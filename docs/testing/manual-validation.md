---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Checklist de Validação Real (sem mock)

> Pré-requisito: Docker ativo e `.env` criado a partir de `.env.example`.

## Fluxo operacional da execution v5 (porta alternativa, sem depender da 5432)

> Sequência copy/paste para validação E2E da execution v5 em máquina local com conflito de porta:

```bash
docker run --name nexogestao-postgres-e2e \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=nexogestao \
  -p 5433:5432 \
  -d postgres:16-alpine

DATABASE_URL="postgresql://postgres:postgres@localhost:5433/nexogestao?schema=public" \
  pnpm --filter ./apps/api prisma migrate deploy

DATABASE_URL="postgresql://postgres:postgres@localhost:5433/nexogestao?schema=public" \
  pnpm --filter ./apps/api validate:execution:v5
```

Critérios obrigatórios de sucesso:

- O script termina sem crash.
- O relatório JSON é gerado em `apps/api/artifacts/execution-v5-e2e.json`.
- O JSON contém evidências de:
  - cobrança (`action-create-charge-followup` ou `action-send-overdue-charge-reminder`);
  - risco (`action-escalate-risk-review`);
  - idempotência (`idempotency_recent_execution`).

## 1) Subir sistema completo

- [ ] Executar `pnpm install`
- [ ] Executar `pnpm dev`
- [ ] Confirmar logs da API:
  - [ ] `DB conectado (Prisma)`
  - [ ] `Redis conectado`
  - [ ] `Queue ativa`

## 2) Login

- [ ] Acessar Web em `http://localhost:3000`
- [ ] Realizar login com usuário válido
- [ ] Confirmar retorno para dashboard

## 3) Criar cliente

- [ ] Navegar para módulo de clientes
- [ ] Criar cliente com nome + telefone
- [ ] Confirmar cliente na listagem

## 4) Criar agendamento

- [ ] Criar agendamento para o cliente
- [ ] Definir data/hora futura
- [ ] Confirmar status inicial `SCHEDULED`

## 5) Gerar Ordem de Serviço (OS)

- [ ] Criar OS vinculada ao cliente/agendamento
- [ ] Iniciar execução
- [ ] Concluir execução
- [ ] Confirmar OS em `DONE`

## 6) Criar cobrança

- [ ] Criar cobrança vinculada à OS
- [ ] Confirmar cobrança em `PENDING`

## 7) Pagar cobrança

- [ ] Registrar pagamento (PIX/cartão)
- [ ] Confirmar cobrança em `PAID`
- [ ] Confirmar lançamento de pagamento no histórico

## 8) Validar timeline

- [ ] Abrir timeline do cliente/OS
- [ ] Confirmar eventos: criação, execução, cobrança, pagamento

## 9) Validar WhatsApp

- [ ] Confirmar criação de mensagens (agendamento/recibo)
- [ ] Validar status de envio/filas

## 10) Validar governança

- [ ] Consultar trilha de auditoria
- [ ] Confirmar ações com actor, entidade e timestamp
- [ ] Validar isolamento por organização (tenant)

## 11) Testes de integração com infra real

- [ ] Com `pnpm dev` ativo, em outro terminal executar:
  - `pnpm --filter ./apps/api exec jest test/integration --runInBand`
- [ ] Confirmar suíte verde sem `ECONNREFUSED`
