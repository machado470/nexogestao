---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
  - DEPLOY_STAGING.md
  - RUNBOOK_STAGING.md
---

# Runbook de staging

O ambiente de staging é descrito por `docker-compose.staging.yml`, `.env.staging.example` e `dev/deploy-staging.sh`. Esses artefatos executáveis prevalecem sobre este resumo.

## Deploy e verificação

```bash
cp .env.staging.example .env.staging
./dev/deploy-staging.sh
./dev/smoke.sh
```

Preencha os segredos fora do Git antes do deploy. Não reutilize credenciais de desenvolvimento ou produção.

## Operação cotidiana

```bash
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs -f
docker compose -f docker-compose.staging.yml restart api
docker compose -f docker-compose.staging.yml stop
```

## Banco e migrations

```bash
docker compose -f docker-compose.staging.yml exec api pnpm prisma:migrate:deploy
```

Prisma Migrate não oferece rollback automático para `migrate deploy`. Em incidente, interrompa a promoção, preserve evidências e adote uma migration corretiva ou restauração validada de backup. Nunca altere uma migration canônica já aplicada.
