# Correcciones a la entrega de tienda · 15-sep-2026

Revisión de Claude sobre la entrega de Codex
([entrega-pendientes-tienda-2026-09-15.md](entrega-pendientes-tienda-2026-09-15.md)).
La entrega original sin cambios está respaldada en la rama
`respaldo/codex-entrega-2026-09-15`; `git diff` contra esa rama muestra solo
estas correcciones (16 archivos).

## Impresión

- El POS mostraba dos veces el botón de impresión directa tras cobrar.
- El ticket imprimía el identificador interno del cliente; ahora imprime su nombre.
- Puente: responde el permiso de red privada que Chrome exige para que una página
  pública hable con `127.0.0.1`; revisa la clave antes de leer el ticket (sin clave
  no procesa el cuerpo); borra al arrancar los trabajos confirmados de más de 30
  días (los inciertos se conservan).
- El POS lee con cuidado respuestas del puente que no son JSON y borra el ticket
  guardado en la sesión en cuanto la impresora lo acepta.

## Reembolsos

- Aprobar con "emitir CFDI Egreso" fallaba siempre y dejaba la solicitud atada a
  esa aprobación para siempre. Ahora se rechaza de entrada (422): la nota fiscal
  se emite aparte.
- Cualquier aprobación que falle antes de guardarse (caja cerrada, artículo
  ausente) regresa la solicitud a pendiente para corregirla o rechazarla.
- Reembolso bancario: si la preparación falla sin guardar devolución, se descarta
  el intento en vez de quedar "preparando" para siempre.
- Stripe `requires_action` en un reembolso ahora es pendiente, no fallido
  (marcarlo fallido invitaba a reembolsar dos veces).

## Videos del kiosco

- La carga ya no se guarda en memoria antes de validar la sesión: el cuerpo llega
  como stream y solo se lee en el handler autenticado. Antes de leer nada se
  rechaza sin sesión (401), sin tamaño (411) o mayor a 50 MB (413), y el proceso
  acepta como máximo 2 cargas a la vez (503 con `Retry-After`).
- La carga se escribe a disco contando bytes; se corta si excede lo reservado o
  si el cliente deja de enviar 60 s.
- Las reservas vencidas liberan su espacio al pedir una carga nueva; la reserva
  dura 30 min (antes 24 h) y el panel espera hasta 25 min.
- La lectura por rangos lee del disco solo el tramo pedido.
- Un anuncio con metadatos dañados se omite del carrusel en vez de responder 500.
- Los registros ocultan `token=` de las URL.

## Sin cambiar, a propósito o por falta de entorno

- Reposición de inventario antes de confirmar el banco: refleja la mercancía
  recibida, es explícita y viene apagada.
- Pedidos con tarjeta anteriores sin proveedor guardado: requieren conciliación;
  no se adivina.
- El envío incluido en el total del pedido evita marcar "reembolsado" completo.
- Signo del importe en reembolsos Conekta, reintento de tarjeta tras resultado
  incierto y `allow-same-origin` del formulario web: sin verificar; requieren
  sandbox del proveedor.
- La prueba con decodificador real (`tenant-kiosko-publishing`, 3 casos) necesita
  ffmpeg/ffprobe; en esta máquina no están. Validar en CI o en Railway junto con
  Bubblewrap y el volumen.
