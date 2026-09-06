---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Risk Engine — Sinais Operacionais Reais

Este documento descreve os sinais operacionais reais consumidos pelo Risk Engine do NexoGestão no lote P1. O objetivo é manter o cálculo no backend, usando entidades existentes e eventos canônicos da Timeline, sem criar mock, dashboard novo ou alteração visual.

## Fontes consideradas

O cálculo usa sempre escopo de organização (`orgId`) derivado da entidade avaliada ou recebido do contexto backend. As consultas operacionais são filtradas por `orgId` para evitar vazamento cross-tenant.

### Financeiro

Entram no score:

- cobranças vencidas (`Charge.status = OVERDUE`);
- valor total vencido (`sum(Charge.amountCents)` para vencidas);
- cobranças pendentes sem pagamento (`Charge.status = PENDING` e sem `Payment`);
- pagamentos recebidos recentemente (`Payment.paidAt` nos últimos 30 dias), como mitigador de risco.

### Ordens de serviço

Entram no score:

- O.S. abertas/atribuídas/em execução com `dueDate` vencido;
- O.S. abertas há mais de 7 dias;
- O.S. concluídas (`DONE`) sem cobrança associada;
- O.S. canceladas recentemente;
- execução iniciada (`IN_PROGRESS` com `startedAt`) e não concluída após 2 dias.

### Agendamentos

Entram no score:

- cancelamentos recorrentes recentes;
- `NO_SHOW`, quando houver status disponível;
- agendamentos próximos ainda `SCHEDULED` (não confirmados);
- agendamentos vencidos sem O.S. vinculada.

### WhatsApp

Entram no score:

- mensagens com status `FAILED` para cliente;
- eventos canônicos `MESSAGE_FAILED` na Timeline;
- conversas aguardando operação/cliente com prazo de resposta vencido, quando houver `responseDueAt`.

### Timeline canônica

O Risk Engine aceita eventos canônicos e aliases legados normalizados por `normalizeTimelineEventType`. Os eventos consumidos neste lote são:

- `APPOINTMENT_CANCELLED`;
- `SERVICE_ORDER_STARTED`;
- `SERVICE_ORDER_COMPLETED`;
- `CHARGE_CREATED`;
- `PAYMENT_RECEIVED`;
- `MESSAGE_FAILED`;
- `GOVERNANCE_RUN_COMPLETED`;
- `OPERATIONAL_STATE_CHANGED`.

Eventos desconhecidos permanecem forward-compatible: são preservados como texto normalizado, mas não quebram o cálculo.

### Pessoas

Quando o cálculo é por pessoa, também entram:

- O.S. atribuídas atrasadas;
- carga diária atribuída contra `dailyServiceOrderCapacity` e `dailyAppointmentCapacity`;
- ações corretivas abertas existentes;
- progresso médio de assignments;
- ausência de atividade recente quando não há atualização operacional por mais de 14 dias.

## Score e estados oficiais

O score final é limitado entre `0` e `100`.

| Score        | Estado oficial |
| ------------ | -------------- |
| `0` a `49`   | `NORMAL`       |
| `50` a `69`  | `WARNING`      |
| `70` a `89`  | `RESTRICTED`   |
| `90` a `100` | `SUSPENDED`    |

Regras principais:

- `NORMAL`: nenhum sinal relevante.
- `WARNING`: pelo menos um sinal operacional relevante, como cobrança vencida, O.S. atrasada ou falha de mensagem.
- `RESTRICTED`: combinação de sinais ou valor financeiro relevante em atraso.
- `SUSPENDED`: score acumulado crítico, mantendo compatibilidade com a política de governança existente.

Pagamentos recentes reduzem pontos do score financeiro, mas nunca deixam o score abaixo de zero.

## Emissão de `RISK_UPDATED`

O evento canônico `RISK_UPDATED` é emitido quando o risco recalculado muda de forma relevante:

- mudança de score;
- mudança de estado operacional (`NORMAL`, `WARNING`, `RESTRICTED`, `SUSPENDED`).

A metadata emitida inclui:

- `previousRisk` e `nextRisk`;
- `previousScore` e `nextScore`;
- `previousState` e `nextState`;
- `score`;
- `riskLevel`;
- `reasons`/`contributors`;
- `signals`/`factors`;
- `breakdown`;
- `evaluatedAt`;
- `entityType`;
- `entityId`;
- `orgId`.

## Integração com Governança e Dashboard

- `Person.operationalRiskScore` e `Person.operationalState` passam a refletir o score operacional real recalculado por pessoa.
- `GovernanceRunService` e `EnforcementEngineService` continuam consumindo o score/estado persistidos em `Person`.
- O Dashboard não teve alteração visual. Os contratos existentes podem consumir os mesmos sinais operacionais reais por backend, sem fallback novo no frontend.
- A Timeline passa a receber `RISK_UPDATED` canônico com metadata suficiente para auditoria e explainability.

## Gaps conhecidos

Sinais não inventados neste lote:

- não há campo explícito de "cliente sem resposta" em mensagem individual; foi usado `WhatsAppConversation.responseDueAt`/status quando disponível;
- não há persistência dedicada de score por cliente, então a comparação de mudança usa o último `RISK_UPDATED` da Timeline do cliente;
- não há capacidade operacional por tipo de serviço; a carga por pessoa usa capacidades diárias já existentes;
- recorrência histórica avançada por janela mensal/por política ainda pode ser refinada em lote futuro;
- políticas específicas de suspensão manual continuam sob Governança/Enforcement e não foram reimplementadas no Risk Engine.
