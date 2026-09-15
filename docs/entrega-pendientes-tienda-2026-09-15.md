# Entrega de cambios de tienda · 15-sep-2026

Carpeta: `gaespos-integracion`. Rama: `trabajo/codex-tienda-08sep`.
Cambios de Codex sin commit, coexistiendo con la limpieza Retail de Claude
(ADR 029). No se desplegó ni se hicieron cargos o reembolsos reales.

## Implementado

1. **Reembolsos online**: registro duradero, proveedor/cuenta originales y
   aprobación idempotente. Solo un reembolso confirmado cambia el pedido;
   un reembolso parcial conserva el pago del resto. Las respuestas inciertas
   se consultan sin volver a enviar dinero. Panel y app Negocio muestran el
   estado y permiten introducir una referencia para verificarla con el banco.
   La recepción apta para inventario es explícita, apagada por defecto.
   Para efectivo se selecciona caja; la transferencia sin comprobante no se
   presenta como pagada. Las aprobaciones no bancarias conservan su solicitud
   original para no duplicar inventario/dinero al repetir la petición.
2. **Tarjeta en Cliente**: PaymentSheet de Stripe para nativo, Elements para web
   y tokenización Conekta dentro del formulario aislado. El API recibe tokens,
   nunca PAN/CVC. El resultado del SDK vuelve a consultar el pedido al servidor.
   El pago conserva su cuenta Stripe Connect y comisión de plataforma.
3. **Anuncios propios del kiosco**: reserva y carga binaria limitada, inspección
   y decodificación completa con FFmpeg en Bubblewrap sin red, límites de
   CPU/memoria/tiempo; publicación inmutable con sucursales y vigencia;
   enlaces temporales, verificación de dispositivo y retiro; lectura Range;
   eliminación de archivo libera cuota. Panel para cargar/publicar/retirar.
   Reproductor expo-video silenciado, se desmonta al escanear y salta errores.
4. **Impresión real**: puente Rust 0.2.0, TCP y spool `lp`, clave local y origen
   permitido, comprobación de errores, registro persistente sin reenvío
   automático. Botón de impresión directa en recibos POS. Binario Linux x64
   empaquetado en `apps/print-bridge/dist/`, con SHA256SUMS. El corte del papel
   es opcional; no abre el cajón.

## Activación necesaria

- Aplicar migraciones tenant `20260915000000_online_bank_refunds` y
  `20260915010000_kiosko_publications`, generar Prisma y desplegar API/clientes
  juntos. No ejecutadas sobre producción.
- Configurar la clave pública correspondiente: `STRIPE_PUBLISHABLE_KEY`
  (admite `STRIPE_PUBLIC_KEY`) o `CONEKTA_PUBLIC_KEY`, junto a las credenciales
  privadas/webhooks existentes. Sin clave pública no se ofrece tarjeta móvil.
- Reconstruir las apps móviles: se añadieron Stripe 0.45.0, WebView 13.13.5 y
  expo-video 2.2.2, compatibles con el Expo 53 instalado.
- Kiosco: `KIOSKO_MEDIA_ROOT` debe ser un volumen persistente absoluto y privado
  del usuario API, con espacio para la cuota por negocio. Requiere Linux,
  `ffmpeg`, `ffprobe`, `bubblewrap` y `prlimit`. Dockerfile incluye herramientas;
  el host/contenedor también debe permitir el aislamiento de usuario que
  requiere Bubblewrap. Si no lo permite, la inspección falla cerrada. No usar
  modo privilegiado ni desactivar el aislamiento para forzar la carga.
- Probar el despliegue real: carga de MP4 conocido, retiro, reinicio del API y
  acceso desde tablet. El volumen debe compartirse si hay varias réplicas.
- Configuración de impresora: ver `apps/print-bridge/README.md`.

## Pendientes reales — no declarar tienda completamente terminada

- Prueba sandbox de extremo a extremo con credenciales del negocio para tarjeta,
  autenticación 3DS, webhooks y reembolsos. Los adaptadores se probaron con
  respuestas controladas; no se movió dinero.
- Pedidos históricos sin proveedor/cuenta original requieren conciliación
  respaldada en el proveedor. No se adivina con la configuración actual.
  Conekta sin respuesta exige referencia individual; Stripe puede localizar
  el reembolso por su clave. Tras fallo bancario confirmado se puede conciliar
  una nueva referencia emitida desde el proveedor, sin reembolso automático.
- Inspección multimedia requiere confirmar compatibilidad del aislamiento y
  volumen en Railway/host elegido. Cargas interrumpidas en `validating` conservan
  reserva hasta expirar; falta automatizar su limpieza. No se genera póster de
  video; ante fallo se muestra el siguiente anuncio. No afirmar ADR 021 completo.
- **POS offline de escritorio sigue pendiente**: no se conectaron SQLite,
  almacenamiento por cuenta ni sincronización a las ventas. El puente de
  impresión no resuelve ese trabajo.
- Instaladores Tauri por SO, firmas, CORS nativo y pruebas físicas de impresora,
  cajón, escáner/tablet. Se preguntaron los modelos y sistemas; sin respuesta aún.

## Evidencia

- Regresión API Retail: 265 pruebas pasaron antes de la última revisión conjunta.
- Reembolsos: 8 pruebas con PostgreSQL aislado; concurrencia, pérdida de respuesta,
  devolución parcial, cuenta original y referencia incorrecta.
- Multimedia: 4 pruebas con MP4 real y decodificador aislado, publicación,
  lectura parcial, firma y revocación. Base exclusiva `qa_fixes_20260915`.
- Navegador Playwright: 11 pruebas pasaron, incluida carga/publicación/retiro de
  video propio, además de los flujos anteriores del panel y POS.
- POS: 141; Negocio: 107; Cliente: 59; kiosco: 24 pruebas pasaron.
- Exportación JavaScript Android de Cliente y Kiosco completada con Metro/Hermes.
  Se corrigió la configuración del plugin Stripe detectada por este build.
  Estas exportaciones no son APK ni sustituyen una prueba nativa.
- Revisión visual de kiosco a 360 px: sin desbordamiento horizontal; carga,
  publicación y retiro repetidos correctamente tras cerrar el tour inicial.
- Puente: dos pruebas unitarias y prueba de proceso/TCP/reinicio pasaron;
  compilación release Linux x64. Preparación de build desktop: 18 pruebas.
- Build API, panel y POS pasó. Tipado final de API, panel, POS y tres apps móviles pasó.
- Revisión conjunta final: 102 pruebas API afectadas pasaron, incluidas las 5
  de activación de verticales de Claude; adaptadores de pagos: 49 pruebas.
- Biome sobre 39 archivos propios: sin errores; conserva 25 advertencias
  de complejidad/estilo (incluye código previo). `git diff --check` sin errores.

Contrato y fuentes: [ADR 028](adr/028-cierre-operativo-tienda.md).
