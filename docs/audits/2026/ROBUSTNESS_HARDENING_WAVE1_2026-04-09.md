# NexoGestao — Hardening estrutural (Wave 1)

Data: 2026-04-09

## 1) O que foi encontrado (auditoria rápida de fluxos críticos)

Fluxos já com boa base:
- Idempotência backend já implementada para `create charge`, `pay charge`, `create appointment`, `create service order` e `ensure charge for service order done`.
- Fila WhatsApp com deduplicação por `messageKey`, claim com `SKIP LOCKED`, retries e status operacional.
- Regras de transição centralizadas em `common/domain/state-transitions.ts`.

Pontos frágeis encontrados:
- **Concorrência/lost update** em mutações de `appointment.update`, `serviceOrder.update` (caso não-DONE) e `charge.update` sem guarda robusta de versão temporal.
- **Validação de encadeamento operacional** incompleta ao criar O.S. com `appointmentId` (não bloqueava agendamento cancelado/no-show nem customer mismatch).
- Contratos de update sem campo explícito para controle otimista (`expectedUpdatedAt`), dificultando tratamento previsível no front.

## 2) O que foi corrigido nesta onda

### Concurrency hardening (optimistic locking pragmático)
- Adicionado `expectedUpdatedAt` em DTOs de update:
  - `UpdateAppointmentDto`
  - `UpdateServiceOrderDto`
  - `UpdateChargeDto`
- Atualizações críticas migradas para `updateMany` com `where` incluindo `orgId + id + updatedAt`.
- Em conflito, agora ocorre erro explícito com código de negócio:
  - `APPOINTMENT_CONCURRENT_MODIFICATION`
  - `SERVICE_ORDER_CONCURRENT_MODIFICATION`
  - `CHARGE_CONCURRENT_MODIFICATION`
- Quando o front não enviar `expectedUpdatedAt`, o backend ainda protege contra corrida usando `updatedAt` lido no início da operação.

### Regras duras no encadeamento appointment -> service order
- Ao criar O.S. com `appointmentId`, passou a validar:
  - `appointment.customerId` deve ser o mesmo `customerId` da O.S.
  - status do agendamento não pode ser `CANCELED` ou `NO_SHOW`.

## 3) O que foi endurecido

- Comportamento sob concorrência em operações centrais de operação e financeiro.
- Contrato Front/BFF/API para updates com semântica de conflito explícita.
- Integridade do fluxo operacional ao impedir execução sobre agendamento inválido.

## 4) Pendências (próxima onda recomendada)

- Expor e padronizar `expectedUpdatedAt` em todos os formulários críticos do front (appointments, service orders, finance edit).
- Expandir idempotência formal para mutações de update cancelamento/conclusão sensíveis além dos casos já cobertos.
- Consolidar resposta de erro de conflito em shape único cross-módulo para UX de retry/reload.
- Adicionar testes automatizados de concorrência (simulação de update concorrente) para appointments/service orders/charges.

## 5) Riscos remanescentes

- Operações antigas do front (sem `expectedUpdatedAt`) continuam funcionais, mas a UX pode não aproveitar totalmente o erro de conflito orientado.
- Outros módulos fora do fluxo central (ex.: alguns domínios administrativos) ainda podem carecer de controle otimista equivalente.
- O hardening de falha parcial e modo degradado já existe em partes (finance/whatsapp), mas ainda pode ser expandido para integrações adicionais (Stripe/OAuth/webhooks) com contratos de fallback padronizados.
