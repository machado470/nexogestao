---
status: review
owner: nexogestao
last_reviewed: 2026-09-07
source_of_truth: false
scope: phase-2-preparation
---

# Fase 2 — contratos, isolamento e prontidão operacional

## 1. Limites, método e conclusão executiva

Esta é uma auditoria de preparação, não uma implementação. A revisão foi feita sobre o merge `0b122fa998b62f47664359e8f4a4e3365213b3e7` e sua continuação documental local (`43f649ad`, equivalente no clone ao commit informado como `59e0705d`). Nenhum arquivo de produção ou superfície visual foi alterado.

O inventário executável é reproduzido por `node scripts/audit-phase2-contracts.mjs`. Ele procura marcadores abertos nos dez routers prioritários e nos dois contratos Nest com abertura mais crítica. A busca manual complementar cobriu controllers, services, acessos Prisma, filas/jobs, webhooks e testes dos domínios pedidos. Contagens são instrumentos de descoberta: um `orgId` presente ou um teste unitário com mock **não** prova isolamento.

Diagnóstico consolidado:

1. **Contratos são o primeiro gargalo.** A fundação de transporte retorna `any`, a maior parte das procedures prioritárias não declara `.output()`, e há entradas realmente abertas em Customers, Executions e Onboarding. Finance valida apenas a moldura da lista; WhatsApp normaliza webhook por inspeção de `any`; AI aceita mapas arbitrários e converte falha em resposta de sucesso lógico.
2. **O isolamento está majoritariamente implementado, mas é provado de ponta a ponta apenas no workflow canônico.** Customers, O.S., Finance, Dashboard e parte de Timeline têm evidência negativa cross-tenant no teste Postgres canônico. Onboarding, endpoints administrativos de WhatsApp, jobs/replay e várias mutations têm filtros no código, porém não têm prova executável cross-tenant equivalente.
3. **Não há base para remover compatibilidade.** `nexo.*` ainda é publicado como alias por referência. Há testes estáticos e de contrato, mas nenhuma métrica de invocação por namespace/procedure. Envelope duplo, fallbacks e warnings de modo degradado precisam ser observados antes de convergência.

### Classificação usada

- **A — contrato público crítico:** mutação, dado sensível ou decisão operacional/financeira atravessando browser ↔ BFF ↔ API.
- **B — contrato interno relevante:** job, webhook, integração, transporte ou leitura operacional cuja deriva afeta confiabilidade.
- **C — transformação de apresentação:** adaptação deliberada sem decisão de negócio.
- **D — tolerável/não prioritário:** metadata/log/test double sem autoridade de domínio imediata.

## 2. Inventário completo dos contratos abertos prioritários

### 2.1 Itens A e B — ficha de remediação

| Pri. / classe | Arquivo:linha; procedure/endpoint | Schema atual e payload real esperado | Risco e schema alvo recomendado | Dependências | Testes existentes → faltantes |
|---|---|---|---|---|---|
| P0 / A | `apps/web/server/routers/executions.ts:17`; `executions.start` → `POST /executions/start` | `z.any()`; `{serviceOrderId, notes?, checklist?, attachments?}` conforme controller/service | Campos forjados, formatos divergentes e inferência `any`; criar `executionStartInput.strict()` com IDs, notas e arrays de itens tipados | DTO Nest novo, `ExecutionService.start`, callers O.S. | concorrência de service/runner → contrato BFF/API, rejeição de extra keys e cross-tenant start |
| P0 / A | `apps/api/src/execution/execution.controller.ts:111-119`; start/complete | `@Body() body:any`; mesmo payload acima | ValidationPipe não protege o corpo; DTOs `StartExecutionDto` e `CompleteExecutionDto`, OpenAPI e limites de tamanho | tipos de checklist/anexo e compatibilidade histórica | testes de serviço → e2e 400 para payload inválido e 404 cross-tenant |
| P0 / A | `apps/web/server/routers/onboarding.ts:11,16`; `completeStep`, `complete` | `payload:any` e corpo inteiro `any`; API consome somente enum `step`, e `/complete` ignora corpo | API/BFF discordam e aceitam lixo silenciosamente; `step: enum(createCustomer,createService,createCharge)`, `.strict()`, e `complete` sem input | OnboardingController e callers SPECIAL | nenhum teste de contrato identificado → router contract + controller e2e + status cross-tenant |
| P0 / A | `apps/web/server/routers/customers.ts:5,100`; `customers.list` | `z.any().optional()`; query real é paginação, busca e filtros usados por `CustomersService.list` | orgId/keys arbitrários atravessam como query; schema estrito sem `orgId`, limites de page/limit/search/status | controller query DTO e CustomersPage, sem mudar UI | workflow canônico cobre leitura isolada → rejeição BFF de `orgId` e query contract |
| P0 / A | `apps/web/server/routers/finance.ts:11-19`; `finance.charges.list` | `{items: unknown[],meta}`; item real é Charge com customer/service order e datas | quebra financeira chega ao browser sem falha; `chargeSchema.strict/passthrough` deliberado + `paginatedSchema(chargeSchema)` | `FinanceService.listCharges`, Prisma selects, FinancesPage | envelopes simples/duplos em `bff-api-contract.test.ts` → conteúdo inválido, cents/datas/status e output schema |
| P0 / A | `apps/web/server/routers/finance.ts:23-231`; todas as demais queries/mutations | inputs fechados, mas resposta é `unwrapNexoApiResponse(raw)` sem `.output()` | charge/payment/stats/queue podem derivar silenciosamente; outputs canônicos discriminados | DTO/serialização Nest, ADR financeiro | service e alguns contratos BFF → output de create/get/update/cancel/pay/stats/queue e erros |
| P0 / A | `apps/web/server/routers/whatsapp.ts:100`; `sendTemplate` → `/whatsapp/messages/template` | `context: record<any>`; API DTO espera `templateName` + `variables`, BFF envia `templateKey` + `context` | incompatibilidade nominal e injeção de dados em template; eleger nomes oficiais e `record<string, string|number|boolean|null>` com limites | template registry, `SendTemplateMessageDto`, callers | template util/provider specs → contrato BFF/API real e rejeição de valor composto |
| P0 / A | `apps/web/server/routers/whatsapp.ts:128`; `requestExecution` | `actionPayload: record<any>`; payload varia por ação sugerida | execução pode receber entidade/campos incompatíveis; união discriminada por `suggestedAction` | `whatsapp-execution.service.ts`, Finance/O.S./Appointments | specs de execution service → matriz por ação, extra keys, cross-tenant entity |
| P0 / B | `apps/web/server/routers/whatsapp.ts:22-30,144-150`; webhook admin list/get | normalizador recebe/retorna `any` e aceita `rawPayloadMetadata` legado | mascara deriva e mantém alias sem medição; schema de evento + união explícita de envelope, métrica quando campo legado for usado | `WhatsAppWebhookService`, admin UI, transporte | webhook service e BFF geral → contract do normalizador e contador de legacy-field |
| P1 / A | `apps/web/server/routers/customers.ts:69`; `operationalSummary` | `factors: record<unknown>` e objetos `.passthrough()`; mapa real de fatores numéricos/booleanos do motor oficial | deriva de decisão oficial passa despercebida; schema versionado de fatores e extensões controladas | `customers-operational-summary.service.ts`, risk policy | service spec → snapshot/schema BFF contra payload real e rejeição de fator inválido |
| P1 / A | `apps/web/server/routers/ai.ts:18,121`; `analyze`, `generateReport` | mapas `record<any>`; JSON serializável de contexto/métricas | custo, PII e payload recursivo/volumoso sem limite; `JsonValue` limitado e, preferível, métricas nomeadas | LLM adapter, política de dados/custos | nenhum contrato específico identificado → limites, redaction, timeout e schema de saída |
| P1 / B | `apps/api/src/whatsapp/dto/whatsapp.dto.ts:49-51`; template API | `variables?: Record<string, any>` | ValidationPipe/OpenAPI não validam conteúdo; mesmo mapa escalar limitado do BFF | class-validator custom/nested DTO | provider/template specs → DTO validation/e2e |
| P1 / B | `apps/web/server/_core/nexoTransport.ts:28-35`; todo transporte canônico | `authedFetch` retorna `unwrap...<any>` | elimina inferência e permite resposta não validada em todos os routers | generics, schemas por router, `nexoEnvelope` | hardening/envelope tests → teste que procedure rejeita payload upstream incompatível |
| P1 / B | `apps/web/server/routers/dashboard.ts:68`; metadata de sinal | `record<unknown>` | metadata operacional não é interpretada hoje, mas pode virar dependência implícita | operational signals contract | dashboard truth/pipeline → schema de campos consumidos e preservação segura de extensões |
| P1 / B | `apps/web/server/routers/operational.ts:11`; mutation metadata | `record<unknown>` | fila recebe metadata arbitrária em ação privilegiada | `OperationalActionsService`, tipos de cada action | controller/service e router contract → união por `actionType`, limite e rejeição cross-tenant |

### 2.2 Itens C e D

| Classe | Ocorrência | Decisão de auditoria |
|---|---|---|
| C | `apps/web/server/routers/whatsapp.ts:22-30`, alias `rawPayloadMetadata` → `payloadMetadata` | Pode permanecer temporariamente, mas somente com métrica de uso do campo legado e teste de equivalência. Não remover agora. |
| C | `apps/web/server/routers/finance.ts:116-119`, `{items,meta}` → `{data,pagination}` | Transformação de apresentação legítima; documentar e testar, sem convergir envelopes nesta fase. |
| D | `apps/web/server/_core/operationalNotifications.ts:17`, analytics/dashboard/governance metadata `z.unknown()` | Extensão opaca tolerável enquanto não dirigir decisão; trocar por `JsonValue` é P2. |
| D | `Record<string, any>` em logger/Sentry/audit/modal state e casts em testes/mocks | Não é contrato público por si só. Migrar oportunisticamente para `unknown`/`JsonValue`, fora do primeiro pacote. |
| D | `Record<string, any>` em automation/webhook/queue internos | Relevante apenas quando cruza persistência/execução; abrir auditoria própria P1, não misturar com o pacote pequeno inicial. |

### 2.3 Respostas sem schema e envelopes

Nos routers prioritários, somente Operations e partes do Dashboard declaram `.output()`. Customers (exceto parse manual do summary), Executions, Onboarding, WhatsApp, AI, Finance, Timeline e Service Orders retornam resultados inferidos de funções `any/unknown`. Portanto, **toda procedure sem `.output()` é registrada como dívida**, mesmo quando o input é fechado. A ordem é: mutations financeiras/execução/WhatsApp (P0), leituras Customers/Finance/Onboarding (P1), demais leituras (P2).

A API Nest pode devolver payload direto e o interceptor pode gerar `{data}`, `{success,data}` ou duplo envelope. `unwrapNexoApiResponse` aceita todos e até seis níveis. Essa tolerância é compatibilidade existente, não contrato alvo. Não alterá-la antes de medir: `envelope_shape_total{shape,route}`, `envelope_unwrap_depth`, e `envelope_invalid_total{route}`.

## 3. Matriz executável de isolamento multi-tenant

Legenda rigorosa: **PROVADO POR TESTE** exige cenário negativo com duas organizações e persistência/HTTP real; mocks que apenas esperam `{orgId}` resultam em **IMPLEMENTADO SEM TESTE**.

| Fluxo | Controller/BFF | Service/Prisma | async/webhook | Estado e evidência / lacuna |
|---|---|---|---|---|
| Customers list/get/workspace/create/update | `@Org()`; BFF não injeta org, mas list aceita query aberta | filtros `{id,orgId}`, `updateMany` scoped | notificações/timeline recebem org | **PROVADO POR TESTE** para workflow/list cross-tenant; workspace/update são **IMPLEMENTADO SEM TESTE** negativo completo |
| Executions start/complete/list | `@Org()`; start BFF/body abertos | service valida O.S. e mutations por org | runner carrega candidatos e entidades por org | **PARCIAL**: concorrência/runner Postgres existem; falta e2e HTTP cross-tenant start/complete e spoof de payload |
| Onboarding status/complete | org vem de `req.user`, não do corpo | counts por org; Organization por PK igual ao org autenticado | N/A | **IMPLEMENTADO SEM TESTE**; falta duas orgs e prova de que completar A não altera B |
| WhatsApp conversas/mensagens/actions | `@Org()` e BFF protegido | serviços geralmente usam `{id,orgId}` | jobs carregam `orgId`; claims/fencing testados | **PARCIAL**: lifecycle e segurança fortes; falta matriz HTTP/DB negativa para conversation/message/action IDs |
| WhatsApp webhook público | assinatura/provider identifica evento; não há usuário | correlação resolve org do recurso/provider | replay/admin usa org autenticado, worker persiste org | **RISCO** até teste provar que payload/provider forjado não correlaciona outra org; segurança de assinatura sozinha não prova tenant |
| Dashboard/Operations | `@Org()` nas leituras tenant; rotas internas protegidas | agregações operacionais recebem org onde aplicável | health global é deliberadamente agregado | Dashboard **PROVADO POR TESTE** no workflow; Operations **PARCIAL** (alguns diagnósticos globais/admin exigem autorização e redaction testadas) |
| Finance charges/payments/remind | `@Org()`, BFF não expõe org no input | lookups/mutations incluem org, idempotência scoped | overdue cron itera dados/organizações | **PROVADO POR TESTE** para charge read/isolation no workflow; pay/cancel/remind/cron **PARCIAL** sem matriz negativa completa |
| Timeline org/customer/O.S. | `@Org()`; IDs vêm do input | queries `{orgId,entityId}` e valida atores/clientes | dispatch webhook é best effort | leituras principais **PROVADO POR TESTE** no workflow; `log`/webhook failure são **IMPLEMENTADO SEM TESTE** de vazamento |
| O.S. list/get/create/update/generate charge/anexos | `@Org()` + guard de anexo | entidades relacionadas e mutations scoped | timeline/risk/notifications recebem org | leituras/criação **PROVADO POR TESTE**; update/anexo/generateCharge **PARCIAL**; guard que retorna `true` sem id/org requer caracterização |
| AI | sessão protegida, sem endpoint Nest | recebe dados enviados pelo próprio caller; não consulta por org | provedor LLM externo | **RISCO** de exfiltração/PII e ausência de quota/audit tenant; não é isolamento Prisma |

### Provas exatas a acrescentar

1. `apps/api/test/integration/phase2-tenant-mutations-postgres.integration.spec.ts`: duas orgs; negar update Customer/O.S., start/complete Execution, pay/cancel/remind Charge, retry/action WhatsApp e completar Onboarding alheio.
2. `apps/api/test/integration/whatsapp-webhook-tenant-correlation-postgres.integration.spec.ts`: assinatura válida, IDs de provider conflitantes e replay; nenhuma escrita/timeline na org errada.
3. `apps/web/server/phase2-input-contracts.test.ts`: `orgId` e extra keys rejeitados; enums/limites; BFF nunca encaminha autoridade tenant do browser.
4. Manter `canonical-operational-workflow.spec.ts` como prova de leituras; não ampliar esse arquivo com todas as mutations para evitar fixture monolítica.

## 4. Telemetria obrigatória antes de convergência

| Caminho | Estado atual | Telemetria mínima antes de mudar/remover | Critério futuro (não executar agora) |
|---|---|---|---|
| alias `nexo.*` | router compatível reutiliza implementações; busca estática só prova callers deste repo | `bff_procedure_calls_total{namespace,procedure,outcome}` e versão do cliente; dashboard por 30 dias | zero tráfego no alias na janela acordada, consumidores externos confirmados e rollback |
| normalização de envelope | unwrap aceita direto/simples/duplo e profundidade até 6 | shape/depth/route, payload inválido e upstream status | uma forma dominante comprovada e contract tests antes de reduzir tolerância |
| webhook WhatsApp `rawPayloadMetadata` | fallback silencioso no BFF | contador do campo legado por provider/route, sem conteúdo sensível | zero uso observado + migration/replay compatível |
| provider WhatsApp mock/dev | warnings de boot | gauge `whatsapp_provider_info`, contador `whatsapp_provider_fallback_total`, alerta se mock fora de dev | nunca remover proteção; bloquear produção e testar startup |
| retry WhatsApp/Queue | há métricas de retry/degraded, logs de persistência falha | tentativas, atraso, final failure, org hash/queue, DLQ age e alerta SLO | calibrar alertas antes de alterar política |
| Billing sem Stripe/simulado | apenas warnings em trechos críticos | gauge enabled/mode, checkout simulated/disabled, webhook ignored por razão | nenhuma remoção sem tráfego e configuração de produção provados |
| AI graceful fallback | retorna `ok:false` no HTTP/tRPC bem-sucedido | latência, provider error class, fallback total, custo/tokens, tenant seguro | definir error envelope/SLO antes de mudar UX |
| Timeline best effort | vários `console.warn`, incluindo evento pulado/webhook falho | `timeline_event_skipped_total{reason}`, dispatch failure/retry e alerta | corrigir causas dominantes antes de tornar falha hard |
| retry/refetch do browser | políticas distribuídas entre hooks/client | inventário por procedure: attempts, cancel, stale/refetch reason, erro final | somente depois, alinhar defaults; nenhuma decisão operacional local |

Warnings que hoje precisam sair de “só log”: falha de dispatch da Timeline, evento Timeline pulado, persistência de falha retryable WhatsApp, variável ausente em template, Billing desabilitado/simulado/webhook ignorado, provider fallback e Bull Board/fila degradada.

## 5. Matriz priorizada e pacote recomendado

### P0 — antes de ampliar produção

- Fechar os inputs de `executions.start/complete`, alinhar DTO Nest e adicionar outputs dessas mutations.
- Fechar Customers list contra `orgId`/chaves extras e provar spoofing no BFF.
- Corrigir por contrato (não por UI) a divergência WhatsApp template `templateKey/context` versus `templateName/variables`.
- Especificar itens Finance e outputs de mutations críticas.
- Criar as provas negativas cross-tenant das mutations; webhook correlation é bloqueador operacional.

### P1 — imediatamente depois

- Outputs de leitura para Customers/Executions/Onboarding/WhatsApp/Timeline/O.S.; DTOs/OpenAPI correspondentes.
- União discriminada de `actionPayload` WhatsApp e metadata de Operations.
- Métricas de alias, envelope shape, fallbacks e warnings; caracterizar jobs/cron/replay.
- Contrato de dados/PII/custo para AI.

### P2 — dívida controlada

- Trocar metadata opaca e infraestrutura `Record<string, any>` por `JsonValue`/`unknown` seguro.
- Normalizar envelope somente após observação.
- Considerar remoção de aliases somente depois da janela com zero tráfego.

### Primeiro pacote de implementação recomendado (parar antes de executar)

**Escopo pequeno:** “Execution start/complete contract slice”. Ele fecha somente duas mutations ponta a ponta e adiciona caracterização tenant, sem UI, sem convergência global e sem remover compatibilidade.

Arquivos exatos que o pacote alteraria:

1. `apps/api/src/execution/dto/start-execution.dto.ts` (novo).
2. `apps/api/src/execution/dto/complete-execution.dto.ts` (novo; pode compartilhar item schemas com o anterior).
3. `apps/api/src/execution/execution.controller.ts` (substituir bodies `any`, adicionar OpenAPI de body/response).
4. `apps/web/server/routers/executions.ts` (schemas estritos de input/output; sem tocar alias, que reutiliza o router).
5. `apps/web/server/phase2-executions-contract.test.ts` (novo contrato BFF, extra keys e payload upstream inválido).
6. `apps/api/test/integration/phase2-execution-tenant-postgres.integration.spec.ts` (novo teste duas orgs para start/complete).

Testes exatos a criar/rodar nesse pacote:

```bash
pnpm --filter ./apps/web test -- phase2-executions-contract.test.ts
pnpm --filter ./apps/api test -- execution.controller phase2-execution-tenant-postgres.integration.spec.ts
RUN_REAL_INTEGRATION=true pnpm --filter ./apps/api test -- test/integration/phase2-execution-tenant-postgres.integration.spec.ts
pnpm --filter ./apps/web typecheck
pnpm --filter ./apps/api typecheck
pnpm --filter ./apps/web test -- bff-api-contract.test.ts bff-router-decomposition.test.ts
```

Riscos de regressão: checklist/anexos históricos podem conter formas não inventariadas; `.strict()` pode rejeitar callers externos; output real pode carregar datas/nullable diferentes; status HTTP 400/404 pode mudar; fixture Postgres pode depender de migrations/Redis. Mitigação: capturar payloads reais/fixtures antes do schema, aceitar apenas extensões comprovadas, rollout sem remoção do alias e preservar rollback por commit.

## 6. Guardrail final

Este plano não reabre Dashboard, Clientes, Agendamentos, Calendário, O.S., Financeiro, WhatsApp, Timeline, Governança, Pessoas, Perfil, Configurações, Billing, Audit, Webhook Recovery nem Operational Cockpit. Não altera Onboarding para `AppPageShell`, não cria decisão no navegador, não remove `nexo.*`, não converge envelopes e não modifica código de produção. A próxima ação é aprovação explícita do pacote; esta entrega para antes da implementação.
