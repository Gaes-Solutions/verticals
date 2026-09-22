#!/usr/bin/env bash
# Deja listo el guardado de archivos en producción: un disco persistente para el
# servicio del API y las dos variables que lo apuntan.
#
# Sin esto, subir una foto de producto o un anuncio del kiosco responde 503: el
# disco del contenedor se borra en cada deploy y un archivo guardado ahí se
# perdería sin avisar.
#
# Claude no puede correrlo (el modo automático bloquea cambios de Railway en
# producción). Gaby lo corre con:  ! bash scripts/prod-volumen-fotos.sh
#
# Idempotente: si el volumen o las variables ya existen, no los duplica.
# OJO: agregar el volumen y cambiar variables REINICIAN el servicio (~1-2 min).
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICIO="${SERVICIO_API:-verticals}"
MONTAJE="/data"

echo "Servicio: ${SERVICIO}   ·   montaje: ${MONTAJE}"
echo

if railway volume list 2>/dev/null | grep -q "Attached to: ${SERVICIO}"; then
  echo "✓ El servicio ya tiene un volumen; no se crea otro."
else
  echo "→ Creando el volumen…"
  # El servicio va ANTES del subcomando: `volume add` no acepta -s.
  railway volume -s "${SERVICIO}" add -m "${MONTAJE}"
fi

echo
echo "→ Apuntando las variables al volumen…"
railway variables -s "${SERVICIO}" \
  --set "PRODUCTOS_MEDIA_ROOT=${MONTAJE}/productos" \
  --set "KIOSKO_MEDIA_ROOT=${MONTAJE}/kiosko"

echo
echo "Listo. Railway reinicia el servicio solo; en 1-2 minutos ya puedes subir"
echo "fotos desde el panel (Catálogo e inventario → Fotos)."
echo
echo "Para comprobar que quedó:"
echo "  railway volume list"
