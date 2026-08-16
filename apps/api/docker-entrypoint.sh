#!/usr/bin/env sh
set -e

log() {
  echo "[nexogestao] $*"
}

is_true() {
  [ "$1" = "1" ]
}

is_prod() {
  [ "${NODE_ENV:-}" = "production" ]
}

resolve_secure_default() {
  var_name="$1"
  current_value="${2:-}"

  if [ -n "$current_value" ]; then
    echo "$current_value"
    return
  fi

  if is_prod; then
    echo "1"
  else
    echo "0"
  fi
}

run_migrations() {
  if is_true "${AUTO_MIGRATE:-0}"; then
    log "AUTO_MIGRATE=1 -> running prisma:migrate:deploy"
    pnpm run prisma:migrate:deploy
  else
    log "AUTO_MIGRATE disabled"
  fi
}

run_database_smoke() {
  REQUIRE_DATABASE_SMOKE_EFFECTIVE="$(resolve_secure_default REQUIRE_DATABASE_SMOKE "${REQUIRE_DATABASE_SMOKE:-}")"
  export REQUIRE_DATABASE_SMOKE="$REQUIRE_DATABASE_SMOKE_EFFECTIVE"
  log "REQUIRE_DATABASE_SMOKE effective=${REQUIRE_DATABASE_SMOKE_EFFECTIVE} (NODE_ENV=${NODE_ENV:-unset})"
  pnpm --dir /app run db:smoke:operational-actions
}

run_prisma_generate() {
  log "running prisma generate"
  pnpm run prisma:generate
}

run_seed_if_enabled() {
  if [ "${SEED_MODE:-}" != "" ]; then
    if is_prod && [ "${ALLOW_PRODUCTION_SEED:-}" != "I_UNDERSTAND_DATA_MUTATION" ]; then
      log "FATAL: seed bloqueada em produção"
      exit 1
    fi
    log "seed enabled (SEED_MODE=$SEED_MODE) -> running prisma:seed"
    pnpm run prisma:seed
  else
    log "seed disabled"
  fi
}

APP_DIR="/app/apps/api"
DIST_MAIN="$APP_DIR/dist/main.js"

log "NODE_ENV=${NODE_ENV:-}"
log "DATABASE_URL=${DATABASE_URL:+<hidden>}"
log "app dir=$APP_DIR"

cd "$APP_DIR"

DB_WAIT_SECONDS="${DB_WAIT_SECONDS:-40}"
DB_URL="${DATABASE_URL:-}"
DB_HOST="$(echo "$DB_URL" | sed -n 's|.*@\(.*\):.*||p')"
DB_PORT="$(echo "$DB_URL" | sed -n 's|.*:\([0-9]\+\)/.*||p')"
DB_NAME="$(echo "$DB_URL" | sed -n 's|.*/\([^?]*\).*||p')"
DB_USER="$(echo "$DB_URL" | sed -n 's|.*//\([^:]*\):.*||p')"

log "db resolved host=${DB_HOST:-postgres} port=${DB_PORT:-5432} db=${DB_NAME:-nexogestao} user=${DB_USER:-postgres}"
log "waiting for postgres (timeout=${DB_WAIT_SECONDS}s)..."

i=0
while [ "$i" -lt "$DB_WAIT_SECONDS" ]; do
  if pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-nexogestao}" >/dev/null 2>&1; then
    log "postgres is ready"
    break
  fi
  i=$((i+1))
  sleep 1
done

run_migrations
run_database_smoke
run_prisma_generate
run_seed_if_enabled

if [ "$#" -gt 0 ]; then
  log "exec custom command: $*"
  exec "$@"
fi

if [ ! -f "$DIST_MAIN" ]; then
  log "dist missing: $DIST_MAIN"
  log "attempting build inside container..."
  pnpm run build
fi

if [ ! -f "$DIST_MAIN" ]; then
  log "FATAL: still missing $DIST_MAIN"
  find "$APP_DIR" -maxdepth 3 -type d -name dist -print -exec ls -la {} \; || true
  exit 1
fi

log "starting node: $DIST_MAIN"
exec node "$DIST_MAIN"
