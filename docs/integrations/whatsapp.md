---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# WhatsApp com Z-API (setup local)

## Objetivo

Deixar a API pronta para envio real via Z-API em ambiente local, exigindo apenas preencher as chaves no `.env`.

## Variáveis obrigatórias (quando `WHATSAPP_PROVIDER=zapi`)

```env
WHATSAPP_PROVIDER=zapi
ZAPI_INSTANCE_ID=
ZAPI_TOKEN=
ZAPI_CLIENT_TOKEN=
```

## Comportamento esperado

- Se `WHATSAPP_PROVIDER=zapi` e faltar alguma chave, a API **sobe normalmente**.
- A readiness (`GET /health/readiness`) marca WhatsApp como `misconfigured` e lista `missingEnv`.
- O provider loga aviso claro com as variáveis faltantes.
- Falhas fatais de autenticação/assinatura da Z-API não entram em loop infinito de requeue: a mensagem é marcada como `FAILED`.

## Diagnóstico rápido

- `GET /health/readiness`
  - `integrations.whatsapp`:
    - `configured` (zapi pronto)
    - `misconfigured` (zapi selecionado com chave faltante)
    - `configured_mock` (provider mock)
  - `whatsapp.missingEnv`: lista do que falta no `.env`

## Subida local

```bash
cp .env.example .env
pnpm install
pnpm --filter ./apps/api build
pnpm --filter ./apps/api dev
```
