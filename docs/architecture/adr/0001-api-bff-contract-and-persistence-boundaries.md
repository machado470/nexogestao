---
status: accepted
date: 2026-09-06
owners: nexogestao
---

# ADR 0001 — Autoridade de contratos e persistência entre API e BFF

## Contexto e decisão

A API NestJS permanece a autoridade de domínio e a única autoridade de persistência relacional. O browser consome procedimentos tRPC; o BFF valida sessão e contratos de fronteira, encaminha o bearer token e adapta somente diferenças de transporte. `orgId` enviado pelo browser não é fonte de tenant. A API deriva o tenant da identidade autenticada e os services/repositories aplicam o filtro antes do Prisma.

Adotamos consolidação incremental, não geração global imediata: OpenAPI/DTOs da API descrevem a superfície autoritativa, enquanto schemas Zod no BFF são validações defensivas de fronteira. Antes de gerar clientes, a API precisa completar e estabilizar seus decorators OpenAPI. Tipos compartilhados só devem representar vocabulário estável e não podem se tornar uma segunda implementação de regras de domínio.

O normalizador único de transporte do BFF é `unwrapNexoApiResponse`. Ele aceita payload direto e envelopes `data`, `success` ou `ok`, inclusive duplos, mas rejeita explicitamente `success: false`/`ok: false` e preserva `null`. Dashboard foi migrado do normalizador local para essa fundação como prova incremental.

## Matriz de contratos críticos

| Contrato | tRPC BFF | REST API | DTO/schema e transformação | Envelope/teste principal |
| --- | --- | --- | --- | --- |
| sessão/me | `nexo.auth.establishSession`, `nexo.me` | `POST /v1/auth/login`, `GET /v1/me` | DTOs auth; BFF normaliza perfil e só cria sessão após `/me` | direto/envelopado; `auth.session-validation.test.ts` |
| customers | `nexo.customers.*` | `/v1/customers[/:id][/workspace]` | DTOs Nest + inputs Zod; sem `orgId` no input | normalizador central; contract/UI + service workspace |
| appointments | `nexo.appointments.*` | `/v1/appointments[/:id]` | DTOs Nest + inputs Zod; datas serializadas | normalizador central; page contracts + service spec |
| service-orders | `nexo.serviceOrders.*` | `/v1/service-orders[/:id]` | DTOs Nest + inputs Zod; geração de charge fica na API | normalizador central; page/service contract specs |
| finance | `finance.*` | `/v1/finance/*` | DTOs financeiros na API; BFF só converte datas/valida paginação | envelope simples/duplo; `bff-api-contract.test.ts` |
| dashboard | `dashboard.kpis/alerts/executivePipeline` | `/v1/dashboard/metrics`, `/alerts`, `/executive-pipeline` | retorno autoritativo validado por Zod, sem recalcular KPI | normalizador central; dashboard truth/pipeline tests |
| governance | `governance.*`, `dashboard.operationalState` | `/v1/governance/*` | enums/resultado calculados pela API; BFF não infere estado | normalizador central; governance/dashboard truth tests |
| operational-signals | `dashboard.operationalSignals` | `/v1/internal/operational-signals` | `limit` validado; array e severidade validados | normalizador central; dashboard truth tests |
| next-best-action | `dashboard.nextBestAction` | `/v1/internal/operational-signals/next-best-action` | objeto autoritativo ou `null`; nenhuma priorização no browser | normalizador central; dashboard truth tests |
| timeline | `nexo.timeline.*` | `/v1/timeline*` | filtros Zod; apresentação/taxonomia ficam na API | normalizador central; timeline authority/UI tests |
| whatsapp | `nexo.whatsapp.*` | `/v1/whatsapp/*` | inputs Zod e DTOs Nest; lógica operacional permanece na API | normalizador central + adaptação webhook legada; contract/action tests |

Os tipos inferidos do router tRPC são o tipo consumido pelo React. Assim, não há uma terceira interface manual obrigatória entre procedure e componente; duplicações restantes estão sobretudo entre DTOs OpenAPI e schemas Zod de fronteira.

## Matriz de tenancy

| Superfície | Autenticação | Fonte do tenant | Prova cross-tenant/transversal | Resultado |
| --- | --- | --- | --- | --- |
| customers | procedure protegida + JWT API | sessão/JWT validado | workflow canônico + workspace service specs | filtrado por organização |
| appointments | procedure protegida + JWT API | sessão/JWT validado | workflow canônico + service specs | filtrado por organização |
| service-orders | procedure protegida + JWT API | sessão/JWT validado | workflow canônico + service specs | filtrado por organização |
| finance | procedure protegida + JWT API | sessão/JWT validado | workflow canônico + BFF rejeita `orgId` | filtrado por organização |
| people | procedure protegida + JWT API | sessão/JWT validado | BFF contract + people service specs | filtrado por organização |
| dashboard | procedure protegida + JWT API | sessão/JWT validado | dashboard controller/service + BFF truth | filtrado por organização |
| governance | procedure protegida + JWT API | sessão/JWT validado | governance read specs + BFF truth | filtrado por organização |
| timeline | procedure protegida + JWT API | sessão/JWT validado | authority/presenter/event specs | filtrado por organização |
| whatsapp | procedure protegida + JWT API | sessão/JWT validado; webhook resolve organização por configuração verificada | controller/service/security specs | filtrado; webhook falha sem resolução válida |

O teste de integração canônico continua sendo a prova transversal real. Testes BFF garantem adicionalmente que parâmetros de organização do navegador não sejam encaminhados. Endpoints administrativos cross-tenant devem declarar guard e escopo explicitamente; não existe fallback permitido para tenant vazio.

## Auditoria da persistência no web

- Não há import nem instanciação de `@prisma/client` em `apps/web`; a dependência declarada era morta e foi removida.
- A migration isolada `apps/web/prisma/migrations/add_soft_delete_and_audit.sql` não era referenciada por script, configuração ou teste. As migrations executáveis são as da raiz `prisma/migrations`; o arquivo isolado foi removido.
- `_core/dataLoader.ts` aceitava um `db: any`, mas não tinha consumidor. `_core/dataApi.ts` era um cliente de proxy externo também sem consumidor. Ambos foram removidos para eliminar a aparência de uma segunda fronteira de dados.
- `server/storage.ts` é usado por geração de imagem e acessa object storage por HTTP; não é persistência relacional nem Prisma e permanece.

Logo: o BFF **não acessa diretamente o banco**, `@prisma/client` **não é necessário no web**, a migration do web **não participava de fluxo real** e **não há segunda autoridade relacional comprovada**.

## Consequências e próximos passos

- Novos routers devem reutilizar `unwrapNexoApiResponse`; normalizadores locais só permanecem quando adaptam um contrato legado específico.
- P1: completar OpenAPI dos contratos críticos e avaliar geração de tipos sem mover validação de domínio para o BFF.
- P1: ampliar provas cross-tenant somente onde o workflow transversal e os specs de service não cobrem uma rota administrativa específica.
- Finance/Payments/Billing e a decomposição de WhatsApp permanecem fora desta decisão.

