const prisma = require('../prisma');

const getCategories = async (req, res) => {
  try {
    const data = await prisma.category.findMany();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createCategory = async (req, res) => {
  try {
    const data = await prisma.category.create({ data: req.body });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const identifier = req.params.id;

    const existingCategory = await prisma.category.findFirst({
      where: {
        OR: [
          { id: identifier },
          { name: identifier }
        ]
      }
    });

    if (!existingCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const data = await prisma.category.update({
      where: { id: existingCategory.id },
      data: req.body
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const identifier = req.params.id;

    const existingCategory = await prisma.category.findFirst({
      where: {
        OR: [
          { id: identifier },
          { name: identifier }
        ]
      }
    });

    if (!existingCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await prisma.category.delete({ where: { id: existingCategory.id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
