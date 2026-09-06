# NexoGestão — Triage de autenticação e renderização das páginas internas

Data: 2026-06-04

## Escopo investigado

Páginas internas autenticadas analisadas:

- `/people`
- `/customers`
- `/appointments`
- `/calendar`
- `/executive-dashboard`

Arquivos de infraestrutura revisados:

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/contexts/AuthContext.tsx`
- `apps/web/client/src/components/AppBootstrapGuard.tsx`
- `apps/web/client/src/lib/trpc.ts`
- `apps/web/client/src/lib/query-helpers.ts`

Routers/BFF relacionados revisados por busca estática:

- `session.me`
- `nexo.auth`/`nexo.me`
- `people`
- `customers`
- `appointments`
- `calendar` via appointments/customers/people
- `dashboard`
- `analytics`
- `finance`
- `whatsapp`

## Causa raiz do crash em `/people`

A página `/people` acessava diretamente `warningSummary?.byWarningType.length`.
O optional chaining protegia apenas `warningSummary`, mas não protegia `byWarningType`.
Quando o payload de `analytics.assigneeWarningSummary` vinha sem `byWarningType`, ou enquanto o payload ainda não estava no formato esperado, o render tentava ler `.length` de `undefined`, acionando o React Error Boundary.

Também havia leituras derivadas de arrays vindos da API sem normalização explícita no mesmo bloco operacional, incluindo:

- `summaryQuery.data.people`
- `exceptionsQuery.data`
- `warningSummary.byContext`
- `warningSummary.byWarningType`

## Causa raiz do “Please login (10001)” nas páginas internas

As páginas autenticadas montavam queries protegidas assim que o componente era renderizado.
Embora `ProtectedRoute` bloqueie renderização durante `authState === "validating"`, as páginas ainda não expressavam a dependência de sessão nas próprias queries.
Isso abria janela para chamadas tRPC/React Query protegidas sem `enabled: isAuthenticated`, especialmente em transições, reidratação de sessão, navegação interna, cache invalidado ou sessão expirada.

O resultado prático era uma resposta real de autenticação do backend/BFF aparecendo dentro do estado operacional da tela, como “Please login (10001)”, em vez de a página aguardar a sessão estar confirmada ou deixar o fluxo global de autenticação tratar sessão expirada.

## Estratégia aplicada para `enabled`/`isAuthenticated`

A estratégia foi tornar cada página autenticada explicitamente dependente do estado de autenticação provido por `AuthContext`:

- Importar `useAuth` nas páginas que ainda não tinham dependência explícita de sessão.
- Obter `isAuthenticated` dentro do componente.
- Adicionar `enabled: isAuthenticated` às queries protegidas principais.
- Combinar `enabled` existente com autenticação quando havia condição de detalhe/dependência:
  - `enabled: isAuthenticated && Boolean(activeCustomerId)`
  - `enabled: isAuthenticated && Boolean(queryParams.customerId)`
  - `enabled: isAuthenticated && Boolean(selectedPersonId)`
- Manter `retry: false` onde já existia.
- Manter `credentials: "include"` nas queries manuais por `fetch` no dashboard executivo.
- Não converter erro 401 em dado falso; erro real continua sendo erro e deve aparecer de forma controlada quando houver sessão autenticada e falha de API.

## Payloads normalizados/protegidos

Em `/people`, os payloads opcionais foram normalizados antes de qualquer uso de `.length`, `.map`, `.filter`, `.reduce`, `.find` ou `.sort`:

- `summaryQuery.data` é convertido em objeto com `normalizeObjectPayload`.
- `summaryPayload?.people` é convertido em array com `normalizeArrayPayload`.
- `exceptionsQuery.data` é convertido em array com `normalizeArrayPayload`.
- `warningSummaryQuery.data` é convertido em objeto parcial com `normalizeObjectPayload`.
- `rawWarningSummary?.byWarningType` é convertido em `warningTypes` com `normalizeArrayPayload`.
- `rawWarningSummary?.byContext` é convertido em `warningContexts` com `normalizeArrayPayload`.
- `mostFrequentWarningType` usa `warningTypes.length` e `warningTypes.reduce`, nunca `warningSummary.byWarningType.length` diretamente.
- `totals` é normalizado com valores numéricos defensivos, sem inventar registros operacionais.

## Arquivos alterados

- `apps/web/client/src/pages/PeoplePage.tsx`
- `apps/web/client/src/pages/CustomersPage.tsx`
- `apps/web/client/src/pages/AppointmentsPage.tsx`
- `apps/web/client/src/pages/CalendarPage.tsx`
- `apps/web/client/src/pages/ExecutiveDashboard.tsx`
- `docs/NEXO_FRONT_AUTH_AND_RENDER_TRIAGE.md`

## O que NÃO foi alterado

- Nenhum router BFF/API foi alterado, pois a causa observada estava no disparo prematuro das queries e em leitura insegura de payload opcional no frontend.
- Nenhum guard de autenticação foi removido ou relaxado.
- Nenhum `orgId` passou a ser aceito do frontend.
- Nenhum mock/fallback de dados foi criado para esconder erro real.
- Nenhuma query protegida foi removida.
- Nenhuma alteração visual, token de tema, layout, `AppPageShell` ou dark/light foi feita.
- Nenhum tratamento transformou 401 em sucesso ou array fake.

## Testes executados

- `pnpm -r typecheck` — passou.
- `pnpm -s build` — passou.
- `pnpm -r lint` — passou; a validação visual reportou apenas avisos não bloqueantes legados já existentes em arquivos de design system/CSS.
- `pnpm --filter ./apps/web test` — passou com 39 arquivos e 203 testes.
- `pnpm --filter ./apps/api test` — passou com 55 suítes, 265 testes e 1 suíte/teste pulado pelo próprio conjunto.

## Validação manual

Validação manual solicitada:

- Abrir `/executive-dashboard`
- Abrir `/customers`
- Abrir `/appointments`
- Abrir `/calendar`
- Abrir `/people`

Status: pendente neste ambiente automatizado. Os testes programáticos obrigatórios foram concluídos, mas a validação interativa das rotas exige servidor web/API em execução e sessão autenticada/piloto disponível para navegação real. A validação esperada é:

- Nenhuma tela deve cair no React Error Boundary.
- `/people` deve renderizar mesmo quando `assigneeWarningSummary` não trouxer `byWarningType` ou `byContext`.
- Páginas internas não devem disparar queries protegidas antes de `isAuthenticated` estar verdadeiro.
- Sessão expirada deve seguir tratamento global consistente para login.
- Falha real de API deve aparecer como erro controlado, não como mock de sucesso.
