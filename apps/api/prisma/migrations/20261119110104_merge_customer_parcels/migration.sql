/*
  Warnings:

  - Added the required column `costLkr` to the `parcels` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerId` to the `parcels` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderAddress` to the `parcels` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderName` to the `parcels` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightKg` to the `parcels` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PackageSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "costLkr" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "customerId" UUID NOT NULL,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "failedDeliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "packageSize" "PackageSize" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "senderAddress" TEXT NOT NULL,
ADD COLUMN     "senderName" TEXT NOT NULL,
ADD COLUMN     "weightKg" DECIMAL(5,2) NOT NULL,
ALTER COLUMN "trackingNumber" SET DATA TYPE TEXT,
ALTER COLUMN "recipientName" SET DATA TYPE TEXT,
ALTER COLUMN "recipientPhone" SET DATA TYPE TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "parcel_status_history" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcel_status_history_parcelId_createdAt_idx" ON "parcel_status_history"("parcelId", "createdAt");

-- CreateIndex
CREATE INDEX "parcels_customerId_status_idx" ON "parcels"("customerId", "status");

-- CreateIndex
CREATE INDEX "parcels_trackingNumber_idx" ON "parcels"("trackingNumber");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_status_history" ADD CONSTRAINT "parcel_status_history_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
