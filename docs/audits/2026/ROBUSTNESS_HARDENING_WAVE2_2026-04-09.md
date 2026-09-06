# NexoGestao — Hardening estrutural (Wave 2)

Data: 2026-04-09

## Base herdada da Wave 1

Já existia:
- Controle otimista com `expectedUpdatedAt` para appointments, service orders e charges.
- Códigos de conflito de concorrência explícitos para fluxo operacional/financeiro central.
- Endurecimento do vínculo `appointment -> service order`.

## Achados desta onda

1. Front/BFF ainda tinham gaps de propagação de `expectedUpdatedAt` em mutações críticas.
2. `customers.update` e `people.update` ainda permitiam sobrescrita silenciosa.
3. UX de conflito não estava homogênea: cada tela tratava erro de forma diferente.
4. Contrato de conflito no BFF não mapeava `409` de forma consistente para TRPC.

## Fechamentos da Wave 2

### 1) Padronização de expectedUpdatedAt ponta a ponta

- Front passou a enviar `expectedUpdatedAt` em:
  - `appointments.update` (AppointmentsPage e CalendarPage)
  - `serviceOrders.update` (EditServiceOrderModal e Onboarding)
  - `finance.charges.update` (EditChargeModal)
  - `customers.update` (EditCustomerModal)
  - `people.update` (EditPersonModal)
- BFF passou a aceitar/propagar o campo para:
  - `nexo-proxy` (customers/appointments/serviceOrders)
  - `finance.charges.update`
  - `people.update`

### 2) UX de conflito reutilizável no front

- Criado utilitário central `client/src/lib/concurrency.ts` para:
  - detectar conflito concorrente por código/shape HTTP
  - padronizar mensagem funcional para usuário
- Aplicado tratamento com ação de recarga de dados nas telas críticas de edição.

### 3) Shape de erro mais previsível no BFF

- `nexoClient` e `nexo-proxy` passaram a mapear `HTTP 409` para `TRPCError(CONFLICT)`.
- Código de erro de negócio é carregado na mensagem quando disponível (`[ERROR_CODE]`), facilitando mapeamento unificado no front.

### 4) Expansão pragmática da proteção otimista

- `customers.update` agora exige `expectedUpdatedAt` e aplica `updateMany` com `updatedAt` no `where`.
- `people.update` agora exige `expectedUpdatedAt` e aplica `updateMany` com `updatedAt` no `where`.
- Conflitos retornam códigos explícitos:
  - `CUSTOMER_CONCURRENT_MODIFICATION`
  - `PERSON_CONCURRENT_MODIFICATION`

### 5) Endurecimento de previsibilidade operacional

- Fluxos de edição críticos com conflito agora apresentam mensagem clara + opção de recarregar.
- Redução de erro silencioso em updates concorrentes de front/BFF/API.

## O que segue pendente para ondas futuras

1. Cobertura de concorrência para outros domínios administrativos mutáveis (onde houver risco real identificado por telemetria).
2. Padronização de payload de conflito com envelope canônico único (ex.: `details.currentSnapshot`) para re-sync avançado automático.
3. Expansão de testes de integração full stack para incluir BFF + UI e validação de UX.
4. Estratégia de timeout/retry por domínio com política declarativa central (sem duplicar tratamento por componente).

## Riscos remanescentes

- Algumas mutações não críticas seguem sem lock otimista por decisão de custo/benefício; devem ser revisitadas quando houver evidência operacional.
- Mensagens de conflito estão padronizadas, mas o refresh ainda é sem merge assistido de campo-a-campo.
- Não foi introduzida nova arquitetura de resiliência global nesta onda para evitar regressão e escopo excessivo.
