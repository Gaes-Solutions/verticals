# Consulta del catálogo sin conexión — 17 de septiembre de 2026

## Resultado

El POS de escritorio consulta su catálogo SQLite al fallar la red. Busca por nombre
sin depender de acentos y por SKU/código de la variante exacta. Los códigos
compartidos por variantes se rechazan para evitar agregar otro artículo.

Si se reinicia con el mismo token todavía vigente y falla la conexión a la API,
se recupera una pantalla de consulta: productos y precios base guardados, fecha de
actualización, salida y verificación de conexión. Al reconectar, el flujo normal
verifica otra vez identidad, sucursal, caja y apertura antes de entrar a ventas.

La lectura queda ligada a la huella del token validado previamente en línea, a
negocio/API/usuario/caja y a la versión completa publicada. No guarda el token en
SQLite ni prolonga su vencimiento. Cerrar sesión o recibir una denegación 401/403
en la búsqueda/actualización retira el acceso local. Los errores HTTP y las
cancelaciones no disparan el modo de consulta. Una lectura concurrente con cambio
de versión o revocación se descarta.

## Evidencia local

- POS: **163 pruebas aprobadas**, incluidas 13 de consulta local/autorización.
- Sync-client: **34 pruebas aprobadas**; SQLite real verifica que una lectura fijada
  a la versión anterior no recibe filas de la nueva.
- Navegador: **8 escenarios aprobados** contra API y PostgreSQL aislados. El caso de
  catálogo usa SQLite real mediante Python y sustituye únicamente el transporte IPC
  de Tauri. Verifica búsqueda sin red, bloqueo del cobro, recarga en consulta,
  reconexión y actualización; los otros siete cubren regresiones comerciales.
- Compilación de producción del POS y comprobación TypeScript aprobadas.
- Revisión visual a 360, 768 y 1440 px; sin desbordamiento horizontal. Capturas
  locales: `/tmp/gaes-readonly-360.png`, `-768.png`, `-1440.png`.
- No se aplicaron migraciones ni se operaron ventas en producción.

La recarga sin red se prueba bloqueando las peticiones a la API y manteniendo los
recursos estáticos del servidor de desarrollo; imita los recursos empaquetados del
escritorio. **No constituye prueba de una ventana nativa instalada.**

## Pendientes para el offline completo

1. Autorización offline autónoma de un turno, con contrato de vigencia/revocación.
   La consulta actual vence con el JWT existente; no promete disponibilidad todo el día.
2. Precios finales locales equivalentes al servidor: impuestos, promociones,
   listas, cupones y política de inventario.
3. Venta, recibo, efectivo y cola persistidos atómicamente; reconciliación frente
   a cierres de caja, reintentos y conflictos.
4. Cortes, devoluciones y apartados offline con reglas comerciales completas.
5. Instaladores y pruebas de ejecución/impresión en dispositivos reales; validación
   de proveedores y pendientes móviles detallados en el estado de entrega.

La consulta implementada no habilita cobros sin conexión. En el POS abierto se
puede armar un ticket con resultados locales, pero el total requiere cotización de
la API. En la pantalla recuperada no se ofrecen acciones de venta.
