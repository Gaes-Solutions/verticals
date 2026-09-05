#!/usr/bin/env bash
# Aplica las migraciones pendientes del schema tenant a TODOS los tenants de producción.
# Usa la URL pública de Postgres de Railway (el host interno no se alcanza desde fuera).
# Requiere: railway CLI logueada y enlazada al proyecto (railway status).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="$(railway variables -s Postgres --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).DATABASE_PUBLIC_URL||""))')"
if [ -z "$URL" ]; then echo "No se obtuvo DATABASE_PUBLIC_URL de Railway (¿railway link / login?)" >&2; exit 1; fi
DATABASE_URL_MASTER="$URL" pnpm --filter @gaespos/db migrate tenant migrate-all
