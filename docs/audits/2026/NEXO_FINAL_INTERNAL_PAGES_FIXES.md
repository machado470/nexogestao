# NexoGestao — Correções finais das páginas internas remanescentes

Data: 2026-06-04.
Commit base investigado: `231f8e3 fix(app): resolve post-auth contract and protected page failures`.
Escopo deste lote: `/audit`, `/profile`, `/settings` e os blocos de `/people` que dependem de `people.operationalSummary` e `analytics.assigneeWarningSummary`.

## Resumo executivo

As falhas restantes tinham duas causas transversais:

1. **Queries protegidas ainda podiam executar antes de a sessão estar confirmada na própria página.** Isso mantinha uma janela em que `/audit`, `/profile` e `/settings` disparavam chamadas tRPC protegidas durante bootstrap/rehidratação, apesar do `ProtectedRoute` externo.
2. **Alguns contratos BFF ainda não normalizavam o payload real da API Nest.** O caso mais visível era `analytics.assigneeWarningSummary`, que podia receber o envelope global da API e repassar um shape que a página precisava defender no render. O perfil também consumia `/me` em shape operacional aninhado (`{ user, organization, operational }`) enquanto a página usa campos pessoais no nível raiz.

Não foram criados mocks, dados falsos ou relaxamento global de permissões. As rotas administrativas continuam administrativas, e o `orgId` continua sendo derivado exclusivamente da sessão/token no BFF/API.

## 1. `/audit`

### Diagnóstico

- Query frontend: `trpc.nexo.audit.listEvents`, `trpc.nexo.audit.getSummary` e resumo das últimas 24h em `apps/web/client/src/pages/AuditPage.tsx`.
- Router/procedure BFF: `nexo.audit.listEvents` e `nexo.audit.getSummary` em `apps/web/server/routers/nexo-proxy.ts`.
- Endpoint API chamado: `GET /audit/events` e `GET /audit/summary`.
- Resposta HTTP real esperada: `200` para usuário `ADMIN`; `403` para não-admin; `401` para sessão inválida.
- Payload real de sucesso: envelope da API normalizado pelo BFF para `{ data: AuditEvent[], pagination }` e `{ total, byAction, byActor }`.
- Schema esperado pela página: lista com `data` e `pagination`; resumo com `total`, `byAction`, `byActor`.
- Role/permissão exigida: `ADMIN` no frontend e `@Roles('ADMIN')` na API.

### Causa raiz

O lote anterior já havia registrado `AuditAdminController` e `AuditAdminService`, mas a página ainda disparava as queries sem `enabled` dependente de sessão/role. Em bootstrap, isso podia transformar uma chamada prematura em estado de erro controlado no card de auditoria.

### Correção aplicada

- A página passou a usar `useAuth()` e só dispara as três queries quando `isAuthenticated && role === "ADMIN"`.
- Foi mantido `retry: false` nas queries de auditoria.
- A rota `/audit` segue protegida por `requiredRoles: ["ADMIN"]`; o backend permanece com `@Roles('ADMIN')`.

### Payload antes/depois

- Antes, uma chamada prematura podia produzir erro tRPC/HTTP em vez do payload administrativo.
- Depois, a chamada só ocorre quando a sessão está validada como `ADMIN`; para sucesso, o BFF entrega `{ data, pagination }` e `{ total, byAction, byActor }`.

## 2. `/profile`

### Diagnóstico

- Query frontend: `trpc.nexo.me`, `trpc.nexo.appointments.list`, `trpc.nexo.serviceOrders.list`, `trpc.finance.charges.list`, `trpc.nexo.timeline.listByOrg`.
- Router/procedure BFF principal: `nexo.me` em `apps/web/server/routers/nexo-proxy.ts`.
- Endpoint API principal: `GET /me`.
- Resposta HTTP real esperada: `200` com sessão válida; `401` com sessão inválida.
- Payload real de `/me`: depois do unwrap do envelope global, `{ user, organization, operational, pending, assignments, requiresOnboarding, redirect }`.
- Schema esperado pela página: campos pessoais operacionais também acessíveis no nível raiz (`id`, `personId`, `role`, `person`, `active`) para filtrar minhas O.S., agendamentos, cobranças e timeline.
- Role/permissão exigida: usuário autenticado para `/me`; as listas secundárias seguem seus próprios guards.

### Causa raiz

A página usava os campos de pessoa/usuário no nível raiz, mas o contrato real de `/me` da API é operacional e aninhado em `user`. Além disso, as queries do perfil não tinham `enabled: isAuthenticated`, mantendo a mesma janela de chamada protegida antes da sessão.

### Correção aplicada

- `nexo.me` no BFF agora normaliza o payload real de `/me` para o perfil, preservando os blocos reais (`organization`, `operational`, `pending`, `assignments`) e promovendo dados reais de `user/person` para o nível raiz.
- A página `/profile` passou a disparar suas queries somente com `enabled: isAuthenticated` e manteve `retry: false`.
- Nenhum dado operacional foi inventado: quando `person` não existe, `personId` fica `null` e as listas pessoais naturalmente rendem empty state real.

### Payload antes/depois

Antes:

```json
{
  "user": { "id": "u1", "personId": "p1", "person": { "id": "p1", "name": "Paula Almeida" } },
  "organization": { "id": "org-1", "name": "Oficina" },
  "operational": { "state": "NORMAL" },
  "assignments": []
}
```

Depois no BFF para consumo do perfil:

```json
{
  "id": "u1",
  "personId": "p1",
  "name": "Paula Almeida",
  "user": { "id": "u1", "personId": "p1" },
  "person": { "id": "p1", "name": "Paula Almeida" },
  "organization": { "id": "org-1", "name": "Oficina" },
  "operational": { "state": "NORMAL" },
  "assignments": []
}
```

## 3. `/settings`

### Diagnóstico

- Query frontend: `trpc.nexo.settings.get`, `trpc.nexo.invites.members`, `trpc.integrations.readiness`.
- Router/procedure BFF: `nexo.settings.get`, `nexo.invites.members`, `integrations.readiness`.
- Endpoints API: `GET /organization-settings`, `GET /auth/organization/members`, `GET /health/readiness`.
- Resposta HTTP real esperada: `200` para settings/members quando `ADMIN`; `403` para não-admin; readiness pode retornar indisponibilidade ambiental.
- Payload real de settings: organização real tenant-scoped com `id`, `name`, `slug`, `timezone`, `currency`, `currentPlan`, `membersCount`.
- Role/permissão exigida: `ADMIN` no backend para configurações e membros.

### Causa raiz

A tela tratava readiness operacional (`/health/readiness`) como dependência bloqueante da renderização de configurações. Assim, indisponibilidade ambiental de health/readiness podia derrubar a página de settings mesmo quando `organization-settings` estava correto. Além disso, a rota frontend não expressava a restrição real de `ADMIN` da API.

### Correção aplicada

- `/settings` agora só dispara queries com `enabled: isAuthenticated`.
- O erro bloqueante da página considera somente settings e members; readiness continua informativa e não bloqueia a renderização das configurações reais.
- A rota frontend `/settings` foi alinhada ao contrato real do backend com `requiredRoles: ["ADMIN"]`.
- `retry: false` foi preservado.

### Payload antes/depois

- Antes: `GET /health/readiness` com erro ambiental podia transformar a página inteira em erro genérico.
- Depois: settings/members continuam bloqueantes; readiness é usado apenas para chips/seções informativas, com pendência exibida como estado operacional quando não houver dado configurado.

## 4. `/people` — resumo operacional e sinais agregados

### Diagnóstico

- Query frontend: `trpc.people.operationalSummary` e `trpc.analytics.assigneeWarningSummary`.
- Router/procedure BFF: `people.operationalSummary` em `apps/web/server/routers/people.ts` e `analytics.assigneeWarningSummary` em `apps/web/server/routers/analytics.ts`.
- Endpoints API: `GET /people/operational-summary` e `GET /analytics/assignee-warning-summary`.
- Resposta HTTP real esperada: `200` para `ADMIN`; `403` para não-admin em analytics/admin; `401` para sessão inválida.
- Payload esperado de `people.operationalSummary`: `{ people: [] }` quando não há pessoas ou `{ people: OperationalPerson[] }` com métricas reais.
- Payload esperado de `assigneeWarningSummary`: `{ totals, byContext, byWarningType, topPeople, commonCombinations }`, com zeros/arrays vazios reais quando não há eventos.
- Role/permissão exigida: `ADMIN` para resumo de equipe e sinais agregados.

### Causa raiz

O BFF de analytics ainda repassava o payload bruto de `nexoFetch`. Quando a API Nest aplicava envelope global ou duplo, a página precisava depender de normalizações defensivas no render. Isso era incompatível com o contrato desejado do BFF: entregar shape operacional já normalizado, sem inventar métricas.

### Correção aplicada

- `analytics.assigneeWarningSummary` agora aplica `unwrapNexoApiResponse` no BFF.
- O endpoint continua tenant-scoped via token/sessão; nenhum `orgId` é aceito do frontend.
- `people.operationalSummary` já usava endpoint real tenant-scoped e continua sem aceitar `orgId` do client.
- Para não-admin, `PeoplePage` já não dispara os sinais agregados; para `ADMIN`, o contrato normalizado permite exibir zeros/empty state real quando não há eventos.

### Payload antes/depois

Antes possível:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "data": {
      "totals": { "shown": 0, "confirmed": 0, "confirmationRatePct": null },
      "byContext": [],
      "byWarningType": []
    }
  }
}
```

Depois no BFF:

```json
{
  "totals": { "shown": 0, "confirmed": 0, "confirmationRatePct": null },
  "byContext": [],
  "byWarningType": []
}
```

## Arquivos alterados

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/pages/AuditPage.tsx`
- `apps/web/client/src/pages/ProfilePage.tsx`
- `apps/web/client/src/pages/SettingsPage.tsx`
- `apps/web/server/routers/analytics.ts`
- `apps/web/server/routers/nexo-proxy.ts`
- `apps/web/server/bff-api.contract.test.ts`
- `apps/web/server/bff-api-contract.test.ts`
- `docs/NEXO_FINAL_INTERNAL_PAGES_FIXES.md`
- `docs/NEXO_POST_AUTH_FIXES.md`

## Testes executados

- `pnpm -r typecheck`
- `pnpm -s build`
- `pnpm -r lint`
- `pnpm --filter ./apps/web test` — 39 arquivos e 210 testes.
- `pnpm --filter ./apps/api test` — 56 suítes passadas, 1 suíte pulada pelo conjunto, 267 testes passados e 1 teste pulado.

## Pendências reais

- Validação manual interativa com navegador/sessão admin piloto não foi executada neste ambiente automatizado antes do relatório; deve ser feita com web/API rodando e login da Paula Almeida.
- Se a organização piloto ainda não tiver eventos reais de `ASSIGNEE_WARNING_*`, a seção de sinais deve mostrar zeros/empty state real, não eventos inventados.

## Validação manual recomendada

Com sessão admin/piloto (Paula Almeida):

1. Abrir `/audit` e confirmar lista ou empty state real sem erro administrativo.
2. Abrir `/profile` e confirmar painel pessoal com dados reais/empty states pessoais.
3. Abrir `/settings` e confirmar configurações da organização; readiness deve aparecer apenas como pendência informativa se o ambiente não estiver pronto.
4. Abrir `/people` e confirmar resumo operacional e sinais agregados sem erro vermelho para `ADMIN`.
5. Revalidar `/finances`, `/timeline`, `/calendar` e `/billing` para garantir que os contratos estabilizados no lote anterior continuam íntegros.
