---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Webhook System

## Visão geral

O sistema de webhooks permite que integrações externas recebam callbacks HTTP sempre que eventos relevantes da plataforma forem registrados na timeline.

## Fluxo de eventos

1. Um módulo chama `TimelineService.log(...)`.
2. O evento de timeline é persistido.
3. `WebhookDispatcher` normaliza o tipo do evento (ex.: `PAYMENT_RECEIVED` -> `payment.received`).
4. O dispatcher encontra endpoints ativos da organização inscritos nesse evento.
5. Para cada endpoint, cria um registro de `WebhookDelivery` com status `PENDING`.
6. O dispatcher enfileira um job `dispatch-webhook` na fila `webhooks`.
7. `WebhookProcessor` consome o job, envia HTTP POST e atualiza status/tentativas.

## Payload

Formato padrão enviado para o endpoint:

```json
{
  "event": "payment.received",
  "timestamp": "2026-03-07T01:30:00.000Z",
  "data": {
    "timelineEventId": "...",
    "personId": "...",
    "description": "...",
    "metadata": {
      "chargeId": "..."
    }
  }
}
```

## Retry policy

- Fila: `webhooks`
- Tentativas: `5`
- Backoff: exponencial com `delay` inicial de `1000ms`
- Em cada tentativa, `WebhookDelivery.attempts` e `lastAttemptAt` são atualizados.
- Status final:
  - `SUCCESS`: resposta HTTP 2xx
  - `FAILED`: erro HTTP não-2xx ou erro de rede

## Assinatura (HMAC)

Cada endpoint possui um `secret` único.

A assinatura é gerada com:

- Algoritmo: `HMAC-SHA256`
- Mensagem: corpo JSON enviado (`payloadText`)
- Header: `X-Nexo-Signature` (enviado como `x-nexo-signature`)

Exemplo de validação (Node.js):

```ts
import { createHmac } from "crypto";

const expected = createHmac("sha256", WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex");

const valid = expected === receivedSignature;
```

## Endpoints da API

### CRUD de endpoints

- `POST /webhooks`
- `GET /webhooks`
- `PUT /webhooks/:id`
- `DELETE /webhooks/:id`

Campos suportados:

- `url`
- `events` (array de strings)
- `active`

### Monitoramento de entregas

- `GET /webhooks/deliveries`
- Filtros opcionais por `eventType` e `status`.

## Exemplo de request

```http
POST /webhooks
Content-Type: application/json
Authorization: Bearer <token>

{
  "url": "https://integracao.exemplo.com/webhooks/nexo",
  "events": ["customer.created", "payment.received", "risk.updated"],
  "active": true
}
```
