---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
  - STATUS.md
  - O_QUE_FALTA.md
---

# Estado atual do projeto

## Consolidado

- Arquitetura macro: React/Vite → BFF tRPC → API NestJS → Prisma/PostgreSQL, com Redis para capacidades assíncronas.
- Catálogo documental, separação entre documentação normativa, documentos em revisão, auditorias temporais e arquivo histórico.
- Regras operacionais vigentes de agendamentos, ordens de serviço, pessoas/configurações, timeline, eventos e padrões do frontend permanecem explicitamente catalogadas.
- O BFF foi decomposto em routers canônicos por domínio; `nexo.*` permanece apenas como composição compatível das mesmas implementações, e o transporte BFF → API usa uma fundação compartilhada.

## Parcial

- Finance, Payments e Billing possuem fronteiras consolidadas no ADR 0002; integrações de WhatsApp, Stripe, filas, webhooks e automação ainda dependem de ambiente e/ou mantêm pontos operacionais em revisão.
- Cobertura de testes é relevante, porém a matriz de contratos BFF↔API e de isolamento multi-tenant não cobre explicitamente toda a superfície crítica.
- Deployment possui artefatos para mais de um alvo; a autoridade única de produção ainda não está definida.

## Precisa de reestruturação

- Migração dos normalizadores locais restantes fora dos domínios decompostos para a fundação única de envelopes do BFF.
- Runbook autoritativo de produção e estratégia canônica de backup/restauração.

## Prioridades atuais

- **P0:** nenhum defeito determinístico aberto foi comprovado pela auditoria da Fase 1. Permanece o risco potencial de indisponibilidade no bootstrap autenticado quando a validação upstream de sessão falha.
- **P1:** completar OpenAPI para futura geração de contratos; migrar callers de `nexo.*` para routers canônicos com telemetria antes de remover aliases; cobrir rotas administrativas ainda ausentes da matriz multi-tenant; observabilidade dos fallbacks de WhatsApp, Queue e Billing; definição operacional de produção.

## Próxima fase

Prosseguir com a próxima etapa de consolidação sem reabrir as fronteiras financeiras nem remover aliases sem evidência de uso. A autoridade API/BFF está no ADR 0001, Finance/Payments/Billing no ADR 0002 e a composição de routers no ADR 0003.
