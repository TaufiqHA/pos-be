const prisma = require('../prisma');

const getDeliveries = async (req, res) => {
  try {
    // 1. Ambil data delivery beserta relasi sale-nya
    const data = await prisma.delivery.findMany({
      include: { sale: true },
      orderBy: { createdAt: 'desc' }
    });

    // 2. Ambil data customer untuk mendapatkan alamat
    const customers = await prisma.customer.findMany();

    // 3. Format/Mapping data agar sesuai dengan ekspektasi Frontend
    const formattedData = data.map(d => {
      const cust = customers.find(c => c.name === d.sale?.customer);
      return {
        ...d,
        invoice: d.sale?.invoice || '-',
        date: d.sale?.date || d.createdAt,
        customerName: d.sale?.customer || '-',
        address: cust?.address || '-',
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
