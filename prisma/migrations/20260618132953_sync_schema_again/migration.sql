-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "branchIsWholesale" JSONB,
ADD COLUMN     "branchWholesalePrices" JSONB;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "pendingPayment" DOUBLE PRECISION DEFAULT 0;
