# NexoGestao — Post-auth triage de páginas autenticadas

Data da auditoria: 2026-06-04.
Escopo: `/settings`, `/profile`, `/audit`, `/timeline`, `/calendar`, `/billing`, `/finances`.

## Resumo executivo

Os crashes de renderização foram estabilizados, mas ainda há falhas de contrato e autorização. A causa transversal mais importante é que o BFF e o frontend ainda não consomem de forma uniforme o envelope real da API Nest. A API aplica `ApiResponseInterceptor`, então vários controllers retornam `success/data` por fora do payload do controller. Quando o controller já retorna `{ ok, data }` ou `{ success, data }`, o shape real vira duplamente aninhado.

Exemplo crítico em finanças:

- Esperado pelo BFF: `{ data: { items: Charge[], meta: Pagination } }`.
- Real da API: `{ success: true, data: { ok: true, data: { items: Charge[], meta: Pagination } } }`.
- Resultado: Zod lê `raw.data.items` e `raw.data.meta`, ambos `undefined`, gerando `expected array at data.items` e `expected object at data.meta`.

Outro eixo recorrente é autorização: algumas páginas internas são acessíveis por papéis mais amplos no frontend, mas chamam endpoints API restritos a `ADMIN`.

## Matriz de diagnóstico

| Página | Query front que falha | Endpoint BFF chamado | Endpoint API chamado | Payload esperado | Payload real recebido/inferido | Erro real | Causa raiz | Tipo | Correção recomendada |
|---|---|---|---|---|---|---|---|---|---|
| `/settings` | `trpc.nexo.settings.get`; secundárias: `trpc.nexo.invites.members`, `trpc.integrations.readiness` | `nexo.settings.get`, `nexo.invites.members`, `integrations.readiness` | `GET /v1/organization-settings`, `GET /v1/auth/organization/members`, `GET /v1/health/readiness` | Settings: objeto operacional da organização com `name`, `timezone`, `currency` etc. Members: lista de membros. Readiness: objeto de saúde/integrações. | Settings vem envelopado pela API como `{ success: true, data: <settings> }`. Members vem como `{ success: true, data: <members[]> }`. Readiness pode retornar `503` se DB/queue não estiverem prontos; quando OK vem `{ success: true, data: { status, checks, integrations } }`. | Para usuário não ADMIN, `GET /organization-settings` e `GET /auth/organization/members` retornam `403`. Para ambiente sem readiness crítica, `GET /health/readiness` pode retornar `503`. | A rota frontend `/settings` não exige `ADMIN`, mas os endpoints de settings/membros exigem `ADMIN` na API. Além disso, a página chama readiness crítica operacional como dependência de renderização de configurações. | role + payload/envelope + readiness ambiental | Definir contrato de rota: ou restringir `/settings` a `ADMIN`, ou separar leitura operacional não-admin de configurações administrativas. Normalizar BFF para remover o envelope `{ success, data }`. Tornar readiness informativa/não bloqueante na página. |
| `/profile` | `trpc.nexo.me`; secundárias: `trpc.nexo.appointments.list`, `trpc.nexo.serviceOrders.list`, `trpc.finance.charges.list`, `trpc.nexo.timeline.listByOrg` | `nexo.me`, `nexo.appointments.list`, `nexo.serviceOrders.list`, `finance.charges.list`, `nexo.timeline.listByOrg` | `GET /v1/me`, `GET /v1/appointments`, `GET /v1/service-orders`, `GET /v1/finance/charges`, `GET /v1/timeline` | Um payload operacional do usuário já achatado, com `id`, `personId`, `person`, `role`, `active`; listas pessoais/operacionais carregáveis para filtrar tarefas, agenda, cobranças e timeline. | `/me` real vem como `{ success: true, data: { success: true, data: { user, organization, operational, pending, assignments, requiresOnboarding, redirect } } }` porque o controller também retorna `success/data` e a API aplica interceptor global. `finance.charges.list` recebe o shape duplo descrito em `/finances`. | Perfil fica sem `personId`/`role` no nível que a página espera; a query de cobranças pode falhar com Zod antes de renderizar o painel. | A página não tem endpoint de leitura operacional de perfil; ela compõe dados de vários endpoints e assume shape achatado. O BFF `nexo.me` repassa o envelope real sem normalizar; `finance.charges.list` tem contrato BFF/API incompatível. | payload/schema zod + feature incompleta | Criar ou expor endpoint operacional de perfil canônico (`/me/operational` ou normalização BFF de `nexo.me`) que retorne o shape que a página usa. Corrigir unwrap do BFF para `/me` e corrigir contrato de finanças antes de depender de cobranças no perfil. |
| `/audit` | `trpc.nexo.audit.listEvents`, `trpc.nexo.audit.getSummary` e segunda `getSummary` das últimas 24h | `nexo.audit.listEvents`, `nexo.audit.getSummary` | `GET /v1/audit/events`, `GET /v1/audit/summary` | Lista: `{ data: AuditEvent[], pagination: { page, limit, total, pages } }`. Resumo: `{ total, byAction, byActor }`. | O código do controller/serviço sugere esses shapes, mas o módulo API registrado (`AuditModule`) exporta apenas `AuditService`; `AuditAdminController` e `AuditAdminService` não estão registrados no módulo. Assim, em runtime Nest, os endpoints admin tendem a não existir (`404`) apesar de o código existir. Se registrados, a API ainda aplicaria envelope global: `{ success: true, data: { data, pagination } }` e `{ success: true, data: { total, byAction, byActor } }`. | `404 NOT_FOUND` para `/audit/events` e `/audit/summary` é a falha estrutural esperada no build atual. Se o controller for registrado, usuários não ADMIN receberão `403`. | Endpoint implementado em arquivos, mas não registrado no `AuditModule`. A rota frontend exige `ADMIN`, e o BFF exige sessão validada; porém a API não expõe efetivamente os endpoints admin. | endpoint inexistente + role | Registrar `AuditAdminController` e `AuditAdminService` no `AuditModule`. Manter `/audit` restrito a `ADMIN`. Normalizar BFF para o envelope global antes de devolver ao frontend. |
| `/timeline` | `trpc.nexo.timeline.listByOrg` | `nexo.timeline.listByOrg` | `GET /v1/timeline?limit=12&cursor=...` | A página espera array de eventos ou payload normalizável para array. | API real: controller retorna `{ ok: true, data: TimelineEvent[] }` e interceptor global transforma em `{ success: true, data: { ok: true, data: TimelineEvent[] } }`. O helper do frontend consegue extrair `raw.data.data` quando a query chega ao componente. | Ainda aparece `Please login (10001)` na query. Essa mensagem é gerada no BFF `protectedProcedure` antes de chamar a API quando `ctx.user?.validated !== true`. | Timeline não recebeu a correção de autenticação/gating aplicada em páginas como Calendar: a query dispara sem `enabled: isAuthenticated` e depende apenas de `ProtectedRoute`. Se a criação de contexto BFF recusa a sessão porque `/me` falhou/malformou no bootstrap, o `protectedProcedure` retorna `UNAUTHORIZED` com `Please login (10001)`. | auth + payload/envelope | Adicionar gating explícito na página (`useAuth()` + `enabled: isAuthenticated`) e auditar por que `createContext` está recusando token-only auth quando `/me` falha. Também normalizar o envelope da timeline no BFF para evitar acoplamento ao helper do frontend. |
| `/calendar` | `trpc.nexo.appointments.list`, `trpc.nexo.customers.list`, `trpc.people.list` | `nexo.appointments.list`, `nexo.customers.list`, `people.list` | `GET /v1/appointments?limit=1000`, `GET /v1/customers`, `GET /v1/people` | Appointments/customers/people como arrays normalizáveis para montar eventos e filtros. | Appointments vem como `{ success: true, data: { data: Appointment[], meta } }`, normalizável. Customers tende a ser normalizável. People vem de `/people`, cujo controller restringe `@Roles('ADMIN')`; para não-admin a API retorna `403`. | A autenticação passa, mas a página entra em erro quando `people.list` falha por `403`, mesmo que appointments tenham carregado. | O frontend permite Calendar para qualquer papel com `appointments:read` (`ADMIN`, `MANAGER`, `STAFF`, `VIEWER`), mas a query auxiliar `people.list` usa endpoint API exclusivo de `ADMIN`. | role | Trocar a fonte de pessoas do Calendar para endpoint legível por papéis com agenda, ou restringir a query de pessoas a `ADMIN`/degradar filtros de equipe sem bloquear dados de agenda. |
| `/billing` | `trpc.billing.plans`, `trpc.billing.status`, `trpc.billing.limits`, `trpc.integrations.readiness` | `billing.plans`, `billing.status`, `billing.limits`, `integrations.readiness` | `GET /v1/billing/plans`, `GET /v1/billing/status`, `GET /v1/billing/limits`, `GET /v1/health/readiness` | Plans como array; status/limits como objetos; readiness com `integrations.stripe === 'configured'`. | Billing BFF remove uma camada (`raw?.data ?? raw`), então endpoints billing tendem a chegar corretos. Porém `GET /health/readiness` é um healthcheck crítico: se DB/queue falharem retorna `503` e bloqueia a página. Há também mismatch de plano: API/BFF usam `BUSINESS` para `price_scale`, mas a UI só aceita `FREE | STARTER | PRO | SCALE`; `BUSINESS` cai para `FREE`. | Página pode falhar por `readinessQuery.isError` quando readiness está `not_ready`. Mesmo sem erro, plano `BUSINESS` é interpretado como `FREE`. | Mistura de feature de assinatura com readiness operacional crítica; contrato de plano incompleto entre API (`BUSINESS`) e UI (`SCALE`). | feature incompleta + payload/contract | Tornar readiness não bloqueante em Billing e usar readiness específica de billing/Stripe. Alinhar enum de planos (`BUSINESS` vs `SCALE`) no frontend, BFF e API. |
| `/finances` | Principal: `trpc.finance.charges.list`; secundárias: `trpc.nexo.customers.list`, `trpc.nexo.serviceOrders.list`; condicionais: `trpc.finance.charges.getById`, `trpc.nexo.timeline.listByCustomer`, `trpc.nexo.timeline.listByServiceOrder` | `finance.charges.list` | `GET /v1/finance/charges?page=1&limit=500` | BFF espera exatamente `{ data: { items: Charge[], meta: { page, limit, total, pages } } }`. | API real: controller retorna `{ ok: true, data: { items, meta } }`; interceptor global envolve em `{ success: true, data: { ok: true, data: { items, meta } } }`. | Zod: `expected array at data.items` e `expected object at data.meta`. | Contrato BFF/API incompatível. O endpoint existe e a autenticação/role podem estar corretas; a falha exata é schema Zod por shape aninhado. | schema zod + payload/envelope | Ajustar `finance.charges.list` no BFF para aceitar o envelope real (`raw.data.data.items/meta`) ou mudar o controller/interceptor para não duplicar `ok/data`. Criar teste de contrato específico para `/finance/charges` com o envelope global real. |

## Detalhamento por página

### `/settings`

Queries da página:

- `trpc.nexo.settings.get.useQuery(undefined, { retry: false })`.
- `trpc.nexo.invites.members.useQuery(undefined, { retry: false })`.
- `trpc.integrations.readiness.useQuery(undefined, { retry: false })`.

Mapeamento:

- BFF `nexo.settings.get` chama `GET /organization-settings`.
- BFF `nexo.invites.members` chama `GET /auth/organization/members`.
- BFF `integrations.readiness` chama `GET /health/readiness`.
- A URL efetiva da API recebe prefixo `/v1` por `resolveNexoApiUrl`.

Causa raiz:

- `OrganizationSettingsController` aplica `@UseGuards(JwtAuthGuard, RolesGuard)` e `@Roles('ADMIN')` no controller inteiro.
- `InvitesController.getOrganizationMembers` também exige `@Roles('ADMIN')`.
- A rota `/settings` no frontend não tem `requiredRoles: ['ADMIN']`.
- Portanto a página pode renderizar para `MANAGER` (que tem `settings:manage` em RBAC), mas as chamadas reais de API retornam `403`.

### `/profile`

Queries da página:

- `trpc.nexo.me` → `GET /v1/me`.
- `trpc.nexo.appointments.list` → `GET /v1/appointments`.
- `trpc.nexo.serviceOrders.list` → `GET /v1/service-orders`.
- `trpc.finance.charges.list` → `GET /v1/finance/charges`.
- `trpc.nexo.timeline.listByOrg` → `GET /v1/timeline`.

Causa raiz:

- A página espera um objeto de usuário operacional achatado (`me.personId`, `me.person.id`, `me.role`, `me.active`).
- A API `/me` retorna `{ success: true, data: { user, organization, operational, pending, assignments, requiresOnboarding, redirect } }` no controller, e o interceptor global ainda envolve de novo.
- O BFF `nexo.me` repassa o payload sem normalização.
- Além disso, a query `finance.charges.list` falha com o mesmo Zod de `/finances`.

### `/audit`

Queries da página:

- `trpc.nexo.audit.listEvents({ page, limit, ...filters })` → `GET /v1/audit/events`.
- `trpc.nexo.audit.getSummary({ from, to })` → `GET /v1/audit/summary`.
- `trpc.nexo.audit.getSummary({ from: last24HoursFrom })` → `GET /v1/audit/summary?from=...`.

Causa raiz exata:

- `AuditAdminController` implementa `GET /audit/events` e `GET /audit/summary` com `@Roles('ADMIN')`.
- `AuditAdminService` implementa os payloads esperados.
- Porém `AuditModule` registra apenas `AuditService` como provider e não registra `AuditAdminController` nem `AuditAdminService`.
- Logo os endpoints admin não ficam expostos pela API atual.

Validação de papéis:

- Frontend restringe `/audit` com `requiredRoles: ['ADMIN']`.
- API também restringe `AuditAdminController` com `@Roles('ADMIN')`, se ele for registrado.
- `AuthContext` normaliza papel a partir de `session.me`; `fetchNexoMe` extrai `role` de `rawUser.role` ou `rawPerson.role`.
- Se `/me` vier malformado ou indisponível, `createContext` define `user: null` e o BFF `protectedProcedure` falha antes de propagar role.

### `/timeline`

Query da página:

- `trpc.nexo.timeline.listByOrg({ limit: PAGE_SIZE, cursor }, { retry: false })` → `GET /v1/timeline`.

Causa raiz exata do `Please login (10001)`:

- Essa mensagem não vem da API Nest; ela é constante do BFF em `shared/const.ts` e é lançada por `protectedProcedure` quando não há token validado no `ctx.user`.
- A timeline não usa `useAuth()` nem `enabled: isAuthenticated` na query, ao contrário do Calendar.
- Mesmo com cookie, o BFF só aceita `protectedProcedure` quando `ctx.user.validated === true`. Se o bootstrap `/me` falha, está em cooldown, retorna shape malformado ou é considerado indisponível, `createContext` devolve `user: null` e a query da timeline recebe `UNAUTHORIZED`.

Payload:

- Se autenticada, API Timeline retorna `{ ok: true, data: events }`, envelopado globalmente como `{ success: true, data: { ok: true, data: events } }`.
- O helper atual consegue extrair o array, então o erro observado é auth/gating, não Zod.

### `/calendar`

Queries da página:

- `trpc.nexo.appointments.list(..., { enabled: isAuthenticated })` → `GET /v1/appointments`.
- `trpc.nexo.customers.list(..., { enabled: isAuthenticated })` → `GET /v1/customers`.
- `trpc.people.list(..., { enabled: isAuthenticated })` → `GET /v1/people`.

Causa raiz:

- A autenticação passa porque as queries são gated por `isAuthenticated`.
- A carga de dados ainda pode falhar porque `people.list` chama `GET /people`, e a API restringe `PeopleController.list` a `@Roles('ADMIN')`.
- A rota `/calendar` permite qualquer papel com `appointments:read`, incluindo `MANAGER`, `STAFF` e `VIEWER`.
- Assim um usuário não-admin consegue entrar na rota, mas a query auxiliar de equipe falha com `403` e coloca a página em erro.

### `/billing`

Queries da página:

- `trpc.billing.plans` → `GET /v1/billing/plans`.
- `trpc.billing.status` → `GET /v1/billing/status`.
- `trpc.billing.limits` → `GET /v1/billing/limits`.
- `trpc.integrations.readiness` → `GET /v1/health/readiness`.

Causa raiz:

- Os endpoints de billing exigem JWT, mas não têm `RolesGuard`, então não são o principal problema de role.
- O endpoint `/health/readiness` é um healthcheck crítico de DB/Prisma/queue. Se retornar `503`, a página inteira marca `hasError`.
- O contrato de plano está incompleto: frontend usa `SCALE`, enquanto API/BFF usam `BUSINESS` para o plano superior (`price_scale` mapeia para `BUSINESS`).

### `/finances`

Query principal:

- `trpc.finance.charges.list({ page: 1, limit: 500 }, { retry: false })`.

Mapeamento:

- BFF `finance.charges.list` chama `GET /finance/charges?page=1&limit=500`.
- API efetiva: `GET /v1/finance/charges?page=1&limit=500`.

Contrato esperado pelo BFF:

```ts
{
  data: {
    items: Charge[],
    meta: { page: number, limit: number, total: number, pages: number }
  }
}
```

Contrato real da API:

```ts
{
  success: true,
  data: {
    ok: true,
    data: {
      items: Charge[],
      meta: { page: number, limit: number, total: number, pages: number }
    }
  }
}
```

Causa raiz:

- `FinanceController.listCharges` retorna `{ ok: true, data }`.
- `FinanceService.listCharges` retorna `{ items, meta }`.
- `ApiResponseInterceptor` envolve todo retorno em `{ success: true, data }`.
- O BFF valida `wrappedListSchema` em `raw.data.items` e `raw.data.meta`, mas o shape real está em `raw.data.data.items` e `raw.data.data.meta`.

## Priorização recomendada de correções (sem aplicar nesta auditoria)

1. **Finances / Profile**: corrigir `finance.charges.list` no BFF para aceitar o envelope real, pois é o erro Zod explícito e também impacta `/profile`.
2. **Audit**: registrar `AuditAdminController` e `AuditAdminService` no `AuditModule`.
3. **Timeline**: aplicar gating explícito por `isAuthenticated` e diagnosticar o fluxo `session.me → createContext → protectedProcedure` quando `/me` falha.
4. **Calendar**: trocar `people.list` por endpoint compatível com papéis de agenda ou tornar a query auxiliar não bloqueante para não-admin.
5. **Settings**: alinhar papéis da rota com `organization-settings` e `auth/organization/members`, ou criar endpoints operacionais separados.
6. **Billing**: separar readiness de Stripe do readiness crítico e alinhar enum `BUSINESS/SCALE`.
7. **Normalização transversal**: criar helper único no BFF para unwrap de API Nest: `raw.data.data ?? raw.data ?? raw`, com tratamento para `{ ok, data }` e `{ success, data }`.

## Correções aplicadas no lote seguinte

Aplicadas em 2026-06-04 no lote `fix(app): resolve post-auth contract and protected page failures`:

1. Criado helper BFF `unwrapNexoApiResponse` para normalizar envelopes diretos, simples e duplos da API Nest sem mascarar erros HTTP.
2. `finance.charges.list` passou a validar `{ items, meta }` após unwrap, cobrindo `raw.data.items/meta` e `raw.data.data.items/meta`.
3. `AuditModule` passou a registrar `AuditAdminController` e `AuditAdminService`, mantendo as regras `ADMIN` existentes.
4. `TimelinePage` passou a usar `useAuth()` e `enabled: isAuthenticated` na query protegida.
5. `CalendarPage` deixou de depender de `people.list` admin-only e passou a usar `people.assignees`, endpoint operacional tenant-scoped.
6. `BillingPage` passou a tratar readiness crítica como informação de integração, não como erro bloqueante da tela, e normaliza o plano persistido `BUSINESS` para o plano comercial exibido como Scale.
7. Settings/Profile foram revalidados por meio da normalização transversal de rotas `nexo.*` e da correção de `finance.charges.list`.
