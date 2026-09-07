---
status: current
owner: nexogestao
last_reviewed: 2026-09-07
---

# Configurações — diagnóstico da migração para o padrão-ouro

## Arquitetura anterior

A página combinava um formulário manual de empresa, uma tabela de membros e um
“centro de controle” derivado do resumo administrativo. Essa composição misturava
configuração editável, navegação para outras áreas e diagnósticos de completude;
também duplicava cards e campos que já possuem primitives canônicas.

## Fontes e contratos atuais

- `settings.get` encaminha `GET /organization-settings` e lê `id`, `name`,
  `slug`, `timezone` e `currency` da organização.
- `settings.update` usa o schema Zod do BFF (`name` e `timezone` opcionais;
  `currency` limitada a `BRL`, `USD` ou `EUR`) e encaminha
  `PATCH /organization-settings`.
- A API valida o mesmo payload com `UpdateOrganizationSettingsDto` e persiste os
  três campos editáveis no modelo de organização.
- `settings.administrativeSummary` e
  `GET /organization-settings/administrative-summary` continuam existentes,
  mas não são fonte de campos configuráveis. O resumo agrega informação de
  acesso, navegação, estados calculados e categorias não avaliadas; por isso não
  é consumido pela nova superfície de edição.

## Superfície entregue

Existe um único grupo real: **Organização**. Nome, fuso horário e moeda são
editáveis e enviados juntos pela única mutation oficial. O `slug` é exibido como
informação somente leitura. Estado do formulário, alterações não salvas e
feedback da mutation são apenas estado de interface, nunca fonte operacional.

Não há nos contratos desta página configuração persistida de capacidade,
agenda, atribuição, juros, multa, prazo, meios de pagamento, WhatsApp,
automações, templates, integrações, membros, permissões, thresholds de risco ou
políticas de governança. Esses itens não foram fabricados nem duplicados de
Pessoas, Financeiro, Billing, WhatsApp ou Governança.
