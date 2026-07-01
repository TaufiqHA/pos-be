const prisma = require('../prisma');

const getStockHistory = async (req, res) => {
  try {
    const data = await prisma.stockHistory.findMany({
      orderBy: { createdAt: 'desc' }
    });
    const mapped = data.map(item => ({
      ...item,
      date: item.createdAt
    }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getStockHistory };
