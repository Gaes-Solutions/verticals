#!/bin/sh
# El disco persistente de Railway se monta como root, y el API corre con un
# usuario sin privilegios: sin esto, guardar una foto falla con "permiso
# denegado". Aquí se toma posesión de las carpetas de archivos y recién después
# se baja al usuario del servicio, que es quien ejecuta el proceso.
set -e

USUARIO=1001
GRUPO=1001

if [ "$(id -u)" = "0" ]; then
  for dir in "${PRODUCTOS_MEDIA_ROOT:-}" "${KIOSKO_MEDIA_ROOT:-}"; do
    [ -n "$dir" ] || continue
    mkdir -p "$dir"
    # Recursivo solo la primera vez: con miles de fotos, repetirlo en cada
    # arranque retrasaría el despliegue sin cambiar nada.
    if [ "$(stat -c %u "$dir")" != "$USUARIO" ]; then
      chown -R "${USUARIO}:${GRUPO}" "$dir"
    fi
  done
  exec setpriv --reuid="$USUARIO" --regid="$GRUPO" --init-groups "$@"
fi

# Ya somos un usuario normal (desarrollo, o una plataforma que fija el usuario):
# no hay nada que ceder.
exec "$@"
