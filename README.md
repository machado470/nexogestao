# NexoGestão (monorepo)

Monorepo com:
- **apps/api**: Backend em NestJS + Prisma (PostgreSQL), módulos: auth, usuários, clientes, produtos, faturas, pagamentos, pedidos, arquivos, notificações, saúde, métricas, auditoria, webhooks.
- **apps/web**: Frontend em React + Vite + TypeScript.

## Requisitos
- Node 20+ e pnpm
- Docker (para o banco Postgres)
- (Opcional) Make

## Primeiros passos
```bash
pnpm i
pnpm -r build

# Subir Postgres e API
docker compose -f apps/api/docker-compose.yml up -d
pnpm --filter @nexogestao/api prisma migrate dev
pnpm --filter @nexogestao/api prisma db seed
pnpm --filter @nexogestao/api dev

# Frontend
pnpm --filter @nexogestao/web dev
```

## Workspaces
- `pnpm -r` roda em todos os pacotes.
- `pnpm --filter @nexogestao/api ...` limita ao backend.
- `pnpm --filter @nexogestao/web ...` limita ao frontend.
