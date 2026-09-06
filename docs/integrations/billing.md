---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Fluxo de Billing com Stripe

Este documento detalha o fluxo de cobrança e gerenciamento de assinaturas no NexoGestão, utilizando o Stripe como gateway de pagamento.

## 1. Modelos de Dados

O sistema de billing é sustentado pelos seguintes modelos no `schema.prisma`:

- **`Plan`**: Representa os planos disponíveis (FREE, PRO, BUSINESS), com seus respectivos limites e preços.
- **`Subscription`**: Armazena o estado da assinatura de uma organização (`Organization`), incluindo o plano atual, status (e.g., `ACTIVE`, `CANCELED`), e IDs do Stripe (`stripeSubscriptionId`).
- **`BillingEvent`**: Log de eventos importantes recebidos do Stripe via webhooks, como `invoice.paid` e `customer.subscription.deleted`.

## 2. Fluxo de Nova Assinatura

1.  **Escolha do Plano**: O usuário, dentro de sua organização, seleciona um plano pago (PRO ou BUSINESS) na interface do `web` app.

2.  **Criação do Checkout Session**: O frontend faz uma requisição `POST /billing/create-checkout-session` para a `api`.
    - A API valida o plano solicitado.
    - Verifica se a organização já possui um `stripeCustomerId`. Se não, cria um novo cliente no Stripe.
    - Cria uma **Sessão de Checkout** no Stripe, associada ao cliente e ao `priceId` do plano escolhido.
    - Retorna a URL da sessão de checkout para o frontend.

3.  **Redirecionamento para o Stripe**: O frontend redireciona o usuário para a página de checkout do Stripe.

4.  **Pagamento**: O usuário insere os dados de pagamento no checkout seguro do Stripe e finaliza a compra.

5.  **Webhook do Stripe**: Após o pagamento bem-sucedido, o Stripe envia um evento (e.g., `checkout.session.completed`) para o endpoint de webhook da nossa API: `POST /billing/webhook`.

6.  **Ativação da Assinatura**: O `BillingService` na API recebe o webhook:
    - **Verifica a assinatura do webhook** para garantir que a requisição veio do Stripe.
    - Processa o evento:
      - Se for `checkout.session.completed`, extrai o `subscriptionId` e `customerId`.
      - Atualiza o modelo `Subscription` no banco de dados com o `stripeSubscriptionId` e define o `status` como `ACTIVE`.
      - Salva o evento no modelo `BillingEvent` para auditoria.
    - A organização agora tem acesso aos recursos do plano pago.

## 3. Gerenciamento da Assinatura

- **Visualizar Assinatura**: O endpoint `GET /billing/subscription` permite que o frontend exiba o status atual da assinatura, plano e próxima data de cobrança.

- **Cancelamento**: O usuário pode solicitar o cancelamento da assinatura.
  - O frontend chama `POST /billing/cancel`.
  - A API envia uma requisição para o Stripe para cancelar a assinatura ao final do período de faturamento atual (`cancel_at_period_end = true`).
  - O Stripe envia um webhook (`customer.subscription.updated` ou `customer.subscription.deleted`) que atualiza o status da `Subscription` no banco de dados para `CANCELED`.

## 4. Webhooks Importantes

O endpoint `POST /billing/webhook` está configurado para lidar com vários eventos do Stripe, incluindo:

| Evento                          | Descrição                                                          | Ação no Sistema                                                       |
| :------------------------------ | :----------------------------------------------------------------- | :-------------------------------------------------------------------- |
| `checkout.session.completed`    | Um usuário completou o checkout.                                   | Ativa a nova assinatura.                                              |
| `invoice.paid`                  | Uma fatura de renovação foi paga com sucesso.                      | Garante que a assinatura continue `ACTIVE`.                           |
| `invoice.payment_failed`        | Falha no pagamento de uma fatura.                                  | Atualiza o status da assinatura para `PAST_DUE` e notifica o usuário. |
| `customer.subscription.deleted` | A assinatura foi cancelada (imediatamente ou no final do período). | Atualiza o status para `CANCELED`.                                    |
| `customer.subscription.updated` | A assinatura foi alterada (upgrade/downgrade).                     | Atualiza o plano e o status da `Subscription`.                        |

## 5. Enforcement de Planos

O `QuotasService` e o `PlanGuard` trabalham juntos para garantir que os limites de cada plano sejam respeitados.

- Antes de executar operações críticas (criar cliente, criar ordem de serviço, etc.), a API verifica o plano ativo da organização consultando o modelo `Subscription`.
- Se o limite do plano for atingido, a operação é bloqueada com um erro `403 Forbidden`, instruindo o usuário a fazer um upgrade.
