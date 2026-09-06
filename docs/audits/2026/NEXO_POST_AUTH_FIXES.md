# NexoGestao — correções pós-auth aplicadas

Data: 2026-06-04.
Commit alvo: `fix(app): resolve post-auth contract and protected page failures`.

## Resumo das causas corrigidas

- **Envelope BFF↔API**: consolidado helper `unwrapNexoApiResponse` para normalizar respostas diretas, `{ data }`, `{ success, data }`, `{ ok, data }` e o envelope duplo gerado pelo `ApiResponseInterceptor` sem transformar erro HTTP em dado falso.
- **Finances/Profile**: `finance.charges.list` agora valida o payload já normalizado como `{ items, meta }`, eliminando o erro Zod de `data.items`/`data.meta` quando a API retorna envelope duplo válido.
- **Audit**: `AuditAdminController` e `AuditAdminService` foram registrados no `AuditModule`, preservando `@Roles('ADMIN')` no controller.
- **Timeline**: `TimelinePage` passou a aguardar sessão autenticada antes de disparar `protectedProcedure`, preservando `retry: false`.
- **Calendar**: criada leitura operacional tenant-scoped de responsáveis em `/people/assignees`, sem relaxar o CRUD/admin global de `/people`; o Calendar usa esse procedimento específico.
- **Billing**: a tela não bloqueia mais por falha de readiness crítica de `/health/readiness`; o plano persistido `BUSINESS` é tratado como o plano comercial exibido como Scale, sem criar enum novo.
- **Settings/Profile**: revalidação coberta pela normalização transversal de envelopes em rotas `nexo.*` e por `finance.charges.list`.

## Arquivos alterados

- `apps/web/server/_core/nexoEnvelope.ts`: novo helper seguro de unwrap do envelope da API Nest.
- `apps/web/server/routers/finance.ts`: aplicação do helper e schema de contrato para listagens paginadas de cobranças.
- `apps/web/server/routers/nexo-proxy.ts`: normalização transversal nos helpers autenticados usados por settings, profile, audit, timeline e demais rotas Nexo.
- `apps/web/server/routers/people.ts`: normalização do envelope e novo procedimento `people.assignees`.
- `apps/web/server/routers/billing.ts`: normalização do envelope para planos/status/limites/ações de billing.
- `apps/web/server/routers/integrations.ts`: normalização do envelope de readiness, mantendo erros reais propagados.
- `apps/api/src/audit/audit.module.ts`: registro de controller/service administrativos de audit.
- `apps/api/src/audit/audit.module.spec.ts`: teste mínimo de registro do módulo.
- `apps/api/src/people/people.controller.ts`: endpoint operacional `/people/assignees` com orgId da sessão e papéis operacionais.
- `apps/web/client/src/pages/TimelinePage.tsx`: gating de query protegida por `isAuthenticated`.
- `apps/web/client/src/pages/CalendarPage.tsx`: troca do filtro auxiliar para `people.assignees`.
- `apps/web/client/src/pages/BillingPage.tsx`: alinhamento `BUSINESS`/Scale e readiness informativa.
- `apps/web/server/bff-api-contract.test.ts`: cobertura de contrato para envelopes simples/duplo, payload inválido e assignees tenant-scoped.

## Helper de unwrap

O helper `unwrapNexoApiResponse` aplica a regra documentada:

```ts
raw.data.data ?? raw.data ?? raw
```

com suporte adicional a envelopes explícitos `{ success: true, data }` e `{ ok: true, data }`. Se receber `{ success: false }` ou `{ ok: false }` como resposta 2xx malformada, lança erro controlado em vez de devolver dado falso. Erros HTTP seguem sendo tratados por `nexoFetch` e propagados como `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, etc.

## Endpoints/routers corrigidos

- BFF `finance.charges.list` → API `GET /v1/finance/charges`.
- BFF `nexo.settings.get/update` → API `GET/PATCH /v1/organization-settings` via normalização transversal.
- BFF `nexo.me` → API `GET /v1/me` via normalização transversal.
- BFF `nexo.audit.listEvents/getSummary` → API `GET /v1/audit/events` e `GET /v1/audit/summary` após registro do módulo.
- BFF `nexo.timeline.listByOrg` → API `GET /v1/timeline` com gating no frontend.
- BFF `people.assignees` → API `GET /v1/people/assignees`.
- BFF `billing.plans/status/limits` → API `GET /v1/billing/*` com envelope normalizado.

## Testes adicionados/ajustados

- Contrato BFF para `finance.charges.list` com `raw.data.items/meta`.
- Contrato BFF para `finance.charges.list` com `raw.data.data.items/meta`.
- Contrato BFF garantindo que payload inválido continua falhando.
- Contrato BFF para `people.assignees` sem `orgId` vindo do frontend.
- Teste de módulo API garantindo registro de `AuditAdminController` e `AuditAdminService`.

## Páginas validadas logicamente

- `/finances`: recebe lista/paginação normalizadas quando a API retorna envelope duplo válido.
- `/timeline`: não dispara query protegida antes de sessão autenticada.
- `/audit`: endpoints admin passam a existir no módulo API e seguem restritos a ADMIN.
- `/calendar`: usa endpoint operacional de responsáveis compatível com papéis permitidos e tenant-scoped.
- `/billing`: readiness crítica não derruba a tela de assinatura; `BUSINESS` é exibido como Scale.
- `/settings`: rotas BFF passam pelo unwrap transversal.
- `/profile`: `nexo.me` e cobranças passam pelo unwrap/contrato corrigidos.

## Pendências

- Validação manual completa em navegador com sessão piloto/admin depende de ambiente local com API, DB e usuários seedados disponíveis.
- Se `/settings` ainda for acessada por papel não-admin, a API continuará retornando `403` conforme o contrato atual documentado; isso é uma decisão de produto/autorização separada e não foi relaxada neste lote.

## Correções finais das páginas internas remanescentes

Data: 2026-06-04.

Este complemento fecha os problemas restantes observados em `/audit`, `/profile`, `/settings` e nos blocos operacionais de `/people`.

### O que foi corrigido

- `/audit`: as queries administrativas agora dependem explicitamente de sessão autenticada e role `ADMIN` antes de disparar. A proteção visual e o `@Roles('ADMIN')` da API foram preservados.
- `/profile`: `nexo.me` no BFF normaliza o payload real de `/me` para expor dados reais de `user/person` no nível que a página consome, mantendo também `organization`, `operational`, `pending` e `assignments`. As queries protegidas da página passaram a usar `enabled: isAuthenticated`.
- `/settings`: a rota frontend foi alinhada à exigência real de `ADMIN`; settings/members continuam bloqueantes, mas readiness deixou de bloquear renderização porque é health ambiental informativo. As queries usam `enabled: isAuthenticated` e mantêm `retry: false`.
- `/people`: `analytics.assigneeWarningSummary` passou a remover envelopes globais/duplos da API no BFF antes de entregar o contrato operacional ao frontend. O endpoint segue tenant-scoped e sem aceitar `orgId` do client.

### Garantias mantidas

- Nenhum mock ou dado falso foi criado para esconder falha.
- `orgId` continua derivado da sessão/token.
- Guards e roles administrativos foram mantidos.
- `retry: false` foi preservado nas queries alteradas.
- Não houve alteração visual, de tema, shell, sidebar ou design system.

Relatório detalhado: `docs/NEXO_FINAL_INTERNAL_PAGES_FIXES.md`.
