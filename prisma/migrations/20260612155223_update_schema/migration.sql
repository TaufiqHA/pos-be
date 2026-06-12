/*
  Warnings:

  - You are about to drop the column `address` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `courier` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `customerName` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `invoice` on the `Delivery` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `StockHistory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Delivery" DROP COLUMN "address",
DROP COLUMN "courier",
DROP COLUMN "customerName",
DROP COLUMN "date",
DROP COLUMN "invoice",
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "isWholesalePrice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockHistory" DROP COLUMN "date";

-- CreateTable
CREATE TABLE "WholesalePrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WholesalePrice_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WholesalePrice" ADD CONSTRAINT "WholesalePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
