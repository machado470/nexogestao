# NexoGestão

O NexoGestão é uma plataforma SaaS multi-tenant para a operação de empresas de serviços. O produto integra clientes, pessoas, agendamentos, ordens de serviço, financeiro, timeline, risco, governança e canais como WhatsApp.

## Arquitetura

Este monorepo PNPM/Turbo contém uma API NestJS (`apps/api`), um BFF tRPC e uma aplicação React/Vite (`apps/web`), tipos compartilhados (`packages/common`) e persistência PostgreSQL via Prisma (`prisma`). Redis apoia filas e processamento assíncrono. Consulte a [visão canônica do sistema](docs/architecture/system-context.md).

## Requisitos

- Node.js 20 ou superior
- PNPM 10.30.3 (versão fixada em `package.json`)
- Docker com Docker Compose, para PostgreSQL e Redis locais

## Quickstart local

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Para recriar o ambiente local, use `pnpm dev:reset`. Diagnóstico e saúde estão disponíveis por `pnpm dev:doctor` e `pnpm dev:health`.

## Comandos essenciais

```bash
pnpm dev              # ambiente completo
pnpm build            # build dos workspaces
pnpm lint             # lint dos workspaces
pnpm prisma:check     # valida o Prisma Client
pnpm dev:infra        # somente PostgreSQL e Redis
```

## Testes

```bash
pnpm test
pnpm ci:preflight
pnpm test:tenant:isolation  # requer infraestrutura real local
```

O catálogo de fontes oficiais, documentos em revisão e registros históricos está em **[docs/index.md](docs/index.md)**.
