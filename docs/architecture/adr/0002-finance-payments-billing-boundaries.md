---
status: accepted
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# ADR 0002 — fronteiras de Finance, Payments e Billing

## Contexto e problema

A API NestJS possui três superfícies com nomes próximos, mas dois contextos financeiros distintos. `Finance` mantém o contas a receber operacional dos clientes do tenant. `Payments` expõe o adaptador Stripe para quitar essas cobranças e rotas legadas que delegam ao Finance. `Billing` mantém o relacionamento comercial do tenant com o NexoGestão. A semelhança entre “checkout”, “payment” e “invoice” tornava possível acoplar acidentalmente os dois contextos.

A auditoria cobriu controllers, services, DTOs e acesso Prisma dos módulos Finance, Payments, Billing, Invoices, Expenses, Launches, Plans e Subscriptions; consumidores em Service Orders, automação, execução, filas, BFF e frontend; e os testes associados. O schema não foi alterado.

## Decisão

Há duas fronteiras estritamente separadas:

1. **financeiro operacional do tenant**: `Finance` é a autoridade de `Charge`, lifecycle, carteira, KPIs e fila. A mutação atômica que registra `Payment` e quita `Charge` permanece, incrementalmente, na facade `FinanceService`; `Payments` é o adaptador de confirmação externa para esse mesmo fluxo e nunca persiste uma segunda interpretação;
2. **billing SaaS do NexoGestão**: `Billing` é a autoridade de checkout de assinatura, interpretação de webhooks Stripe de assinatura, lifecycle, entitlement/quota e visão comercial. `Plan` e `Subscription` existem apenas nesse contexto.

A autoridade de pagamento permanece temporariamente em `FinanceService.payCharge`, em vez de mover código transacional nesta fase: ali `Charge`, `Payment`, Timeline e Outbox são gravados na mesma transação e a concorrência é vencida por `updateMany` condicional. Separar essa unidade agora aumentaria o risco sem alterar comportamento. `PaymentsService` valida o checkout operacional e converte confirmação Stripe em uma chamada à autoridade canônica. Sua criação duplicada e não consumida de Charge foi removida.

`invoice.paid` no `BillingService` é uma **fatura Stripe da assinatura SaaS** e somente atualiza `Subscription`/`BillingEvent`. O modelo interno `Invoice` é um documento comercial/visual do tenant: não recebe pagamento diretamente e não é uma Stripe Invoice.

## Matriz de autoridade (antes → depois)

| Conceito | Módulo antes | Autoridade depois | Consumidores | Duplicação / risco encontrado | Ação |
| --- | --- | --- | --- | --- | --- |
| Charge | Finance; wrappers em Payments; integração O.S. | Finance | API Finance, Payments, O.S., automação, filas, BFF/web | entrada `PaymentsService.createCharge` não consumida | remover entrada duplicada; preservar facade |
| Payment | Finance; confirmação em Payments | Finance (`payCharge`), até extração segura | Finance API, Payments Stripe, relatórios | nomes sugeriam duas autoridades | explicitar que Payments somente adapta confirmação externa |
| Payment confirmation | Finance + Payments | Finance para persistência; Payments para tradução do provedor | webhook operacional | callback poderia parecer escrita independente | continuar delegando atomicamente |
| Manual payment | Finance; rota legada Payments | Finance | BFF Finance e compatibilidade Payments | duas rotas, uma operação | manter rota compatível, sem segunda persistência |
| Invoice interno | Invoices | Invoices | API/BFF de invoices | confusão nominal com Stripe Invoice | documentar como documento, não recebível |
| Expense | Expenses | Expenses | API/BFF e resultado mensal | lê Payment/Charge para projeção, não os muta | manter read model composto |
| Launch | Launches | Launches | API/BFF | ledger manual independente, não equivale a Payment/Expense | manter; não sincronizar automaticamente |
| Plan | Plans + Billing | Billing como autoridade comercial; Plans mantém catálogo persistido/bootstrap | Billing, quotas, pricing | catálogo persistido e definição canônica coexistem | manter bootstrap; alterações comerciais passam por Billing/política |
| Subscription | Subscriptions + Billing | Billing | auth/commercial policy, quotas, BFF | service legado também permite lifecycle local | manter compatibilidade; migrar consumidores ao Billing |
| Stripe Customer | Billing | Billing | checkout/lifecycle SaaS | nenhum acesso em Finance | manter isolado |
| Stripe Subscription | Billing | Billing | webhooks e cancelamento SaaS | nenhum acesso em Finance | manter isolado |
| Checkout Session SaaS | Billing | Billing | BFF Billing | nome colide com checkout operacional | distinguir por rota/contexto |
| Checkout operacional | Payments | Payments (adaptador), Finance (estado) | cliente pagador/Stripe | Stripe também usado pelo Billing | manter metadata Charge somente neste adaptador |
| Billing Event | Billing | Billing | lifecycle SaaS | nenhum equivalente operacional | manter idempotência por `providerEventId` |
| Operational finance queue | Finance | Finance | BFF/frontend, ações operacionais | nenhuma regra comprovada no BFF | manter cálculo na API |
| Financial KPIs/carteira | Finance; Expenses compõe resultado mensal | Finance para recebíveis; Expenses para resultado com despesas | dashboards/BFF | leituras compostas, não mutações duplicadas | preservar contratos oficiais |

## Regras de dependência

- Billing não importa Finance ou Payments e não lê/escreve `Charge`/`Payment`.
- Payments não lê/escreve `Plan`, `Subscription` ou `BillingEvent`.
- Eventos Stripe de assinatura nunca alteram cobrança operacional.
- Confirmação Stripe de cobrança operacional deve chamar a mesma operação idempotente de pagamento; não atualiza `Charge.status` isoladamente.
- Controllers obtêm `orgId` de `@Org()`; DTO/body não é autoridade tenant. Webhooks são a exceção de transporte: usam assinatura Stripe válida e metadata correlacionada, seguida de consulta tenant-scoped.
- BFF valida e adapta envelopes; atraso, saldo, risco, prioridade, estado, plano e entitlement são respostas da API.
- `Payment` + transição de `Charge` + `PAYMENT_RECEIVED` + Outbox permanecem uma unidade transacional. `CHARGE_CREATED` e seu Outbox também permanecem transacionais.

## Consequências

A separação SaaS versus operação passa a ser testada estruturalmente. Nenhum comportamento financeiro, preço, plano, schema ou rota pública foi alterado. A remoção do método público não consumido em `PaymentsService` elimina uma segunda entrada de criação sem remover compatibilidade HTTP.

O nome `Payments` ainda representa integração de pagamento operacional, enquanto a autoridade transacional continua na facade Finance. Isso é uma dívida explícita, não uma segunda regra.

## Estratégia incremental

1. manter `FinanceService` como facade estável;
2. migrar a rota legada `payments/charges/:id/pay` para aceitar o contrato canônico de idempotência antes de qualquer remoção;
3. extrair a unidade completa de registro para um serviço de Payments somente quando for possível preservar transação, idempotência, concorrência, Timeline e Outbox sem ciclo Finance → Payments → Finance;
4. migrar consumidores do `SubscriptionsService` legado para Billing e então restringir suas mutações;
5. somente depois considerar decompor leituras/KPIs e fila do `FinanceService`.

## Itens não resolvidos e riscos

- A rota legada manual de Payments não recebe chave de idempotência nem preserva o método informado; removê-la ou mudar seu contrato seria incompatível nesta fase.
- O webhook operacional reconhece `charge.succeeded` e `checkout.session.completed`, mas a deduplicação depende do estado/idempotência do fluxo Finance; uma chave explícita por Stripe event exige migração cuidadosa.
- `Payment.externalRef` não possui unicidade no schema; nenhuma migration é permitida nesta fase.
- `SubscriptionsService` ainda duplica operações locais de lifecycle do Billing para consumidores legados.
- `FinanceService` permanece grande. A extração deve seguir unidades transacionais reais, não divisão cosmética.
- Leituras de Expenses agregam Charge/Payment para resultado mensal; isso é composição de read model, não transferência de autoridade.
