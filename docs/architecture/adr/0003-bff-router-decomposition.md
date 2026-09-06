---
status: accepted
date: 2026-09-06
owners: nexogestao
---

# ADR 0003 — decomposição dos routers do BFF

## Contexto e problema

Na baseline `f2e10b2ef8bd3803e9fcc75d40c83dff87f8c011`, `server/routers/nexo-proxy.ts` tinha 1.198 linhas e concentrava autenticação/sessão, transporte HTTP e 87 procedures de onze áreas. Finance, People, Governance, Dashboard, Billing, Expenses, Launches, Analytics e Integrations já tinham routers próprios; porém Customers, Appointments, Service Orders, Timeline, WhatsApp e outras superfícies continuavam implementadas sob `nexo.*`. O frontend possui consumidores relevantes de `trpc.nexo.*`, portanto esse namespace é contrato de compatibilidade e não pode ser removido.

A auditoria também encontrou dois clientes HTTP concorrentes: a implementação privada do proxy e `_core/nexoClient.ts`. A privada não propagava request/correlation IDs nem mapeava 429, enquanto a fundação compartilhada já o fazia. Não foi encontrado import de Prisma no web. O único `orgId` aceito pelo proxy estava no filtro administrativo de eventos de webhook do WhatsApp; ele é mantido como filtro operacional existente, nunca como fonte implícita de tenant para Customers, Appointments, Service Orders, Timeline ou Settings.

## Matriz auditada antes da extração

Legenda: `P` = `protectedProcedure`; `U` = `publicProcedure`; `unwrap` = `unwrapNexoApiResponse`; “pass-through” significa que o BFF não calcula domínio. Todos os endpoints abaixo são relativos a `/v1`; tenant é derivado pelo JWT/sessão, salvo o filtro administrativo explicitamente indicado.

| Procedure | Domínio / classificação anterior | REST e método | Input / output / normalização | Auth / tenant / transformação | Cobertura localizada | Destino ideal |
| --- | --- | --- | --- | --- | --- | --- |
| `nexo.operations.summary` | operações; B | `GET /internal/operations/summary` | sem input; schema `operationsSummary`; unwrap | P; sessão; pass-through | cockpit contract | `operations` |
| `nexo.operations.incidents` | operações; B | `GET /internal/operations/incidents` | sem input; `incident[]`; unwrap | P; sessão; pass-through | cockpit contract | `operations` |
| `nexo.operations.queues` | operações; B | `GET /internal/operations/queues` | sem input; `queueStatus[]`; unwrap | P; sessão; pass-through | contract BFF | `operations` |
| `nexo.operations.dlq` | operações; B | `GET /internal/operations/dlq` | sem input; `dlqStatus[]`; unwrap | P; sessão; pass-through | contract BFF | `operations` |
| `nexo.operations.diagnostics` | operações; B | `GET /internal/operational-actions/diagnostics` | sem input/output aberto; unwrap | P; sessão; pass-through | API unit | `operations` |
| `nexo.operations.requestAction` | ação operacional; B | `POST /internal/operational-actions/request` | schema estrito; resultado validado; unwrap | P; sessão; sem decisão local | API/unit | `operations` |
| `nexo.operations.executeAction` | ação operacional; B | `POST /internal/operational-actions/execute` | idem | P; sessão; sem decisão local | API/unit | `operations` |
| `nexo.operations.cancelAction` | ação operacional; B | `POST /internal/operational-actions/cancel` | idem | P; sessão; sem decisão local | API/unit | `operations` |
| `nexo.operations.recoverAction` | ação operacional; B | `POST /internal/operational-actions/recover-stuck` | executionId/reason; unwrap | P; sessão; pass-through | API/unit | `operations` |
| `nexo.operations.webhookDeliveries` | webhooks; B | `GET /webhooks/deliveries` | filtros estritos; unwrap | P; sessão; query | API/unit | `operations` |
| `nexo.operations.replayWebhook` | webhooks; B | `POST /webhooks/deliveries/:id/replay` | deliveryId; unwrap | P; sessão; id no path | API/unit | `operations` |
| `nexo.auth.login` | auth; B | `POST /auth/login` | email/senha; resposta bruta | U; cookie após token | auth/session | `auth` |
| `nexo.auth.register` | auth; B | `POST /auth/register` | cadastro; resposta bruta | U; cookie se token | auth/session | `auth` |
| `nexo.auth.forgotPassword` | auth; B | `POST /auth/forgot-password` | email; resposta bruta | U; sem tenant | auth flows | `auth` |
| `nexo.auth.resetPassword` | auth; B | `POST /auth/reset-password` | token/senha; resposta bruta | U; sem tenant | auth flows | `auth` |
| `nexo.auth.acceptInvite` | auth; B | `POST /auth/accept-invite` | convite; resposta bruta | U; cookie se token | auth flows | `auth` |
| `nexo.auth.establishSession` | sessão; B | `GET /me` | token; envelope próprio preservado | U; valida antes de manter cookie | session validation | `auth` |
| `nexo.auth.verifyEmail` | auth; B | `POST /auth/verify-email` | token; resposta bruta | U | auth flows | `auth` |
| `nexo.auth.resendEmailVerification` | auth; B | `POST /auth/resend-email-verification` | email; resposta bruta | U | auth flows | `auth` |
| `nexo.me` | perfil/sessão; B | `GET /me` | sem input; unwrap + adaptação de perfil | P; sessão; sem tenant de input | BFF contract | `auth`/compatibilidade raiz |
| `nexo.customers.list` | customers; B | `GET /customers` | input opcional legado; unwrap | P; sessão; query | BFF/UI | `customers` |
| `nexo.customers.operationalSummary` | customers/risk; B | `GET /customers/operational-summary` | sem input; schema defensivo | P; sessão; não calcula score | BFF/API | `customers` |
| `nexo.customers.getById` | customers; B | `GET /customers/:id` | id; unwrap | P; sessão; id no path | UI | `customers` |
| `nexo.customers.workspace` | customers; B | `GET /customers/:id/workspace` | id; unwrap | P; sessão; pass-through | workspace specs | `customers` |
| `nexo.customers.create` | customers; B | `POST /customers` | create schema; unwrap | P; sessão; payload | workflow | `customers` |
| `nexo.customers.update` | customers; B | `PATCH /customers/:id` | update schema; unwrap | P; sessão; remove id do body | BFF/UI | `customers` |
| `nexo.appointments.list` | appointments; B | `GET /appointments` | filtros/paginação; unwrap | P; sessão; query | BFF/UI | `appointments` |
| `nexo.appointments.getById` | appointments; B | `GET /appointments/:id` | id; unwrap | P; sessão | UI | `appointments` |
| `nexo.appointments.create` | appointments; B | `POST /appointments` | create schema; unwrap | P; sessão | workflow | `appointments` |
| `nexo.appointments.update` | appointments; B | `GET` + `PATCH /appointments/:id` | update schema; busca `updatedAt` se ausente | P; sessão; adaptação otimista legada | BFF/UI | `appointments` |
| `nexo.serviceOrders.list` | service-orders; B | `GET /service-orders` | filtros/paginação; unwrap | P; sessão; sem orgId | BFF/UI | `serviceOrders` |
| `nexo.serviceOrders.getById` | service-orders; B | `GET /service-orders/:id` | id; unwrap | P; sessão | UI | `serviceOrders` |
| `nexo.serviceOrders.create` | service-orders; B | `POST /service-orders` | create schema; unwrap | P; sessão; prioridade apenas validada | workflow | `serviceOrders` |
| `nexo.serviceOrders.update` | service-orders; B | `PATCH /service-orders/:id` | update schema; unwrap | P; sessão; remove id do body | BFF/UI | `serviceOrders` |
| `nexo.serviceOrders.generateCharge` | service-orders/finance; B | `POST /service-orders/:id/generate-charge` | id; unwrap | P; sessão; regra na API | finance contracts | `serviceOrders` |
| `nexo.timeline.listByOrg` | timeline; B | `GET /timeline` | limit/action/cursor; unwrap | P; sessão; org não aceito | authority test | `timeline` |
| `nexo.timeline.listByCustomer` | timeline; B | `GET /timeline/customers/:id` | customerId/limit; unwrap | P; sessão; id no path | UI | `timeline` |
| `nexo.timeline.listByServiceOrder` | timeline; B | `GET /timeline/service-orders/:id` | serviceOrderId/limit; unwrap | P; sessão | authority/UI | `timeline` |
| `nexo.executions.listByServiceOrder` | execuções; B | `GET /executions/service-order/:id` | id/limit; unwrap | P; sessão | UI guardrails | `executions` |
| `nexo.executions.start` | execuções; B | `POST /executions/start` | input legado aberto; unwrap | P; sessão; pass-through | UI guardrails | `executions` |
| `nexo.executions.complete` | execuções; B | `POST /executions/:id/complete` | schema; unwrap | P; sessão; remove id do body | UI/API | `executions` |
| `nexo.executions.mode` | execuções; B | `GET /executions/mode` | sem input; unwrap | P; sessão; modo autoritativo API | API/UI | `executions` |
| `nexo.executions.updateMode` | execuções; B | `POST /executions/mode` | schema de modo/policy; unwrap | P; sessão; valida, não decide | API/UI | `executions` |
| `nexo.executions.stateSummary` | execuções; B | `GET /executions/state-summary` | sinceMs; unwrap | P; sessão | API/UI | `executions` |
| `nexo.executions.events` | execuções; B | `GET /executions/events` | filtros; unwrap | P; sessão | API/UI | `executions` |
| `nexo.executions.recent` | execuções; B | `GET /executions/recent` | limit; unwrap | P; sessão | API/UI | `executions` |
| `nexo.executions.modeHistory` | execuções; B | `GET /executions/mode-history` | limit; unwrap | P; sessão | API/UI | `executions` |
| `nexo.executions.runOnce` | execuções; B | `POST /executions/runner/run-once` | sem input; unwrap | P; sessão | API/UI | `executions` |
| `nexo.whatsapp.listConversations` | WhatsApp; B | `GET /whatsapp/conversations` | filtros/cursor; unwrap | P; sessão | WhatsApp UI | `whatsapp` |
| `nexo.whatsapp.getConversation` | WhatsApp; B | `GET /whatsapp/conversations/:id` | id; unwrap | P; sessão | WhatsApp UI | `whatsapp` |
| `nexo.whatsapp.getMessages` | WhatsApp; B | `GET /whatsapp/conversations/:id/messages` | conversationId; unwrap | P; sessão | WhatsApp UI | `whatsapp` |
| `nexo.whatsapp.getContext` | WhatsApp; B | `GET /whatsapp/conversations/:id/context` | conversationId; unwrap | P; sessão | WhatsApp UI | `whatsapp` |
| `nexo.whatsapp.getIntelligence` | WhatsApp; B | `GET /whatsapp/conversations/:id/intelligence` | conversationId; unwrap | P; sessão; inteligência vem da API | WhatsApp API | `whatsapp` |
| `nexo.whatsapp.sendMessage` | WhatsApp; B | `POST /whatsapp/(conversations/:id/)?messages` | schema/refine; unwrap | P; sessão; escolhe rota por identificador | WhatsApp UI | `whatsapp` |
| `nexo.whatsapp.sendTemplate` | WhatsApp; B | `POST /whatsapp/messages/template` | schema/refine; unwrap | P; sessão | WhatsApp UI | `whatsapp` |
| `nexo.whatsapp.retryMessage` | WhatsApp; B | `POST /whatsapp/messages/:id/retry` | id; unwrap | P; sessão | API/UI | `whatsapp` |
| `nexo.whatsapp.updateConversationStatus` | WhatsApp; B | `PATCH /whatsapp/conversations/:id/status` | id/status; unwrap | P; sessão | API/UI | `whatsapp` |
| `nexo.whatsapp.health` | WhatsApp; B | `GET /whatsapp/health` | sem input; unwrap | P; sessão | API/UI | `whatsapp` |
| `nexo.whatsapp.listPendingApprovals` | WhatsApp/actions; B | `GET /whatsapp/action-executions/pending` | limit; unwrap | P; sessão | dashboard/UI | `whatsapp` |
| `nexo.whatsapp.listExecutionHistory` | WhatsApp/actions; B | `GET /whatsapp/action-executions/history` | filtros; unwrap | P; sessão | UI | `whatsapp` |
| `nexo.whatsapp.getExecutionStatus` | WhatsApp/actions; B | `GET /whatsapp/action-executions/:id` | id; unwrap | P; sessão | UI | `whatsapp` |
| `nexo.whatsapp.requestExecution` | WhatsApp/actions; B | `POST /whatsapp/conversations/:id/actions` | schema; unwrap | P; sessão; API decide lifecycle | UI/API | `whatsapp` |
| `nexo.whatsapp.approveExecution` | WhatsApp/actions; B | `POST /whatsapp/action-executions/:id/approve` | id/reason; unwrap | P; sessão | UI/API | `whatsapp` |
| `nexo.whatsapp.executeExecution` | WhatsApp/actions; B | `POST /whatsapp/action-executions/:id/execute` | id/reason; unwrap | P; sessão | UI/API | `whatsapp` |
| `nexo.whatsapp.cancelExecution` | WhatsApp/actions; B | `POST /whatsapp/action-executions/:id/cancel` | id/reason; unwrap | P; sessão | UI/API | `whatsapp` |
| `nexo.whatsapp.listWebhookEvents` | WhatsApp/admin; B | `GET /whatsapp/webhook-events` | inclui filtro administrativo `orgId`; unwrap + metadata legada | P; sessão; filtro explícito preservado | recovery UI | `whatsapp` |
| `nexo.whatsapp.getWebhookEvent` | WhatsApp/admin; B | `GET /whatsapp/webhook-events/:id` | id; unwrap + metadata legada | P; sessão | recovery UI | `whatsapp` |
| `nexo.whatsapp.replayWebhookEvent` | WhatsApp/admin; B | `POST /whatsapp/webhook-events/:id/replay` | id/force; unwrap | P; sessão | recovery UI | `whatsapp` |
| `nexo.whatsapp.replayWebhookEvents` | WhatsApp/admin; B | `POST /whatsapp/webhook-events/replay` | ids/force; unwrap | P; sessão | recovery UI | `whatsapp` |
| `nexo.whatsapp.webhookDlqStats` | WhatsApp/admin; B | `GET /whatsapp/webhook-events/dlq/stats` | sem input; unwrap | P; sessão | recovery UI | `whatsapp` |
| `nexo.whatsapp.conversations` | WhatsApp; D | `GET /whatsapp/conversations` | alias legado sem filtros; unwrap | P; sessão | busca de consumidores | `whatsapp` compat |
| `nexo.whatsapp.messagesFeed` | WhatsApp; D | `GET /whatsapp/messages/:customerId` | cursor/limit; unwrap | P; sessão | busca de consumidores | `whatsapp` compat |
| `nexo.whatsapp.messages` | WhatsApp; D | `GET /whatsapp/messages/:customerId` | adapta payload para array | P; sessão; compatibilidade | busca de consumidores | `whatsapp` compat |
| `nexo.whatsapp.send` | WhatsApp; D | `POST /whatsapp/messages` | schema legado; unwrap; idempotency header | P; sessão | busca de consumidores | `whatsapp` compat |
| `nexo.demo.bootstrapLive` | demo/admin; B | `POST /demo/bootstrap/live` | input vazio; unwrap | P; sessão; mapeamento legado | API | `demo` |
| `nexo.settings.get` | organização; B | `GET /organization-settings` | sem input; unwrap | P; sessão; tenant não aceito | BFF contract | `settings` |
| `nexo.settings.administrativeSummary` | organização/admin; B | `GET /organization-settings/administrative-summary` | sem input; unwrap | P; sessão | UI | `settings` |
| `nexo.settings.update` | organização; B | `PATCH /organization-settings` | schema sem orgId; unwrap | P; sessão; payload | BFF contract | `settings` |
| `nexo.onboarding.status` | onboarding; B | `GET /onboarding/status` | sem input; unwrap | P; sessão | UI | `onboarding` |
| `nexo.onboarding.completeStep` | onboarding; B | `POST /onboarding/complete-step` | step/payload; unwrap | P; sessão | UI | `onboarding` |
| `nexo.onboarding.complete` | onboarding; B | `POST /onboarding/complete` | input legado aberto; unwrap | P; sessão | UI | `onboarding` |
| `nexo.invites.invite` | people/auth; B | `POST /auth/invite` | email/role; unwrap | P; sessão | UI/API | `invites` |
| `nexo.invites.members` | people/auth; B | `GET /auth/organization/members` | sem input; unwrap | P; sessão | UI/API | `invites` |
| `nexo.globalSearch.search` | busca; B | `GET /customers` + `GET /service-orders` | query/limit; envelope legado próprio | P; sessão; composição de transporte preservada | UI | `globalSearch` |
| `nexo.audit.listEvents` | auditoria; B | `GET /audit/events` | filtros sem orgId; unwrap | P; sessão | BFF/Audit UI | `audit` |
| `nexo.audit.getSummary` | auditoria; B | `GET /audit/summary` | período; unwrap | P; sessão | BFF/Audit UI | `audit` |
| `nexo.risk.explainPerson` | risk; B | `GET /risk/explain/person/:id` | personId; unwrap | P; sessão; explicação vem da API | API | `risk` |

Classificação: **A** routers já especializados: Finance, People, Governance, Dashboard, Billing, Expenses, Launches, Analytics, Integrations, Referrals e AI; **B** procedures acima ainda implementadas no proxy; **C** não foi encontrada implementação duplicada dessas procedures em router especializado; **D** quatro aliases WhatsApp são intencionais; **E** nenhum helper/procedure foi removido sem prova de ausência — a compatibilidade pública torna a retenção mais segura.

## Decisão e arquitetura nova

Cada domínio acima passa a possuir router canônico em `server/routers`. `appRouter` registra os routers canônicos no topo e `nexoProxyRouter` apenas monta o namespace legado usando **as mesmas instâncias exportadas**. Assim `customers.*` e `nexo.customers.*`, por exemplo, não têm duas implementações. `nexo.me` continua como compatibilidade de procedure raiz e também é exposto por `auth.me`.

Chamadas BFF → API usam exclusivamente `_core/nexoClient.ts`; helpers de método/query em `_core/nexoTransport.ts` acrescentam apenas serialização e `unwrapNexoApiResponse`. A fundação preserva timeout, bearer da sessão validada, content type, corpo/query, request ID, correlation ID e o mapeamento 400/401/403/404/409/429/5xx. Chamadas públicas de Auth compartilham o mesmo transporte, mas não fabricam contexto autenticado.

Novos domínios não podem ser implementados em `nexo-proxy.ts`. Devem ganhar router pequeno, validação Zod de fronteira, chamada HTTP, unwrap/validação de saída e proteção adequada. Estado, risco, prioridade, saldo, lifecycle, recomendação, entitlement e tenant permanecem decisões da API NestJS, conforme ADR 0001.

## Compatibilidade, consequências e dívida restante

- Nenhum caller precisa migrar nesta fase; `trpc.nexo.*` permanece idêntico e os namespaces canônicos permitem migração incremental futura.
- Aliases compartilham o mesmo objeto router; um teste estrutural impede que o proxy volte a conter procedures ou transporte.
- A adaptação de perfil, a metadata legada de webhooks, o array legado de mensagens, a busca global composta e o fallback de concorrência de Appointments permanecem por compatibilidade, não como regras novas.
- O filtro `orgId` de webhook recovery requer futura confirmação de guard administrativo na API; removê-lo agora mudaria contrato.
- Inputs `z.any()` legados em Customers list, Executions e Onboarding devem ser estreitados somente em fase contratual com inventário de callers.
- P1: migrar callers aos namespaces canônicos e medir uso dos quatro aliases WhatsApp. P2: decidir remoção dos aliases e separar routers auxiliares adicionais apenas quando telemetria/testes provarem segurança.
