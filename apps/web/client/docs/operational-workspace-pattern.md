---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Padrão de Workspace Operacional (Nexo)

Este padrão consolida o que já funciona em **Ordens de Serviço** e **Agendamentos**, sem criar framework paralelo.

## Partes compartilhadas (reutilizar)

- **Seleção ativa persistente** via `useOperationalMemoryState`, mantendo foco de linha entre filtros/volta de navegação.
- **Sinais operacionais** com estrutura comum (`OperationalSignal`) e tons consistentes (`critical`, `warning`, `info`, `healthy`).
- **Próxima ação** com esqueleto comum (título, razão, urgência, impacto, intenção, ações secundárias), com regra de negócio ainda por domínio.
- **Timeline compacta** via `buildCompactOperationalTimeline`:
  - ordenação por data (mais recente primeiro),
  - limite curto de itens,
  - fallback resiliente quando não há histórico real.
- **Ações inline seguras**: CTA dominante único por linha + dropdown sem repetir a intenção dominante.

## Partes que permanecem específicas

- Regras de decisão da próxima ação de cada domínio (O.S. x Agendamentos).
- Sinais específicos de negócio (ex.: cobrança pendente da O.S., conflito de slot em agendamento).
- Textos de contexto operacional e decisões de navegação por página.

## Como replicar em futuras páginas (ex.: Financeiro)

1. Modelar sinais no formato `OperationalSignal`.
2. Implementar decisão local usando o esqueleto de próxima ação compartilhado.
3. Montar timeline com `buildCompactOperationalTimeline` + fallback local.
4. Garantir CTA principal único, com ações auxiliares no dropdown sem duplicação.
5. Manter compatibilidade com modais legados (sem abrir modal automático no clique de linha).

## O que **não** fazer

- Não generalizar demais com engine abstrata.
- Não mover lógica específica de domínio para helper compartilhado.
- Não quebrar o comportamento operacional estabilizado da lista/workspace.
