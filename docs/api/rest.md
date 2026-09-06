---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Referência da API - NexoGestão

Este documento detalha os principais endpoints da API RESTful do NexoGestão, localizada em `apps/api`. A autenticação é baseada em JWT, e o `orgId` é extraído do token para garantir o multi-tenancy.

**URL Base**: `/api`

## 1. Autenticação

### `POST /auth/login`

Autentica um usuário e retorna um token JWT.

- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "your_password"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "access_token": "ey..."
  }
  ```

## 2. Clientes (`/customers`)

### `GET /customers`

Lista todos os clientes da organização.

- **Query Parameters**:
  - `page` (number, opcional): Número da página.
  - `limit` (number, opcional): Itens por página.
  - `q` (string, opcional): Termo de busca para nome, email ou documento.
- **Response (200 OK)**: Retorna um objeto com `data` (array de clientes) e `pagination`.

### `POST /customers`

Cria um novo cliente.

- **Request Body**: `CreateCustomerDto`
- **Response (201 Created)**: O objeto do cliente criado.

## 3. Ordens de Serviço (`/service-orders`)

### `GET /service-orders`

Lista as ordens de serviço da organização.

- **Query Parameters**:
  - `page` (number, opcional): Página.
  - `limit` (number, opcional): Limite por página.
  - `status` (ServiceOrderStatus, opcional): Filtra por status (`OPEN`, `ASSIGNED`, `IN_PROGRESS`, `DONE`, `CANCELED`).
  - `customerId` (string, opcional): Filtra por cliente.
  - `assignedToPersonId` (string, opcional): Filtra por responsável.
- **Response (200 OK)**: Objeto com `data` e `pagination`.

### `POST /service-orders`

Cria uma nova ordem de serviço.

- **Request Body**: `CreateServiceOrderDto`
- **Response (201 Created)**: O objeto da OS criada.

## 4. Despesas (`/expenses`)

### `GET /expenses`

Lista as despesas da organização.

- **Query Parameters**:
  - `page`, `limit` (number, opcional): Paginação.
  - `category` (ExpenseCategory, opcional): Filtra por categoria.
  - `from`, `to` (DateString, opcional): Filtra por período.
- **Response (200 OK)**: Objeto com `data` e `pagination`.

### `POST /expenses`

Cria uma nova despesa.

- **Request Body**: `CreateExpenseDto`
- **Response (201 Created)**: O objeto da despesa criada.

## 5. Faturas (`/invoices`)

### `GET /invoices`

Lista as faturas da organização.

- **Query Parameters**:
  - `page`, `limit` (number, opcional): Paginação.
  - `status` (InvoiceStatus, opcional): `DRAFT`, `ISSUED`, `PAID`, `CANCELLED`.
  - `customerId` (string, opcional): Filtra por cliente.
- **Response (200 OK)**: Objeto com `data` e `pagination`.

### `POST /invoices`

Cria uma nova fatura.

- **Request Body**: `CreateInvoiceDto`
- **Response (201 Created)**: O objeto da fatura criada.

### `PATCH /invoices/:id`

Atualiza uma fatura, incluindo a mudança de status.

- **Request Body**: `Partial<CreateInvoiceDto>`
- **Response (200 OK)**: O objeto da fatura atualizada.

## 6. Lançamentos Financeiros (`/launches`)

### `GET /launches`

Lista os lançamentos financeiros.

- **Query Parameters**:
  - `page`, `limit` (number, opcional): Paginação.
  - `type` (LaunchType, opcional): `INCOME`, `EXPENSE`, `TRANSFER`.
  - `from`, `to` (DateString, opcional): Filtro por período.
- **Response (200 OK)**: Objeto com `data` e `pagination`.

### `POST /launches`

Cria um novo lançamento.

- **Request Body**: `CreateLaunchDto`
- **Response (201 Created)**: O objeto do lançamento criado.

## 7. Indicações (`/referrals`)

### `GET /referrals`

Lista as indicações da organização.

- **Query Parameters**:
  - `page`, `limit` (number, opcional): Paginação.
  - `status` (ReferralStatus, opcional): `PENDING`, `CONFIRMED`, `PAID`.
- **Response (200 OK)**: Objeto com `data` e `pagination`.

### `POST /referrals`

Cria uma nova indicação.

- **Request Body**: `CreateReferralDto`
- **Response (201 Created)**: O objeto da indicação criada.
