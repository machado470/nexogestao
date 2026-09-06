---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Regras de Domínio - NexoGestão

Este documento descreve as principais regras de negócio implementadas no sistema para garantir a consistência, integridade e robustez dos dados.

## 1. Faturas (`Invoices`)

As faturas seguem um ciclo de vida estrito para garantir a integridade financeira.

### Transições de Status

O status de uma fatura só pode progredir de acordo com o seguinte fluxo:

- `DRAFT` → `ISSUED` (Emitida)
- `DRAFT` → `CANCELLED` (Cancelada)
- `ISSUED` → `PAID` (Paga)
- `ISSUED` → `CANCELLED` (Cancelada)

Qualquer outra tentativa de transição (ex: `PAID` → `DRAFT`) é bloqueada pela API, retornando um erro `400 Bad Request`.

### Validações

- **Valor Positivo**: O valor (`amountCents`) de uma fatura deve ser sempre maior que zero.
- **Número Único**: O número da fatura (`number`) deve ser único por organização (`orgId`). A API impede a criação de faturas com números duplicados.
- **Exclusão**: Faturas com status `PAID` não podem ser excluídas.

## 2. Despesas (`Expenses`)

As despesas são validadas para garantir que os registros financeiros sejam precisos.

### Validações

- **Valor Positivo**: O valor (`amountCents`) de uma despesa deve ser sempre maior que zero.
- **Categoria Válida**: A categoria (`category`) deve pertencer a uma lista pré-definida de valores (`enum ExpenseCategory`). Tentativas de criar ou atualizar despesas com categorias inválidas são rejeitadas.

## 3. Lançamentos Financeiros (`Launches`)

Lançamentos genéricos (receitas, despesas, transferências) também possuem regras para manter a consistência.

### Validações

- **Valor Positivo**: O valor (`amountCents`) de um lançamento deve ser sempre maior que zero.
- **Tipo Válido**: O tipo (`type`) deve ser um dos valores do enum `LaunchType`: `INCOME`, `EXPENSE`, ou `TRANSFER`.
- **Categoria Obrigatória**: Todo lançamento deve ter uma categoria (`category`) não-vazia.

## 4. Indicações (`Referrals`)

O sistema de indicações é protegido contra duplicidade e garante a unicidade dos códigos de referência.

### Validações

- **Código Único**: Ao criar uma indicação, um código de 8 caracteres alfanuméricos é gerado. O sistema garante que este código seja único em toda a plataforma. Caso o código gerado aleatoriamente já exista, o sistema tenta gerar um novo código por até 5 vezes antes de falhar.
- **Prevenção de Duplicidade**: O sistema impede que um mesmo _referrer_ (indicador) indique o mesmo _referred_ (indicado) mais de uma vez dentro da mesma organização, com base na combinação de `referrerEmail` e `referredEmail`.

## 5. Multi-Tenancy

A regra de domínio mais crítica do sistema.

- **Isolamento de Dados por `orgId`**: **Todas** as consultas, modificações e exclusões de dados em **todos os services** da API são estritamente filtradas pelo `orgId` do usuário autenticado. Isso garante que uma organização não possa, sob nenhuma circunstância, acessar ou modificar dados de outra.
- **Auditoria**: Esta regra foi auditada e verificada em todos os endpoints relevantes, e correções foram aplicadas onde necessário (ex: `PeopleService`).
