#!/usr/bin/env bash
# Ensayo de restauración: levanta un Postgres 18 desechable, restaura el respaldo
# ahí dentro y verifica que los datos llegaron completos. NUNCA toca producción
# ni la base de desarrollo.
#
#   bash scripts/restore-ensayo.sh ~/respaldos-gaespos/gaespos-AAAAMMDD-HHMMSS.dump
set -euo pipefail
ARCHIVO="${1:?Uso: restore-ensayo.sh <archivo.dump>}"
[ -f "$ARCHIVO" ] || { echo "No existe: $ARCHIVO" >&2; exit 1; }
CONTENEDOR="gaespos-ensayo-restore-$$"
PASS="ensayo$$"

limpiar() { docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true; }
trap limpiar EXIT

echo "Levantando Postgres 18 desechable…"
docker run -d --name "$CONTENEDOR" -e POSTGRES_PASSWORD="$PASS" postgres:18-alpine >/dev/null
until docker exec "$CONTENEDOR" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

echo "Restaurando…"
docker exec -i "$CONTENEDOR" pg_restore -U postgres -d postgres --no-owner --no-privileges < "$ARCHIVO" \
  || echo "(pg_restore reportó avisos; se verifica el contenido abajo)"

echo
echo "Verificación del contenido restaurado:"
docker exec "$CONTENEDOR" psql -U postgres -d postgres -tAc "
  select 'esquemas de tenant: ' || count(*) from information_schema.schemata where schema_name like 'tenant_%'
  union all select 'tablas totales: ' || count(*) from information_schema.tables
    where table_schema not in ('pg_catalog','information_schema')
  union all select 'tenants: ' || count(*) from public.tenants
  union all select 'planes: ' || count(*) from public.plans;"

echo
echo "Ensayo terminado. El contenedor desechable se elimina solo."
