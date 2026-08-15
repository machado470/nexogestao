#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NEXO_PORT_TO_TEST="${NEXO_TEST_PORT:-33080}"
OPTOUT_PORT_TO_TEST="${NEXO_TEST_OPTOUT_PORT:-33081}"
EXTERNAL_PORT_TO_TEST="${NEXO_TEST_EXTERNAL_PORT:-33082}"
LEGACY_PORT_TO_TEST="${NEXO_TEST_LEGACY_PORT:-33083}"
EXTERNAL_DIR="$(mktemp -d -t nexogestao-external-port.XXXX)"
PIDS=()
LOGS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  for log_file in "${LOGS[@]:-}"; do
    rm -f "$log_file"
  done
  rm -rf "$EXTERNAL_DIR"
}
trap cleanup EXIT

start_server() {
  local port="$1"
  local workdir="$2"
  local log_file
  log_file="$(mktemp -t nexogestao-dev-full-port-test.XXXX.log)"
  LOGS+=("$log_file")
  (
    cd "$workdir"
    PORT="$port" node -e "require('http').createServer((_req,res)=>res.end('port test')).listen(Number(process.env.PORT),'127.0.0.1')" >"$log_file" 2>&1 &
    echo "$!" > "$log_file.pid"
  )
  local pid
  pid="$(cat "$log_file.pid")"
  rm -f "$log_file.pid"
  PIDS+=("$pid")
  sleep 1
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    echo "[ERROR] processo node não iniciou na porta $port. Log: $(cat "$log_file")" >&2
    exit 1
  fi
  echo "$pid"
}

assert_dead() {
  local pid="$1"
  local port="$2"
  sleep 1
  if port_in_use "$port"; then
    echo "[ERROR] processo $pid ainda escuta na porta $port" >&2
    exit 1
  fi
}

assert_alive() {
  local pid="$1"
  local port="$2"
  sleep 1
  if ! kill -0 "$pid" >/dev/null 2>&1 || ! port_in_use "$port"; then
    echo "[ERROR] processo $pid na porta $port foi encerrado indevidamente" >&2
    exit 1
  fi
}

# shellcheck source=./dev-full.sh
source "$ROOT_DIR/scripts/dev-full.sh"

NEXO_PID="$(start_server "$NEXO_PORT_TO_TEST" "$ROOT_DIR")"
ALLOW_KILL=1
kill_nexo_pids_on_port_if_opt_in "$NEXO_PORT_TO_TEST"
assert_dead "$NEXO_PID" "$NEXO_PORT_TO_TEST"
echo "[OK] comportamento padrão encerra processo antigo do NexoGestão"

OPTOUT_PID="$(start_server "$OPTOUT_PORT_TO_TEST" "$ROOT_DIR")"
ALLOW_KILL=0
kill_nexo_pids_on_port_if_opt_in "$OPTOUT_PORT_TO_TEST"
assert_alive "$OPTOUT_PID" "$OPTOUT_PORT_TO_TEST"
echo "[OK] NEXO_DEV_KILL_PORTS=0 preserva processo do NexoGestão"

EXTERNAL_PID="$(start_server "$EXTERNAL_PORT_TO_TEST" "$EXTERNAL_DIR")"
ALLOW_KILL=1
kill_nexo_pids_on_port_if_opt_in "$EXTERNAL_PORT_TO_TEST"
assert_alive "$EXTERNAL_PID" "$EXTERNAL_PORT_TO_TEST"
echo "[OK] processo externo é preservado"

LEGACY_PID="$(start_server "$LEGACY_PORT_TO_TEST" "$ROOT_DIR")"
unset NEXO_DEV_KILL_PORTS
NEXO_KILL_STALE_DEV_PROCESSES=1
ALLOW_KILL="$(determine_allow_kill)"
kill_nexo_pids_on_port_if_opt_in "$LEGACY_PORT_TO_TEST"
assert_dead "$LEGACY_PID" "$LEGACY_PORT_TO_TEST"
echo "[OK] NEXO_KILL_STALE_DEV_PROCESSES=1 permanece compatível"

DIAGNOSTIC_LOG="$(mktemp -t nexogestao-dev-full-diagnostic-test.XXXX.log)"
LOGS+=("$DIAGNOSTIC_LOG")
printf '%s\n' 'primeira exceção real' 'stack trace de teste' > "$DIAGNOSTIC_LOG"
if diagnostic_output="$(fail_with_log "API não abriu porta 3000." "$DIAGNOSTIC_LOG" 2>&1)"; then
  echo "[ERROR] fail_with_log deveria encerrar com falha" >&2
  exit 1
fi
if [[ "$diagnostic_output" != *"primeira exceção real"* ]] || [[ "$diagnostic_output" != *"stack trace de teste"* ]]; then
  echo "[ERROR] fail_with_log não exibiu o conteúdo completo do log" >&2
  exit 1
fi
echo "[OK] falhas de bootstrap exibem o log completo"
