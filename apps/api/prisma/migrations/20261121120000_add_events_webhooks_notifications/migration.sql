-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('DELIVERED', 'RETRY_SCHEDULED', 'FAILED', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "merchantOrderId" UUID;

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "aggregateType" VARCHAR(32) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "routingKey" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" VARCHAR(1000),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" UUID NOT NULL,
    "consumer" VARCHAR(64) NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId","consumer")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "merchantUserId" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "secretHint" VARCHAR(16) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "requestUrl" VARCHAR(2048) NOT NULL,
    "responseStatus" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" VARCHAR(500),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "template" VARCHAR(64) NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_sequence_key" ON "outbox_events"("sequence");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_nextAttemptAt_sequence_idx" ON "outbox_events"("publishedAt", "nextAttemptAt", "sequence");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateId_sequence_idx" ON "outbox_events"("aggregateId", "sequence");

-- CreateIndex
CREATE INDEX "processed_events_processedAt_idx" ON "processed_events"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_merchantUserId_key" ON "webhook_endpoints"("merchantUserId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_eventId_idx" ON "webhook_deliveries"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_endpointId_eventId_attempt_key" ON "webhook_deliveries"("endpointId", "eventId", "attempt");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_createdAt_idx" ON "notifications"("recipientUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_eventId_channel_recipientUserId_key" ON "notifications"("eventId", "channel", "recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "parcels_merchantOrderId_key" ON "parcels"("merchantOrderId");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_merchantOrderId_fkey" FOREIGN KEY ("merchantOrderId") REFERENCES "merchant_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
