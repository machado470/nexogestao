---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Taxonomia canônica de eventos da Timeline

Este documento define a linguagem operacional oficial para Timeline, Dashboard, Risk Engine e Governança do NexoGestão.

## Regra de compatibilidade

Eventos legados podem continuar existindo em dados históricos e em fluxos auxiliares, mas qualquer leitura operacional deve normalizar o tipo do evento antes de filtrar, agregar ou classificar. Eventos desconhecidos devem permanecer inalterados para não bloquear eventos futuros.

A fonte única no backend é `apps/api/src/timeline/timeline-events.ts`, que exporta `CANONICAL_TIMELINE_EVENTS`, `LEGACY_TIMELINE_EVENT_ALIASES`, `normalizeTimelineEventType` e expansão de filtros para leitura compatível.

## Eventos canônicos oficiais

- `CUSTOMER_CREATED`: cliente criado.
- `CUSTOMER_UPDATED`: cliente atualizado.
- `APPOINTMENT_CREATED`: agendamento criado.
- `APPOINTMENT_CONFIRMED`: agendamento confirmado.
- `APPOINTMENT_CANCELLED`: agendamento cancelado.
- `SERVICE_ORDER_CREATED`: ordem de serviço criada.
- `SERVICE_ORDER_STARTED`: execução operacional da O.S. iniciada.
- `SERVICE_ORDER_COMPLETED`: execução operacional da O.S. concluída.
- `CHARGE_CREATED`: cobrança criada, incluindo cobranças geradas a partir de O.S.
- `PAYMENT_RECEIVED`: pagamento recebido.
- `MESSAGE_SENT`: mensagem efetivamente enviada.
- `MESSAGE_FAILED`: falha de mensagem.
- `RISK_UPDATED`: risco operacional recalculado ou atualizado.
- `GOVERNANCE_RUN_STARTED`: ciclo de governança iniciado.
- `GOVERNANCE_RUN_COMPLETED`: ciclo de governança concluído.
- `OPERATIONAL_STATE_CHANGED`: estado operacional alterado ou enforcement/warning normalizado para leitura.

## Aliases legados

| Legado                              | Canônico                    |
| ----------------------------------- | --------------------------- |
| `APPOINTMENT_CANCELED`              | `APPOINTMENT_CANCELLED`     |
| `EXECUTION_STARTED`                 | `SERVICE_ORDER_STARTED`     |
| `EXECUTION_DONE`                    | `SERVICE_ORDER_COMPLETED`   |
| `EXECUTION_COMPLETED`               | `SERVICE_ORDER_COMPLETED`   |
| `SERVICE_ORDER_DONE`                | `SERVICE_ORDER_COMPLETED`   |
| `SERVICE_ORDER_CHARGE_CREATED`      | `CHARGE_CREATED`            |
| `WHATSAPP_MESSAGE_SENT`             | `MESSAGE_SENT`              |
| `WHATSAPP_MESSAGE_FAILED`           | `MESSAGE_FAILED`            |
| `CUSTOMER_OPERATIONAL_RISK_UPDATED` | `RISK_UPDATED`              |
| `RISK_SNAPSHOT_CREATED`             | `RISK_UPDATED`              |
| `OPERATIONAL_STATE_ENFORCED`        | `OPERATIONAL_STATE_CHANGED` |
| `OPERATIONAL_WARNING_RAISED`        | `OPERATIONAL_STATE_CHANGED` |

## Emissão por fluxo

- Agendamentos devem emitir `APPOINTMENT_CANCELLED` ao cancelar. `APPOINTMENT_CANCELED` permanece apenas como alias histórico.
- Execução fallback de O.S. emite `SERVICE_ORDER_STARTED` e mantém `EXECUTION_STARTED` como evento auxiliar legado.
- Conclusão de execução fallback de O.S. emite `SERVICE_ORDER_COMPLETED` e mantém `EXECUTION_DONE` como evento auxiliar legado.
- Cobrança gerada a partir de O.S. emite `CHARGE_CREATED` e mantém `SERVICE_ORDER_CHARGE_CREATED` como evento auxiliar legado.
- WhatsApp deve contar envios reais por `MESSAGE_SENT` e falhas por `MESSAGE_FAILED`. Eventos `WHATSAPP_MESSAGE_SENT` são tratados como legado/compatibilidade.
- Risk deve emitir `RISK_UPDATED` para atualizações relevantes, mantendo `RISK_SNAPSHOT_CREATED` e `CUSTOMER_OPERATIONAL_RISK_UPDATED` como eventos auxiliares quando já existirem no fluxo.
- Governança deve emitir `GOVERNANCE_RUN_STARTED` ao iniciar, `OPERATIONAL_STATE_CHANGED` quando warning/enforcement muda ou sinaliza estado operacional, e `GOVERNANCE_RUN_COMPLETED` ao finalizar.

## Consumidores

- Timeline: deve normalizar antes de rotular, filtrar, agrupar severidade ou módulo.
- Dashboard: deve preferir contagens canônicas (`CHARGE_CREATED`, `MESSAGE_FAILED`, `SERVICE_ORDER_COMPLETED`, `RISK_UPDATED`, `OPERATIONAL_STATE_CHANGED`).
- Risk Engine: deve publicar `RISK_UPDATED` com metadata disponível (`previousRisk`, `nextRisk`/`riskLevel`, `score`, `reason`, `entityType`, `entityId`).
- Governança: deve publicar início, alterações de estado e conclusão para permitir reconstruir a sequência: governança iniciou → avaliou risco → alterou estado → concluiu.

## Multi-tenant

Eventos devem sempre usar `orgId` resolvido no backend por contexto autenticado ou entidade persistida no tenant. Não se deve confiar em `orgId` crítico vindo do frontend para gerar timeline cross-tenant.
