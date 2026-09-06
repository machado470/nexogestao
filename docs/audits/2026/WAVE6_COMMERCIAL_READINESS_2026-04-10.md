# Wave 6 — Commercial Readiness (SaaS)

## Objetivo
Evoluir a base endurecida das Waves 1-5 para operação SaaS vendável com controle de plano, flags, enforcement comercial e visibilidade admin-first.

## Modelo canônico criado
- `Plan` com:
  - `name` (FREE/STARTER/PRO/BUSINESS)
  - `displayName` (Free/Basic/Pro/Enterprise)
  - `priceCents`
  - `limitsJson` (limites comerciais por recurso)
  - `featuresJson` (capabilities por plano)
- `Subscription` com:
  - vínculo `orgId` + `planId`
  - `status` (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED`)
  - período vigente (`currentPeriodStart`/`currentPeriodEnd`)
  - campos de readiness para gateway futuro (`billingProvider`, `billingCustomerRef`, `billingExternalRef`)
- `TenantFeatureOverride`:
  - override por tenant + feature (`orgId`, `featureKey`, `enabled`)

## Limites por plano aplicados
Medições comerciais avaliadas no backend:
- `automation_executions`
- `message_sends`
- `finance_critical_actions`
- `configurable_automations`

As decisões comerciais são separadas do throttling técnico:
- **comercial**: `policyType = commercial_block`, reasonCode como `plan_limit_reached`.
- **técnico/fairness**: continua via `TenantOperationsService.enforceLimit(...)`.

## Feature flags / capabilities
Resolução efetiva:
1. Base por plano (`featuresJson` + fallback canônico).
2. Override por tenant em `TenantFeatureOverride`.
3. Backend como fonte de verdade (`CommercialPolicyService`).

## Enforcement comercial central
`CommercialPolicyService` centraliza:
- validação de status da assinatura (`SUSPENDED`, `PAST_DUE`, `CANCELED`, trial expirado)
- autorização de features premium
- bloqueio por limite comercial

Integrações aplicadas em pontos críticos:
- runner de execução automática
- automações
- fila/envio WhatsApp
- ações financeiras críticas (criar/pagar cobrança)

## Visibilidade admin/comercial
Endpoints novos:
- `GET /commercial/context` (tenant atual)
- `GET /admin/commercial/tenants` (visão consolidada)
- `PATCH /admin/commercial/tenants/:orgId/features/:featureKey` (override)

A saída admin inclui:
- tenant
- plano/status
- limites e consumo básico
- flags efetivas
- near-limit e bloqueio comercial

## Billing interno da plataforma (base)
Separação mantida entre:
- financeiro operacional do tenant (charges/payments do produto)
- billing SaaS da plataforma (subscription/plan/provider refs)

Sem plugar gateway completo nesta wave, mas com readiness para Stripe/Mercado Pago/Pagar.me via campos e enum dedicados.

## Pendências para Wave 7
- integração plena com gateway recorrente (webhooks, dunning, ciclo fiscal)
- reset de consumo por período no storage persistente
- política de grace period e downgrade automático parametrizável
- superfícies UX dedicadas para gestão de capabilities enterprise
