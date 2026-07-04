#!/usr/bin/env bash
# Atajo de desarrollo de GaesSoft POS.
#   ./scripts/dev.sh up        Levanta API + 4 apps (detached con setsid, sobreviven)
#   ./scripts/dev.sh down      Baja todos los servicios
#   ./scripts/dev.sh status    Muestra qué puertos responden
#   ./scripts/dev.sh logs <svc> Muestra el log (api|superadmin|admin|pos|tienda)
#   ./scripts/dev.sh token:super            Token de sesión del superadmin (resuelve 2FA)
#   ./scripts/dev.sh token:tenant <slug> <email> <pass>   Token de un usuario del negocio
#   ./scripts/dev.sh setpass <slug> <email> <newpass>     Fija una contraseña de prueba
#   ./scripts/dev.sh code      Código TOTP actual del superadmin
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; [ -f .env ] && . ./.env; set +a

API_PORT=3000
declare -A APPS=([superadmin]=5176 [admin]=5174 [pos]=5173 [tienda]=3001 [vendedor]=5179)

# Lanza un comando en sesión propia (sobrevive al cierre de la tarea del agente).
launch() { setsid bash -c "$1" </dev/null >"$2" 2>&1 & disown; }

wait_port() { # puerto, intentos
  for _ in $(seq 1 "${2:-60}"); do
    curl -s -o /dev/null --max-time 1 "http://localhost:$1" 2>/dev/null && return 0
    curl -s -o /dev/null --max-time 1 "http://localhost:$1/health" 2>/dev/null && return 0
  done
  return 1
}

cmd_up() {
  echo "▶ Levantando API…"
  launch "RECARGA_PROVIDER=mock FISCAL_PROVIDER=mock pnpm dev:api" /tmp/gaes-api.log
  wait_port "$API_PORT" 90 && echo "  API :$API_PORT ✓" || echo "  API :$API_PORT ✗ (ver /tmp/gaes-api.log)"

  launch "VITE_API_URL=http://localhost:$API_PORT pnpm --filter @gaespos/web-superadmin dev" /tmp/gaes-superadmin.log
  launch "VITE_API_URL=http://localhost:$API_PORT pnpm --filter @gaespos/web-admin dev" /tmp/gaes-admin.log
  launch "VITE_API_URL=http://localhost:$API_PORT pnpm --filter @gaespos/web-pos dev" /tmp/gaes-pos.log
  launch "VITE_API_URL=http://localhost:$API_PORT pnpm --filter @gaespos/web-vendedor dev" /tmp/gaes-vendedor.log
  launch "TIENDA_TENANT_SLUG=${TIENDA_TENANT_SLUG:-globoland} TIENDA_USER_EMAIL=${TIENDA_USER_EMAIL:-dueno@globoland.mx} TIENDA_USER_PASSWORD=${TIENDA_USER_PASSWORD:-Cliente!2026} pnpm --filter @gaespos/web-tienda dev" /tmp/gaes-tienda.log

  for svc in superadmin admin pos tienda; do
    wait_port "${APPS[$svc]}" 90 && echo "  $svc :${APPS[$svc]} ✓" || echo "  $svc :${APPS[$svc]} ✗"
  done
  echo "✔ Listo."
}

cmd_down() {
  for p in "$API_PORT" "${APPS[@]}"; do fuser -k "${p}/tcp" 2>/dev/null; done
  echo "✔ Servicios bajados."
}

cmd_status() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$API_PORT/health" 2>/dev/null)
  echo "API      :$API_PORT  → ${code:-sin respuesta}"
  for svc in superadmin admin pos tienda; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:${APPS[$svc]}" 2>/dev/null)
    printf "%-9s:%s → %s\n" "$svc" "${APPS[$svc]}" "${code:-sin respuesta}"
  done
}

cmd_token() { pnpm --filter @gaespos/api exec tsx scripts/dev-tokens.ts "$@"; }

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  logs) tail -n 40 "/tmp/gaes-${2:-api}.log" ;;
  token:super) cmd_token super ;;
  token:tenant) shift; cmd_token tenant "$@" ;;
  setpass) shift; cmd_token setpass "$@" ;;
  code) cmd_token code ;;
  *)
    grep -E '^#( |!)' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
