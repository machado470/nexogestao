# MVP Gap Analysis (Focused Domains)

Date: 2026-03-05
Scope reviewed: `apps/api`, `apps/web`, `prisma`, and product docs.

## 1) Customer
- [ ] Consolidate frontend customer flow on `nexo.*` proxy (currently mixed with legacy `data.*` router/in-memory backend in key pages).
- [ ] Add customer detail workspace (contact history + timeline + linked appointments/OS/charges).
- [ ] Enforce stronger data quality on customer fields (phone normalization/display rules and explicit email verification strategy).
- [ ] Add customer merge/deduplication and archive/reactivation flow for operational hygiene.

## 2) Appointment
- [ ] Fix tenant-scope holes in appointment service queries (`create` customer validation and `update` read/update operations currently miss `orgId` in some lookups).
- [ ] Remove frontend contract mismatch (pages still model IDs as `number` while API is UUID/string).
- [ ] Add explicit operational actions in UI (confirm/cancel/no-show/done transitions with guided reasons).
- [ ] Wire automated communication triggers (confirmation/reminder/no-show follow-up) to WhatsApp queue.

## 3) Service Order
- [ ] Add structured execution fields/entities (start/end timestamps, execution notes/checklist, attachments, outcome) instead of status-only progression.
- [ ] Replace legacy frontend `data.serviceOrders.*` integration with canonical backend proxy.
- [ ] Add status transition guardrails in backend (valid transition matrix, immutable terminal states, cancellation reasons).
- [ ] Expose OS history panel in UI with timeline and finance linkage status.

## 4) Execution
- [ ] Implement explicit "Execution" module (today execution is implicit in ServiceOrder status and comments in service indicate missing execution timestamps).
- [ ] Add executor workflow UI (start execution, progress steps, complete with evidence).
- [ ] Track SLA/lead-time metrics from execution lifecycle.
- [ ] Create auditable execution events linked to customer + OS + responsible person.

## 5) Finance
- [ ] Unify finance stack (currently split between `FinanceService` and separate `PaymentsService` Stripe flow with partial overlap).
- [ ] Add robust overdue lifecycle automation (status updates, reminder cadence, retries) and make it visible in UI actions.
- [ ] Expand UI from read-only cards/list to full operational commands (create charge, collect payment, refund/cancel policy where applicable).
- [ ] Harden notification typing/integration (`ensureChargeForServiceOrderDone` currently emits notification type fallback not domain-specific).

## 6) Timeline
- [ ] Build customer-centered timeline query API (timeline model is generic and current controllers are person/org oriented only).
- [ ] Add timeline page in web app routes/navigation for MVP reconstruction of customer journey.
- [ ] Standardize event taxonomy across customer/appointment/OS/finance/WhatsApp for deterministic story reconstruction.
- [ ] Add timeline filters by entityId/entityType to reduce reliance on metadata parsing.

## 7) Risk
- [ ] Define MVP risk target entity: current implementation is person-centric, while canonical MVP flow requires operational/customer-level risk consequences.
- [ ] Add org-scope enforcement in risk history API path (`persons/:id/risk-history` currently delegates to person-only lookup).
- [ ] Connect risk recalculation triggers directly from operational events (appointment no-show, finance overdue, repeated cancellation) in explicit orchestration layer.
- [ ] Expose explainability payload in API/UI (contributors, reasons, delta vs last snapshot).

## 8) WhatsApp Integration
- [ ] Replace mock provider with real provider adapter(s) and secure credential/config handling for production.
- [ ] Implement template governance and approved placeholders end-to-end (send path still accepts broad `body: any`).
- [ ] Make message idempotency deterministic by business key in manual/API sends (not timestamp-only key generation).
- [ ] Integrate WhatsApp into domain workflows (appointment confirmations/reminders, payment reminders, receipt notifications) instead of isolated messaging UI.
- [ ] Align frontend conversation model with backend message schema (frontend expects `direction/content` style fields, backend persists `renderedText/messageType/status`).

## 9) Cross-cutting MVP blockers observed
- [ ] Remove legacy in-memory data plane from critical pages (`apps/web/server/db.ts` + `data` router) to prevent divergence from Nest/Prisma source of truth.
- [ ] Eliminate UUID-vs-number contract drift in frontend types for customer/appointment/service-order/whatsapp flows.
- [ ] Add one E2E golden path test for: Customer → Appointment → Service Order → Execution → Charge/Payment → WhatsApp → Timeline → Risk.
