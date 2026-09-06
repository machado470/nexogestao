---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Test Suite Reliability Map

Este mapa separa os testes por tipo, dependências de infraestrutura e comando recomendado para execução confiável.

## Web (`@nexogestao/web`)

| Arquivo                                                         | Tipo                     | Infra externa | Observação                                     |
| --------------------------------------------------------------- | ------------------------ | ------------- | ---------------------------------------------- |
| `apps/web/server/security.test.ts`                              | Unit                     | Não           | Usa mocks/stubs locais.                        |
| `apps/web/server/modals.test.ts`                                | Unit                     | Não           | Render/fluxo local.                            |
| `apps/web/server/auth.logout.test.ts`                           | Unit                     | Não           | Sem dependência de API externa.                |
| `apps/web/server/operational-notifications.integration.test.ts` | Integration (BFF router) | Não           | Requer alinhamento com router real (`nexo.*`). |

## API (`@nexogestao/api`)

| Arquivo                                                            | Tipo                 | Infra externa              | Observação                                                |
| ------------------------------------------------------------------ | -------------------- | -------------------------- | --------------------------------------------------------- |
| `apps/api/src/**/*.spec.ts` (services)                             | Unit                 | Não                        | Serviços com doubles/mocks.                               |
| `apps/api/test/integration/full-flow.spec.ts`                      | Integration (mocked) | Não                        | Usa Prisma mockado; não abre DB/Redis.                    |
| `apps/api/test/integration/execution-concurrency.spec.ts`          | Integration (mocked) | Não                        | Teste de concorrência em memória.                         |
| `apps/api/test/integration/canonical-operational-workflow.spec.ts` | E2E real             | **Sim** (Postgres + Redis) | Agora é executado apenas com `RUN_REAL_INTEGRATION=true`. |

## Comandos confiáveis

### Sem stack completa (local rápido)

```bash
pnpm -r exec tsc --noEmit
pnpm -r build
pnpm --filter @nexogestao/web test
pnpm --filter @nexogestao/api test:unit
```

### Validação E2E real (com infraestrutura)

Pré-requisitos:

- Postgres disponível e configurado no `DATABASE_URL`
- Redis disponível em `REDIS_URL`/`localhost:6379`

```bash
RUN_REAL_INTEGRATION=true pnpm --filter @nexogestao/api test:integration:real
```

Se `RUN_REAL_INTEGRATION` não estiver ativo, o teste E2E real é **skipado explicitamente** para evitar falso negativo por infra implícita.
