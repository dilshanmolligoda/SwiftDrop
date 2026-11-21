CREATE TYPE "MerchantOrderStatus" AS ENUM (
    'AWAITING_PICKUP',
    'OUT_FOR_DELIVERY',
    'IN_TRANSIT',
    'PICKED_UP',
    'DELIVERY_FAILED',
    'DELIVERED'
);

CREATE TABLE "merchant_orders" (
    "id" UUID NOT NULL,
    "merchantUserId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "MerchantOrderStatus" NOT NULL DEFAULT 'AWAITING_PICKUP',
    "failedDeliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_orders_trackingNumber_key"
    ON "merchant_orders"("trackingNumber");
CREATE UNIQUE INDEX "merchant_orders_merchantUserId_reference_key"
    ON "merchant_orders"("merchantUserId", "reference");
CREATE INDEX "merchant_orders_merchantUserId_updatedAt_idx"
    ON "merchant_orders"("merchantUserId", "updatedAt");
CREATE INDEX "merchant_orders_merchantUserId_status_idx"
    ON "merchant_orders"("merchantUserId", "status");

ALTER TABLE "merchant_orders"
    ADD CONSTRAINT "merchant_orders_merchantUserId_fkey"
    FOREIGN KEY ("merchantUserId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
