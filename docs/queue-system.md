---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Queue System (BullMQ)

## Architecture

O backend agora possui um módulo dedicado `QueueModule` que centraliza conexão Redis e gerenciamento das filas BullMQ.

Filas registradas:

- `automation`
- `notifications`
- `whatsapp`
- `finance`

Cada fila possui producer em serviço de domínio e processor dedicado em `apps/api/src/queue/processors`.

## Job lifecycle

1. Serviço de domínio adiciona job (`QueueService.addJob`).
2. Job é persistido no PostgreSQL em `QueueJob` com status `QUEUED`.
3. Worker processa e muda status para `ACTIVE`.
4. Em sucesso, status vira `COMPLETED` e `completedAt` é preenchido.
5. Em falha, status vira `FAILED` com mensagem de erro.

## Retry behavior

Todos os jobs usam opções padrão:

- `attempts: 3`
- `backoff: exponential` com delay inicial de 1 segundo
- `removeOnComplete: true`

## Delayed jobs

O sistema suporta `delay` nativo do BullMQ.

Exemplo implementado:

- job `finance/payment-reminder` com atraso de **3 dias** para lembrete automático de cobrança.

## Workers

Workers implementados:

- `AutomationProcessor` (`automation`): executa ações enfileiradas da automação.
- `NotificationProcessor` (`notifications`): cria notificações assíncronas.
- `WhatsAppProcessor` (`whatsapp`): despacha mensagens WhatsApp usando provider.
- `FinanceProcessor` (`finance`): cria cobranças e dispara lembretes.

## Monitoring endpoint

Endpoint disponível:

- `GET /queue/status`

Retorna contadores de cada fila (`waiting`, `active`, `failed`, `completed`, `delayed`).

## Infra

`docker-compose.yml` e `docker-compose.dev.yml` agora incluem Redis:

```yaml
redis:
  image: redis:7
  ports:
    - "6379:6379"
```

A API recebe:

- `REDIS_HOST`
- `REDIS_PORT`
