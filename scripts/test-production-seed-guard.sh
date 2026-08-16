#!/usr/bin/env bash
set -euo pipefail
entrypoint="apps/api/docker-entrypoint.sh"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed -n '1,/^APP_DIR=/p' "$entrypoint" | sed '/^APP_DIR=/d' > "$tmp"
cat >> "$tmp" <<'EOF'
pnpm() { printf 'pnpm:%s\n' "$*"; }
run_seed_if_enabled
EOF

assert_blocked() {
  local authorization="${1-}" output
  if output="$(NODE_ENV=production SEED_MODE=pilot ALLOW_PRODUCTION_SEED="$authorization" bash "$tmp" 2>&1)"; then
    printf 'seed de produção foi permitida indevidamente\n' >&2
    exit 1
  fi
  case "$output" in *"$authorization"*) [ -z "$authorization" ] || { printf 'autorização vazou no log\n' >&2; exit 1; };; esac
}

assert_blocked
assert_blocked incorreta
NODE_ENV=production SEED_MODE=pilot ALLOW_PRODUCTION_SEED=I_UNDERSTAND_DATA_MUTATION bash "$tmp" | grep -q 'pnpm:run prisma:seed'
NODE_ENV=development SEED_MODE=pilot bash "$tmp" | grep -q 'pnpm:run prisma:seed'
printf 'proteção comportamental de seed em duas camadas validada\n'
