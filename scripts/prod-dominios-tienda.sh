#!/usr/bin/env bash
# Da de alta en producción la dirección de cada tienda que ya existía
# (su-tienda.shop.angaes.com), para que su QR del mostrador lleve a algún lado.
#
# Requisitos, en este orden (sin ellos la dirección no abre aunque exista):
#   1. STOREFRONT_APEX=shop.angaes.com en el servicio del API.
#   2. DNS comodín *.shop.angaes.com apuntando a la tienda web.
#   3. El dominio comodín agregado en Railway al servicio de la tienda web.
#
# Idempotente: se puede correr las veces que haga falta. Nunca le quita a un
# negocio una dirección que ya es de otro.
set -euo pipefail
cd "$(dirname "$0")/.."

APEX="${STOREFRONT_APEX:-shop.angaes.com}"

URL="$(railway variables -s Postgres --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).DATABASE_PUBLIC_URL||""))')"
if [ -z "$URL" ]; then echo "No se obtuvo DATABASE_PUBLIC_URL de Railway (¿railway login?)" >&2; exit 1; fi

echo "Registrando direcciones bajo ${APEX}…"
STOREFRONT_APEX="$APEX" DATABASE_URL_MASTER="$URL" DATABASE_URL_TENANT="$URL" \
  pnpm --filter @gaespos/db migrate tenant dominios

echo
echo "Listo. Cada tienda ya puede descargar su QR desde el panel: Tienda online."
