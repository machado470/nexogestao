-- Restaura o subsistema de webhooks removido por
-- 20260307051134_billing_v2_clean antes da migration
-- que adiciona idempotência ao fan-out da Outbox.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'WebhookDeliveryStatus'
    ) THEN
        CREATE TYPE "WebhookDeliveryStatus"
            AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_orgId_active_createdAt_idx"
    ON "WebhookEndpoint"("orgId", "active", "createdAt");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_endpointId_idx"
    ON "WebhookDelivery"("endpointId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_eventType_idx"
    ON "WebhookDelivery"("eventType");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_idx"
    ON "WebhookDelivery"("status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WebhookEndpoint_orgId_fkey'
    ) THEN
        ALTER TABLE "WebhookEndpoint"
            ADD CONSTRAINT "WebhookEndpoint_orgId_fkey"
            FOREIGN KEY ("orgId")
            REFERENCES "Organization"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WebhookDelivery_endpointId_fkey'
    ) THEN
        ALTER TABLE "WebhookDelivery"
            ADD CONSTRAINT "WebhookDelivery_endpointId_fkey"
            FOREIGN KEY ("endpointId")
            REFERENCES "WebhookEndpoint"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END
$$;
