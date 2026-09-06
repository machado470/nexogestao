# Mapa de Integração NexoGestão

Este documento mapeia as páginas e componentes do frontend para suas respectivas ações, endpoints no backend (NestJS) e o status da implementação.

| Domínio | Página/Componente | Ação | Endpoint (NestJS) | Status | Observação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth** | Login | Autenticar | `POST /auth/login` | ✅ Existia | |
| | Register | Criar Org + Admin | `POST /bootstrap/first-admin` | ✅ Existia | |
| | Logout | Encerrar sessão | `POST /auth/logout` | ✅ Existia | |
| **Customers** | CustomersPage | Listar clientes | `GET /customers` | ✅ Existia | |
| | CreateCustomerModal | Criar cliente | `POST /customers` | ✅ Existia | |
| | EditCustomerModal | Atualizar cliente | `PATCH /customers/:id` | ✅ Existia | |
| **People** | PeoplePage | Listar pessoas | `GET /people` | ✅ Existia | |
| | CreatePersonModal | Criar pessoa | `POST /people` | ✅ Existia | |
| **Service Orders** | ServiceOrdersPage | Listar O.S. | `GET /service-orders` | ✅ Existia | |
| | CreateServiceOrderModal | Criar O.S. | `POST /service-orders` | ✅ Existia | |
| **Finance** | ExpensesPage | Listar despesas | `GET /expenses` | ✅ Conectado | via `expensesRouter` |
| | CreateExpenseModal | Criar despesa | `POST /expenses` | ✅ Conectado | via `expensesRouter.create` |
| | InvoicesPage | Listar faturas | `GET /invoices` | ✅ Conectado | via `invoicesRouter` |
| | CreateInvoiceModal | Criar fatura | `POST /invoices` | ✅ Conectado | via `invoicesRouter.create` |
| | LaunchesPage | Listar lançamentos | `GET /launches` | ✅ Conectado | via `launchesRouter` |
| | CreateLaunchModal | Criar lançamento | `POST /launches` | ✅ Conectado | via `launchesRouter.create` |
| **Referrals** | ReferralsPage | Listar indicações | `GET /referrals` | ✅ Conectado | via `referralsRouter` |
| | GenerateCode | Gerar link | `POST /referrals/generate-code` | ✅ Conectado | via `referralsRouter.generateCode` |
| | Stats/Balance | Estatísticas | `GET /referrals/stats` | ✅ Conectado | via `referralsRouter.stats` |

## Notas de Implementação
- **Multi-tenancy**: Todas as queries no backend utilizam o `orgId` extraído do token JWT.
- **Conversão de Moeda**: O frontend trabalha com valores em Reais (`amount`), que são convertidos para centavos (`amountCents`) no router antes de serem enviados ao backend (Nest).
- **Routers**: Os routers `expenses.ts` e `launches.ts` foram migrados de mocks para chamadas reais usando `nexoFetch`.
