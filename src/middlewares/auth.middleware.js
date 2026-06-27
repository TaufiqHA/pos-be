const prisma = require('../prisma');
const jwt = require('jsonwebtoken');

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.name) {
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (user) decoded.name = user.name;
    }
    req.user = decoded; // attach user info to request
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token tidak valid atau kadaluarsa.' });
  }
};

module.exports = { requireAuth };
