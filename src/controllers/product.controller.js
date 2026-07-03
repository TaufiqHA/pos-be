const prisma = require('../prisma');

const getProducts = async (req, res) => {
  try {
    const user = req.user;
    const branchIdFilter = req.query.branch_id;
    
    let whereClause = { isDeleted: false };
    if (branchIdFilter) {
      whereClause = {
        isDeleted: false,
        purchaseItems: {
          some: {
            purchase: {
              branchId: branchIdFilter
            }
          }
        }
      };
    }

    // Ambil data produk. Jika user = Cabang, ambil juga StockHistory milik cabang tersebut.
    let data = await prisma.product.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        wholesalePrices: true,
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
          centralStock: productData.stock,
          stock: branchStock // Ganti nilai stok global menjadi stok cabang
        };
      });
    } else {
      data = data.map(p => {
        const { stockHistory, ...productData } = p;
        return {
          ...productData,
          centralStock: productData.stock
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
    const { wholesalePrices, ...productData } = req.body;
    
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ 
        data: {
          ...productData,
          averageCost: productData.buyPrice,
          wholesalePrices: {
            create: wholesalePrices ? wholesalePrices.map(item => ({
              qty: parseInt(item.qty, 10),
              price: parseFloat(item.price)
            })) : []
          }
        }
      });
      
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
    }, {
      maxWait: 5000,
      timeout: 20000
    });
    
    const finalProduct = await prisma.product.findUnique({
      where: { id: result.id },
      include: { wholesalePrices: true }
    });
    res.json(finalProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    // Note: Do not update stock directly here if not logging to history.
    // Assuming req.body doesn't contain manual stock update.
    const { wholesalePrices, ...productData } = req.body;
    const productId = req.params.id;

    const currentProd = await prisma.product.findUnique({ where: { id: productId } });
    const updatePayload = { ...productData };

    if (productData.buyPrice !== undefined && currentProd && currentProd.stock <= 0) {
      updatePayload.averageCost = productData.buyPrice;
    }

    const data = await prisma.product.update({
      where: { id: productId },
      data: {
        ...updatePayload,
        wholesalePrices: {
          deleteMany: {},
          create: wholesalePrices ? wholesalePrices.map(item => ({
            qty: parseInt(item.qty, 10),
            price: parseFloat(item.price)
          })) : []
        }
      },
      include: { wholesalePrices: true }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Periksa apakah produk sudah digunakan dalam transaksi
    const usedInSales = await prisma.saleItem.findFirst({ where: { productId } });
    const usedInPurchases = await prisma.purchaseItem.findFirst({ where: { productId } });
    const usedInStockHistory = await prisma.stockHistory.findFirst({ where: { productId } });
    
    if (usedInSales || usedInPurchases || usedInStockHistory) {
      // Soft delete
      await prisma.product.update({
        where: { id: productId },
        data: { isDeleted: true }
      });
      res.json({ message: 'Soft Deleted' });
    } else {
      // Hard delete
      await prisma.product.delete({ where: { id: productId } });
      res.json({ message: 'Hard Deleted' });
    }
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
      
      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      const isCabang = user && user.role === 'Cabang';

      let prevStock;
      let newStock;

      if (isCabang) {
        // Calculate current branch stock from its history
        const history = await tx.stockHistory.findMany({
          where: { productId, branchId: user.branchId }
        });
        const branchStock = history.reduce((sum, h) => {
          return h.type === 'Tambah' ? sum + h.qty : sum - h.qty;
        }, 0);
        
        prevStock = branchStock;
        newStock = type === 'Tambah' ? prevStock + qty : prevStock - qty;

        // DO NOT update product.stock in the database since it represents central stock
      } else {
        prevStock = product.stock;
        newStock = type === 'Tambah' ? prevStock + qty : prevStock - qty;

        await tx.product.update({
          where: { id: productId },
          data: { stock: newStock }
        });
      }

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

      // Fetch the product again to return the updated state
      const finalProduct = await tx.product.findUnique({
        where: { id: productId },
        include: { wholesalePrices: true }
      });

      return finalProduct;
    }, {
      maxWait: 5000,
      timeout: 20000
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getProducts, createProduct, updateProduct, deleteProduct, adjustStock };
