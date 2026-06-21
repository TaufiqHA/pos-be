const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const branches = await prisma.branch.findMany();
  console.log("BRANCHES:", branches);
  const customers = await prisma.customer.findMany();
  console.log("CUSTOMERS:", customers);
}
main().catch(console.error).finally(() => prisma.$disconnect());
