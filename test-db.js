require('dotenv').config();
const prisma = require('./src/prisma');

async function main() {
  const branches = await prisma.branch.findMany();
  console.log("BRANCHES:", branches);
  const customers = await prisma.customer.findMany();
  console.log("CUSTOMERS:", customers);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
