---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Automation Engine (Layer 1)

## Design

The automation engine is rule-based and organization-scoped.

- **AutomationRule**: defines `trigger`, optional `conditionSet`, and `actionSet`.
- **AutomationExecution**: immutable execution log per rule match attempt.
- **Trigger invocation points** (current):
  - `APPOINTMENT_CREATED` on appointment creation.
  - `SERVICE_ORDER_COMPLETED` when service order transitions to `DONE`.
  - `PAYMENT_OVERDUE` inside overdue lifecycle automation.

Conditions and actions are JSON-driven to avoid architectural refactor and preserve current modules.

## Condition model

```json
{
  "all": [{ "field": "amountCents", "operator": "gt", "value": 0 }],
  "any": [{ "field": "customerPhone", "operator": "exists" }]
}
```

Supported operators:

- `equals`
- `notEquals`
- `gt`
- `gte`
- `lt`
- `lte`
- `in`
- `exists`

## Action model

```json
[
  {
    "type": "CREATE_NOTIFICATION",
    "notificationType": "PAYMENT_OVERDUE",
    "message": "..."
  },
  { "type": "UPDATE_RISK", "reason": "PAYMENT_OVERDUE_AUTOMATION" }
]
```

Supported action types:

- `SEND_WHATSAPP_MESSAGE`
- `CREATE_CHARGE`
- `CREATE_NOTIFICATION`
- `UPDATE_RISK`

## API endpoints

- `GET /automation/rules`
- `POST /automation/rules`
- `PATCH /automation/rules/:id`
- `POST /automation/execute`

All endpoints require JWT and `ADMIN` or `MANAGER` role.
