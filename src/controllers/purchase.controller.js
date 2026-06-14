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

      const totalPurchases = await tx.purchase.count();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const urutan = String(totalPurchases + 1).padStart(4, '0');
      const generatedInvoice = `PO-${dateStr}-${urutan}`;

      // 1. Create Purchase
      // Jika role adalah Admin, maka langsung anggap sudah diproses (isProcessed: true)
      const isProcessedAdmin = user.role === 'Admin' || user.role === 'Admin Pusat';
      
      const purchase = await tx.purchase.create({
        data: {
          ...purchaseData,
          invoice: generatedInvoice,
          userId,
          branchId,
          isProcessed: isProcessedAdmin,
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

      // 2 & 3. Add Stock and create StockHistory HANYA jika langsung diproses (Admin)
      if (isProcessedAdmin) {
        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error(`Product ${item.productId} not found`);

          const prevStock = product.stock;
          const newStock = prevStock + item.qty;

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
              prevStock,
              newStock,
              reason: `Pembelian ${purchase.invoice}`,
              userName: user?.name || 'System',
              branchId: user?.branchId || null
            }
          });
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
    const { amount } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } });
      if (!purchase) throw new Error('Purchase not found');

      const currentPaid = purchase.cashGiven || 0;
      const newPaid = currentPaid + amount;
      const status = newPaid >= purchase.total ? 'Lunas' : 'Sebagian';

      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: { cashGiven: newPaid, status }
      });
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

      // 3. Eksekusi penambahan stok karena sudah di-acc
      for (const item of purchase.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        
        const prevStock = product.stock;
        const newStock = prevStock + item.qty;

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
            prevStock,
            newStock,
            reason: `PO Disetujui: ${purchase.invoice}`,
            userName: req.user?.name || 'Admin Sistem',
            branchId: purchase.branchId // <-- Stok masuk ke cabang yang me-request
          }
        });
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

module.exports = { getPurchases, createPurchase, payPurchase, processPurchase, cancelPurchase };
