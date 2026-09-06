# NexoGestao — Robustness Hardening Wave 4 (2026-04-10)

## Escopo executado

Wave 4 focou em centralização operacional sem reimplementar entregas das Waves 1–3 (concorrência otimista e idempotência).

### 1) State machine central de negócio

Consolidação de transições explícitas por entidade no núcleo de domínio:

- Appointment: `SCHEDULED -> CONFIRMED -> (DONE | CANCELED | NO_SHOW)`
- ServiceOrder: `OPEN -> ASSIGNED -> IN_PROGRESS -> (DONE | CANCELED)`
- Charge: `PENDING -> (OVERDUE | PAID | CANCELED)` e `OVERDUE -> (PAID | CANCELED)`

Mudanças:
- Helpers dedicados adicionados (`ensureAppointmentTransition`, `ensureServiceOrderTransition`, `ensureChargeTransition`).
- Serviços de Appointment/ServiceOrder passaram a usar os helpers centrais (sem validação duplicada local).
- Erro padronizado em transição inválida: `INVALID_STATE_TRANSITION` com `details.allowed`.

### 2) Execution/result contract mais central

- Novo envelope central em `common/operations/operational-result.ts`.
- `FinanceService` passou a construir `operation` com contexto de rastreabilidade:
  - `status`
  - `reason`
  - `idempotencyKey`
  - `executionKey`
  - `requestId`
  - `correlationId`

Isso mantém compatibilidade com contratos prévios e amplia observabilidade sem quebrar fluxos atuais.

### 3) Observabilidade operacional

- `operation` agora inclui `requestId` e `correlationId` no FinanceService.
- Execution Runner reforçou rastreabilidade por status, mantendo `executionKey` em eventos.

### 4) Métricas operacionais básicas

Expansão de métricas in-memory:
- `executionActionStatus:{executed|blocked|throttled|failed}`
- `financeOperationStatus:{executed|blocked|skipped|duplicate|retry_scheduled|failed|degraded}`

E instrumentação aplicada em:
- `ExecutionRunner` (contagem por resultado final e bloqueios).
- `FinanceService` (contagem no momento de materialização do envelope `operation`).

### 5) Governança/execution hardening

No `ExecutionRunner`, bloqueios e resultados agora também alimentam contadores padronizados por status, reforçando leitura operacional consolidada de:
- executed
- blocked
- throttled
- failed

### 6) Frontend: consistência de feedback operacional

Criado utilitário único para texto de feedback operacional:
- `resolveOperationFeedback` em `apps/web/client/src/lib/operations/operation-feedback.ts`

Aplicado em fluxos críticos:
- `CreateChargeModal`
- `useChargeActions` (pagamento)
- `WhatsAppPage` (envio manual via painel)

Resultado: menos divergência de mensagens para `duplicate`, `blocked`, `retry_scheduled` e sucesso padrão.

### 7) Testes adicionados/atualizados

- `state-transitions.spec.ts` ampliado com charge + helpers explícitos por entidade.
- Novo teste de `operational-result.spec.ts` cobrindo envelope operacional com rastreabilidade.
- `finance.service.spec.ts` atualizado para contrato operacional enriquecido (request/correlation ids).

## Riscos remanescentes / Wave 5

1. Expandir métricas para provider-level timeout por integração (ex.: WhatsApp provider timeout counter explícito).
2. Consolidar o envelope operacional também em outros módulos além Finance (ex.: endpoints de WhatsApp e runner responses públicas).
3. Fechar trilha E2E com validação ponta a ponta (BFF/API/UI) para status `blocked/skipped/degraded/retry_scheduled`.
4. Evoluir dashboard/health para exibir os novos contadores de execução operacional.
