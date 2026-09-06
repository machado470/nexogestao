# Wave 5 — SaaS Robustness Hardening (Multi-tenant + Fairness + Cost)

## Objetivo desta wave

Endurecer o backend para operação SaaS multi-tenant real com foco em:

- isolamento por `orgId` em fluxos críticos;
- fairness e limites por tenant;
- visibilidade de custo/abuso por tenant;
- base controlada para automação canônica (`trigger -> condition -> action`);
- sem quebrar contratos já estabilizados nas Waves 1-4.

---

## Riscos encontrados e tratados

### 1) Mensageria WhatsApp vulnerável a `entityId` inválido/cross-tenant

**Risco:** era possível enfileirar mensagem com `entityId` que não pertencia ao tenant autenticado (ou com `customerId` inconsistente), criando risco de vazamento indireto e spam cruzado.

**Endurecimento aplicado:**

- validação explícita de ownership por `orgId` e vínculo com `customerId` antes de persistir mensagem;
- bloqueio explícito quando `customerId` não pertence ao tenant;
- validação para `SERVICE_ORDER`, `APPOINTMENT` e `CHARGE`.

---

### 2) Ausência de fairness por tenant em execução automática

**Risco:** tenant barulhento poderia consumir runner em rajada e aumentar custo/latência global.

**Endurecimento aplicado:**

- limite por tenant no `ExecutionRunner` (`execution:auto-actions`) com janela;
- status operacional preservado como `throttled` + reason explícita;
- evento crítico registrado para observabilidade operacional.

---

### 3) Ausência de fairness para operações financeiras repetitivas

**Risco:** explosão de criação/pagamento de cobrança por tenant (acidental ou abuso).

**Endurecimento aplicado:**

- limite por tenant para criação de cobrança;
- limite por tenant para pagamento de cobrança;
- bloqueio com motivo explícito e evento crítico.

---

### 4) Automação sem proteção de volume/condição mínima

**Risco:** regras ativas disparando em loop ou sem filtro canônico de condição.

**Endurecimento aplicado:**

- avaliação mínima de `conditionSet` (`eq`, `neq`, `in`, `gte`, `lte`);
- throttle por tenant em execução de trigger de automação;
- contabilização de execuções/bloqueios/throttling para custo operacional.

---

## Limites por tenant implementados na Wave 5

- `whatsapp:queue`: 120/min por org.
- `execution:auto-actions`: 180/min por org.
- `finance:create-charge`: 40/min por org.
- `finance:pay-charge`: 30/min por org.
- `automation:execute-trigger`: 100/min por org.

> Todos com razão explícita de bloqueio para retorno operacional previsível.

---

## Métricas/custos por tenant agora visíveis

Nova visão por tenant disponível via `GET /health` em `tenantOperations`:

- contadores por org para eventos operacionais (automação, WhatsApp, finanças, throttling etc.);
- lista de eventos críticos recentes por org;
- recorte de tenants “barulhentos” (`noisyTenants`) para troubleshooting rápido.

---

## Base canônica de automação nesta wave

Mantida e endurecida a estrutura:

- `trigger` (origem do evento);
- `conditionSet` (filtro determinístico mínimo);
- `actionSet` (ações enfileiradas).

Restrições aplicadas:

- automação continua passando por limites e observabilidade;
- não contorna execution contract nem políticas operacionais existentes.

---

## Pendências reais para Wave 6

1. Persistir métricas operacionais por tenant em storage durável (além do snapshot em memória).
2. Expor dashboard admin dedicado para comparação temporal por tenant.
3. Expandir engine de condições (AND/OR com grupos e operadores de data).
4. Regras de limite configuráveis por plano/tenant em config central.
5. Testes de integração end-to-end cobrindo workflow completo multi-tenant com filas reais.

