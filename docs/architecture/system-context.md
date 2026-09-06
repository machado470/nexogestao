---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
  - docs/ARCHITECTURE_OVERVIEW.md
  - docs/SAAS_ARCHITECTURE.md
---

# Contexto e arquitetura do sistema

## Escopo

O NexoGestão é um SaaS multi-tenant para empresas de serviços. A plataforma reúne relacionamento com clientes, agenda, execução de ordens de serviço, pessoas, financeiro e sinais operacionais em uma experiência web.

## Contêineres lógicos

```text
Navegador
   │ tRPC/HTTP
   ▼
Web + BFF (`apps/web`: React/Vite + servidor tRPC)
   │ REST, com credenciais e contexto da sessão
   ▼
API (`apps/api`: NestJS)
   ├── Prisma ──► PostgreSQL
   ├── filas ───► Redis
   └── integrações externas (configuradas por ambiente)
```

- A API NestJS concentra regras de negócio, autorização e persistência.
- O BFF adapta contratos da API para a interface; não é uma segunda fonte normativa de regras de domínio.
- O frontend fica em `apps/web/client` e consome os routers em `apps/web/server`.
- `packages/common` contém código compartilhado entre workspaces.
- `prisma/schema.prisma` e as migrations canônicas definem a estrutura persistida.

## Módulos em produção

A composição em `apps/api/src/app.module.ts` e os módulos sob `apps/api/src` são a evidência factual da superfície atual. Ela inclui auth, customers, appointments, service-orders, people, finance, billing, payments, timeline, risk, governance, notifications, operational-actions, queue, outbox, WhatsApp, webhooks e email, entre outros.

## Limites e decisões ainda abertas

- Finance, Payments e Billing existem como módulos distintos, mas suas fronteiras arquiteturais continuam em **review**; este documento não presume uma consolidação futura.
- Contratos de resposta entre API e BFF ainda têm envelopes heterogêneos em alguns fluxos.
- A abrangência do isolamento multi-tenant deve continuar sendo comprovada por testes de integração; a existência de `orgId` não é, isoladamente, prova de cobertura completa.

## Fontes factuais

Em divergências, prevalecem o código executável, `prisma/schema.prisma`, as migrations canônicas e os testes. O [catálogo documental](../index.md) define qual documento é normativo para cada assunto.
