---
status: accepted
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
---

# ADR 0004 — Decomposição dos serviços operacionais

## Contexto e auditoria anterior à alteração

Na baseline `9f69cb42`, `ServiceOrdersService` tinha 1.120 linhas, cinco métodos públicos,
quatro métodos privados e doze dependências injetadas. Concentrava leitura e montagem do
read model, criação, lifecycle concorrente, notificações, auditoria, automação, integração
Finance/WhatsApp, Timeline e Outbox. `WhatsAppService` tinha 1.705 linhas, 31 métodos
públicos, 14 privados e dez dependências injetadas. Concentrava inbox/read models,
persistência e despacho de mensagens, provider/webhook, claim, recovery, fila,
inteligência, Timeline, métricas e política comercial.

### Matriz Service Orders

| Método público | Endpoint/caller | Responsabilidade e modelos | Serviços/efeitos | Atomicidade, idempotência e concorrência | Tenancy/testes | Destino |
| --- | --- | --- | --- | --- | --- | --- |
| `list` | `GET /service-orders` | query de `ServiceOrder`, `Customer`, `Person`, `Appointment` e `Charge`; paginação e decisão operacional | sem side effect | leituras paralelas; sem transação | todos os filtros incluem `orgId`; spec do facade | `ServiceOrderReadService` |
| `get` | `GET /service-orders/:id`; geração manual de charge | detalhe dos mesmos modelos e resumo financeiro | sem side effect | sem transação | `findFirst(id, orgId)`; guard/controller specs | `ServiceOrderReadService` |
| `create` | `POST /service-orders`; demo | valida customer/appointment/person e cria `ServiceOrder` | Idempotency, Audit, Timeline, Notifications, Onboarding, Analytics e WhatsApp | chave fornecida ou `service-order-create:*`; conflito `P2002`; não há transação compartilhada a dividir | todas as buscas/mutações usam `orgId`; unit specs | facade/lifecycle (mantido) |
| `update` | `PATCH /service-orders/:id`; governance/demo | transição, atribuição, execução/conclusão e atualização de `ServiceOrder` | OperationalState, Audit, Timeline, Outbox, Finance, Automation, WhatsApp e Analytics | conclusão usa `$transaction`, `updateMany(id, orgId, expectedUpdatedAt, status)`, Timeline e Outbox atômicos; idempotência da conclusão preservada | seleção e CAS incluem `orgId`; concorrência caracterizada nos specs | facade/lifecycle (mantido como unidade transacional) |
| `generateCharge` | callers internos/demo (REST usa Finance diretamente) | ponte para Charge após O.S. concluída | somente `FinanceService.ensureChargeForServiceOrderDone` | prevenção de duplicidade permanece em Finance | O.S. buscada por `id, orgId`; specs de Finance | facade/ponte Finance (mantido) |

Timeline registra criação, atualização e transições; na conclusão, o evento e o Outbox
permanecem na mesma transação. Auto/manual charge continuam delegados à autoridade Finance.

### Matriz WhatsApp

| Método(s) público(s) | Endpoint/caller | Responsabilidade/modelos | Efeitos e mecanismos | Tenancy/testes | Destino |
| --- | --- | --- | --- | --- | --- |
| `listConversations` | `GET /whatsapp/conversations`, `/inbox` | inbox sobre `WhatsAppConversation`, `WhatsAppMessage`, Charge, Appointment e ServiceOrder | somente leitura; prioridade/read model oficial | todas as consultas usam `orgId`; service specs | `WhatsAppConversationReadService` |
| `getConversation`, `getMessages` | detalhes e mensagens da conversa | leitura de Conversation/Message | sem side effect | `id + orgId`; service specs | `WhatsAppConversationReadService` |
| `getContext`, `getConversationIntelligence` | context/intelligence | compõe customer context, inteligência e ações oficiais | pode persistir decisão e Timeline deduplicada | conversa tenant-scoped; intelligence/timeline specs | facade de orquestração (mantido) |
| `isQueueAvailable` | health | capacidade da Queue | consulta QueueService | sem dados tenant; health specs | facade |
| `sendManualMessage`, `sendTemplateMessage`, `enqueueMessage`, `queueMessage` | envio REST e integrações | persiste Conversation/Message | quota comercial, chave determinística/messageKey e jobId BullMQ | customer/conversation/org validados; dispatch specs | facade/dispatch (mantido) |
| `updateMessageStatus`, `retryFailedMessage` | patch/retry | transição de Message | Timeline, fila de retry | `updateMany(id, orgId)`; specs de retry | facade/dispatch |
| `markConversationResolved`, `markConversationPending`, `updateConversationStatus` | status/resolve/reopen | transição de Conversation | `updateMany` condicional | `id + orgId`; controller specs | facade/command |
| `processInboundWebhook` | webhook e worker | normaliza provider, resolve tenant/conversa, deduplica e persiste inbound/status | provider adapter, `providerMessageId`, Timeline, métricas | tenant resolvido oficialmente; webhook/security specs | facade/webhook (mantido) |
| `buildConversationFromCustomer`, `resolveOrCreateConversation`, `findById` | execution/internos | resolve Conversation/Customer | persistência idempotente por chave existente | queries com `orgId` quando aplicável; execution specs | facade/conversation command |
| `getMessagesFeed` | `GET /messages/:customerId` | feed de Message | somente leitura | `orgId + customerId`; service specs | `WhatsAppConversationReadService` |
| `claimMessageForDispatch`, `claimQueued` | dispatcher/processor | claim de Message | SQL condicional, `lockedAt/lockedBy`, `FOR UPDATE SKIP LOCKED` | mensagem carrega `orgId`; claim/fencing specs | unidade canônica de execução (mantida) |
| `reconcileStaleSending` | runner/recovery | recupera `SENDING` stale | `$transaction`, lock, Timeline transacional | por registros com `orgId`; stale specs | unidade canônica de recovery (mantida) |
| `markSent`, `markFailedTerminal`, `markDeliveryUncertain`, `markFailedAndRequeue` | dispatcher | finalização fenced | SQL exige status/worker; providerMessageId e Timeline | org do registro; fencing/post-send specs | unidade canônica de execução (mantida) |
| `listWebhookEvents`, `getWebhookEventDetail`, `getWebhookDlqStats` | rotas administrativas/DLQ | read model de WebhookEvent | sem side effect | `orgId`; webhook specs | facade/webhook read |
| `replayWebhookEvents` | replay individual/lote | recuperação de WebhookEvent | fila, force e auditoria operacional | seleção por `orgId`; recovery specs | facade/recovery |
| `createWebhookEvent`, `enqueueInboundWebhook`, `processPersistedInboundWebhook` | controllers/processors | persistência e execução durável de webhook | providerMessageId, job id e estado do WebhookEvent | org explícita/resolvida pelo webhook; security/reconciliation specs | facade/webhook |
| `recordWebhookEventAttempt`, `deadLetterWebhookEvent`, `completeWebhookEvent` | processor/DLQ | lifecycle de WebhookEvent | retry, DLQ e timestamps | registro preserva org; processor specs | facade/recovery |

`WhatsAppExecutionService`, dispatcher e processors já são fronteiras separadas. Claim e
fencing permanecem canônicos no facade para não duplicar ou repartir as transações sensíveis.

## Decisão

Extrair somente duas fronteiras de leitura comprovadamente independentes:

1. `ServiceOrderReadService`, responsável por listagem, detalhe, resumo financeiro de
   leitura e decisão operacional pura.
2. `WhatsAppConversationReadService`, responsável pelo inbox, conversa, mensagens e feed.

`ServiceOrdersService` e `WhatsAppService` permanecem facades públicas compatíveis. Os
controllers, DTOs, rotas, códigos HTTP e consumers não mudam. Commands sensíveis ficam
intactos: a transação de conclusão de O.S. continua abrangendo CAS, Timeline e Outbox; os
claims/recovery de WhatsApp continuam abrangendo locks e transições existentes.

## Dependências permitidas e proibidas

Os read services podem depender de Prisma para consultas tenant-scoped. O facade de O.S.
pode chamar Finance para Charge e WhatsApp para comunicação. WhatsApp pode chamar Queue,
provider, Timeline, contexto e políticas comerciais. É proibido Service Orders controlar
Payment ou implementar Charge, WhatsApp acessar Billing, controllers acessarem Prisma,
BFF persistir dados ou frontend decidir estados operacionais.

## Consequências, riscos e dívida restante

As assinaturas públicas permanecem estáveis e os testes existentes exercitam as mesmas
facades. O risco principal é wiring de DI ou divergência futura entre facade e serviços
focados; testes estruturais protegem delegação, autoridade financeira e ausência de Prisma
nos controllers. Permanecem como dívida P1 a extração futura de webhook read/recovery após
caracterização específica e, como P2, avaliar separação de mensagens/dispatch sem romper
claim, fencing ou Timeline. Não há mudança de schema, provider, payload, estado ou frontend.
