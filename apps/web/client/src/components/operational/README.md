---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Componentes operacionais do Nexo

Use esta pasta para padrões visuais reutilizáveis de cockpit operacional.

- `OperationalPanel`: superfície principal de blocos executivos/operacionais, substitui painéis montados manualmente quando há título, narrativa, ação e conteúdo.
- `OperationalInnerCard`: card compacto interno para responsáveis, eventos, alertas e itens de lista; evita card dentro de card com Tailwind repetido.
- `OperationalFlow`: fluxo real entre etapas do Nexo, como Responsáveis → Agendamentos → O.S. → Cobranças → Timeline. Use apenas dados reais ou zeros honestos.
- `OperationalActionPanel`: “O que fazer agora”; deve suportar estado saudável compacto e estado crítico com impacto/segurança.

Regras:

1. Não use Tailwind solto para padrões repetidos de panel, inner-card, workload, timeline, prioridade ou fluxo quando estes componentes atenderem.
2. Mantenha tokens do Nexo (`--nexo-*`, `--surface-*`, `--text-*`, `--accent-*`) e compatibilidade light/dark.
3. Não copie catálogos externos ou templates visuais; estes componentes são vocabulário operacional próprio do Nexo.
4. Não invente métricas: componentes de fluxo, saúde e carga devem receber dados reais ou fallback explícito.
