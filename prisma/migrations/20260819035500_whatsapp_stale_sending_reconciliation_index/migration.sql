-- Suporta a reconciliação global de mensagens WhatsApp abandonadas em SENDING.
-- A consulta filtra por status e ordena/limita por lockedAt sem depender de orgId.
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_lockedAt_idx"
ON "WhatsAppMessage"("status", "lockedAt");
