const prisma = require('../prisma');

const getProducts = async (req, res) => {
  try {
    const user = req.user;
    
    // Ambil data produk. Jika user = Cabang, ambil juga StockHistory milik cabang tersebut.
    let data = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        stockHistory: (user && user.role === 'Cabang' && user.branchId) ? {
          where: { branchId: user.branchId }
        } : false
      }
    });

    // Jika Cabang, hitung stok nyata berdasarkan History
    if (user && user.role === 'Cabang' && user.branchId) {
      data = data.map(p => {
        let branchStock = 0;
        if (p.stockHistory) {
          p.stockHistory.forEach(h => {
            if (h.type === 'Tambah') branchStock += h.qty;
            if (h.type === 'Kurang') branchStock -= h.qty;
          });
        }
        
        const { stockHistory, ...productData } = p; // Buang history agar response API bersih
        return {
          ...productData,
          stock: branchStock // Ganti nilai stok global menjadi stok cabang
        };
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const { wholesalePrices, ...productData } = req.body;
      const product = await tx.product.create({ data: productData });
      
      if (product.stock > 0) {
        await tx.stockHistory.create({
          data: {
            productId: product.id,
            productName: product.name,
            type: 'Tambah',
            qty: product.stock,
            prevStock: 0,
            newStock: product.stock,
            reason: 'Stok Awal',
            userName: req.user?.name || 'System',
            branchId: req.user?.branchId || null
          }
        });
      }
      return product;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    // Note: Do not update stock directly here if not logging to history.
    // Assuming req.body doesn't contain manual stock update.
    const { wholesalePrices, ...productData } = req.body;
    const data = await prisma.product.update({
      where: { id: req.params.id },
      data: productData
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const adjustStock = async (req, res) => {
  try {
    const { productId, type, qty, reason } = req.body;
    
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error('Product not found');
      
      const prevStock = product.stock;
      const newStock = type === 'Tambah' ? prevStock + qty : prevStock - qty;

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { stock: newStock }
      });

      const user = await tx.user.findUnique({ where: { id: req.user.id } });

      await tx.stockHistory.create({
        data: {
          productId,
          productName: product.name,
          type,
          qty,
          prevStock,
          newStock,
          reason,
          userName: user?.name || 'System',
          branchId: user?.branchId || null
        }
      });

      return updatedProduct;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getProducts, createProduct, updateProduct, deleteProduct, adjustStock };
