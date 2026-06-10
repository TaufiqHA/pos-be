const prisma = require('../prisma');

const getStockHistory = async (req, res) => {
  try {
    const data = await prisma.stockHistory.findMany({
      orderBy: { date: 'desc' }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getStockHistory };
