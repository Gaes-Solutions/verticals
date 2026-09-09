#!/usr/bin/env bash
# Prepara producción para el login sin negocio.
#
# Hace dos cosas, en este orden:
#   1. Crea la tabla del índice correo → negocio (migración aditiva del master).
#   2. Rellena el índice con los usuarios que ya existían.
#
# DEBE correrse ANTES de desplegar el código nuevo: las pantallas dejan de
# mandar el negocio, así que sin el índice nadie podría entrar.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="$(railway variables -s Postgres --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).DATABASE_PUBLIC_URL||""))')"
if [ -z "$URL" ]; then echo "No se obtuvo DATABASE_PUBLIC_URL de Railway (¿railway login?)" >&2; exit 1; fi

echo "1/2 Creando la tabla del índice…"
DATABASE_URL_MASTER="$URL" pnpm --filter @gaespos/db prisma:migrate:deploy

echo
echo "2/2 Indexando los usuarios que ya existían…"
DATABASE_URL_MASTER="$URL" DATABASE_URL_TENANT="$URL" pnpm --filter @gaespos/db migrate tenant directorio

echo
echo "Listo. Ahora sí se puede desplegar el código que quita el campo del negocio."
