#!/usr/bin/env bash
set -euo pipefail

compose_project="nexogestao_outbox_test"
database="nexogestao_outbox_test"
port="${OUTBOX_TEST_POSTGRES_PORT:-55432}"
url="postgresql://postgres:postgres@127.0.0.1:${port}/${database}?schema=public"

cleanup() { docker compose -p "$compose_project" -f docker-compose.outbox-test.yml down -v; }
trap cleanup EXIT
docker compose -p "$compose_project" -f docker-compose.outbox-test.yml up -d --wait
DATABASE_URL="$url" pnpm prisma:migrate:deploy
DATABASE_URL="$url" pnpm prisma:generate
DATABASE_URL="$url" RUN_REAL_OUTBOX_INTEGRATION=true pnpm --filter ./apps/api test -- test/integration/outbox-postgres.integration.spec.ts
