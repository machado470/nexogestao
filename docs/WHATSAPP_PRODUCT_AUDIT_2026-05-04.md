# WhatsApp Module Product Audit (NexoGestao)

## 1) Brutal diagnosis (what is wrong)

### The module is operationally ambitious but interaction-model confused
- The page includes operational context (customer/appointment/service order/charge) but still executes core interactions as if it were a standard chat app: select thread, type message, send. The operational entities are secondary to message composition, not first-class workflow objects.
- "Context" is largely read-only and detached from execution state transitions; operators are not guided through resolution loops (e.g., pending charge -> send charge -> payment confirmation -> timeline closure).

### Prioritization is present in data but weak in decision UX
- Priority ranking exists (`priorityScore` + `resolveInboxPriority`) and sorting is applied, but the list UI does not expose a clear triage model (SLA buckets, urgency timers, ownership, blocked reason).
- The UI has badges like "Sem resposta", "Falha", "Cobrança pendente", but these are visual labels without explicit next-best-action logic per row.

### Integration is partial and brittle
- Integrations with customers/appointments/service orders/charges are built via multiple broad list queries (up to 300/500 items) and client-side joins, making context assembly fragile, heavy, and susceptible to stale/partial data.
- Message send flow still has TODO-level timeline integration, meaning execution telemetry is not guaranteed where business auditability matters.

### Virtual conversations blur real operational state
- Customers without active conversation are injected as pseudo-conversations (`id: customer:<id>`). This helps outbound initiation, but it pollutes the inbox model and can confuse filtering/priority semantics because non-conversations are rendered like active threads.

### UI consistency and architecture issues
- One file (`WhatsAppPage.tsx`) owns mapping, business rules, fetching, state orchestration, and rendering of all three panels; high coupling increases risk and slows evolution.
- Hardcoded dimensions/colors/classes dominate (`ROW_HEIGHT`, per-element utility styling, custom dark palette on page shell), reducing design-system reuse and consistency.
- Several actions are placeholders or overloaded (e.g., "Mais ações" effectively retries failed message), which breaks operator trust.

## 2) Why it is wrong (product perspective)

### Operational products optimize decisions, not just message throughput
For NexoGestao, WhatsApp should reduce mean-time-to-resolution (MTR) across service, financial, and customer workflows. A chat-first mental model optimizes conversation continuity, while an operations system must optimize queue triage, compliance, and outcome closure.

### Missing explicit work queues hurts prioritization behavior
Without queue framing ("Needs response now", "At risk", "Finance due today", "Delivery failure"), operators rely on scanning and memory, increasing cognitive load and causing delayed actions on high-value/at-risk cases.

### Weak lifecycle linkage breaks accountability
If sending payment link, confirming appointment, and service updates are not visibly linked to entity states and timeline events in one flow, users cannot reliably prove "what happened" or "what changed because of this message".

### Ambiguous message status is expensive
Raw transport statuses are shown inline, but operationally useful statuses ("Awaiting customer", "Action failed: retry required", "Delivered but no response > Xh") are missing. Teams need actionability, not protocol vocabulary.

## 3) What must change

1. Reframe the page as **Operational Inbox**, not chat.
2. Replace one-dimensional chronological list with **priority queue lanes**.
3. Enforce **context-required messaging**: outbound message must have linked entity intent/type (or explicit "general" justification).
4. Convert right panel from static details to **action cockpit** tied to entity state transitions.
5. Add **end-to-end status model**: transport + business outcome.
6. Break page into domain components + orchestration hooks; remove heavy client-side joins.

## 4) New architecture (3-column, execution-oriented)

## Column 1 — Conversation Queue (priority-based)

### Purpose
Answer: "Who needs action now and why?"

### Structure
- Sections/lanes (top to bottom):
  1. **Critical now** (delivery failures, overdue finance, unresolved high-priority)
  2. **Waiting customer** (delivered/read but no response past threshold)
  3. **Today commitments** (appointments/services due today)
  4. **Monitor/Resolved**
- Each row includes:
  - Priority badge (Critical/High/Medium/Low)
  - Time-to-breach or age-in-state
  - Primary blocker reason (e.g., `PAYMENT_OVERDUE`, `DELIVERY_FAILED`)
  - Next action chip (single CTA preview)
  - Linked entity icons (Customer / SO / Charge / Appointment)

### Behavior
- Sorting by `(priority, SLA breach risk, last-event-time)`.
- Filters are operational, not generic: "Needs my response", "Finance risk", "Service at risk", "Delivery failed".

## Column 2 — Execution Chat Area (focused)

### Purpose
Execute communication with clear outcome intent.

### Structure
- Header: customer + operational state summary + ownership.
- Message timeline grouped by business episodes (e.g., charge reminder sequence).
- Composer with required **intent selector**:
  - Payment link/reminder
  - Appointment confirm/reminder
  - Service update
  - General note
- Send action validates context availability and displays predicted effect (e.g., "Will attach to Charge #123 and log timeline event").

### Message status model
- Transport: queued/sent/delivered/read/failed
- Operational overlay:
  - `ACTION_PENDING_CUSTOMER`
  - `ACTION_RETRY_REQUIRED`
  - `ACTION_COMPLETED`
- Failed messages get inline retry + root-cause hint + fallback channel suggestion.

## Column 3 — Operational Context Panel (action cockpit)

### Purpose
Answer: "What business object is this conversation affecting, and what can I do now?"

### Sections
1. **Customer snapshot** (segment, risk, recent interactions)
2. **Finance block** (open charges, due date, amount, quick actions)
3. **Service block** (open SOs, current status, technician, SLA)
4. **Appointments block** (next appointment, confirmation status)
5. **Timeline block** (latest operational events + message-linked events)

### Contextual actions
- Send payment link/reminder
- Register payment (or deep-link with callback)
- Confirm/reschedule appointment
- Update service status and notify customer
- Escalate / assign owner

## Cross-cutting rules
- No outbound message without `entityType/entityId` (or explicit audited `GENERAL`).
- Every send creates/updates timeline event contract.
- Suggested action engine returns one primary + secondary actions with rationale.

## 5) Refactor plan ready for implementation

### Phase 0 — Baseline and contracts
1. Define `OperationalInboxItem` API DTO server-side (already prioritized, pre-joined context).
2. Define `MessageOperationalStatus` contract combining transport + business state.
3. Add timeline write contract for each send/template/retry path.

### Phase 1 — Frontend architecture split
1. Create page container `WhatsAppOperationalInboxPage` (or keep route but new composition).
2. Extract components:
   - `InboxQueueColumn`
   - `ExecutionChatColumn`
   - `OperationalContextColumn`
3. Extract hooks:
   - `useOperationalInbox()`
   - `useConversationExecution(conversationId)`
   - `useOperationalContext(conversationId | customerId)`

### Phase 2 — Queue and triage UX
1. Replace current filter chips with operational lanes + counters.
2. Add urgency timers and breach chips.
3. Add row-level "next action" CTA.

### Phase 3 — Chat execution hardening
1. Replace free composer default with intent-first composer.
2. Add status rendering component with operational overlays.
3. Add deterministic retry/fallback panel for failures.

### Phase 4 — Context cockpit actions
1. Convert static cards to action-capable cards (`FinanceActionCard`, `ServiceOrderActionCard`, `AppointmentActionCard`).
2. Ensure actions update both entity and timeline; optimistic UI + rollback on failure.

### Phase 5 — Design system and consistency
1. Wrap with reusable shell primitives (`AppPageShell`, `AppPane`, `AppCard`, `StatusPill`, `ActionRail`).
2. Remove hardcoded spacing/colors in page-level classes; tokenize through DS variants.
3. Normalize button hierarchy and terminology (avoid overloaded "Mais ações").

### Phase 6 — Migration safety and metrics
1. Feature flag new inbox.
2. Track KPIs: first-response time, overdue-charge conversion after message, failed-delivery recovery rate, resolution time by context type.
3. Gradual rollout by organization.
