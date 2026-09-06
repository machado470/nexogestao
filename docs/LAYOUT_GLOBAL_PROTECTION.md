---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Proteção de Layout Global — NexoGestão

## Objetivo

Evitar regressões de glitch visual causadas por efeitos de composição aplicados no nível raiz do app.

## Regras obrigatórias

Nos wrappers globais (`AppLayout`, `MainLayout`, `.app-root`, `.nexo-app-shell`, `.nexo-app-content`) **não aplicar**:

- `transform`
- `filter`
- `backdrop-filter`
- `overflow: hidden` global

## Onde efeitos visuais são permitidos

Efeitos visuais continuam permitidos em **componentes isolados**, por exemplo:

- modais (`DialogContent`, `nexo-modal-content`)
- overlays locais
- cartões, painéis e blocos específicos
- componentes de gráfico e visualização

## Diretriz prática

1. Se o efeito for estético/local, aplicar no componente isolado.
2. Se o efeito impactar viewport inteira, revisar antes e evitar wrappers raiz.
3. Não bloquear design evolution: encapsular efeito em componentes dedicados, nunca no root.

## Observabilidade em desenvolvimento

Em ambiente de desenvolvimento, o app emite `console.warn` quando detecta propriedades proibidas em wrappers raiz ou overflow global no `body`.
