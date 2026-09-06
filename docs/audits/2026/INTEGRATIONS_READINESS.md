# Integrações externas — readiness para produção

Este projeto está preparado para operar em **modo degradado seguro** quando integrações externas não estiverem configuradas.

## Convenções de log no boot local

- `[BOOT]`: etapas normais de inicialização.
- `[READY]`: aplicação pronta para uso.
- `[OPTIONAL]`: integração opcional indisponível, sem bloquear boot.
- `[WARN-LOCAL]`: aviso local de ambiente (ex.: WSL em `/mnt/*`).
- `[FATAL]`: falha real de startup.

## Integrações prontas

- Stripe (checkout + webhook com assinatura).
- Google OAuth (login).
- E-mail transacional (Resend).
- WhatsApp provider (mock/z-api).

## Variáveis de ambiente

Preencha os placeholders em `.env.example` e `apps/api/.env.example`.

### Obrigatórias para rodar local

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `NEXO_API_URL`

### Obrigatórias para Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_BUSINESS`

Opcional:

- `BILLING_ENABLE_SIMULATED_CHECKOUT=true` (apenas ambiente controlado)

### Obrigatórias para Google OAuth

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL`

### E-mail transacional

- `RESEND_API_KEY`
- `EMAIL_FROM`

### WhatsApp

- `WHATSAPP_PROVIDER=mock|zapi`
- Se `zapi`: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`

## Como ativar Stripe

1. Defina as variáveis `STRIPE_*`.
2. Aponte o webhook Stripe para:
   - `POST /billing/webhook` (assinatura validada via `STRIPE_WEBHOOK_SECRET`).
3. Faça checkout via fluxo Billing no frontend.

Sem chave Stripe, o sistema retorna erro estruturado de integração ausente e a UI mantém o fluxo sem quebrar.

## Como ativar Google OAuth

1. Defina `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`.
2. Verifique status em:
   - `GET /auth/google/status`.
3. O frontend habilita o botão automaticamente quando configurado.

Sem configuração, o botão aparece desabilitado com mensagem explícita.

## Health/readiness

- `GET /health`: saúde geral (db, prisma, queue).
- `GET /health/readiness`: status de integração sem expor segredo:
  - `status: ok` em boot local quando núcleo crítico está operacional;
  - `stripe: configured|missing`
  - `googleAuth: configured|missing`
  - `email: configured|missing`
  - `whatsapp: configured|configured_mock|misconfigured`

> Observação: integrações opcionais ausentes (Google OAuth, Stripe, Resend, Z-API, Sentry) **não** devem marcar startup como falha fatal em ambiente local.
