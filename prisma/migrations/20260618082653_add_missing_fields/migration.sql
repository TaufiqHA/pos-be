-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'Menunggu';
