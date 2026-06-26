const prisma = require('../prisma');

const getSales = async (req, res) => {
  try {
    const data = await prisma.sale.findMany({
      include: { items: true, deliveries: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createSale = async (req, res) => {
  try {
    const { items, ...saleData } = req.body;
    const userId = req.user.id;
    
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('Sesi tidak valid atau pengguna telah dihapus. Silakan login ulang.');
      }
      const branchId = user?.branchId || null;

      const totalSales = await tx.sale.count();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const urutan = String(totalSales + 1).padStart(4, '0');
      const generatedInvoice = `INV-${dateStr}-${urutan}`;

      const productIds = items.map(item => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } }
      });
      const productMap = {};
      products.forEach(p => productMap[p.id] = p);

      // 1. Create Sale
      const sale = await tx.sale.create({
        data: {
          ...saleData,
          invoice: generatedInvoice,
          userId,
          branchId,
          items: {
            create: items.map(item => ({
              productId: item.productId,
              name: item.name,
              qty: item.qty,
              price: item.price,
              subtotal: item.subtotal,
              isWholesalePrice: item.isWholesalePrice || false,
              cogs: productMap[item.productId]?.averageCost ?? productMap[item.productId]?.buyPrice ?? 0
            }))
          }
        }
      });

      // 2 & 3. Reduce Stock and create StockHistory
      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product ${item.productId} not found`);

        const prevStock = product.stock;
        const newStock = prevStock - item.qty;

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
            reason: `Penjualan ${sale.invoice}`,
            userName: saleData.salesName || user?.name || 'System',
            branchId
          }
        });
      }

      // 4. Create Delivery
      await tx.delivery.create({
        data: {
          saleId: sale.id,
          status: 'Menunggu',
          branchId
        }
      });

      return sale;
    }, {
      maxWait: 5000,
      timeout: 20000
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const paySale = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } });
      if (!sale) throw new Error('Sale not found');

      const currentPaid = sale.cashGiven || 0;
      const newPaid = currentPaid + amount;
      const status = newPaid >= sale.grandTotal ? 'Lunas' : 'Sebagian';

      const updatedSale = await tx.sale.update({
        where: { id },
        data: { cashGiven: newPaid, status }
      });

      if (sale.paymentRef) {
        const linkedPurchase = await tx.purchase.findUnique({ where: { id: sale.paymentRef } });
        if (linkedPurchase) {
          await tx.purchase.update({
            where: { id: sale.paymentRef },
            data: { cashGiven: newPaid, status }
          });
        }
      }

      return updatedSale;
    }, {
      maxWait: 5000,
      timeout: 20000
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: true }
      });
      if (!sale) throw new Error('Sale not found');

      for (const item of sale.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const newStock = product.stock + item.qty;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: newStock }
          });
          await tx.stockHistory.create({
            data: {
              productId: product.id,
              productName: product.name,
              type: 'Tambah',
              qty: item.qty,
              prevStock: product.stock,
              newStock,
              reason: `Hapus Penjualan ${sale.invoice}`,
              userName: req.user?.name || 'System',
              branchId: sale.branchId
            }
          });
        }
      }

      let linkedP = null;
      if (sale.paymentRef) {
        linkedP = await tx.purchase.findUnique({
          where: { id: sale.paymentRef },
          include: { items: true }
        });
      }

      if (!linkedP && sale.customer) {
        const allPurchases = await tx.purchase.findMany({ include: { items: true } });
        const branches = await tx.branch.findMany();
        const matchedBranch = branches.find(b => 
          sale.customer.toLowerCase().includes(b.name.toLowerCase()) ||
          b.name.toLowerCase().includes(sale.customer.toLowerCase())
        );

        linkedP = allPurchases.find(p => {
          const isPusatSup = (p.supplier || '').toLowerCase() === 'kantor pusat';
          const isSameAmount = Math.abs((p.total || 0) - (sale.grandTotal || sale.total || 0)) < 100;
          const isSameBranch = matchedBranch ? (p.branchId === matchedBranch.id) : true;
          return isPusatSup && isSameAmount && isSameBranch && p.status !== 'Dibatalkan';
        });
      }

      if (linkedP) {
        const stockAdded = linkedP.status === 'Selesai' || (linkedP.status === 'Lunas' && (linkedP.supplier || '').toLowerCase() !== 'kantor pusat');
        if (stockAdded) {
          for (const item of linkedP.items) {
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
                  reason: `Hapus Pembelian Terkait ${linkedP.invoice}`,
                  userName: req.user?.name || 'System',
                  branchId: linkedP.branchId
                }
              });
            }
          }
        }
        await tx.purchaseItem.deleteMany({ where: { purchaseId: linkedP.id } });
        await tx.purchase.delete({ where: { id: linkedP.id } });
      }

      await tx.delivery.deleteMany({ where: { saleId: id } });
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
    });

    res.json({ message: 'Penjualan berhasil dihapus' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Sale not found' });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSales, createSale, paySale, deleteSale };
