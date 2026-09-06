---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Catálogo oficial da documentação

Este é o mapa autoritativo da documentação do NexoGestão. **Código executável, schema, migrations canônicas e testes são a evidência factual primária.** `source_of_truth` identifica a fonte documental oficial do assunto, nunca uma autorização para contradizer o código.

Status: `current` descreve a referência vigente; `review` explicita conteúdo útil ainda não totalmente consolidado; `archived` é memória não normativa. Auditorias registram um recorte temporal e não são especificação.

## Entrada e estado

| Documento                         | Finalidade                           | Status  | source_of_truth | Substitui / substituído por                                     | Última revisão |
| --------------------------------- | ------------------------------------ | ------- | --------------- | --------------------------------------------------------------- | -------------- |
| [README](../README.md)            | Entrada curta, requisitos e comandos | current | true            | substitui README mínimo anterior                                | 2026-09-06     |
| [PROJECT_STATE](PROJECT_STATE.md) | Estado, prioridades e próxima fase   | current | true            | substitui `STATUS.md` e `O_QUE_FALTA.md` (arquivados em audits) | 2026-09-06     |

## Arquitetura e contratos

| Documento                                                                         | Finalidade                           | Status  | source_of_truth | Substitui / substituído por                        | Última revisão |
| --------------------------------------------------------------------------------- | ------------------------------------ | ------- | --------------- | -------------------------------------------------- | -------------- |
| [Contexto do sistema](architecture/system-context.md)                             | Arquitetura macro e limites          | current | true            | `ARCHITECTURE_OVERVIEW.md`, `SAAS_ARCHITECTURE.md` | 2026-09-06     |
| [ADR 0001 — contratos e persistência](architecture/adr/0001-api-bff-contract-and-persistence-boundaries.md) | Autoridade API/BFF, envelopes e tenancy | current | true | — | 2026-09-06 |
| [ADR 0002 — fronteiras financeiras](architecture/adr/0002-finance-payments-billing-boundaries.md) | Autoridade de Finance, Payments, Billing e Stripe | current | true | — | 2026-09-06 |
| [Contrato de eventos operacionais](architecture/CONTRATO_EVENTOS_OPERACIONAIS.md) | Envelope e invariantes dos eventos   | current | true            | —                                                  | 2026-09-06     |
| [Taxonomia da Timeline](TIMELINE_EVENT_TAXONOMY.md)                               | Vocabulário canônico de eventos      | current | true            | —                                                  | 2026-09-06     |
| [Sinais do Risk Engine](RISK_ENGINE_OPERATIONAL_SIGNALS.md)                       | Sinais operacionais de risco         | current | true            | —                                                  | 2026-09-06     |
| [Automation Engine](automation-engine.md)                                         | Camada de automação implementada     | review  | true            | —                                                  | 2026-09-06     |
| [Queue System](queue-system.md)                                                   | Filas e modos degradados             | review  | true            | —                                                  | 2026-09-06     |
| [Webhook System](webhook-system.md)                                               | Recepção e processamento de webhooks | review  | true            | —                                                  | 2026-09-06     |

## Produto e operação do domínio

| Documento                                                                    | Finalidade                                  | Status  | source_of_truth | Substitui / substituído por | Última revisão |
| ---------------------------------------------------------------------------- | ------------------------------------------- | ------- | --------------- | --------------------------- | -------------- |
| [Regras de domínio](product/domain-rules.md)                                 | Regras transversais ainda sob reconfirmação | review  | true            | `DOMAIN_RULES.md`           | 2026-09-06     |
| [Agendamentos](AGENDAMENTOS_CONTROLE_OPERACIONAL.md)                         | Controle operacional de agendamentos        | current | true            | —                           | 2026-09-06     |
| [Ordens de serviço](SERVICE_ORDERS_OPERATIONAL_EXECUTION.md)                 | Execução operacional de O.S.                | current | true            | —                           | 2026-09-06     |
| [Pessoas vs. Configurações](PEOPLE_VS_SETTINGS.md)                           | Limites entre pessoas e settings            | current | true            | —                           | 2026-09-06     |
| [Operational Actions rollout](operational-actions-rollout.md)                | Rollout seguro e compatibilidade de banco   | current | true            | —                           | 2026-09-06     |
| [Financeiro operacional](operational-ui/financeiro-nexo-operating-system.md) | Direção operacional do financeiro           | review  | true            | —                           | 2026-09-06     |

## API e integrações

| Documento                            | Finalidade                           | Status | source_of_truth | Substitui / substituído por | Última revisão |
| ------------------------------------ | ------------------------------------ | ------ | --------------- | --------------------------- | -------------- |
| [REST](api/rest.md)                  | Referência legada da superfície REST | review | true            | `API_REFERENCE.md`          | 2026-09-06     |
| [Billing](integrations/billing.md)   | Fluxo Stripe/Billing                 | review | true            | `BILLING_FLOW.md`           | 2026-09-06     |
| [WhatsApp](integrations/whatsapp.md) | Configuração local da Z-API          | review | true            | `WHATSAPP_ZAPI_LOCAL.md`    | 2026-09-06     |

> Finance, Payments e Billing têm fronteiras normativas no ADR 0002. Guias de integração continuam em `review` por dependerem de configuração e validação do ambiente.

## Frontend

| Documento                                                                           | Finalidade                              | Status  | source_of_truth | Substitui / substituído por     | Última revisão |
| ----------------------------------------------------------------------------------- | --------------------------------------- | ------- | --------------- | ------------------------------- | -------------- |
| [Arquitetura frontend/BFF](frontend/architecture.md)                                | Limite entre client, BFF e API          | current | true            | `apps/web/FRONTEND_DELIVERY.md` | 2026-09-06     |
| [DEV_RULES](DEV_RULES.md)                                                           | Regras gerais de desenvolvimento        | current | true            | —                               | 2026-09-06     |
| [FRONT_RULES](FRONT_RULES.md)                                                       | Regras normativas do frontend           | current | true            | —                               | 2026-09-06     |
| [Arquitetura visual](VISUAL_ARCHITECTURE_RULES.md)                                  | Separação visual Public/Auth/App        | current | true            | —                               | 2026-09-06     |
| [Padrão-ouro interno](FRONTEND_INTERNO_PADRAO_OURO.md)                              | Contrato visual do app interno          | current | true            | —                               | 2026-09-06     |
| [Proteção de layout](LAYOUT_GLOBAL_PROTECTION.md)                                   | Restrições para alterações globais      | current | true            | —                               | 2026-09-06     |
| [Fundação visual](../apps/web/client/docs/internal-visual-foundation.md)            | Fundação visual co-localizada ao client | current | true            | —                               | 2026-09-06     |
| [Camada de comando](../apps/web/client/docs/operational-command-layer.md)           | Padrões operacionais transversais       | current | true            | —                               | 2026-09-06     |
| [Workspace operacional](../apps/web/client/docs/operational-workspace-pattern.md)   | Padrão de página operacional            | current | true            | —                               | 2026-09-06     |
| [Componentes operacionais](../apps/web/client/src/components/operational/README.md) | Uso dos componentes co-localizados      | current | true            | —                               | 2026-09-06     |

## Operações e testes

| Documento                                                   | Finalidade                         | Status  | source_of_truth | Substitui / substituído por               | Última revisão |
| ----------------------------------------------------------- | ---------------------------------- | ------- | --------------- | ----------------------------------------- | -------------- |
| [Desenvolvimento local](operations/local-development.md)    | Setup e operação local             | current | true            | README e instruções dispersas             | 2026-09-06     |
| [Deployment](operations/deployment.md)                      | Gates e alvos de implantação       | review  | true            | `DEPLOYMENT_GUIDE.md`                     | 2026-09-06     |
| [Runbook de staging](operations/staging-runbook.md)         | Deploy e diagnóstico de staging    | current | true            | `DEPLOY_STAGING.md`, `RUNBOOK_STAGING.md` | 2026-09-06     |
| [Configuração de piloto](operations/pilot-configuration.md) | Configuração operacional do piloto | current | true            | `docs/pilot/PILOT_CONFIGURATION_GUIDE.md` | 2026-09-06     |
| [Estratégia de testes](testing/strategy.md)                 | Suítes, escopo e confiabilidade    | current | true            | `TEST_SUITE_RELIABILITY.md`               | 2026-09-06     |
| [Integração real](testing/real-integration.md)              | Teste real de isolamento tenant    | current | true            | README antes co-localizado                | 2026-09-06     |
| [Validação manual](testing/manual-validation.md)            | Checklist sem mocks                | current | true            | `REAL_VALIDATION_CHECKLIST.md`            | 2026-09-06     |

## Registros não normativos

| Documento/coleção                                     | Finalidade                                                  | Status   | source_of_truth | Substitui / substituído por              | Última revisão |
| ----------------------------------------------------- | ----------------------------------------------------------- | -------- | --------------- | ---------------------------------------- | -------------- |
| [Auditorias de 2026](audits/2026/)                    | Relatórios temporais, waves e validações concluídas         | archived | false           | quando aplicável, pelos documentos acima | 2026-09-06     |
| [Archive](archive/)                                   | Planos, TODOs, snapshots, duplicatas e documentos superados | archived | false           | quando aplicável, pelos documentos acima | 2026-09-06     |
| [Template de PR](../.github/PULL_REQUEST_TEMPLATE.md) | Template operacional do GitHub                              | current  | false           | —                                        | 2026-09-06     |

Arquivos dentro de `audits/2026` e `archive` preservam seu conteúdo original para rastreabilidade. Eles não precisam de front matter retroativo e não devem ser citados como comportamento vigente.
