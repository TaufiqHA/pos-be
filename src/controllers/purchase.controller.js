const prisma = require('../prisma');

/**
 * Menghitung Moving Average Cost baru secara aman.
 * Jika harga beli baru sama persis dengan modal rata-rata lama, kembalikan modal lama (konstan).
 */
function calculateSafeAverageCost(prevStock, oldAverageCost, incomingQty, incomingPrice) {
  // 1. Jika stok sebelumnya habis (<= 0), modal rata-rata langsung mengikuti harga beli baru
  if (prevStock <= 0) {
    return incomingPrice;
  }

  // 2. Guard: Jika selisih harga beli baru dengan modal lama sangat kecil (kembar/sama persis),
  // pertahankan modal rata-rata lama agar tidak terjadi floating-point drift.
  if (Math.abs(incomingPrice - oldAverageCost) < 0.01) {
    return oldAverageCost;
  }

  const newStock = prevStock + incomingQty;
  if (newStock <= 0) return oldAverageCost;

  // 3. Kalkulasi weighted average cost
  const totalValue = (prevStock * oldAverageCost) + (incomingQty * incomingPrice);
  const calculatedCost = totalValue / newStock;

  // 4. Bulatkan ke 2 desimal atau bilangan bulat terdekat untuk mencegah desimal tak hingga
  return Math.round(calculatedCost * 100) / 100;
}

const getPurchases = async (req, res) => {
  try {
    const data = await prisma.purchase.findMany({
      include: { items: true, user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createPurchase = async (req, res) => {
  try {
    const { items, ...purchaseData } = req.body;
    const userId = req.user.id;
    
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('Sesi tidak valid atau pengguna telah dihapus. Silakan login ulang.');
      }
      const branchId = user?.branchId || null;

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `PO-${dateStr}-`;
      const lastPurchase = await tx.purchase.findFirst({
        where: { invoice: { startsWith: prefix } },
        orderBy: { invoice: 'desc' }
      });
      let nextNum = 1;
      if (lastPurchase && lastPurchase.invoice) {
        const lastParts = lastPurchase.invoice.split('-');
        const lastSeq = parseInt(lastParts[lastParts.length - 1], 10);
        if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
      }
      const urutan = String(nextNum).padStart(4, '0');
      const generatedInvoice = `PO-${dateStr}-${urutan}`;

      // 1. Create Purchase
      // Jika role adalah Admin, maka langsung anggap sudah diproses (isProcessed: true)
      const isProcessedAdmin = user.role === 'Admin' || user.role === 'Admin Pusat';
      
      const purchase = await tx.purchase.create({
        data: {
          ...purchaseData,
          invoice: generatedInvoice,
          userId,
          branchId: purchaseData.branchId || branchId, // Gunakan branchId dari payload jika ada (Push System)
          isProcessed: purchaseData.isProcessed !== undefined ? purchaseData.isProcessed : isProcessedAdmin,
          items: {
            create: items.map(item => ({
              productId: item.productId,
              name: item.name,
              qty: item.qty,
              price: item.price,
              subtotal: item.subtotal
            }))
          }
        },
        include: { items: true }
      });

      const isKantorPusat = (purchase.supplier || '').toLowerCase() === 'kantor pusat';
      const stockAdded = purchase.status === 'Selesai' || purchase.status === 'Lunas';
      if (stockAdded) {
        for (const item of purchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          if (isKantorPusat) {
            // Hitung stok virtual cabang dari history
            const history = await tx.stockHistory.findMany({
              where: { productId: item.productId, branchId: purchase.branchId }
            });
            const branchStock = history.reduce((sum, h) => {
              return h.type === 'Tambah' ? sum + h.qty : sum - h.qty;
            }, 0);

            await tx.stockHistory.create({
              data: {
                productId: item.productId,
                productName: product.name,
                type: 'Tambah',
                qty: item.qty,
                prevStock: branchStock,
                newStock: branchStock + item.qty,
                reason: `Pembelian Lunas: ${purchase.invoice}`,
                userName: req.user?.name || user?.name || 'System',
                branchId: purchase.branchId
              }
            });
          } else {
            const prevStock = product.stock;
            const newStock = prevStock + item.qty;
            const oldAverageCost = product.averageCost ?? product.buyPrice;
            const newAverageCost = calculateSafeAverageCost(prevStock, oldAverageCost, item.qty, item.price);

            await tx.product.update({
              where: { id: item.productId },
              data: { stock: newStock, averageCost: newAverageCost }
            });

            await tx.stockHistory.create({
              data: {
                productId: product.id,
                productName: product.name,
                type: 'Tambah',
                qty: item.qty,
                prevStock,
                newStock,
                reason: `Pembelian Lunas: ${purchase.invoice}`,
                userName: req.user?.name || user?.name || 'System',
                branchId: purchase.branchId
              }
            });
          }
        }
      }

      return purchase;
    }, {
      maxWait: 5000,
      timeout: 20000
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const payPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, isPending } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id }, include: { items: true } });
      if (!purchase) throw new Error('Purchase not found');

      if (isPending) {
        return await tx.purchase.update({
          where: { id },
          data: { 
            pendingPayment: amount,
            paymentStatus: 'Menunggu Konfirmasi'
          }
        });
      }

      // Confirm payment (Admin Pusat)
      const paymentToAdd = purchase.pendingPayment && purchase.pendingPayment > 0 ? purchase.pendingPayment : amount;
      const currentPaid = purchase.cashGiven || 0;
      const newPaid = currentPaid + paymentToAdd;
      const status = newPaid >= purchase.total ? 'Lunas' : 'Sebagian';

      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: { 
          cashGiven: newPaid, 
          status,
          pendingPayment: 0,
          paymentStatus: 'Diterima'
        }
      });

      const linkedSale = await tx.sale.findFirst({ where: { paymentRef: id } });
      if (linkedSale) {
        await tx.sale.update({
          where: { id: linkedSale.id },
          data: { cashGiven: newPaid, status }
        });
      }

      if (status === 'Lunas' && purchase.status !== 'Lunas' && (purchase.supplier || '').toLowerCase() !== 'kantor pusat') {
        const finalBranchId = purchase.branchId || req.user?.branchId || null;
        for (const item of purchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          const prevStock = product.stock;
          const newStock = prevStock + item.qty;
          const oldAverageCost = product.averageCost ?? product.buyPrice;
          const newAverageCost = calculateSafeAverageCost(prevStock, oldAverageCost, item.qty, item.price);

          await tx.product.update({
            where: { id: item.productId },
            data: { stock: newStock, averageCost: newAverageCost }
          });

          await tx.stockHistory.create({
            data: {
              productId: product.id,
              productName: product.name,
              type: 'Tambah',
              qty: item.qty,
              prevStock: product.stock,
              newStock,
              reason: `Pembayaran PO Lunas: ${purchase.invoice}`,
              userName: req.user?.name || 'System',
              branchId: finalBranchId
            }
          });
        }
      }

      return updatedPurchase;
    }, {
      maxWait: 5000,
      timeout: 20000
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const processPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. Cek purchase
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true }
      });
      
      if (!purchase) throw new Error('Purchase not found');
      if (purchase.isProcessed) throw new Error('PO sudah pernah diproses');

      // 2. Set isProcessed menjadi true
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: { isProcessed: true }
      });

      // Penambahan stok tidak dilakukan di sini.
      // Stok baru akan ditambahkan ketika Cabang menekan "Terima & Cek" (status menjadi Selesai).
      
      return updatedPurchase;
    }, {
      maxWait: 5000,
      timeout: 20000
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const cancelPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedPurchase = await prisma.purchase.update({
      where: { id },
      data: { 
        status: 'Dibatalkan',
        isProcessed: true
      }
    });
    res.json(updatedPurchase);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryStatus, status, cashGiven, isProcessed } = req.body;
    
    const dataToUpdate = {};
    if (deliveryStatus !== undefined) dataToUpdate.deliveryStatus = deliveryStatus;
    if (status !== undefined) dataToUpdate.status = status;
    if (cashGiven !== undefined) dataToUpdate.cashGiven = cashGiven;
    if (isProcessed !== undefined) dataToUpdate.isProcessed = isProcessed;

    const updatedPurchase = await prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!existingPurchase) throw new Error('Purchase not found');

      // Mencegah duplikasi kalkulasi stok & modal (Double Processing Guard)
      const wasAlreadyStocked = (existingPurchase.status === 'Selesai' || existingPurchase.status === 'Lunas') && 
        (existingPurchase.supplier || '').toLowerCase() !== 'kantor pusat';

      const finalBranchId = existingPurchase.branchId || req.user?.branchId || null;
      if (!existingPurchase.branchId && finalBranchId) {
        dataToUpdate.branchId = finalBranchId;
      }

      // Jika status BERUBAH menjadi 'Selesai' (Cabang sudah Terima & Cek)
      if (status === 'Selesai' && !wasAlreadyStocked) {
        const isKantorPusat = (existingPurchase.supplier || '').toLowerCase() === 'kantor pusat';
        for (const item of existingPurchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error(`Product ${item.productId} not found`);

          if (isKantorPusat) {
            const history = await tx.stockHistory.findMany({
              where: { productId: item.productId, branchId: finalBranchId }
            });
            const branchStock = history.reduce((sum, h) => {
              return h.type === 'Tambah' ? sum + h.qty : sum - h.qty;
            }, 0);

            await tx.stockHistory.create({
              data: {
                productId: item.productId,
                productName: product.name,
                type: 'Tambah',
                qty: item.qty,
                prevStock: branchStock,
                newStock: branchStock + item.qty,
                reason: `Penerimaan PO: ${existingPurchase.invoice}`,
                userName: req.user?.name || 'Cabang',
                branchId: finalBranchId
              }
            });
          } else {
            const prevStock = product.stock;
            const newStock = prevStock + item.qty;
            const oldAverageCost = product.averageCost ?? product.buyPrice;
            const newAverageCost = calculateSafeAverageCost(prevStock, oldAverageCost, item.qty, item.price);

            await tx.product.update({
              where: { id: item.productId },
              data: { stock: newStock, averageCost: newAverageCost }
            });

            await tx.stockHistory.create({
              data: {
                productId: product.id,
                productName: product.name,
                type: 'Tambah',
                qty: item.qty,
                prevStock,
                newStock,
                reason: `Penerimaan PO: ${existingPurchase.invoice}`,
                userName: req.user?.name || 'Cabang',
                branchId: finalBranchId
              }
            });
          }
        }
      }

      // Jika status BERUBAH menjadi 'Lunas' untuk supplier eksternal
      if (status === 'Lunas' && !wasAlreadyStocked && (existingPurchase.supplier || '').toLowerCase() !== 'kantor pusat') {
        for (const item of existingPurchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          const prevStock = product.stock;
          const newStock = prevStock + item.qty;
          const oldAverageCost = product.averageCost ?? product.buyPrice;
          const newAverageCost = calculateSafeAverageCost(prevStock, oldAverageCost, item.qty, item.price);

          await tx.product.update({
            where: { id: item.productId },
            data: { stock: newStock, averageCost: newAverageCost }
          });

          await tx.stockHistory.create({
            data: {
              productId: product.id,
              productName: product.name,
              type: 'Tambah',
              qty: item.qty,
              prevStock: product.stock,
              newStock,
              reason: `PO Lunas: ${existingPurchase.invoice}`,
              userName: req.user?.name || 'System',
              branchId: finalBranchId
            }
          });
        }
      }

      if (status) {
        const linkedS = await tx.sale.findFirst({ 
          where: { 
            OR: [
              { invoice: existingPurchase.invoice },
              { paymentRef: id }
            ]
          } 
        });

        if (linkedS) {
          await tx.sale.update({
            where: { id: linkedS.id },
            data: { status }
          });

          const linkedD = await tx.delivery.findFirst({
            where: { saleId: linkedS.id }
          });

          if (linkedD) {
            await tx.delivery.update({
              where: { id: linkedD.id },
              data: { status }
            });
          }
        }
      }

      return await tx.purchase.update({
        where: { id },
        data: dataToUpdate
      });
    }, {
      maxWait: 10000,
      timeout: 30000
    });

    res.json(updatedPurchase);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Purchase not found' });
    }
    res.status(500).json({ message: error.message });
  }
};

const deletePurchase = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true }
      });
      if (!purchase) throw new Error('Purchase not found');

      const isKantorPusat = (purchase.supplier || '').toLowerCase() === 'kantor pusat';
      const stockAdded = purchase.status === 'Selesai' || purchase.status === 'Lunas';
      if (stockAdded) {
        const purchaseProductIds = [...new Set(purchase.items.map(item => item.productId))];
        const purchaseProducts = await tx.product.findMany({
          where: { id: { in: purchaseProductIds } }
        });
        const purchaseProductMap = {};
        purchaseProducts.forEach(p => purchaseProductMap[p.id] = p);

        for (const item of purchase.items) {
          const product = purchaseProductMap[item.productId];
          if (product) {
            if (isKantorPusat) {
              const history = await tx.stockHistory.findMany({
                where: { productId: item.productId, branchId: purchase.branchId }
              });
              const branchStock = history.reduce((sum, h) => {
                return h.type === 'Tambah' ? sum + h.qty : sum - h.qty;
              }, 0);

              await tx.stockHistory.create({
                data: {
                  productId: product.id,
                  productName: product.name,
                  type: 'Kurang',
                  qty: item.qty,
                  prevStock: branchStock,
                  newStock: branchStock - item.qty,
                  reason: `Hapus Pembelian Terkait ${purchase.invoice}`,
                  userName: req.user?.name || 'System',
                  branchId: purchase.branchId
                }
              });
            } else {
              const prevStock = product.stock;
              const newStock = prevStock - item.qty;
              product.stock = newStock;
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: newStock }
              });
              await tx.stockHistory.create({
                data: {
                  productId: product.id,
                  productName: product.name,
                  type: 'Kurang',
                  qty: item.qty,
                  prevStock,
                  newStock,
                  reason: `Hapus Pembelian Terkait ${purchase.invoice}`,
                  userName: req.user?.name || 'System',
                  branchId: purchase.branchId
                }
              });
            }
          }
        }
      }

      const linkedSale = await tx.sale.findFirst({ where: { paymentRef: id }, include: { items: true } });
      if (linkedSale) {
        const linkedSaleProductIds = [...new Set(linkedSale.items.map(item => item.productId))];
        const linkedSaleProducts = await tx.product.findMany({
          where: { id: { in: linkedSaleProductIds } }
        });
        const linkedSaleProductMap = {};
        linkedSaleProducts.forEach(p => linkedSaleProductMap[p.id] = p);

        for (const item of linkedSale.items) {
          const product = linkedSaleProductMap[item.productId];
          if (product) {
            if (!linkedSale.branchId) {
              const prevStock = product.stock;
              const newStock = prevStock + item.qty;
              product.stock = newStock;
              await tx.product.update({ where: { id: item.productId }, data: { stock: newStock } });
              await tx.stockHistory.create({
                data: {
                  productId: product.id,
                  productName: product.name,
                  type: 'Tambah',
                  qty: item.qty,
                  prevStock,
                  newStock,
                  reason: `Hapus Penjualan Terkait ${linkedSale.invoice}`,
                  userName: req.user?.name || 'System',
                  branchId: null
                }
              });
            } else {
              const history = await tx.stockHistory.findMany({
                where: { productId: item.productId, branchId: linkedSale.branchId }
              });
              const branchStock = history.reduce((sum, h) => {
                return h.type === 'Tambah' ? sum + h.qty : sum - h.qty;
              }, 0);

              await tx.stockHistory.create({
                data: {
                  productId: product.id,
                  productName: product.name,
                  type: 'Tambah',
                  qty: item.qty,
                  prevStock: branchStock,
                  newStock: branchStock + item.qty,
                  reason: `Hapus Penjualan Terkait ${linkedSale.invoice}`,
                  userName: req.user?.name || 'System',
                  branchId: linkedSale.branchId
                }
              });
            }
          }
        }
        await tx.delivery.deleteMany({ where: { saleId: linkedSale.id } });
        await tx.saleItem.deleteMany({ where: { saleId: linkedSale.id } });
        await tx.sale.delete({ where: { id: linkedSale.id } });
      }

      await tx.stockHistory.deleteMany({
        where: {
          reason: {
            contains: purchase.invoice,
            mode: 'insensitive'
          }
        }
      });
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });
    }, {
      maxWait: 10000,
      timeout: 30000
    });

    res.json({ message: 'Pembelian berhasil dihapus' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Purchase not found' });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPurchases, createPurchase, payPurchase, processPurchase, cancelPurchase, updatePurchase, deletePurchase };
