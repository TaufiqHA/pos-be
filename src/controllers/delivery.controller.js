const prisma = require('../prisma');

const getDeliveries = async (req, res) => {
  try {
    const whereClause = {};
    if (req.user && req.user.role === 'Cabang' && req.user.branchId) {
      whereClause.branchId = req.user.branchId;
    }

    // 1. Ambil data delivery dengan filter cabang di level DB dan pilih kolom sale seperlunya
    const data = await prisma.delivery.findMany({
      where: whereClause,
      include: {
        sale: {
          select: {
            invoice: true,
            date: true,
            customer: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 2. Ambil alamat customer khusus untuk nama-nama yang muncul di daftar delivery ini saja
    const custNames = [...new Set(data.map(d => d.sale?.customer).filter(Boolean))];
    const customers = custNames.length > 0
      ? await prisma.customer.findMany({
          where: { name: { in: custNames } },
          select: { name: true, address: true }
        })
      : [];

    const custMap = new Map(customers.map(c => [c.name, c.address]));

    // 3. Format/Mapping data dengan pencarian O(1)
    const formattedData = data.map(d => {
      return {
        ...d,
        invoice: d.sale?.invoice || '-',
        date: d.sale?.date || d.createdAt,
        customerName: d.sale?.customer || '-',
        address: custMap.get(d.sale?.customer) || '-',
        courier: d.driverName || '' // mapping driverName kembali ke properti courier
      };
    });

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateDelivery = async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Ubah key 'courier' dari frontend menjadi 'driverName' untuk Prisma
    if (updateData.courier !== undefined) {
      updateData.driverName = updateData.courier;
      delete updateData.courier;
    }

    const data = await prisma.delivery.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getDeliveries, updateDelivery };
