# 2-Week Sprint Plan for Pilot Readiness

Date: 2026-03-06  
Input analyzed: `PRODUCT_AUDIT.md` and `docs/MVP_GAP_ANALYSIS_FOCUS_AREAS.md`

## Planning assumptions
- Goal is **pilot readiness** (stable onboarding and core operations), not full production hardening.
- Prioritization is derived from currently flagged gaps: mock finance modules, execution model gaps, and frontend/backend contract drift.
- Team capacity baseline: ~2 squads (Platform/API + Web UX), 10 working days.

## 1) Prioritized task list (2 weeks)

## P0 — Must ship for pilot (Days 1–10)

1. **Implement real registration (replace partial/basic flow with tenant-aware real signup)**
   - Add backend validation and duplicate checks (email/org-safe), finalize signup payload, and return auth/session consistently.
   - Harden frontend registration form (password/email validation + API error mapping).
   - Add happy-path and duplicate-email integration tests.

2. **Guided onboarding workflow (first-login to operational-ready)**
   - Build step engine with persisted progress (`onboardingStep`) and resumable flow.
   - Steps: company profile → first customer → first appointment → first service order → finance setup checklist.
   - Add post-step CTAs linking directly to target screens.

3. **Backend ↔ frontend route parity stabilization**
   - Remove or isolate legacy `data.*`/mock routes from critical flows.
   - Migrate affected pages to canonical `nexo-proxy`/Nest endpoints.
   - Standardize ID contracts (UUID/string) and pagination/filter DTOs.
   - Produce route parity matrix (expected route, current route, owner, status).

4. **Expense and invoice UX completion (from CRUD mock feel to usable finance operations)**
   - Wire full list/create/edit/delete with summaries and empty/loading/error states.
   - Add mandatory business fields (category, due dates, status badges, references).
   - Add invoice numbering strategy and clear status transitions.

5. **Expose execution lifecycle in the web portal**
   - Materialize execution events in UI timeline from service order lifecycle.
   - Add user actions: “Start execution”, “Mark step done”, “Complete with notes/evidence”.
   - Surface lead-time/SLA widgets tied to execution timestamps.

## P1 — Should ship if P0 stabilized early (Days 8–10)

6. **Admin dashboard UI hardening for pilot operations**
   - Consolidate executive/admin cards, make health/operational widgets explicit.
   - Add quick actions (create user/customer, review overdue charges, pending service orders).
   - Add skeleton and alert states for key panels.

7. **Cross-flow QA + smoke automation**
   - E2E “golden path”: registration → onboarding → customer → appointment → service order execution → expense/invoice touchpoint.
   - Release checklist and pilot rollback notes.

## 2) Estimated complexity

| Priority | Task | Complexity | Notes |
|---|---|---:|---|
| P0 | Real registration | **M** | Existing auth exists, but contract and validation hardening required. |
| P0 | Guided onboarding workflow | **M/L** | Requires persisted step orchestration + UX sequencing. |
| P0 | Route parity fix | **L** | Broad impact across routers/pages and typing contracts. |
| P0 | Expense/invoice UX completion | **M** | Backend exists but UX is incomplete and partly perceived as mock. |
| P0 | Execution lifecycle in portal | **L** | New explicit lifecycle UX + likely backend event enrichments. |
| P1 | Admin dashboard UI | **M** | Mostly composition and data shaping over existing metrics APIs. |
| P1 | QA & smoke suite | **M** | Requires stable fixtures + deterministic e2e flow. |

## 3) Files likely to change

## Backend (API)
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/onboarding/onboarding.controller.ts`
- `apps/api/src/onboarding/onboarding.service.ts`
- `apps/api/src/service-orders/service-orders.controller.ts`
- `apps/api/src/service-orders/service-orders.service.ts`
- `apps/api/src/execution/execution.controller.ts`
- `apps/api/src/execution/execution.service.ts`
- `apps/api/src/invoices/invoices.controller.ts`
- `apps/api/src/invoices/invoices.service.ts`
- `apps/api/src/expenses/expenses.controller.ts`
- `apps/api/src/expenses/expenses.service.ts`
- `apps/api/src/dashboard/dashboard.controller.ts`
- `apps/api/src/dashboard/dashboard.service.ts`
- `apps/api/src/reports/executive-dashboard.controller.ts`
- `apps/api/src/reports/executive-dashboard.service.ts`

## Frontend (Web)
- `apps/web/client/src/pages/Register.tsx`
- `apps/web/client/src/pages/Onboarding.tsx`
- `apps/web/client/src/pages/ExecutiveDashboard.tsx`
- `apps/web/client/src/pages/ServiceOrdersPage.tsx`
- `apps/web/client/src/pages/OperationalWorkflowPage.tsx`
- `apps/web/client/src/pages/ExpensesPage.tsx`
- `apps/web/client/src/pages/InvoicesPage.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- `apps/web/client/src/App.tsx`
- `apps/web/server/routers/nexo-proxy.ts`
- `apps/web/server/routers/data.ts` (deprecation/removal from critical paths)
- `apps/web/server/routers/expenses.ts`
- `apps/web/server/routers/invoices.ts`
- `apps/web/server/routers/auth.ts`
- `apps/web/server/routers/dashboard.ts`

## Data/contracts/tests
- `prisma/schema.prisma` (if execution lifecycle fields/events are formalized)
- `apps/api/test/*` and `apps/web/*e2e*` (golden-path coverage)

## 4) Suggested UI routes

## Pilot-critical routes
- `/register` — real signup with stronger validation
- `/onboarding` — guided stepper with resume
- `/dashboard/admin` — admin-focused operational cockpit (can alias existing executive dashboard)
- `/service-orders/:id/execution` — explicit execution lifecycle workspace
- `/service-orders/:id/timeline` — execution + finance linkage events
- `/finance/expenses` — expense operations + summary
- `/finance/invoices` — invoice operations + status
- `/settings/integrations` — pilot setup guardrail (payment/notifications readiness)

## Compatibility/transition routes
- Keep existing routes and add redirects while parity migration occurs:
  - `/executive-dashboard` → `/dashboard/admin`
  - `/expenses` → `/finance/expenses`
  - `/invoices` → `/finance/invoices`

## Delivery sequencing by week

### Week 1 (Foundation + parity)
- Real registration
- Onboarding step persistence + first 3 guided steps
- Route parity fixes for auth/customers/appointments/service-orders paths
- Expense/invoice page contract cleanup (types + API parity)

### Week 2 (Operational completion + polish)
- Execution lifecycle UI and API event coverage
- Finish expense/invoice UX flows (state transitions, summaries, validations)
- Admin dashboard UI hardening
- End-to-end smoke tests and pilot go/no-go checklist
