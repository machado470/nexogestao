# Financeiro — Golden Standard (2026-09-07)

## Escopo e baseline

- Baseline real: merge `c7637bf7`, que contém a auditoria transversal local
  `5c4c597f` e a migração golden-standard de Auditoria `258d17c8`.
- Branch de trabalho: `codex/financeiro-golden-standard-2026-09-07`.
- Escopo exclusivo: `FinancesPage`, seus contratos financeiros e guardrails. Billing,
  WhatsApp, O.S., Pessoas, Cockpit e Onboarding não foram migrados nesta entrega.

## Diagnóstico anterior

A tela já havia removido o motor decisório do navegador e consumia três fontes
independentes. Entretanto, a carteira ainda era um mosaico de cards, os filtros não
usavam a barra canônica e o pagamento manual era um `AppInfoCard` com
posicionamento `fixed`, sem semântica, foco, ESC ou retorno de foco de modal. O
cancelamento dependia de `window.prompt`. Status desconhecidos também perdiam o
texto oficial, e a ausência de pagamentos podia ser apresentada como conclusão.

## Contratos confirmados

### Carteira factual

`finance.charges.list` encaminha para `GET /finance/charges`, com paginação e
filtros factuais. A API deriva o tenant de `@Org()`, consulta por `orgId` e retorna
cliente, O.S., pagamentos, `paidAmountCents`, `balanceCents`, `daysOverdue` e
`evaluatedAt`. A tela não refaz joins, saldo ou atraso.

### Indicadores oficiais

`finance.charges.stats` encaminha para `GET /finance/charges/stats`. Os grupos
`paid`, `pending` e `overdue`, seus valores e contagens são exibidos somente quando
retornados por essa fonte. A lista não é reduzida como fallback. `0` passa pelo
formatador de moeda e continua sendo `R$ 0,00`; `null`, `undefined`, loading e erro
têm apresentações diferentes.

### Fila operacional

`finance.operationalQueue` encaminha para `GET /finance/operational-queue`. A API
é a autoridade de `priority`, `priorityReason`, `riskLevel`, `daysOverdue`,
`recommendedAction`, `recommendedActionTarget`, `evaluatedAt` e da ordem dos
itens. A interface percorre o array recebido sem `sort`, score, threshold ou relógio
local. Navegação para comunicação só aparece quando o destino oficial é
`CUSTOMER`; a ação contextual de cobrança só aparece para destino `CHARGE`.

### Pagamentos e mutation manual

Cada cobrança traz pagamentos factuais (valor, `paidAt` e método). Ausência do
array ou contrato incompleto é descrita como não informada, e não como pagamento
faltante. `finance.charges.pay` encaminha para
`POST /finance/charges/:chargeId/pay`, com `amountCents`, método e chave de
idempotência. Não existe `orgId` no payload do browser: o BFF e a API usam o tenant
autenticado. A API valida autorização por papel, vínculo tenant/cobrança,
idempotência e valor dentro da transação.

## Composição final

- `AppPageShell` e `AppOperationalHeader` estabelecem contexto factual.
- `AppSectionBlock`, `AppInfoCard`, `AppAlert`, `AppLoadingState` e
  `AppEmptyState` preservam degradação parcial entre carteira, stats e fila.
- `AppFiltersBar`, `AppField`, `AppInput` e `AppSelect` implementam filtros de
  texto e status oficial, empilháveis em telas estreitas.
- `AppDataTable` apresenta fila e carteira com semântica de tabela e overflow
  horizontal controlado; não há mosaico de cobranças.
- `AppStatusBadge` mantém rótulo textual, inclusive para enums desconhecidos.
- `FormModal`, `AppForm`, `AppFieldGroup` e `AppFormActions` substituem o card
  fixo de pagamento e o prompt de cancelamento.

## Registro de pagamento e cancelamento

O modal canônico fornece backdrop e surfaces por tokens, body rolável, footer
estável, fechamento por ESC, foco inicial e retorno de foco pelo Radix Dialog. Em
mobile respeita o limite vertical do sistema. Os campos têm `id`, label,
`aria-invalid` e `aria-describedby`. Enquanto a mutation está pendente o modal não
fecha. O sucesso só é anunciado após `mutateAsync` e refresh; em erro, o modal e os
valores digitados permanecem intactos. Cancelamento agora é um formulário modal
auditável, com motivo real e controle de concorrência `expectedUpdatedAt`.

## Decisões locais e limites

Não foram encontrados nem adicionados `Date.now`, `differenceInDays`, ranking,
health, risk, priority ou recommendation calculados na página. `new Date` existe
somente dentro de `safeDate`, helper compartilhado usado para formatação factual;
nenhuma data decide estado. Busca e status são estado de UI. Tradução e tom visual
de enums conhecidos são transformações de apresentação; enum desconhecido é
mostrado literalmente, sem coerção para estado conhecido.

A fila permanece uma decisão produzida pelo backend atual; seus thresholds e sua
ordenação ainda pertencem ao serviço monolítico de Financeiro. Esta entrega não
altera esse motor. A carteira solicita até 500 itens e mantém filtragem local sobre
o recorte recebido; paginação progressiva é uma evolução futura. A página não
possui contrato de listagem global de pagamentos, apenas os pagamentos associados
a cada cobrança e busca por pagamento individual no BFF.

## Financeiro não é Billing

O guardrail de fonte rejeita imports/consumo de `billing.status`, `billing.plans`,
`billing.limits`, checkout e subscription status. Cobranças e pagamentos
operacionais continuam em `/finance`; assinaturas SaaS continuam no domínio
Billing. Nenhuma identidade ou organização arbitrária é lida de storage ou enviada
pelos formulários.

## Light/dark, responsividade e acessibilidade

O pseudo-overlay e surfaces hardcoded foram removidos. Tabelas, filtros, alerts e
modais usam primitives e tokens canônicos em light/dark. As grades de KPI fluem em
360, 768, 1280 e 1440 px; filtros empilham e tabelas mantêm overflow controlado.
Cabeçalhos usam `th scope="col"`; botões têm nomes; status não depende de cor; e
os formulários preservam labels, descrições de erro, foco e teclado.
