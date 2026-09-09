#!/usr/bin/env bash
# Respaldo lógico completo de la base de producción.
#
# Producción corre Postgres 18 y pg_dump se niega a leer un servidor más nuevo
# que él, así que se usa la imagen 18 en Docker en vez del cliente local.
#
#   bash scripts/backup-prod.sh [carpeta_destino]
#
# Genera un archivo en formato custom (-Fc), que permite restaurar selectivamente
# y va comprimido. Requiere: railway CLI logueada y Docker.
set -euo pipefail
DESTINO="${1:-$HOME/respaldos-gaespos}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/gaespos-$(date +%Y%m%d-%H%M%S).dump"

URL="$(railway variables -s Postgres --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).DATABASE_PUBLIC_URL||""))')"
if [ -z "$URL" ]; then echo "No se obtuvo la URL pública de Postgres (¿railway login?)" >&2; exit 1; fi

echo "Respaldando producción → $ARCHIVO"
docker run --rm -e PGURL="$URL" -v "$DESTINO:/respaldo" postgres:18-alpine \
  sh -c 'pg_dump -Fc --no-owner --no-privileges "$PGURL"' > "$ARCHIVO"

TAM=$(du -h "$ARCHIVO" | cut -f1)
echo "Listo: $ARCHIVO ($TAM)"
echo
echo "IMPORTANTE: un respaldo que no se ha restaurado no es un respaldo."
echo "Ensáyalo con: bash scripts/restore-ensayo.sh \"$ARCHIVO\""
