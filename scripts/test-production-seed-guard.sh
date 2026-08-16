#!/usr/bin/env sh
set -eu
entrypoint="apps/api/docker-entrypoint.sh"
awk '/run_seed_if_enabled\(\)/,/^}/' "$entrypoint" | grep -q 'is_prod'
awk '/run_seed_if_enabled\(\)/,/^}/' "$entrypoint" | grep -q 'ALLOW_PRODUCTION_SEED'
grep -q 'I_UNDERSTAND_DATA_MUTATION' prisma/seed.ts
printf 'proteção de seed em produção presente\n'
