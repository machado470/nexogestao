ALTER TABLE "WebhookDelivery" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "WebhookDelivery_endpointId_idempotencyKey_key"
  ON "WebhookDelivery"("endpointId", "idempotencyKey");
