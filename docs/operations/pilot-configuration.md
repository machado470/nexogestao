---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Pilot Configuration Guide (Small Service Company)

This guide prepares a realistic pilot environment for **Serviços Viva** using seeded operational + financial data.

## 1) Prerequisites

- PostgreSQL database configured in `DATABASE_URL`
- Dependencies installed (`pnpm install`)
- Prisma client generated (`pnpm prisma generate` if needed)

## 2) Run Pilot Seed

```bash
pnpm tsx prisma/seed-pilot.ts
```

Optional environment overrides:

```bash
PILOT_ORG_SLUG=pilot-servicos-viva \
PILOT_ORG_NAME="Serviços Viva - Ambiente Piloto" \
PILOT_ADMIN_EMAIL=admin.piloto@nexogestao.local \
PILOT_OPERATOR_EMAIL=operador.piloto@nexogestao.local \
PILOT_FINANCE_EMAIL=financeiro.piloto@nexogestao.local \
pnpm tsx prisma/seed-pilot.ts
```

## 3) What the seed creates

- 1 pilot organization
- 3 test users (admin, operator, finance)
- 5 customers (service company profile)
- 5 appointments (scheduled, confirmed, done, no-show)
- 5 service orders (open, assigned, in progress, done)
- 4 invoices (draft, issued, paid)
- charges and payment records (pending, paid, overdue)
- 5 expenses and 4 financial launches
- timeline event to audit seed execution

## 4) Pilot Environment Checklist

### Access & Security

- [ ] Confirm all test users can authenticate.
- [ ] Force password rotation before external pilot users access the environment.
- [ ] Validate role permissions (admin/operator/finance) in key screens.

### Core Operations

- [ ] Check customer listing, details, and notes for all seeded customers.
- [ ] Validate calendar rendering for all seeded appointments.
- [ ] Validate service order states transition flow (`OPEN` -> `ASSIGNED` -> `IN_PROGRESS` -> `DONE`).
- [ ] Confirm overdue and pending charge visibility in finance dashboard.

### Finance

- [ ] Validate invoice filters by status (`DRAFT`, `ISSUED`, `PAID`).
- [ ] Confirm paid invoice and paid charge appear in revenue KPIs.
- [ ] Confirm seeded expenses are grouped by categories (operational, supplies, infra, marketing, payroll).
- [ ] Validate launch cashflow timeline and totals.

### Reliability

- [ ] Re-run seed script and ensure it is idempotent (no destructive duplication in core entities).
- [ ] Validate timeline audit event `PILOT_ENVIRONMENT_SEEDED` was created.
- [ ] Execute smoke test for pilot critical journey (login -> appointment -> service order -> invoice).

## 5) Rollback (if needed)

Recommended rollback by tenant/org:

1. Delete org-scoped pilot records by `org.slug = PILOT_ORG_SLUG`.
2. Delete pilot users by test emails.
3. Re-run seed to restore a clean baseline.
