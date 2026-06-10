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
              subtotal: item.subtotal
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
      const customerObj = await tx.customer.findFirst({ where: { name: saleData.customer } });
      await tx.delivery.create({
        data: {
          saleId: sale.id,
          invoice: sale.invoice,
          customerName: saleData.customer,
          address: customerObj?.address || '-',
          status: 'Menunggu',
          branchId
        }
      });

      return sale;
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
      return updatedSale;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSales, createSale, paySale };
