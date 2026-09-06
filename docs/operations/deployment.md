---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
  - docs/DEPLOYMENT_GUIDE.md
---

# Deployment

Os artefatos executáveis atualmente versionados são `Dockerfile`, `infra/api.Dockerfile`, `docker-compose.staging.yml`, `docker-compose.prod.yml`, `railway.json` e os scripts em `dev/`. Eles prevalecem sobre instruções históricas.

## Gates mínimos antes de promover

```bash
pnpm ci:preflight
pnpm prisma:check
```

Migrations canônicas devem ser aplicadas com `pnpm prisma:migrate:deploy`; não editar migrations já promovidas. Backups e rollback devem ser planejados antes de qualquer alteração de dados.

## Estado da documentação

Este documento permanece em **review**: há mais de um alvo de implantação versionado (Compose e Railway), e a autoridade operacional de produção ainda precisa ser definida. Até essa decisão, valide variáveis contra os arquivos `.env.*.example` e o artefato do ambiente escolhido, sem inferir valores de documentos arquivados.
