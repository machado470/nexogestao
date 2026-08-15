#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-${PORT:-3010}}"
NEXO_API_URL="${NEXO_API_URL:-http://localhost:${API_PORT}}"
determine_allow_kill() {
  # Por padrão, o fluxo local limpa apenas processos antigos do próprio repositório
  # nas portas da API/WEB. NEXO_DEV_KILL_PORTS=0 desabilita explicitamente;
  # NEXO_KILL_STALE_DEV_PROCESSES permanece como alias legado.
  if [ "${NEXO_DEV_KILL_PORTS+x}" = "x" ]; then
    echo "$NEXO_DEV_KILL_PORTS"
  elif [ "${NEXO_KILL_STALE_DEV_PROCESSES+x}" = "x" ]; then
    echo "$NEXO_KILL_STALE_DEV_PROCESSES"
  else
    echo "1"
  fi
}

ALLOW_KILL="$(determine_allow_kill)"
RESET_MODE="${NEXO_DEV_RESET:-0}"
NEXO_DEV_SEED_SET_IN_SHELL="${NEXO_DEV_SEED+x}"

API_LOG_FILE="$(mktemp -t nexogestao-api.XXXX.log)"
WEB_LOG_FILE="$(mktemp -t nexogestao-web.XXXX.log)"
API_PID=""
WEB_PID=""

log() { echo "$1"; }
fail() { echo "[ERROR] $1"; exit 1; }

fail_with_log() {
  local message="$1"
  local log_file="$2"

  echo "[ERROR] $message"
  echo "[ERROR] Conteúdo completo de $log_file:"
  if [ -f "$log_file" ]; then
    cat "$log_file"
  else
    echo "[ERROR] Arquivo de log não encontrado."
  fi
  exit 1
}

kill_hint() {
  local port="$1"
  echo "Diagnóstico: pnpm dev:ports"
  echo "Inspeção manual: lsof -nP -iTCP:${port} -sTCP:LISTEN"
  echo "Se for outro aplicativo, libere a porta manualmente ou ajuste API_PORT/WEB_PORT no .env."
  echo "Para desabilitar a limpeza segura de processos antigos do NexoGestão: NEXO_DEV_KILL_PORTS=0 pnpm dev:full"
}

ensure_env_file() {
  if [ -f .env ]; then
    return 0
  fi

  if [ ! -f .env.example ]; then
    fail ".env ausente e .env.example não encontrado para bootstrap automático."
  fi

  cp .env.example .env
  log "[BOOT] .env ausente; criado automaticamente a partir de .env.example"
}

load_env_file_preserving_shell() {
  # Carrega .env sem sobrescrever variáveis passadas na linha de comando.
  # Ex.: NEXO_DEV_SEED=1 pnpm dev:full deve vencer NEXO_DEV_SEED=0 do .env.
  local line key
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#${line%%[![:space:]]*}}"
    line="${line%${line##*[![:space:]]}}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == export[[:space:]]* ]] && line="${line#export }"
    key="${line%%=*}"
    key="${key%${key##*[![:space:]]}}"
    if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [ -z "${!key+x}" ]; then
      eval "export $line"
    fi
  done < .env
}

seed_mode() {
  echo "${SEED_MODE:-pilot}" | tr '[:upper:]' '[:lower:]'
}


ensure_not_production_seed() {
  local node_env="${NODE_ENV:-}"
  if [ "${node_env,,}" = "production" ]; then
    fail "Seed automático/forçado bloqueado: NODE_ENV=production. O dev:full só pode seedar banco local/desenvolvimento."
  fi
}

database_user_count() {
  DATABASE_URL="$DATABASE_URL" pnpm exec tsx -e '
    async function main() {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        const count = await prisma.user.count();
        console.log(count);
      } finally {
        await prisma.$disconnect();
      }
    }

    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  ' | tail -n 1 | tr -d "[:space:]"
}

run_prisma_seed() {
  ensure_not_production_seed
  local mode
  mode="$(seed_mode)"
  SEED_MODE="$mode" pnpm --filter @nexogestao/api prisma db seed
  print_seed_credentials
}
print_seed_credentials() {
  local mode
  mode="$(seed_mode)"
  if [ "$mode" = "basic" ]; then
    log "[BOOT] credencial seed basic: admin@nexogestao.local / 123456"
    return 0
  fi

  log "[BOOT] credenciais seed pilot:"
  log "[BOOT] - Admin: ${PILOT_ADMIN_EMAIL:-admin.piloto@nexogestao.local} / ${PILOT_ADMIN_PASSWORD:-Admin123!}"
  log "[BOOT] - Operação: ${PILOT_OPERATOR_EMAIL:-operador.piloto@nexogestao.local} / ${PILOT_OPERATOR_PASSWORD:-Piloto@Operador123}"
  log "[BOOT] - Financeiro: ${PILOT_FINANCE_EMAIL:-financeiro.piloto@nexogestao.local} / ${PILOT_FINANCE_PASSWORD:-Piloto@Finance123}"
}

validate_required_env() {
  local required=(DATABASE_URL REDIS_URL API_PORT WEB_PORT NEXO_API_URL)
  local missing=()

  for key in "${required[@]}"; do
    local value="${!key:-}"
    if [ -z "${value// }" ]; then
      missing+=("$key")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    fail "Variáveis obrigatórias ausentes no ambiente/.env: ${missing[*]}"
  fi
}

cleanup() {
  local code="$?"
  if [ -n "$API_PID" ] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
  exit "$code"
}
port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v p=":$port" 'NR>1 && $4 ~ p {found=1} END {exit found?0:1}'
    return $?
  fi

  if command -v node >/dev/null 2>&1; then
    node -e "const net=require('net');const s=net.createServer();s.once('error',()=>process.exit(0));s.once('listening',()=>s.close(()=>process.exit(1)));s.listen($port,'127.0.0.1');" >/dev/null 2>&1
    return $?
  fi

  return 1
}

port_owner() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    local lsof_out
    lsof_out="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -n 1 || true)"
    if [ -n "$lsof_out" ]; then
      echo "$lsof_out"
      return 0
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    local ss_out
    ss_out="$(ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {print; exit}' || true)"
    if [ -n "$ss_out" ]; then
      echo "$ss_out"
      return 0
    fi
  fi

  if docker info >/dev/null 2>&1; then
    local d_out
    d_out="$(docker ps --format '{{.Names}}\t{{.Ports}}' | awk -v p=":""$port" '$0 ~ p {print; exit}' || true)"
    if [ -n "$d_out" ]; then
      echo "docker $d_out"
      return 0
    fi
  fi

  return 1
}

container_on_port() {
  local port="$1"
  local cid
  while IFS=$'\t' read -r cid _; do
    [ -n "$cid" ] || continue
    if docker port "$cid" 2>/dev/null | grep -Eq "(^|:)${port}(\\s|$)"; then
      docker inspect --format '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##'
      return 0
    fi
  done < <(docker ps --format '{{.ID}}\t{{.Names}}')
  return 1
}

path_is_inside_root() {
  local path="$1"
  [ "$path" = "$ROOT_DIR" ] || [[ "$path" == "$ROOT_DIR/"* ]]
}

cmd_contains_root_path() {
  local cmd="$1"
  [[ "$cmd" == *"$ROOT_DIR"* ]] || return 1
  [[ "$cmd" == *"$ROOT_DIR/"* || "$cmd" == *"$ROOT_DIR "* || "$cmd" == *"$ROOT_DIR" ]]
}

is_nexo_pid() {
  local pid="$1"
  local cmd
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  local cwd=""
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"

  if [ -n "$cwd" ] && path_is_inside_root "$cwd"; then
    return 0
  fi

  # Exige caminho absoluto do repositório no comando. Strings genéricas como
  # apps/api ou apps/web não são suficientes para validar pertencimento.
  if [ -n "$cmd" ] && cmd_contains_root_path "$cmd"; then
    return 0
  fi

  return 1
}

port_pids() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
    return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null \
      | awk -v p=":$port" '$4 ~ p {print}' \
      | sed -nE 's/.*pid=([0-9]+).*/\1/p' \
      | sort -u
    return 0
  fi

  if command -v python3 >/dev/null 2>&1 && [ -r /proc/net/tcp ]; then
    python3 - "$port" <<'PY'
import os
import sys

port = int(sys.argv[1])
inodes = set()

for table in ("/proc/net/tcp", "/proc/net/tcp6"):
    try:
        lines = open(table, encoding="utf-8").read().splitlines()[1:]
    except OSError:
        continue
    for line in lines:
        parts = line.split()
        if len(parts) < 10 or parts[3] != "0A":
            continue
        local_address = parts[1]
        try:
            local_port = int(local_address.rsplit(":", 1)[1], 16)
        except (IndexError, ValueError):
            continue
        if local_port == port:
            inodes.add(parts[9])

pids = set()
for name in os.listdir("/proc"):
    if not name.isdigit():
        continue
    fd_dir = f"/proc/{name}/fd"
    try:
        fds = os.listdir(fd_dir)
    except OSError:
        continue
    for fd in fds:
        try:
            target = os.readlink(f"{fd_dir}/{fd}")
        except OSError:
            continue
        if target.startswith("socket:[") and target[8:-1] in inodes:
            pids.add(int(name))
            break

for pid in sorted(pids):
    print(pid)
PY
    return 0
  fi

  return 1
}

describe_pid() {
  local pid="$1"
  local cmd
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [ -n "$cmd" ]; then
    echo "PID $pid ($cmd)"
  else
    echo "PID $pid"
  fi
}

stop_pid_gracefully() {
  local pid="$1"
  kill "$pid" >/dev/null 2>&1 || true
  sleep 1
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
}

kill_nexo_pids_on_port_if_opt_in() {
  local port="$1"
  [ "$ALLOW_KILL" = "1" ] || return 0

  local killed_any=0
  while read -r pid; do
    [ -n "$pid" ] || continue
    if is_nexo_pid "$pid"; then
      log "[BOOT] porta $port ocupada por processo antigo do NexoGestão; encerrando para reiniciar o ambiente local."
      log "[BOOT] processo encerrado: $(describe_pid "$pid")"
      stop_pid_gracefully "$pid"
      killed_any=1
    else
      log "[BOOT] porta $port ocupada por processo não identificado como NexoGestão: $(describe_pid "$pid")"
      log "[BOOT] Por segurança, este processo não será encerrado automaticamente."
    fi
  done < <(port_pids "$port" || true)

  if [ "$killed_any" = "1" ]; then
    log "[BOOT] limpeza aplicada na porta $port"
  fi
}

assert_port_available() {
  local port="$1"
  local label="$2"

  if ! port_in_use "$port"; then
    return 0
  fi

  local owner=""
  owner="$(port_owner "$port" || true)"

  if docker info >/dev/null 2>&1; then
    local cname
    cname="$(container_on_port "$port" || true)"
    if [ -n "$cname" ] && [[ "$cname" != nexogestao_* ]] && [[ "$cname" != nexogestao-* ]]; then
      fail "$label: porta $port ocupada por container externo ($cname). ${owner:+Processo: $owner}"
    fi

    if [ "$label" = "Postgres" ] || [ "$label" = "Redis" ]; then
      if [ -n "$cname" ] && ([[ "$cname" == nexogestao_* ]] || [[ "$cname" == nexogestao-* ]]); then
        log "[BOOT] $label já está publicado na porta $port via container $cname; seguindo bootstrap."
        return 0
      fi
    fi
  fi

  if [ "$label" = "API" ] || [ "$label" = "WEB" ]; then
    kill_nexo_pids_on_port_if_opt_in "$port"
    if ! port_in_use "$port"; then
      return 0
    fi
  fi

  fail "$label: porta $port ocupada. ${owner:+Processo: $owner}. Não encerrei automaticamente porque o processo não foi validado com segurança como pertencente a $ROOT_DIR ou porque NEXO_DEV_KILL_PORTS=0 desabilitou a limpeza. $(kill_hint "$port")"
}

wait_tcp() {
  local host="$1"
  local port="$2"
  local tries="${3:-60}"
  local i=0
  while [ "$i" -lt "$tries" ]; do
    if node -e "const net=require('net');const s=net.createConnection({host:'$host',port:$port});s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),700);" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

wait_http() {
  local url="$1"
  local tries="${2:-90}"
  local i=0
  while [ "$i" -lt "$tries" ]; do
    if curl -sS -o /dev/null --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

main() {
  trap cleanup EXIT

  # 1) checar portas
  ensure_env_file
  load_env_file_preserving_shell
  validate_required_env

  assert_port_available 5432 "Postgres"
  assert_port_available 6379 "Redis"
  assert_port_available "$API_PORT" "API"
  assert_port_available "$WEB_PORT" "WEB"

  # 2) (opcional) limpar processos do próprio Nexo
  if [ "$ALLOW_KILL" = "1" ]; then
    kill_nexo_pids_on_port_if_opt_in "$API_PORT"
    kill_nexo_pids_on_port_if_opt_in "$WEB_PORT"
  fi

  # 3) subir containers
  if ! docker info >/dev/null 2>&1; then
    fail "Docker indisponível no ambiente atual. No WSL, abra o Docker Desktop e habilite a integração da distro em Settings > Resources > WSL Integration; depois valide com 'docker --version' e 'docker info'."
  fi

  if [ "$RESET_MODE" = "1" ]; then
    log "[BOOT] reset de infraestrutura (postgres/redis)..."
    docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi

  log "[BOOT] subindo infraestrutura (postgres/redis) via docker-compose.yml..."
  docker compose -f docker-compose.yml up -d postgres redis >/dev/null

  # 4) validar infra
  wait_tcp 127.0.0.1 5432 60 || fail "Banco PostgreSQL não disponível na porta 5432. Verifique: pnpm dev:logs"
  wait_tcp 127.0.0.1 6379 60 || fail "Redis não disponível na porta 6379. Verifique: pnpm dev:logs"
  echo "[BOOT] aguardando postgres aceitar conexões..."
  until docker exec nexogestao_postgres pg_isready -U postgres >/dev/null 2>&1; do
    sleep 2
  done
  echo "[BOOT] postgres pronto"

  # 5) sincronizar Prisma (migrations -> generate -> seed opcional)
  log "[BOOT] aplicando migrations Prisma..."
  pnpm --filter @nexogestao/api prisma migrate deploy

  log "[BOOT] gerando Prisma Client real..."
  pnpm --filter @nexogestao/api prisma generate

  user_count="$(database_user_count)"
  if ! [[ "$user_count" =~ ^[0-9]+$ ]]; then
    fail "Não foi possível verificar usuários no banco local usando DATABASE_URL. Valor retornado: ${user_count:-vazio}"
  fi

  if [ "${NEXO_DEV_SEED:-}" = "1" ]; then
    log "[BOOT] NEXO_DEV_SEED=1 -> rodando seed Prisma forçado (SEED_MODE=$(seed_mode))..."
    run_prisma_seed
  elif [ "${NEXO_DEV_SEED_SET_IN_SHELL:-}" = "x" ] && [ "${NEXO_DEV_SEED:-}" = "0" ]; then
    if [ "$user_count" = "0" ]; then
      log "[BOOT] banco vazio e seed desabilitado; login não estará disponível."
      log "[BOOT] Para criar usuários piloto de desenvolvimento, rode: NEXO_DEV_SEED=1 pnpm dev:full"
    else
      log "[BOOT] banco já possui ${user_count} usuário(s); seed automático desabilitado por NEXO_DEV_SEED=0."
      log "[BOOT] use as credenciais já existentes ou rode NEXO_DEV_SEED=1 pnpm dev:full para reaplicar o seed idempotente."
      print_seed_credentials
    fi
  elif [ "$user_count" = "0" ]; then
    log "[BOOT] banco sem usuários; rodando seed piloto automaticamente para ambiente local."
    SEED_MODE="${SEED_MODE:-pilot}" run_prisma_seed
  else
    log "[BOOT] banco já possui ${user_count} usuário(s); seed automático não será executado para preservar dados locais."
    log "[BOOT] use as credenciais já existentes ou consulte docs/DEV_RULES.md; para reaplicar seed idempotente: NEXO_DEV_SEED=1 pnpm dev:full"
    print_seed_credentials
  fi

  # 6) subir API
  log "[BOOT] iniciando API..."
  API_PORT="$API_PORT" PORT="$API_PORT" pnpm --filter ./apps/api run dev > "$API_LOG_FILE" 2>&1 &
  API_PID=$!

  # 7) esperar processo vivo + porta + /health
  kill -0 "$API_PID" >/dev/null 2>&1 || fail_with_log "API falhou no boot." "$API_LOG_FILE"
  wait_tcp 127.0.0.1 "$API_PORT" 120 || fail_with_log "API não abriu porta $API_PORT." "$API_LOG_FILE"
  log "[READY] API porta OK"
  wait_http "http://127.0.0.1:${API_PORT}/v1/health" 120 || fail_with_log "API falhou no /v1/health." "$API_LOG_FILE"
  log "[READY] API /v1/health OK"

  # 8) subir WEB
  log "[BOOT] iniciando WEB..."
  WEB_PORT="$WEB_PORT" PORT="$WEB_PORT" NEXO_API_URL="$NEXO_API_URL" pnpm --filter ./apps/web run dev > "$WEB_LOG_FILE" 2>&1 &
  WEB_PID=$!

  # 9) validar root web
  kill -0 "$WEB_PID" >/dev/null 2>&1 || fail_with_log "WEB falhou no boot." "$WEB_LOG_FILE"
  wait_http "http://127.0.0.1:${WEB_PORT}/" 120 || fail_with_log "WEB não respondeu /." "$WEB_LOG_FILE"
  log "[READY] WEB OK"

  # Optional integrations (non-blocking)
  [ -n "${STRIPE_SECRET_KEY:-}" ] || log "[OPTIONAL] Stripe não configurado"
  [ -n "${GOOGLE_CLIENT_ID:-}" ] || log "[OPTIONAL] Google OAuth não configurado"
  [ -n "${WHATSAPP_PROVIDER:-}${ZAPI_INSTANCE_ID:-}" ] || log "[OPTIONAL] WhatsApp não configurado"
  [ -n "${SENTRY_DSN:-}" ] || log "[OPTIONAL] Sentry não configurado"

  # 10) status geral
  log ""
  if ! { [ "${NEXO_DEV_SEED_SET_IN_SHELL:-}" = "x" ] && [ "${NEXO_DEV_SEED:-}" = "0" ]; }; then
    log "[BOOT] credenciais de desenvolvimento documentadas em docs/DEV_RULES.md"
  fi

  log "[SUCCESS] ambiente pronto:"
  log "- API: http://localhost:${API_PORT}"
  log "- WEB: http://localhost:${WEB_PORT}"
  log ""
  log "[BOOT] logs: API=${API_LOG_FILE} WEB=${WEB_LOG_FILE}"

  set +e
  while true; do
    wait -n "$API_PID" "$WEB_PID"
    status=$?
    if ! kill -0 "$API_PID" >/dev/null 2>&1; then
      fail "API encerrou (status=$status). Logs: $API_LOG_FILE"
    fi
    if ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
      fail "WEB encerrou (status=$status). Logs: $WEB_LOG_FILE"
    fi
  done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
