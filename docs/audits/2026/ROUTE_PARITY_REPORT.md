# Route Parity Report (P0 Pilot Readiness)

## Scope
Auth, Customers, Appointments, Service Orders (plus supporting finance routes used by onboarding and billing pages).

## Canonical proxy namespace
All audited frontend calls now use `trpc.nexo.*`, which resolves to `apps/web/server/routers/nexo-proxy.ts` and forwards to the canonical Nest API endpoints.

## Parity matrix

| Domain | Frontend route | Proxy route | Canonical backend endpoint |
|---|---|---|---|
| Auth | `trpc.nexo.auth.login` | `nexo.auth.login` | `POST /auth/login` |
| Auth | `trpc.nexo.bootstrap.firstAdmin` | `nexo.bootstrap.firstAdmin` | `POST /bootstrap/first-admin` |
| Customers | `trpc.nexo.customers.list` | `nexo.customers.list` | `GET /customers` |
| Customers | `trpc.nexo.customers.create` | `nexo.customers.create` | `POST /customers` |
| Appointments | `trpc.nexo.appointments.list` | `nexo.appointments.list` | `GET /appointments` |
| Appointments | `trpc.nexo.appointments.create` | `nexo.appointments.create` | `POST /appointments` |
| Service Orders | `trpc.nexo.serviceOrders.list` | `nexo.serviceOrders.list` | `GET /service-orders` |
| Service Orders | `trpc.nexo.serviceOrders.update` | `nexo.serviceOrders.update` | `PATCH /service-orders/:id` |
| Execution lifecycle | `trpc.nexo.serviceOrders.startExecution` | `nexo.serviceOrders.startExecution` | `POST /service-orders/:id/execution/start` |
| Execution lifecycle | `trpc.nexo.serviceOrders.completeExecutionStep` | `nexo.serviceOrders.completeExecutionStep` | `POST /service-orders/:id/execution/steps/:stepId/complete` |
| Execution lifecycle | `trpc.nexo.serviceOrders.finishExecution` | `nexo.serviceOrders.finishExecution` | `POST /service-orders/:id/execution/finish` |

## Billing parity (supporting P0 #5)

| Domain | Frontend route | Proxy route | Canonical backend endpoint |
|---|---|---|---|
| Expenses | `trpc.nexo.expenses.*` | `nexo.expenses.*` | `/expenses` |
| Invoices | `trpc.nexo.invoices.*` | `nexo.invoices.*` | `/invoices` |

