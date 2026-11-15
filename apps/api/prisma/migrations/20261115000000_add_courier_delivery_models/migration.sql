-- Additive courier delivery schema. Existing users and authentication data are untouched.

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryFailureReason" AS ENUM ('RECIPIENT_UNAVAILABLE', 'INCORRECT_ADDRESS', 'RECIPIENT_REJECTED', 'UNABLE_TO_CONTACT', 'OTHER');

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "trackingNumber" VARCHAR(64) NOT NULL,
    "recipientName" VARCHAR(200) NOT NULL,
    "recipientPhone" VARCHAR(32) NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "deliveryInstructions" TEXT,
    "contentsDescription" VARCHAR(500),
    "weightGrams" INTEGER,
    "status" "ParcelStatus" NOT NULL DEFAULT 'CREATED',
    "deliveredProofId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parcels_delivered_requires_proof_check" CHECK ("status" <> 'DELIVERED' OR "deliveredProofId" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "delivery_assignments" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_status_events" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "assignmentId" UUID,
    "actorId" UUID,
    "proofId" UUID,
    "status" "ParcelStatus" NOT NULL,
    "note" TEXT,
    "failureReason" "DeliveryFailureReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_status_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parcel_status_events_failed_requires_reason_check" CHECK ("status" <> 'FAILED' OR "failureReason" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "delivery_proofs" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "storageProvider" VARCHAR(32) NOT NULL DEFAULT 'local',
    "storageKey" VARCHAR(512) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" CHAR(64),
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_proofs_positive_size_check" CHECK ("sizeBytes" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "parcels_trackingNumber_key" ON "parcels"("trackingNumber");
CREATE UNIQUE INDEX "parcels_deliveredProofId_key" ON "parcels"("deliveredProofId");
CREATE INDEX "parcels_status_updatedAt_idx" ON "parcels"("status", "updatedAt");
CREATE UNIQUE INDEX "parcels_deliveredProofId_id_key" ON "parcels"("deliveredProofId", "id");

CREATE INDEX "delivery_assignments_courierId_assignedAt_endedAt_idx" ON "delivery_assignments"("courierId", "assignedAt", "endedAt");
CREATE INDEX "delivery_assignments_parcelId_assignedAt_idx" ON "delivery_assignments"("parcelId", "assignedAt");
CREATE INDEX "delivery_assignments_parcelId_endedAt_idx" ON "delivery_assignments"("parcelId", "endedAt");
CREATE UNIQUE INDEX "delivery_assignments_id_parcelId_key" ON "delivery_assignments"("id", "parcelId");
CREATE UNIQUE INDEX "delivery_assignments_id_parcelId_courierId_key" ON "delivery_assignments"("id", "parcelId", "courierId");
CREATE UNIQUE INDEX "delivery_assignments_one_active_per_parcel_key" ON "delivery_assignments"("parcelId") WHERE "endedAt" IS NULL;

CREATE UNIQUE INDEX "parcel_status_events_proofId_key" ON "parcel_status_events"("proofId");
CREATE INDEX "parcel_status_events_parcelId_createdAt_idx" ON "parcel_status_events"("parcelId", "createdAt");
CREATE INDEX "parcel_status_events_actorId_createdAt_idx" ON "parcel_status_events"("actorId", "createdAt");
CREATE UNIQUE INDEX "parcel_status_events_proofId_parcelId_key" ON "parcel_status_events"("proofId", "parcelId");

CREATE UNIQUE INDEX "delivery_proofs_storageKey_key" ON "delivery_proofs"("storageKey");
CREATE INDEX "delivery_proofs_parcelId_uploadedAt_idx" ON "delivery_proofs"("parcelId", "uploadedAt");
CREATE UNIQUE INDEX "delivery_proofs_id_parcelId_key" ON "delivery_proofs"("id", "parcelId");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_deliveredProofId_id_fkey" FOREIGN KEY ("deliveredProofId", "id") REFERENCES "delivery_proofs"("id", "parcelId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcel_status_events" ADD CONSTRAINT "parcel_status_events_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcel_status_events" ADD CONSTRAINT "parcel_status_events_assignmentId_parcelId_fkey" FOREIGN KEY ("assignmentId", "parcelId") REFERENCES "delivery_assignments"("id", "parcelId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcel_status_events" ADD CONSTRAINT "parcel_status_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcel_status_events" ADD CONSTRAINT "parcel_status_events_proofId_parcelId_fkey" FOREIGN KEY ("proofId", "parcelId") REFERENCES "delivery_proofs"("id", "parcelId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_assignmentId_parcelId_courierId_fkey" FOREIGN KEY ("assignmentId", "parcelId", "courierId") REFERENCES "delivery_assignments"("id", "parcelId", "courierId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
