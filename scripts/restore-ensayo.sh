#!/usr/bin/env bash
# Restaura un dump custom en Postgres 18 desechable, sin red ni puertos.
# Prueba que el archivo se restaura y que se pueden consultar tablas básicas.
# Sin conteos del origen NO certifica que el respaldo contenga todos sus datos.
# Uso: bash scripts/restore-ensayo.sh <archivo.dump>
# Opcional: RESTORE_EXPECTED_COUNTS="esquemas,tablas,tenants,planes" (cuatro enteros).
set -euo pipefail
ARCHIVO="${1:?Uso: restore-ensayo.sh <archivo.dump>}"
[ -s "$ARCHIVO" ] || { echo "El respaldo no existe o está vacío." >&2; exit 1; }
READY_TIMEOUT="${RESTORE_READY_TIMEOUT_SECONDS:-90}"
RESTORE_TIMEOUT="${RESTORE_TIMEOUT_SECONDS:-1200}"
EXPECTED="${RESTORE_EXPECTED_COUNTS:-}"
for limite in "$READY_TIMEOUT" "$RESTORE_TIMEOUT"; do
  [[ "$limite" =~ ^[1-9][0-9]{0,3}$ ]] && (( limite <= 3600 )) || {
    echo "Los límites de espera deben ser enteros entre 1 y 3600 segundos." >&2; exit 1;
  }
done
if [[ -n "$EXPECTED" && ! "$EXPECTED" =~ ^[0-9]+,[0-9]+,[0-9]+,[0-9]+$ ]]; then
  echo "RESTORE_EXPECTED_COUNTS debe contener cuatro enteros separados por comas." >&2; exit 1
fi
command -v timeout >/dev/null || { echo "Se requiere GNU timeout." >&2; exit 1; }
command -v docker >/dev/null || { echo "Se requiere Docker." >&2; exit 1; }
umask 077
PRIVADO="$(mktemp -d)"
CONTENEDOR="gaespos-ensayo-restore-$$-$RANDOM"
INTENTADO=0
limpiar() {
  local resultado=$?
  trap - EXIT
  if (( INTENTADO )); then
    if ! timeout --kill-after=5s 15s docker rm -fv "$CONTENEDOR" > /dev/null 2>&1; then
      echo "No se pudo confirmar la eliminación del contenedor de ensayo." >&2
      resultado=1
    fi
  fi
  rm -rf "$PRIVADO"
  exit "$resultado"
}
trap limpiar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fallar() { echo "$1" >&2; exit 1; }

echo "Levantando Postgres 18 desechable y sin red…"
INTENTADO=1
if ! timeout --kill-after=5s 60s docker run -d --network none --name "$CONTENEDOR" \
  -e POSTGRES_PASSWORD="ensayo-local-$$-$RANDOM-$RANDOM" postgres:18-alpine \
  > "$PRIVADO/inicio" 2> "$PRIVADO/error"; then
  fallar "No se pudo iniciar el contenedor de ensayo."
fi
LIMITE=$((SECONDS + READY_TIMEOUT))
while true; do
  RESTANTE=$((LIMITE - SECONDS))
  (( RESTANTE > 0 )) || fallar "Postgres no estuvo listo dentro del tiempo permitido."
  (( RESTANTE <= 5 )) || RESTANTE=5
  # El servidor temporal de initdb solo acepta socket; esperar TCP evita
  # restaurar justo antes de que el entrypoint lo detenga y arranque el final.
  if timeout --kill-after=1s "${RESTANTE}s" docker exec "$CONTENEDOR" pg_isready -h 127.0.0.1 -U postgres \
    > /dev/null 2>&1; then break; fi
  sleep 1
done

# Usa pg_restore de la misma versión que el servidor; el cliente del host puede
# ser anterior e incapaz de leer un archivo generado por Postgres 18.
if ! timeout --kill-after=5s 60s docker exec -i "$CONTENEDOR" pg_restore --list \
  < "$ARCHIVO" > "$PRIVADO/catalogo" 2> "$PRIVADO/error"; then
  fallar "El catálogo del respaldo no es válido."
fi
[ -s "$PRIVADO/catalogo" ] || fallar "El catálogo del respaldo está vacío."

echo "Restaurando y verificando SQL…"
if ! timeout --kill-after=5s "${RESTORE_TIMEOUT}s" docker exec -i "$CONTENEDOR" \
  pg_restore -U postgres -d postgres --exit-on-error --single-transaction --no-owner --no-privileges \
  < "$ARCHIVO" > "$PRIVADO/restauracion" 2> "$PRIVADO/error"; then
  fallar "La restauración falló o superó el tiempo permitido; ensayo rechazado."
fi
if ! timeout --kill-after=5s 60s docker exec -i "$CONTENEDOR" \
  psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -F ',' \
  > "$PRIVADO/conteos" 2> "$PRIVADO/error" <<'SQL'
SELECT
  (SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'tenant\_%'),
  (SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE'
    AND table_schema NOT IN ('pg_catalog', 'information_schema')),
  (SELECT count(*) FROM public.tenants),
  (SELECT count(*) FROM public.plans);
SQL
then
  fallar "La comprobación SQL de las tablas restauradas falló."
fi
CONTEOS="$(tr -d '\r\n' < "$PRIVADO/conteos")"
[[ "$CONTEOS" =~ ^[0-9]+,[0-9]+,[0-9]+,[0-9]+$ ]] || fallar "La comprobación SQL no devolvió conteos válidos."
if [[ -n "$EXPECTED" && "$CONTEOS" != "$EXPECTED" ]]; then
  fallar "Los conteos restaurados no coinciden con los esperados; ensayo rechazado."
fi
echo "Restauración y consultas SQL verificadas; el contenedor se elimina al salir."
if [[ -n "$EXPECTED" ]]; then
  echo "Los cuatro conteos proporcionados también coinciden."
else
  echo "Sin conteos de origen: esto no certifica que todos los datos del origen estén presentes."
fi
