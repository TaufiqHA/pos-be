const prisma = require('../prisma');
const bcrypt = require('bcrypt');

const getUsers = async (req, res) => {
  try {
    const data = await prisma.user.findMany({ include: { branch: true } });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    // Ekstrak branchId dan parentId dari req.body
    const { password, branchId, parentId, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password || '123456', 10);
    
    const createData = { ...rest, password: hashedPassword };

    // Format relasi branch sesuai aturan Prisma
    if (branchId) {
      createData.branch = { connect: { id: branchId } };
    }

    // Format relasi parent
    if (parentId) {
      createData.parent = { connect: { id: parentId } };
    }

    const user = await prisma.user.create({
      data: createData
    });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    // PENTING: Ekstrak branchId dan parentId dari req.body agar tidak masuk ke rest
    const { password, branchId, parentId, ...rest } = req.body;
    const updateData = { ...rest };
    
    // 1. Hash password jika ada
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    // 2. Perbaikan Relasi Branch (Prisma Connect/Disconnect)
    if (branchId !== undefined) {
      if (branchId === null || branchId === "") {
        updateData.branch = { disconnect: true };
      } else {
        updateData.branch = { connect: { id: branchId } };
      }
    }

    // 3. Perbaikan Relasi Parent
    if (parentId !== undefined) {
      if (parentId === null || parentId === "") {
        updateData.parent = { disconnect: true };
      } else {
        updateData.parent = { connect: { id: parentId } };
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
