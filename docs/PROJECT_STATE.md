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

## Parcial

- Integrações de WhatsApp, billing, filas, webhooks e automação possuem implementação e documentação, mas dependem de ambiente e/ou mantêm pontos em revisão.
- Cobertura de testes é relevante, porém a matriz de contratos BFF↔API e de isolamento multi-tenant não cobre explicitamente toda a superfície crítica.
- Deployment possui artefatos para mais de um alvo; a autoridade única de produção ainda não está definida.

## Precisa de reestruturação

- Fronteiras entre Finance, Payments e Billing.
- Padronização dos envelopes e erros entre API e BFF.
- Runbook autoritativo de produção e estratégia canônica de backup/restauração.

## Prioridades atuais

- **P0:** nenhum defeito determinístico aberto foi comprovado pela auditoria da Fase 1. Permanece o risco potencial de indisponibilidade no bootstrap autenticado quando a validação upstream de sessão falha.
- **P1:** contract tests para sessão/perfil/configurações/pessoas; matriz multi-tenant; observabilidade dos fallbacks de WhatsApp, Queue e Billing; definição operacional de produção.

## Próxima fase

Executar a Fase 2B como validação técnica dos contratos críticos e das fronteiras Finance/Payments/Billing, sem usar documentos históricos como especificação. As decisões arquiteturais resultantes devem ser registradas em ADRs.
