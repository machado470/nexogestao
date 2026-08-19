-- Resultado de envio cujo efeito externo não pode ser determinado com
-- segurança (ex.: timeout após o POST ter sido iniciado).
--
-- UNCERTAIN não é FAILED: o provider pode ter aceitado a mensagem.
-- Mensagens neste estado não são elegíveis a retry automático.

ALTER TYPE "WhatsAppMessageStatus"
ADD VALUE IF NOT EXISTS 'UNCERTAIN';
