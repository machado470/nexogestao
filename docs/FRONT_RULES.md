---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# FRONT RULES — NexoGestão

> **Se o usuário vê, ele precisa conseguir agir.**

## Regras obrigatórias

- Todo elemento exibido para o usuário precisa ter contexto operacional e ação clara.
- Toda ação precisa ter feedback visual (loading, sucesso ou erro).
- Nenhum elemento de tela deve ser puramente decorativo em áreas operacionais.
- Nenhum botão pode ser “morto” (sem efeito observável).

## Padrões oficiais

- Cards operacionais usam `AppActionCard` + `AppTrendIndicator` + `AppCardCTA`.
- Ações de linha em tabelas usam `AppRowActions`.
- Empty states usam `AppEmptyState`.
- Loading states usam `AppLoadingState`.
- Execução de ações assíncronas usa `useRunAction`.

## Guardrails visuais

Classes proibidas em elementos operacionais:

- `shadow-*`
- `ring-*`
- `backdrop-*`
- `blur-*`

Validação de regressão é aplicada no script `pnpm --filter ./apps/web lint`.
