# Revisión de entrega de tienda — 14-sep-2026

## Dictamen

**La vertical completa todavía no está lista para declararse terminada.** El recorrido básico de caja/panel pasó las pruebas de navegador, y la batería de servidor aprobó los casos ejecutados. Hay capacidades de producto pendientes y un bloqueo de reembolso online que las pruebas actuales no detectan.

Fuente revisada: `gaespos-integracion`, rama `trabajo/codex-tienda-08sep`, HEAD `0910a6e` más cambios locales. Durante la revisión otra sesión continuó modificando la revisión previa de importación (API y panel); se preservaron esos cambios. No es una certificación de una versión publicada ni de cambios posteriores.

## Bloqueos concretos

### 1. Reembolso online a tarjeta: estado de éxito sin ejecutar el reembolso

Prioridad alta. `aprobarSolicitud` acepta `tarjeta_misma`, crea la devolución y marca `statusPago: reembolsado`. La cadena ejecutada no llama a un proveedor de pagos: el proveedor recibido es fiscal. `procesarDevolucion` devuelve un importe como aplicado, sin confirmar una devolución bancaria. El comprador puede recibir un aviso de reembolso aunque el dinero no haya sido devuelto.

Evidencia: [aprobación online](../apps/api/src/modules/tenant/devoluciones-online/service.ts), [ruta y método predeterminado](../apps/api/src/modules/tenant/devoluciones-online/routes.ts), [servicio de devoluciones](../apps/api/src/modules/tenant/devoluciones/service.ts). La prueba de ecommerce verifica stock/estado, no una llamada y confirmación del proveedor; que pase no acredita reembolso real.

Cierre: ejecutar y conciliar el reembolso con el proveedor, guardar identidad e importe de la operación y manejar reintentos/resultados inciertos. Comunicar reembolsado únicamente cuando exista confirmación. Probar rechazo y respuesta perdida, además del éxito.

### 2. App Cliente: tarjeta no implementada

La pantalla declara expresamente «Tarjeta no disponible en esta versión». `PaymentChoices` ofrece únicamente OXXO/SPEI y solo con proveedor Conekta. Una tienda configurada solo con Stripe no obtiene un método utilizable en esa pantalla.

Evidencia: [checkout móvil](../apps/mobile-cliente/app/(app)/checkout.tsx). Cierre: completar la integración de tarjeta y comprobar el pago/rechazo/recuperación en el dispositivo y con el proveedor elegido.

### 3. Kiosco: videos propios pendientes

El reposo renderiza imágenes y texto mediante `Image`; no hay reproducción de video integrada. La documentación actual lo reconoce. Las 24 pruebas cubren funciones presentes, no esta capacidad.

Evidencia: [verificador](../apps/mobile-kiosko/app/verificador.tsx), [estado del kiosco](../apps/mobile-kiosko/README.md). Cierre: carga, validación, publicación y reproducción de videos, con recuperación y prueba en tablet real.

### 4. Escritorio e impresión nativa incompletos

El puente `/print/ticket` devuelve `ok: true` y registra el ticket, pero conserva un TODO para renderizar ESC/POS y enviarlo a USB. La impresión mediante navegador es otra vía y no fue probada físicamente en esta revisión.

El shell Tauri registra el plugin SQL, pero no conecta las migraciones ni un adaptador SQLite a las ventas. `check:native` falla por falta de Rust/Cargo y WebKitGTK/OpenSSL en este entorno. No se certificaron instaladores, operación offline ni impresoras/cajón/lectores por plataforma.

Evidencia: [puente de impresión](../apps/print-bridge/src/main.rs), [shell](../apps/pos-desktop/src-tauri/src/main.rs), [estado de escritorio](../apps/pos-desktop/README.md).

## Verificación ejecutada

| Área | Resultado |
|---|---|
| API retail | 265 pruebas aprobadas en 16 archivos: checkout, identidad/recuperación, ventas, inventario, cortes/concurrencia, devoluciones, ecommerce, kiosco y postpago |
| POS | 141 pruebas aprobadas |
| App Cliente | 56 pruebas aprobadas |
| App Negocio | 107 pruebas aprobadas |
| Kiosco | 24 pruebas aprobadas |
| Tienda web | 47 pruebas aprobadas y build Next.js correcto |
| Navegador Chromium | 10 pruebas aprobadas de panel y POS: catálogo/alta/plantilla, cobro en efectivo, búsqueda/código ausente, lectura X y recuperación, devolución y promoción |
| Tipos | Tienda web, POS y las tres apps móviles aprobados |
| Entorno nativo | Comprobación fallida por herramientas ausentes; no compilación ni prueba física |

Son **650 ejecuciones de pruebas aprobadas en esta revisión**, no 650 funcionalidades independientes. No se incluyen las 34 pruebas de las correcciones realizadas en el turno anterior.

API y navegador usaron PostgreSQL aislado `qa_fixes_20260915`, puerto 55438. Playwright usó copias temporales de las pruebas con API 3309, POS 5373 y panel 5374, sin reutilizar servidores existentes. Los proveedores de pruebas son simulados. No se hicieron movimientos en producción.

Logs locales: `/tmp/gaes-retail-review-tests.log`, `/tmp/gaes-retail-app-tests.log`, `/tmp/gaes-retail-types.log`, `/tmp/gaes-retail-store-tests.log`, `/tmp/gaes-retail-store-build.log`, `/tmp/gaes-retail-e2e-tests.log`. Runner de API: `/tmp/gaes-retail-review-tests.cjs`; runner navegador: `/tmp/gaes-retail-e2e-run.cjs`.

## Qué no acredita esta revisión

- No se verificó el commit desplegado, migraciones de producción o cuentas de proveedores.
- No se repitió en navegador el recorrido completo del comprador web; el checkout sí tuvo pruebas de API y unitarias. Las pruebas Playwright existentes cubren panel/POS y no incluyen el corte Z completo en navegador; el servidor de cortes sí fue probado.
- No se probó en equipos físicos Android/iOS, impresión, instalación o actualización.
- No se certificó paridad exhaustiva de todas las operaciones de la app Negocio con el panel.
- La sincronización del vendedor conserva los arreglos anteriores, pero no constituye un POS offline terminado.

## Orden de cierre

1. Corregir reembolsos online y probar su conciliación.
2. Completar tarjeta en app Cliente.
3. Completar videos del kiosco y entrega nativa/hardware conforme al alcance acordado.
4. Fijar una versión sin cambios simultáneos y repetir compra web/app → pago → entrega → devolución, y apertura → venta → ticket físico → corte Z en los equipos del piloto.
5. Asociar la versión probada con el despliegue y las migraciones antes de declarar terminada la vertical.
