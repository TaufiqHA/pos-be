const prisma = require('../prisma');
const bcrypt = require('bcrypt');

const getAllUserOutlets = async (req, res) => {
  try {
    const userOutlets = await prisma.user.findMany({
      where: { role: 'Outlet' },
      include: { branch: true },
    });
    res.json(userOutlets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserOutletById = async (req, res) => {
  try {
    const { id } = req.params;
    const userOutlet = await prisma.user.findUnique({
      where: { id },
      include: { branch: true },
    });
    
    if (!userOutlet || userOutlet.role !== 'Outlet') {
      return res.status(404).json({ error: 'User Outlet not found' });
    }
    
    res.json(userOutlet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createUserOutlet = async (req, res) => {
  try {
    const { name, email, password, status, branchId } = req.body;
    
    // Validasi data penting
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const createData = {
      name,
      email,
      password: hashedPassword,
      status: status || 'Aktif',
      role: 'Outlet', // Paksakan role menjadi Outlet
    };

    if (branchId) {
      createData.branch = { connect: { id: branchId } };
    }

    const newUserOutlet = await prisma.user.create({
      data: createData,
    });
    
    res.status(201).json(newUserOutlet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserOutlet = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, status, branchId } = req.body;
    
    const updateData = { name, email, status };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    if (branchId !== undefined) {
      if (branchId === null || branchId === "") {
        updateData.branch = { disconnect: true };
      } else {
        updateData.branch = { connect: { id: branchId } };
      }
    }
    
    const updatedUserOutlet = await prisma.user.update({
      where: { id },
      data: updateData,
    });
    
    res.json(updatedUserOutlet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteUserOutlet = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({
      where: { id },
    });
    res.json({ message: 'User Outlet deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllUserOutlets,
  getUserOutletById,
  createUserOutlet,
  updateUserOutlet,
  deleteUserOutlet,
};
