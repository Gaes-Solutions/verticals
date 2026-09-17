#!/usr/bin/env bash
# Borra un tenant VACÍO de producción (un alta que quedó a medias): registro en master y esquema.
# Se niega si el negocio tiene usuarios, productos, ventas o historial de cobro.
# Uso: bash scripts/prod-borrar-tenant.sh <slug>              → solo simula
#      bash scripts/prod-borrar-tenant.sh <slug> --confirmar  → borra
# Requiere: railway CLI logueada y enlazada al proyecto (railway status).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ $# -lt 1 ]; then echo "Uso: $0 <slug> [--confirmar]" >&2; exit 1; fi
URL="$(railway variables -s Postgres --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).DATABASE_PUBLIC_URL||""))')"
if [ -z "$URL" ]; then echo "No se obtuvo DATABASE_PUBLIC_URL de Railway (¿railway link / login?)" >&2; exit 1; fi
DATABASE_URL_MASTER="$URL" pnpm --filter @gaespos/db migrate tenant delete "$@"
