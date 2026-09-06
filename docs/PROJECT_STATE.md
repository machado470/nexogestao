---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
  - STATUS.md
  - O_QUE_FALTA.md
---

# Estado atual do projeto

## Consolidado

- Arquitetura macro: React/Vite → BFF tRPC → API NestJS → Prisma/PostgreSQL, com Redis para capacidades assíncronas.
- Catálogo documental, separação entre documentação normativa, documentos em revisão, auditorias temporais e arquivo histórico.
- Regras operacionais vigentes de agendamentos, ordens de serviço, pessoas/configurações, timeline, eventos e padrões do frontend permanecem explicitamente catalogadas.
- O BFF foi decomposto em routers canônicos por domínio; `nexo.*` permanece apenas como composição compatível das mesmas implementações, e o transporte BFF → API usa uma fundação compartilhada.
- Service Orders e WhatsApp preservam facades públicas, com leituras tenant-scoped extraídas para serviços focados conforme o ADR 0004; transações, claims, Timeline, Outbox e autoridade Finance permanecem nas unidades originais.
- Os consumidores de produção do frontend usam os routers canônicos diretamente. A migração eliminou 98 chamadas `trpc.nexo.*` e 71 acessos diretos de cache pelo namespace legado (60 `utils.nexo.*` e 11 `trpcUtils.nexo.*`), além de um acesso dinâmico a `trpcUtils.nexo` sem alterar inputs, outputs ou efeitos das operações.

## Matriz de migração dos callers `nexo.*`

Todos os caminhos abaixo são referências à mesma instância de procedure nos routers canônico e de compatibilidade. Por isso, input e output são idênticos por construção. A ação foi trocar somente o namespace; onde havia cache, query, `invalidate`, `refetch`, `fetch`, `getData` e `setData` foram migrados juntos.

| Callers de produção | Procedures legadas → canônicas | Input/output | Cache | Testes relacionados | Risco | Ação |
| --- | --- | --- | --- | --- | --- | --- |
| AuthContext e páginas Login, callback, convite, confirmação e recuperação de senha | `nexo.auth.{login,register,establishSession,acceptInvite,verifyEmail,resendEmailVerification,forgotPassword,resetPassword}` → `auth.*` | iguais | nenhum acesso manual | sessão e contratos BFF/API | médio | B |
| Profile | `nexo.me` → `auth.me` | mesma `meProcedure` | opções da query preservadas | validação de sessão | médio | B |
| páginas/modais/hooks de Customers, Calendar, Appointments, Onboarding, Service Orders e WhatsApp | `nexo.customers.{list,getById,create,update,workspace,operationalSummary}` → `customers.*` | iguais | query, optimistic `getData`/`setData`, refetch e invalidations migrados | contratos operacionais | médio | B |
| páginas/modais/hooks de Appointments, Calendar, Customers, Onboarding, Service Orders e WhatsApp | `nexo.appointments.{list,create,update}` → `appointments.*` | iguais | query e invalidations migradas | appointments/tenancy | médio | B |
| páginas/modais/hooks de Service Orders, Appointments, Customers, Onboarding e WhatsApp | `nexo.serviceOrders.{list,getById,create,update,generateCharge}` → `serviceOrders.*` | iguais | query, fetch, optimistic cache e invalidations migrados | O.S./contratos operacionais | médio | B |
| Service Orders, detalhes e barra global | `nexo.executions.{listByServiceOrder,start,complete,mode,stateSummary,events,updateMode,runOnce}` → `executions.*` | iguais | query, fetch e invalidations migrados | guardrails de execução | médio | B |
| Timeline, People, Dashboard, Appointments, Service Orders e hooks compartilhados | `nexo.timeline.{listByOrg,listByCustomer,listByServiceOrder}` → `timeline.*` | iguais | query e invalidations migradas | timeline/dashboard truth | médio | B |
| WhatsApp, Dashboard, recuperação de webhook, detalhes de O.S. e helpers | todas as 21 referências em `nexo.whatsapp.*` → `whatsapp.*` | iguais | conversations, messages, contexto, aprovações e DLQ migrados em conjunto | contratos WhatsApp/webhook | alto | B |
| Settings | `nexo.settings.{get,administrativeSummary,update}` → `settings.*` | iguais | invalidations migradas | contratos BFF/API | baixo | B |
| Audit | `nexo.audit.{listEvents,getSummary}` → `audit.*` | iguais | sem acesso manual | contrato da página | baixo | A |
| Operational Cockpit | `nexo.operations.{summary,incidents}` → `operations.*` | iguais | intervalo de refetch preservado | contrato do cockpit | baixo | A |
| Global Search | `nexo.globalSearch.search` → `globalSearch.search` | iguais | opções preservadas | suíte web | baixo | A |
| Onboarding e demo | `nexo.onboarding.complete`/`nexo.demo.bootstrapLive` → routers homônimos | iguais | invalidations pós-bootstrap migradas | suíte web | médio | B |

Categorias: **A** é migração direta segura; **B** inclui cache, sessão ou efeitos que exigiram migração coordenada. Não foram encontrados callers internos de produção nas categorias C–F.

## Compatibilidade `nexo.*` após a migração

- **Ainda usados internamente:** somente por testes de compatibilidade BFF, que provam sessão, tenancy, contratos e que os aliases continuam funcionais; não há caller de produção no frontend.
- **Sem consumidor interno de produção:** `operations`, `auth`/`me`, `customers`, `appointments`, `serviceOrders`, `timeline`, `executions`, `whatsapp`, `demo`, `settings`, `onboarding`, `invites`, `globalSearch`, `audit` e `risk`.
- **Compatibilidade externa possível:** todos os aliases acima permanecem publicados sob `nexo.*`; sua remoção depende de telemetria ou de confirmação dos consumidores externos.
- **Especiais/administrativos:** preservar especialmente `nexo.me` e todo `nexo.whatsapp.*`, inclusive recovery de webhook, aprovações e compatibilidade histórica administrativa.
- **Candidatos futuros:** os aliases sem tráfego comprovado podem ser removidos em fase posterior, nunca apenas com base na ausência de referências estáticas internas.

Os contratos legados com `z.any()` permanecem localizados em Customers, Executions, Onboarding e WhatsApp (além de AI, fora desta migração); nenhum novo uso foi criado. O fallback dinâmico de Customers apontava para nomes de timeline inexistentes no alias; as invalidações ativas foram direcionadas a `timeline.listByCustomer`/`listByOrg` e a sondagem opcional sem procedure foi removida. Nenhum input de `orgId`, `tenantId` ou `organizationId` foi adicionado no browser, nenhum contrato REST foi alterado e os aliases continuam reutilizando as instâncias canônicas.

## Parcial

- Finance, Payments e Billing possuem fronteiras consolidadas no ADR 0002; integrações de WhatsApp, Stripe, filas, webhooks e automação ainda dependem de ambiente e/ou mantêm pontos operacionais em revisão.
- Cobertura de testes é relevante, porém a matriz de contratos BFF↔API e de isolamento multi-tenant não cobre explicitamente toda a superfície crítica.
- Deployment possui artefatos para mais de um alvo; a autoridade única de produção ainda não está definida.

## Precisa de reestruturação

- Migração dos normalizadores locais restantes fora dos domínios decompostos para a fundação única de envelopes do BFF.
- Runbook autoritativo de produção e estratégia canônica de backup/restauração.

## Prioridades atuais

- **P0:** nenhum defeito determinístico aberto foi comprovado pela auditoria da Fase 1. Permanece o risco potencial de indisponibilidade no bootstrap autenticado quando a validação upstream de sessão falha.
- **P1:** completar OpenAPI para futura geração de contratos; migrar callers de `nexo.*` para routers canônicos com telemetria antes de remover aliases; cobrir rotas administrativas ainda ausentes da matriz multi-tenant; observabilidade dos fallbacks de WhatsApp, Queue e Billing; definição operacional de produção.

## Próxima fase

Prosseguir com a próxima etapa de consolidação sem reabrir as fronteiras financeiras nem remover aliases sem evidência de uso. A autoridade API/BFF está no ADR 0001, Finance/Payments/Billing no ADR 0002, a composição de routers no ADR 0003 e a decomposição operacional no ADR 0004.
