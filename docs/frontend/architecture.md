---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Frontend delivery boundary (BFF x client)

## Portas em desenvolvimento

- `localhost:3010` (`pnpm --filter web dev:bff`): BFF Express + middleware do Vite (`apps/web/server/_core/index.ts` + `apps/web/server/_core/vite.ts`).
- `localhost:5173` (`pnpm --filter web dev:client`): client Vite puro (sem BFF).

## Como a UI é entregue

1. O `vite.config.ts` define `root` em `apps/web/client` e usa `apps/web/client/index.html` como shell.
2. O BFF, em `NODE_ENV=development`, lê `apps/web/client/index.html`, valida `#root` + `<script type="module">`, passa no `vite.transformIndexHtml` e responde no `3010`.
3. Em produção, o build do Vite vai para `apps/web/dist/public` e o Express serve estático com fallback SPA.

## Diagnóstico rápido

- **Falha em 5173 e 3010**: problema de client bootstrap/entrypoint (`index.html`, `src/main.tsx`, providers/App).
- **Funciona em 5173 e falha em 3010**: problema de entrega BFF (shell, middleware, fallback, assets).
- **`/?bootProbe=1`**: render mínimo para provar execução do JS e mount em `#root` sem depender do App real.

## Validação mínima sugerida

1. `pnpm --filter web dev:client` e abrir `http://localhost:5173/?bootProbe=1`.
2. `pnpm --filter web dev:bff` e abrir `http://localhost:3010/?bootProbe=1`.
3. Abrir `/` nas duas portas e confirmar que o App real monta.
