---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Tenant isolation integration test (real infra)

Este diretório contém o teste canônico de isolamento multi-tenant em infraestrutura real.

## Pré-requisitos

1. Docker ativo.
2. Variáveis de ambiente de teste configuradas (`DATABASE_URL` e `REDIS_URL`), ou defaults de `test/setup-env.ts`.
3. Prisma client gerado.

## Comando recomendado

Na raiz do monorepo:

```bash
pnpm test:tenant:isolation
```

Esse comando:

- sobe `postgres` e `redis` via `docker compose`
- executa `canonical-operational-workflow.spec.ts` com `RUN_REAL_INTEGRATION=true`

## Execução direta alternativa

```bash
docker compose -f docker-compose.yml up -d postgres redis
RUN_REAL_INTEGRATION=true pnpm --filter ./apps/api test -- test/integration/canonical-operational-workflow.spec.ts
```

## Logs esperados

- Quando **skipado**: `[integration-skip] Real integration/e2e tests are disabled...`
- Quando **executado**: `[integration-run] Real integration/e2e tests enabled...`

## Isolamento de dados

O teste cria tenants com UUIDs únicos por execução e faz cleanup explícito no `afterAll` para:

- customers
- appointments
- service orders / executions
- charges / payments
- timeline / audit events
- WhatsApp messages
- pessoas e organizações de teste

Assim, ele não depende de dados antigos e mantém execução isolada.
