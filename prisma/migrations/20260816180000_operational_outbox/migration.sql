CREATE TABLE "OperationalOutboxEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "actorId" TEXT,
  "correlationId" TEXT NOT NULL,
  "causationId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalOutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalOutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OperationalOutboxEvent_orgId_idempotencyKey_key" ON "OperationalOutboxEvent"("orgId", "idempotencyKey");
CREATE INDEX "OperationalOutboxEvent_status_availableAt_createdAt_idx" ON "OperationalOutboxEvent"("status", "availableAt", "createdAt");
CREATE INDEX "OperationalOutboxEvent_orgId_status_availableAt_idx" ON "OperationalOutboxEvent"("orgId", "status", "availableAt");
CREATE INDEX "OperationalOutboxEvent_lockedAt_status_idx" ON "OperationalOutboxEvent"("lockedAt", "status");
CREATE INDEX "OperationalOutboxEvent_orgId_aggregateType_aggregateId_occurredAt_idx" ON "OperationalOutboxEvent"("orgId", "aggregateType", "aggregateId", "occurredAt");
