# NexoGestao — Hardening estrutural (Wave 3)

Data: 2026-04-09

## Escopo executado nesta onda

Foco em robustez operacional real sem refazer o hardening de concorrência otimista das Waves 1 e 2:
- idempotência e deduplicação em criação/pagamento/WhatsApp,
- contrato de status operacional mais explícito para ações críticas,
- resiliência de integração com timeout e fallback,
- UX mais clara para resposta duplicada/pendente.

## Achados principais

1. Back-end já tinha base de idempotência (`IdempotencyRecord` + `IdempotencyService`), mas o contrato de retorno ainda era pouco explícito para o front em casos de replay/duplicidade.
2. Fluxos críticos (charge/payment/whatsapp) tinham proteção parcial, porém faltava padronização de status operacional canônico no payload.
3. Integração WhatsApp real (Z-API) não aplicava timeout explícito de rede.
4. Front já bloqueava duplo submit em pontos relevantes, mas não distinguia bem execução real vs replay idempotente vs fallback pendente.

## Fechamentos da Wave 3

### 1) Contrato operacional explícito em ações críticas

Foi adicionado envelope `operation` nos retornos críticos com status canônico:
- `executed`
- `queued`
- `duplicate`
- (`retry_scheduled` em side-effect degradado)

Aplicado em:
- `finance.createCharge`
- `finance.payCharge`
- `whatsapp.sendMessage`

### 2) Idempotência com replay seguro e sem ambiguidade

- Replays via `IdempotencyService` agora retornam `operation.status = duplicate`.
- Duplicação por constraint (`P2002`) em cobrança e mensagem também retorna status explícito de duplicidade.
- Resultado reaproveitado preserva chave idempotente para rastreabilidade.

### 3) Falha parcial com fallback previsível

- Em createCharge/payCharge, quando o side-effect de WhatsApp falha, a operação principal segue concluída e registra:
  - `degraded.fallback = message_queued`
  - `degraded.status = retry_scheduled`
- Evita falso sucesso silencioso: retorno informa explicitamente o estado degradado.

### 4) Timeout explícito para provider externo

- Provider Z-API agora usa timeout de 12s por chamada (`AbortSignal.timeout`).
- Timeout retorna erro semântico (`TIMEOUT`) para acionar política segura de retry/fila.

### 5) UX do front alinhada com estado assíncrono

- Tela de criação de cobrança mostra feedback distinto para `duplicate` e para fallback pendente (`retry_scheduled`).
- Registro de pagamento mostra feedback distinto para replay idempotente e para confirmação WhatsApp pendente.
- Página WhatsApp mostra claramente quando a ação ficou `queued` ou `duplicate`.

## Cobertura de testes adicionada

- `FinanceService`:
  - replay idempotente em createCharge => `operation.duplicate`
  - replay idempotente em payCharge => `operation.duplicate`
  - fallback degradado em createCharge => `retry_scheduled`
- `ZApiWhatsAppProvider`:
  - timeout de provider => erro `TIMEOUT`

## Pendências reais para Wave 4

1. Expandir contrato `operation.status` para mais ações automáticas de execução/governança (followup, notify-finance, etc.) com enums compartilhados entre API/BFF/front.
2. Padronizar telemetria e métricas por status (`executed`, `duplicate`, `queued`, `failed`) em dashboards operacionais.
3. Introduzir política declarativa central de retry/backoff por integração (Stripe, webhooks externos, etc.) com limites por ação.
4. Adicionar testes de integração e2e cobrindo API+BFF+front para estados `queued/duplicate/retry_scheduled` ponta a ponta.

## Riscos remanescentes

- Contrato operacional ainda não está universal em 100% dos domínios.
- Parte da deduplicação ainda depende de chaves determinísticas por fluxo específico; ampliar para novos fluxos exigirá catálogo único de execution keys.
- A estratégia de timeout foi aplicada primeiro em WhatsApp provider; outras integrações externas ainda precisam convergir para o mesmo padrão.
