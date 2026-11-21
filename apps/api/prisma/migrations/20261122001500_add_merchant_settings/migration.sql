ALTER TABLE "users"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deliveryStatusNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "failedDeliveryNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "storeConnectionNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "language" VARCHAR(32) NOT NULL DEFAULT 'English',
  ADD COLUMN "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo (UTC+05:30)';

ALTER TABLE "merchant_profiles"
  ADD COLUMN "registrationNumber" TEXT,
  ADD COLUMN "website" TEXT;

CREATE TYPE "MerchantBusinessUpdateStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "merchant_business_update_requests" (
  "id" UUID NOT NULL,
  "merchantUserId" UUID NOT NULL,
  "businessName" TEXT,
  "businessAddress" TEXT,
  "businessType" TEXT,
  "registrationNumber" TEXT,
  "website" TEXT,
  "status" "MerchantBusinessUpdateStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" UUID,
  "rejectionReason" TEXT,

  CONSTRAINT "merchant_business_update_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "merchant_business_update_requests_merchantUserId_createdAt_idx"
  ON "merchant_business_update_requests"("merchantUserId", "createdAt");

ALTER TABLE "merchant_business_update_requests"
  ADD CONSTRAINT "merchant_business_update_requests_merchantUserId_fkey"
  FOREIGN KEY ("merchantUserId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
