const prisma = require('../prisma');

const getUnits = async (req, res) => {
  try {
    const data = await prisma.unit.findMany();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUnit = async (req, res) => {
  try {
    const data = await prisma.unit.create({ data: req.body });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUnit = async (req, res) => {
  try {
    const data = await prisma.unit.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUnit = async (req, res) => {
  try {
    await prisma.unit.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getUnits, createUnit, updateUnit, deleteUnit };
