# ADR 030 — Integración durable del POS offline

Fecha: 17-sep-2026. Continúa ADR 009 por instrucción de Gaby de terminar los pendientes.

## Orden de integración

1. Cerrar duplicación en sync: efecto comercial y acuse en una transacción,
   clave ligada a usuario y contenido. Reintentar no cambia caja, pago ni artículos.
2. Conectar almacenamiento SQLite con migraciones registradas, ámbitos por
   negocio/usuario/sucursal/caja y recuperación de escrituras interrumpidas.
3. Conectar catálogo, operaciones locales y reconciliación al POS. La interfaz
   distingue cobrado localmente, confirmado por servidor y pendiente de revisión.
4. Construir y probar artefactos nativos; mantener separado resultado de compilación,
   ejecución e instalación física. No declarar implementado todo ADR 009 por
   tener una cola o un instalador que abre.

## Contratos

- No habilitar cobro local hasta persistir operación y comprobante. Repetir usa
  la misma clave. No descartar ventas cobradas para resolver errores de red.
- Catálogo/precios con versión y fecha. El importe aceptado al cobrar no se
  sustituye silenciosamente por el precio del momento de reconexión.
- Datos y trabajadores separados por cuenta y caja. Cambiar de usuario detiene
  sincronización anterior; jamás envía su cola con credenciales del nuevo usuario.
- Migraciones aditivas: tablas antiguas sin ámbito no se reinterpretan como
  pertenecientes a la cuenta actual.
- Un proceso de escritorio por instalación; SQLite WAL. Acceso nativo solo
  desde la ventana local empaquetada; sin capacidades para contenido remoto.
- La cola conserva resultados rechazados/conflictos, con recuperación explícita.
  Una respuesta incompleta no deja operaciones atascadas en `syncing`.

Fuentes: [plugin SQL Tauri](https://v2.tauri.app/plugin/sql/),
[instancia única](https://v2.tauri.app/plugin/single-instance/).

## Catálogo y sesión de escritorio (continuación)

Se materializa una versión completa del catálogo en páginas inmutables de 500
filas dentro de una transacción PostgreSQL Repeatable Read. Cada descarga pertenece
a un usuario, conserva la huella de sus permisos y caduca a los 15 minutos. Una
nueva descarga reemplaza la anterior de ese usuario; un cambio de permisos invalida
el acceso. No se usa `updatedAt` como prueba de que se recibieron todas las filas.
SQLite guarda páginas en preparación y publica una referencia a la versión activa
solo si recibió todas; la versión anterior permanece visible ante un fallo.

La integración inicial prepara catálogo y datos de sesión desde una identidad
verificada en línea. El trabajador captura el token y se cancela al salir/cambiar
cuenta. No prolonga la autorización ni habilita cobros offline por disponer de
una copia del catálogo. Sesión autónoma y cobro se integran después del contrato
comercial de precios/apertura ya previsto arriba.

Referencias de implementación de la descarga:
[aislamiento Repeatable Read de PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-REPEATABLE-READ)
y [funciones JSON de SQLite](https://www.sqlite.org/json1.html). Se materializan las
páginas antes de cerrar la transacción; no se mantiene una transacción abierta
mientras el dispositivo descarga por HTTP.

## Consulta del catálogo y recuperación de pantalla

La consulta local se vincula a la huella SHA-256 del token validado en línea,
la caja/negocio/API y la versión completa del catálogo. Su vigencia nunca supera
el `exp` del token ya verificado; no se convierte decodificar un JWT en validarlo.
El token no se copia a SQLite. Cerrar sesión retira el puntero de recuperación.

Al reiniciar sin red, la misma sesión vigente recupera una pantalla de
consulta de productos, sin acciones comerciales. Errores 401/403/servidor no se
reinterpretan como pérdida de red. Al reconectar se vuelve a verificar identidad
y apertura de caja antes de entrar a ventas. Esto no sustituye la autenticación
offline autónoma ni la autorización de cobros de un turno completo.

## Reconciliación inicial de importes y apertura — 18-sep-2026

Cada venta nueva enviada por sync requiere `expectedTotal` y
`expectedAperturaId`, además de caja. El total se compara con el cálculo del
servidor; la apertura original debe seguir activa y queda bloqueada durante la
persistencia. Si no coincide, no se crea la venta ni se reemplazan importes.
La cola conserva la operación para revisión. Las operaciones antiguas sin esos
datos no se completan con datos del momento de reconexión.

Un acuse ya confirmado se recupera antes de validar precio/apertura actuales.
Esta protección del total no sustituye el comprobante fiscal/comercial completo
por línea ni autoriza cobros locales. [Evidencia](../avance-reconciliacion-offline-2026-09-18.md).

## Comprobante por línea — 20-sep-2026

La reconciliación comparaba solo el total. Dos cambios que se compensan (un
artículo sube y otro baja lo mismo) dejaban pasar la venta con un desglose
distinto del que aprobó el cliente, y así se habría facturado.

La cotización (`POST /t/ventas/preview`) ahora devuelve, por línea, cantidad,
precio unitario, descuento unitario, IVA, IEPS e importe. La caja conserva ese
desglose junto al intento de cobro y lo envía como `expectedLineas`. Antes de
persistir, el servidor recalcula y compara línea por línea; cualquier
diferencia deja la operación para revisión, sin crear la venta.

Es obligatorio para las ventas que llegan por sincronización: una operación sin
desglose no se completa con los precios del momento de reconexión. Esto protege
el importe y su composición; sigue sin habilitar el cobro sin conexión.
