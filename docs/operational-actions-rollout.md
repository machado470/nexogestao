---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Rollout seguro de Operational Actions (Prisma + banco + startup)

## Objetivo

Garantir enforcement real para evitar rollout com drift entre código, Prisma Client e estrutura crítica de banco para `OperationalActionExecution`.

## Estruturas críticas protegidas

- Tabela `OperationalActionExecution`.
- Coluna `logicalKey`.
- Enum `OperationalActionExecutionStatus` com valor `EXECUTING`.
- Índice único parcial `OperationalActionExecution_unique_requested_per_key` para `status='REQUESTED'`.

## Enforcement obrigatório no CI

- O workflow `.github/workflows/ci.yml` roda `pnpm ci:preflight` antes de concluir build/test.
- `ci:preflight` já encadeia:
  - `pnpm prisma:check` (`prisma validate` + `prisma generate`);
  - typecheck/build/test.

## Enforcement de banco (secure-by-default em production)

O script `db:smoke:operational-actions` agora é **strict por default em `NODE_ENV=production`**.

Regras de ativação (`REQUIRE_DATABASE_SMOKE`):

- `1`: força modo estrito em qualquer ambiente.
- `0`: desativa modo estrito explicitamente (não recomendado em staging/prod).
- não definido: `1` em `production`, `0` em dev/test.

Comportamento:

- **dev/local sem `DATABASE_URL`**: smoke avisa e faz skip por padrão.
- **strict ativo** (`REQUIRE_DATABASE_SMOKE=1` efetivo): falha se `DATABASE_URL` estiver ausente ou se faltar estrutura crítica.

## Startup fail-fast da API (secure-by-default em production)

Ativação (`OPERATIONAL_ACTIONS_DB_STARTUP_CHECK`):

- `1`: força check em qualquer ambiente (exceto `NODE_ENV=test`).
- `0`: desativa explicitamente.
- não definido: habilita automaticamente em `NODE_ENV=production`, desabilita em dev/test.

Quando ativo (e `NODE_ENV != test`), a API valida no bootstrap:

- tabela `OperationalActionExecution`;
- coluna `logicalKey`;
- enum `EXECUTING`;
- índice único parcial.

Se algo faltar:

- registra erro claro de pré-condição;
- encerra startup (fail-fast).

Quando desativado:

- não bloqueia desenvolvimento/testes locais.

## Ordem final recomendada de rollout

1. `pnpm prisma:migrate:deploy`
2. `pnpm ci:preflight` (inclui `prisma:check` + typecheck/build/test)
3. `pnpm db:smoke:operational-actions` (em production já roda strict por padrão)
4. deploy da API (startup check habilita automaticamente em `NODE_ENV=production`)
5. health check pós-deploy

## Audit commands

```bash
rg -n "OperationalActionExecution|EXECUTING|logicalKey" prisma apps/api/src
rg -n "CREATE UNIQUE INDEX|logicalKey" prisma/migrations
rg -n "ci:preflight|prisma:check|db:smoke:operational-actions" .github package.json scripts docs
```

## Troubleshooting rápido

- Erro de enum `EXECUTING` inexistente:
  - revisar ordem de migrations e reaplicar `pnpm prisma:migrate:deploy`.
- Erro de coluna `logicalKey` inexistente:
  - confirmar migrações aplicadas no banco alvo.
- Erro de índice parcial ausente:
  - reaplicar migrations e validar `pg_indexes`.
- Prisma Client stale:
  - rodar `pnpm prisma:check` antes de typecheck/build/test.

## Operational Actions Diagnostics

- Endpoint interno/admin: `GET /internal/operational-actions/diagnostics`.
- Segurança:
  - protegido por `JwtAuthGuard` + `RolesGuard` + `@Roles('ADMIN')`;
  - `orgId` vem exclusivamente de `req.user.orgId` (não aceita query/body para org).
- Métricas retornadas:
  - `totalsByStatus`: contagem por `REQUESTED | EXECUTING | EXECUTED | FAILED | CANCELED`;
  - `pendingRequestedCount`: total com status `REQUESTED`;
  - `stuckExecutingCount`: total em `EXECUTING` com `updatedAt` há mais de 5 minutos;
  - `failedLast24hCount`: total em `FAILED` com `failedAt` nas últimas 24h;
  - `avgRequestedToExecutedMs`: média de `executedAt - requestedAt` (ms);
  - `avgRequestedToFailedMs`: média de `failedAt - requestedAt` (ms);
  - `topFailedActionTypes`: top tipos de ação por falha;
  - `recentFailures`: últimas falhas (limitado, inclui `failureReason`).
- Interpretação de `stuckExecutingCount`:
  - valor > 0 indica possíveis execuções travadas (lock lógico/conectividade/dependência externa);
  - investigar timeline + integradores quando subir sustentadamente.

### Curl de exemplo

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/internal/operational-actions/diagnostics"
```

### Quando investigar FAILED alto

- Se `failedLast24hCount` crescer acima do baseline do tenant.
- Se `topFailedActionTypes` concentrar em um único actionType.
- Se `recentFailures` repetir o mesmo motivo (`failureReason`) por janela curta.

## Manual HTTP smoke — diagnostics

Pré-condição: API rodando e acessível em `API_BASE_URL`.

Env vars:

- `API_BASE_URL` (default no script: `http://127.0.0.1:3000`);
- `SMOKE_ADMIN_EMAIL` (obrigatória);
- `SMOKE_ADMIN_PASSWORD` (obrigatória);
- `SMOKE_EXPECT_UNAUTHORIZED` (opcional, default ativo; use `0` para pular check sem token).

Execução:

```bash
API_BASE_URL=http://127.0.0.1:3000 \
SMOKE_ADMIN_EMAIL=admin@seu-tenant.com \
SMOKE_ADMIN_PASSWORD='***' \
pnpm smoke:operational-actions:diagnostics
```

Comportamento esperado:

- valida rejeição sem token (`401/403`);
- autentica admin em `POST /auth/login`;
- chama `GET /internal/operational-actions/diagnostics` autenticado;
- valida contrato mínimo e statuses esperados de `totalsByStatus`;
- tenta `?orgId=fake-org` e confirma que endpoint responde normalmente sem depender de `orgId` externo.

Se vier `401/403` no login autenticado:

- validar e-mail/senha de admin seed/piloto;
- validar se usuário é `ADMIN` e está ativo;
- validar se API apontada por `API_BASE_URL` é o ambiente correto.

Se contrato vier incompleto:

- tratar como regressão de backend no endpoint de diagnostics;
- comparar payload atual com os campos mandatórios desta seção e corrigir antes do rollout.

## Overrides e risco operacional

- Use override (`REQUIRE_DATABASE_SMOKE=0` ou `OPERATIONAL_ACTIONS_DB_STARTUP_CHECK=0`) **apenas** para mitigação emergencial com janela curta.
- Risco ao desligar: aceitar deploy com drift de schema (tabela/coluna/enum/índice ausentes), causando falhas em runtime e perda de idempotência.

## Dashboard/Admin — Saúde das ações assistidas

- O `ExecutiveDashboard` exibe o bloco compacto **"Saúde das ações assistidas"** consumindo `GET /internal/operational-actions/diagnostics` com `credentials: include` e sem enviar `orgId`.
- Leitura operacional no bloco:
  - `EXECUTING` travado (`stuckExecutingCount > 0`) = investigar lock, integração externa e timeline imediatamente;
  - `FAILED` 24h alto (`failedLast24hCount > 0` acima do baseline) = revisar `actionType`/provider concentrados em `topFailedActionTypes`;
  - `REQUESTED` pendente alto (`pendingRequestedCount`) = gargalo humano/fila sem avanço.
- O bloco inclui estados de loading, erro com retry, saudável e crítico para uso operacional rápido no turno.

## Recuperação manual de EXECUTING travado (admin)

- Endpoint interno/admin: `POST /internal/operational-actions/recover-stuck`.
- Uso: encerrar manualmente uma execução em `EXECUTING` que ultrapassou o threshold de travamento (5 minutos sem atualização).
- Segurança:
  - protegido por `JwtAuthGuard` + `RolesGuard` + `@Roles('ADMIN')`;
  - `orgId` sempre derivado de `req.user` (não vem de body/query).
- Input mínimo:
  - `executionId` (obrigatório)
  - `recoveryReason` (opcional)

### Modelagem escolhida

Foi adotada a opção **A**:

- mantém `status=FAILED` no lifecycle materializado;
- grava metadata de recovery em `metadata.recovery`:
  - `recovered: true`
  - `recoveredBy`
  - `recoveredAt`
  - `recoveryReason`

Isso evita introduzir novo estado de máquina (`FAILED_RECOVERED`) e preserva simplicidade operacional.

### Regras de recuperação

- só permite recuperar quando `status=EXECUTING`;
- só permite quando está realmente `stuck` (threshold atual);
- bloqueia `REQUESTED/EXECUTED/CANCELED/FAILED`;
- não executa retry automático;
- não reexecuta ação assistida.

### Timeline de auditoria

Ao recuperar, registra `OPERATIONAL_ACTION_RECOVERED` com:

- `executionId`
- `previousStatus=EXECUTING`
- `nextStatus=FAILED`
- `recoveredBy`
- `recoveryReason`
- `actionType`
- `entityType`
- `entityId`

### Diagnóstico e dashboard

`GET /internal/operational-actions/diagnostics` passa a incluir:

- `recoveredLast24hCount`
- `recentStuckExecuting` (lista compacta para ação manual)

No Dashboard (bloco "Saúde das ações assistidas"):

- mostra botão "Marcar como recuperado" somente para itens em `recentStuckExecuting`;
- exige confirmação explícita;
- aplica loading local;
- após sucesso, refaz diagnostics.

### Quando usar e riscos

Use somente após investigar causa provável (integração externa, lock, timeout lógico, inconsistência de entidade de destino).

Risco principal: marcar como recuperado uma execução que ainda poderia concluir por conta própria, produzindo percepção de falha operacional sem necessidade. Por isso, a ação é manual, admin-only e auditável em timeline.
