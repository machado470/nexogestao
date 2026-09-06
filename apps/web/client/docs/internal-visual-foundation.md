---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Fundação visual oficial — Front interno NexoGestão

Este guia define o padrão base reutilizável para páginas operacionais internas.

## Blocos oficiais

- `OperationalTopCard`: topo operacional da página (contexto, direção, ação principal).
- `AppKpiRow` + `AppMetricCard`/`AppKpiCard`: linha de indicadores executivos/KPIs.
- `AppSectionBlock`: container oficial para blocos de lista, tabela, resumo e alertas.
- `AppListBlock`: listas operacionais curtas com CTA por item.
- `AppDataTable`: tabelas operacionais com linguagem visual única.
- `AppStatusBadge` + `AppPriorityBadge`: estados e prioridade com semântica padronizada.

## Quando usar cada bloco

### `AppKpiRow` / `AppMetricCard`

Use para métricas principais da página (4, 2 ou 1 coluna), com:

- título curto,
- valor principal,
- delta/contexto subordinado,
- CTA opcional sem quebrar altura do card.

### `AppSectionBlock`

Use como container padrão de área operacional:

- listas,
- tabelas,
- gráficos,
- painéis de alerta,
- resumos executivos.

Sempre manter header do bloco (título/subtítulo/CTA) e ritmo de espaçamento padronizado.

### `AppListBlock`

Use para filas e listas de execução rápida:

- gargalos,
- top O.S.,
- agenda do dia,
- próximas ações,
- alertas operacionais.

### `AppDataTable`

Use para tabelas principais por domínio. Evite tabela “solta” sem container padrão.

### `AppStatusBadge` / `AppPriorityBadge`

Use para:

- status de execução,
- risco,
- confirmação,
- pendência,
- urgência/prioridade.

Evite badges locais ad-hoc por página.

## Regras visuais obrigatórias

- Sem hardcode escuro (`bg-black`, `bg-zinc-900`, `bg-slate-900`) em componentes internos.
- Sem glow exagerado.
- Sem borda gritante fora da linguagem de tokens.
- Sem altura aleatória entre cards equivalentes.
- Sem inventar card novo por página quando já existir bloco base.
- Priorizar composição com a base consolidada (`OperationalTopCard`, `AppKpiRow`, `AppSectionBlock`, `AppListBlock`, `AppDataTable`, badges).

## Ordem de construção recomendada nas páginas

1. Topo operacional (`OperationalTopCard`)
2. KPIs (`AppKpiRow`)
3. Bloco principal de decisão/execução (`AppSectionBlock`)
4. Blocos auxiliares (`AppSectionBlock` + `AppListBlock`)
5. Tabela operacional (`AppDataTable`)

Esse fluxo mantém consistência entre Dashboard, Clientes, Agendamentos, O.S. e WhatsApp e prepara a expansão para Financeiro, Timeline, Governança, Configurações e Perfil.
