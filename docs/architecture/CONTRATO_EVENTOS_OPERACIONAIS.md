---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Contrato de eventos operacionais

## Objetivo e semântica

A Outbox entrega fatos **pelo menos uma vez**; todo consumidor deve ser idempotente. O fato de negócio, a evidência oficial (`TimelineEvent`) e `OperationalOutboxEvent` são gravados na mesma transação. SSE, webhook e WhatsApp são efeitos posteriores e nunca fonte da verdade.

## Envelope canônico (schema v1)

| Campo                                | Regra                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `id` / `eventType` / `schemaVersion` | identidade imutável, tipo no passado (`SERVICE_ORDER_COMPLETED`, `CHARGE_CREATED`, `PAYMENT_RECEIVED`) e versão inteira positiva |
| `orgId`                              | sempre obtido da identidade autenticada e copiado para a Outbox; o payload não escolhe tenant                                    |
| `aggregateType` / `aggregateId`      | agregado que originou o fato e sua identidade persistida                                                                         |
| `actorId` / origem                   | ator autenticado quando houver; `payload.origin=operational` distingue evidência primária                                        |
| `correlationId` / `causationId`      | correlação da requisição (ou UUID) e evento causador opcional                                                                    |
| `idempotencyKey`                     | única em conjunto com `orgId`; descreve o fato, não o efeito                                                                     |
| `occurredAt`                         | instante do fato, distinto de `createdAt`                                                                                        |
| `payload`                            | JSON mínimo, validado pelo consumidor; não inclui segredos; contém `timelineEventId`                                             |

Campos de entrega (`status`, `attempts`, `availableAt`, locks, erro e `processedAt`) pertencem à Outbox, não ao evento de domínio.

## Conceitos separados

- **Evento de domínio:** envelope imutável do fato ocorrido.
- **Auditoria oficial:** `TimelineEvent`, append-only pela superfície de serviço; correção é novo evento com referência em metadados.
- **Entrega Outbox:** estado operacional de tentativa e lock; pode mudar sem alterar o fato.
- **Projeção de leitura:** dado reconstruível, nunca autoriza mutação.
- **SSE:** aviso efêmero de atualização; falha não reverte negócio.
- **Comando:** intenção de executar uma ação, não prova de que ela ocorreu.

## Entrega, erro e evolução

O claim usa uma transação PostgreSQL com `FOR UPDATE SKIP LOCKED`. Locks abandonados voltam a ser elegíveis apó `OUTBOX_LOCK_TIMEOUT_MS`. Falhas recebem backoff exponencial limitado; em `OUTBOX_MAX_ATTEMPTS`, ficam como `FAILED`, sem exclusão. `lastError` é truncado e sanitizado. Retenção deve ser definida por política operacional futura; até lá, não há purge automático.

Versões existentes nunca mudam de significado. Mudança incompatível cria nova versão e consumidor aceita explicitamente as versões suportadas. O worker pode ser desligado com `OUTBOX_WORKER_ENABLED=false`.

## Consumidores e prevenção de ciclos

Neste lote, somente o dispatcher de webhooks já existente consome os três fatos protegidos, usando `timelineEventId`. Filas externas e chamadas não rodam na transação. Risco e governança não foram conectados automaticamente à Outbox: fatos com origem `risk`, `governance` ou `derived` não podem ser reintroduzidos como evidência primária sem regra versionada explícita. Uma decisão não pode causar a si mesma; `causationId` e chave idempotente devem encerrar a cadeia.

## Fechamento de entrega do Lote 2

Cada handoff de webhook persistido tem chave `outbox:<eventId>:endpoint:<endpointId>`; o evento fica `PROCESSED` quando todas as entregas foram persistidas e seus jobs aceitos. A resposta HTTP externa pode ocorrer depois e mantém retry próprio: `PROCESSED` não significa confirmação do destino. O identificador do worker pode ser fixado por `OUTBOX_WORKER_ID`; lote, intervalo, lock, tentativas e backoff usam `OUTBOX_BATCH_SIZE`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_LOCK_TIMEOUT_MS`, `OUTBOX_MAX_ATTEMPTS` e `OUTBOX_BACKOFF_BASE_MS`, validados como inteiros positivos.
