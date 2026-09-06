# Auditoria de Integração Front-End → Back-End

Este documento mapeia a integração entre a interface do usuário (React/tRPC) e a API (NestJS), garantindo que todas as ações da interface correspondam a endpoints reais e funcionais no back-end, sem o uso de dados mocados.

| Página/Componente | Ação do Usuário | Endpoint tRPC (BFF) | Endpoint API (NestJS) | Service NestJS | Modelo Prisma | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Clientes** | | | | | | |
| `CustomersPage.tsx` | Listar Clientes | `nexo.customers.list` | `GET /customers` | `CustomersService` | `Customer` | ✅ OK |
| `CreateCustomerModal.tsx` | Criar Cliente | `nexo.customers.create` | `POST /customers` | `CustomersService` | `Customer` | ✅ OK |
| `EditCustomerModal.tsx` | Editar Cliente | `nexo.customers.update` | `PATCH /customers/:id` | `CustomersService` | `Customer` | ✅ OK |
| **Pessoas** | | | | | | |
| `PeoplePage.tsx` | Listar Pessoas | `people.list` | `GET /people` | `PeopleService` | `Person` | ✅ OK |
| `CreatePersonModal.tsx` | Criar Pessoa | `people.create` | `POST /people` | `PeopleService` | `Person` | ✅ OK |
| **Ordens de Serviço** | | | | | | |
| `ServiceOrdersPage.tsx` | Listar OS | `data.serviceOrders.list` | `GET /service-orders` | `ServiceOrdersService` | `ServiceOrder` | ✅ OK |
| `CreateServiceOrderModal.tsx` | Criar OS | `data.serviceOrders.create` | `POST /service-orders` | `ServiceOrdersService` | `ServiceOrder` | ✅ OK |
| `ServiceOrdersPage.tsx` | Atualizar Status OS | `data.serviceOrders.update` | `PATCH /service-orders/:id` | `ServiceOrdersService` | `ServiceOrder` | ✅ OK |
| **Agendamentos** | | | | | | |
| `AppointmentsPage.tsx` | Listar Agendamentos | `appointments.list` | `GET /appointments` | `AppointmentsService` | `Appointment` | ✅ OK |
| `CreateAppointmentModal.tsx`| Criar Agendamento | `appointments.create` | `POST /appointments` | `AppointmentsService` | `Appointment` | ✅ OK |
| **Cobranças** | | | | | | |
| `FinancesPage.tsx` | Listar Cobranças | `finance.charges.list` | `GET /finance/charges` | `FinanceService` | `Charge` | ✅ OK |
| `CreateChargeModal.tsx` | Criar Cobrança | `finance.charges.create` | `POST /finance/charges` | `FinanceService` | `Charge` | ✅ OK |
| `EditChargeModal.tsx` | Editar Cobrança | `finance.charges.update` | `PATCH /finance/charges/:id`| `FinanceService` | `Charge` | ✅ OK |
| **Pagamentos** | | | | | | |
| `EditChargeModal.tsx` | Registrar Pagamento | `finance.payments.create` | `POST /finance/payments` | `FinanceService` | `Payment` | ✅ OK |
| **Despesas** | | | | | | |
| `ExpensesPage.tsx` | Listar Despesas | `expenses.list` | `GET /expenses` | `ExpensesService` | `Expense` | ✅ OK |
| `CreateExpenseModal.tsx` | Criar Despesa | `expenses.create` | `POST /expenses` | `ExpensesService` | `Expense` | ✅ OK |
| **Faturas** | | | | | | |
| `InvoicesPage.tsx` | Listar Faturas | `invoices.list` | `GET /invoices` | `InvoicesService` | `Invoice` | ✅ OK |
| `CreateInvoiceModal.tsx` | Criar Fatura | `invoices.create` | `POST /invoices` | `InvoicesService` | `Invoice` | ✅ OK |
| **Lançamentos** | | | | | | |
| `LaunchesPage.tsx` | Listar Lançamentos | `launches.list` | `GET /launches` | `LaunchesService` | `Launch` | ✅ OK |
| `CreateLaunchModal.tsx` | Criar Lançamento | `launches.create` | `POST /launches` | `LaunchesService` | `Launch` | ✅ OK |
| **Indicações** | | | | | | |
| `ReferralsPage.tsx` | Listar Indicações | `referrals.list` | `GET /referrals` | `ReferralsService` | `Referral` | ✅ OK |
| `ReferralsPage.tsx` | Criar Indicação | `referrals.create` | `POST /referrals` | `ReferralsService` | `Referral` | ✅ OK |

**Conclusão da Auditoria:**

A integração entre o front-end e o back-end está **sólida e consistente**. O padrão BFF (Backend-for-Frontend) com tRPC atua como um proxy para a API NestJS, o que é uma excelente prática para desacoplar as responsabilidades. Não foram encontrados dados mocados ou estáticos nos fluxos principais. Todos os componentes de UI analisados se conectam a endpoints de API reais e funcionais.
