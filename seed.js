require('dotenv').config();
const prisma = require('./src/prisma');
const bcrypt = require('bcrypt');

async function main() {
  const hashedPassword = await bcrypt.hash('12345678', 10);

  // 1. Seed Branch (Cabang)
  const branch1 = await prisma.branch.upsert({
    where: { id: 'branch-1' }, // Kita pakai ID statis untuk relasi yang mudah
    update: {},
    create: {
      id: 'branch-1',
      name: 'Cabang Jakarta Pusat',
      address: 'Jl. Sudirman No. 1, Jakarta',
      phone: '021-123456',
      wilayah: 'Jakarta Pusat'
    }
  });

  // 2. Seed Users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pos.com' },
    update: {},
    create: {
      email: 'admin@pos.com',
      name: 'Admin Pusat',
      password: hashedPassword,
      role: 'Admin',
      status: 'Aktif',
    },
  });

  const cabang = await prisma.user.upsert({
    where: { email: 'cabang@pos.com' },
    update: {},
    create: {
      email: 'cabang@pos.com',
      name: 'Admin Cabang JKT',
      password: hashedPassword,
      role: 'Cabang',
      status: 'Aktif',
      branchId: branch1.id
    },
  });

  const outlet = await prisma.user.upsert({
    where: { email: 'outlet@pos.com' },
    update: {},
    create: {
      email: 'outlet@pos.com',
      name: 'Admin Outlet 1',
      password: hashedPassword,
      role: 'Outlet',
      status: 'Aktif',
      branchId: branch1.id
    },
  });

  // 3. Seed Category
  const category1 = await prisma.category.upsert({
    where: { name: 'Elektronik' },
    update: {},
    create: { name: 'Elektronik' }
  });

  const category2 = await prisma.category.upsert({
    where: { name: 'Sembako' },
    update: {},
    create: { name: 'Sembako' }
  });

  // 4. Seed Unit (Satuan)
  const unit1 = await prisma.unit.upsert({
    where: { name: 'Pcs' },
    update: {},
    create: { name: 'Pcs' }
  });

  const unit2 = await prisma.unit.upsert({
    where: { name: 'Kg' },
    update: {},
    create: { name: 'Kg' }
  });

  // Seed Wilayah
  const wilayahJKTPusat = await prisma.wilayah.upsert({
    where: { name: 'Jakarta Pusat' },
    update: {},
    create: { name: 'Jakarta Pusat' }
  });

  // 5. Seed Supplier
  const supplier = await prisma.supplier.upsert({
    where: { id: 'sup-1' },
    update: {},
    create: {
      id: 'sup-1',
      name: 'PT Distributor Utama',
      contactName: 'Budi Hartono',
      phone: '081234567890',
      address: 'Kawasan Industri Pulo Gadung'
    }
  });

  // 6. Seed Customer
  const customer = await prisma.customer.upsert({
    where: { id: 'cust-1' },
    update: {},
    create: {
      id: 'cust-1',
      name: 'Toko Makmur Jaya',
      phone: '08987654321',
      address: 'Jl. Melati No. 10',
      wilayah: 'Jakarta Selatan',
      cabang: branch1.name
    }
  });

  // 7. Seed Product
  const product1 = await prisma.product.upsert({
    where: { sku: 'PROD-001' },
    update: {},
    create: {
      sku: 'PROD-001',
      name: 'TV LED 32 Inch',
      category: category1.name,
      buyPrice: 1500000,
      sellPrice: 2000000,
      stock: 15,
      minStock: 5,
      unit: unit1.name,
      isWholesale: false
    }
  });

  const product2 = await prisma.product.upsert({
    where: { sku: 'PROD-002' },
    update: {},
    create: {
      sku: 'PROD-002',
      name: 'Beras Premium 5Kg',
      category: category2.name,
      buyPrice: 60000,
      sellPrice: 75000,
      stock: 100,
      minStock: 20,
      unit: unit1.name, // Anggap dijual per karung (Pcs)
      isWholesale: true
    }
  });

  console.log('Seeding Semua Data Master Selesai!');
  console.log('- Wilayah:', wilayahJKTPusat.name);
  console.log('- Cabang:', branch1.name);
  console.log('- Users:', { admin: admin.email, cabang: cabang.email, outlet: outlet.email });
  console.log('- Kategori & Satuan:', [category1.name, category2.name], [unit1.name, unit2.name]);
  console.log('- Produk:', [product1.name, product2.name]);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
