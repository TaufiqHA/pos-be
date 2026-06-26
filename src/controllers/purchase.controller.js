const prisma = require('../prisma');

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
        }
      });

      // Penambahan stok tidak dilakukan di sini.
      // Stok baru akan ditambahkan ketika Cabang menekan "Terima & Cek" (status menjadi Selesai).

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

      if (status === 'Lunas' && purchase.status !== 'Lunas' && purchase.supplier !== 'Kantor Pusat') {
        for (const item of purchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          const prevStock = product.stock;
          const newStock = prevStock + item.qty;
          const oldAverageCost = product.averageCost ?? product.buyPrice;
          let newAverageCost = oldAverageCost;
          if (newStock > 0) {
            newAverageCost = ((prevStock * oldAverageCost) + (item.qty * item.price)) / newStock;
          }

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
              branchId: purchase.branchId
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

      // Jika status BERUBAH menjadi 'Selesai' (Cabang sudah Terima & Cek)
      if (status === 'Selesai' && existingPurchase.status !== 'Selesai') {
        for (const item of existingPurchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error(`Product ${item.productId} not found`);

          const prevStock = product.stock;
          const newStock = prevStock + item.qty;
          const oldAverageCost = product.averageCost ?? product.buyPrice;
          let newAverageCost = oldAverageCost;
          if (newStock > 0) {
            newAverageCost = ((prevStock * oldAverageCost) + (item.qty * item.price)) / newStock;
          }

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
              reason: `Penerimaan PO: ${existingPurchase.invoice}`,
              userName: req.user?.name || 'Cabang',
              branchId: existingPurchase.branchId
            }
          });
        }
      }

      // Jika status BERUBAH menjadi 'Lunas' untuk supplier eksternal
      if (status === 'Lunas' && existingPurchase.status !== 'Lunas' && existingPurchase.supplier !== 'Kantor Pusat') {
        for (const item of existingPurchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          const prevStock = product.stock;
          const newStock = prevStock + item.qty;
          const oldAverageCost = product.averageCost ?? product.buyPrice;
          let newAverageCost = oldAverageCost;
          if (newStock > 0) {
            newAverageCost = ((prevStock * oldAverageCost) + (item.qty * item.price)) / newStock;
          }

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
              branchId: existingPurchase.branchId
            }
          });
        }
      }

      if (status) {
        const linkedS = await tx.sale.findFirst({ where: { paymentRef: id } });
        if (linkedS) {
          await tx.sale.update({
            where: { id: linkedS.id },
            data: { status }
          });
        }
      }

      return await tx.purchase.update({
        where: { id },
        data: dataToUpdate
      });
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

      const stockAdded = purchase.status === 'Selesai' || (purchase.status === 'Lunas' && (purchase.supplier || '').toLowerCase() !== 'kantor pusat');
      if (stockAdded) {
        for (const item of purchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            const newStock = product.stock - item.qty;
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
                prevStock: product.stock,
                newStock,
                reason: `Hapus Pembelian ${purchase.invoice}`,
                userName: req.user?.name || 'System',
                branchId: purchase.branchId
              }
            });
          }
        }
      }

      const linkedSale = await tx.sale.findFirst({ where: { paymentRef: id }, include: { items: true } });
      if (linkedSale) {
        for (const item of linkedSale.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            const newStock = product.stock + item.qty;
            await tx.product.update({ where: { id: item.productId }, data: { stock: newStock } });
            await tx.stockHistory.create({
              data: {
                productId: product.id,
                productName: product.name,
                type: 'Tambah',
                qty: item.qty,
                prevStock: product.stock,
                newStock,
                reason: `Hapus Penjualan Terkait ${linkedSale.invoice}`,
                userName: req.user?.name || 'System',
                branchId: linkedSale.branchId
              }
            });
          }
        }
        await tx.delivery.deleteMany({ where: { saleId: linkedSale.id } });
        await tx.saleItem.deleteMany({ where: { saleId: linkedSale.id } });
        await tx.sale.delete({ where: { id: linkedSale.id } });
      }

      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });
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
