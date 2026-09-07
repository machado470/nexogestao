# Billing — auditoria e migração para o padrão-ouro (2026-09-07)

## Baseline e escopo

- O hash informado `4188b5b1` não existe neste clone. A baseline equivalente é
  `58f50ad6 feat(web): migrate profile to golden standard`, já integrada pelo
  merge `22c4d83a`. Os arquivos de Perfil desse commit estavam presentes e a
  árvore de trabalho estava limpa antes da criação da branch de Billing.
- O escopo alterado é exclusivamente a página interna de Billing, seu teste de
  contrato e este diagnóstico. Pricing, Financeiro, Perfil, Pessoas,
  Configurações e primitives compartilhadas não foram alterados.

## Arquitetura anterior e separação de domínios

A página anterior misturava dados reais com reconstruções locais: convertia
status desconhecido em `ACTIVE`, inferia governança e risco de acesso, calculava
dias até uma suposta tentativa, criava método de pagamento, faturas e histórico
a partir de campos que o endpoint de status não fornece, e oferecia ações sem
destino oficial (`visualizar`, `baixar` e `reenviar`). Essas informações foram
classificadas como **G (inventadas/reconstruídas localmente)** e removidas.

Billing permanece sendo a relação **organização → NexoGestão**. Nenhuma
`Charge`, `Payment`, receita, inadimplência ou consulta do Financeiro operacional
é usada. Pricing continua sendo a vitrine pública; Billing agora começa pela
assinatura autenticada e apresenta apenas uma seleção compacta do catálogo para
a ação real de checkout.

## Contratos reais encontrados

| Classe | Fonte | Contrato autoritativo |
| --- | --- | --- |
| A | `trpc.billing.status` → `GET /billing/status` | `status`, `plan`, `isActive`, `currentPeriodEnd`; ausência retorna `NO_SUBSCRIPTION` |
| A/F | `trpc.billing.plans` → `GET /billing/plans` | catálogo persistido de `Plan`: nome, display name, preço em centavos, quotas, limites comerciais e features |
| A | `trpc.billing.limits` → `GET /billing/limits` | plano, trial e consumo/limite calculados no backend por organização |
| D | `trpc.billing.checkout` → `POST /billing/create-checkout-session` | plano `STARTER`, `PRO` ou `BUSINESS`; backend resolve `orgId`, `priceId` e retorna URL/sessão do provider |
| D | `trpc.billing.cancel` → `POST /billing/cancel` | cancelamento imediato; backend resolve a organização autenticada e cancela no provider quando Stripe |
| B | frontend | tradução literal de enums, formatação BRL/data e labels de quota |
| C | frontend | plano selecionado, confirmação e estados de carregamento/erro |

O DTO REST usa `CreateCheckoutSessionDto`; o BFF valida o input com Zod. Ambos
aceitam somente o nome canônico de plano pago e URLs opcionais de retorno. Os
controllers obtêm `orgId` de `req.user.orgId`; checkout e cancelamento exigem
usuário ativo com papel `ADMIN`. O provider implementado é Stripe, com modo
simulado explicitamente limitado a ambientes não produtivos.

## Estado real e lacunas intencionais

Os estados persistidos são `ACTIVE`, `TRIALING`, `CANCELED`, `PAST_DUE` e
`SUSPENDED`; o endpoint adiciona `NO_SUBSCRIPTION`. Estado desconhecido permanece
indisponível e nunca vira ativo. O preço mostrado é identificado como preço do
catálogo vigente, pois o contrato da assinatura não fornece preço contratado nem
periodicidade. `currentPeriodEnd` é apresentado literalmente como fim do período,
sem prometer renovação ou próxima cobrança.

Não existem no contrato consumido pela página: invoices/documentos e URLs,
método de pagamento mascarado, portal de assinatura, reativação, cancelamento ao
fim do período ou valor/data da próxima cobrança. Embora `BillingEvent` exista no
banco para processamento interno de webhooks, nenhum endpoint de Billing o
expõe; portanto histórico e faturas não foram fabricados. Também não foram
implementados trial calculado no cliente, grace period, score, risco, enforcement
ou estimativas comerciais.

## Composição e comportamento

- `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, `AppStatusBadge`,
  `AppAlert`, estados canônicos e `ConfirmModal` substituem hero, KPIs, painéis,
  alertas e modalizações paralelas.
- Assinatura, catálogo e quotas degradam separadamente. Falha do catálogo não
  apaga o status válido; erro de status não vira plano gratuito; erro de quotas
  não produz consumo calculado no navegador.
- Cards usam grids fluidos e conteúdo quebrável; ações permanecem nomeadas,
  focáveis e empilham em viewports estreitas. Status sempre inclui texto.
- O frontend não envia `orgId`, `subscriptionId`, customer ID ou price ID. A URL
  externa usada é exclusivamente a retornada pelo backend.
