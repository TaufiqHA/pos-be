const prisma = require('../prisma');

const getWilayahs = async (req, res) => {
  try {
    const data = await prisma.wilayah.findMany({ orderBy: { name: 'asc' } });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createWilayah = async (req, res) => {
  try {
    const data = await prisma.wilayah.create({ data: req.body });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getWilayahs, createWilayah };
