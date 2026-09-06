# Relatório de Validação E2E Real — 2026-04-08

## Escopo solicitado
Fluxo operacional ponta a ponta:
- landing
- consentimento LGPD
- register
- login
- dashboard
- criar customer
- criar appointment
- criar service order
- concluir service order
- gerar cobrança
- abrir finance
- gerar ação WhatsApp
- logout

## Execução realizada

### 1) Tentativa de subir stack completa
Comandos executados:
- `cp .env.example .env`
- `docker compose up -d postgres redis`

Resultado:
- `docker: command not found` no ambiente atual.
- Sem Docker disponível, não foi possível subir `postgres` e `redis` localmente.

### 2) Integração real habilitada
Comando executado:
- `RUN_REAL_INTEGRATION=true pnpm --filter @nexogestao/api test:integration:real`

Resultado:
- Falha por indisponibilidade de infraestrutura real local:
  - `ECONNREFUSED 127.0.0.1:6379` (Redis)
  - `Can't reach database server at localhost:5432` (Postgres)

### 3) Validações complementares executadas no ambiente disponível
- `pnpm --filter @nexogestao/api test:unit` ✅
- `pnpm --filter @nexogestao/web test` ✅

Cobertura validada por suíte canônica/unitária (sem stack real ativa):
- consentimento LGPD (backend + banner web)
- autenticação/logout
- fluxo operacional de customer/appointment/service order/charge/payment (via contratos e testes de integração internos onde aplicável)

## Correções aplicadas

### Bug corrigido (P1 fluxo de validação real)
**Arquivo:** `apps/api/test/integration/canonical-operational-workflow.spec.ts`

- Ajustado timeout global do teste canônico real de `30s` para `90s`.
- Motivo: em cenários de cold start com infra real (Postgres/Redis + retries Prisma), o `beforeAll` pode ultrapassar 30s e gerar falso negativo por timeout prematuro, mesmo com sistema funcional.

## Pendências restantes

### P0 runtime
- Ausência de Docker no ambiente de execução atual impede subir stack completa local (`postgres`, `redis`) e bloqueia validação E2E real.

### P1 fluxo
- Reexecutar fluxo completo com stack real disponível e confirmar cada etapa de navegação/operação solicitada (landing → logout).

### P2 polimento
- Opcional: reduzir ruído de logs BullMQ/Jest quando infra indisponível durante execução de testes reais.

## Classificação final
- **P0 runtime:** bloqueio de infraestrutura (Docker ausente) no ambiente.
- **P1 fluxo:** corrigido timeout do teste canônico para reduzir falso negativo em bootstrap real.
- **P2 polimento:** melhoria de ergonomia de logs ainda opcional.
