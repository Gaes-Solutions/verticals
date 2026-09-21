# Continuación de tienda — 17 de septiembre de 2026

> Actualización posterior: [catálogo local conectado y pruebas nuevas](avance-catalogo-local-2026-09-17.md). La descarga paginada y el aviso de preparación ya están integrados; los pendientes de esta primera parte son históricos donde difieran de esa actualización.

## Verificado

- El servidor guarda la venta (y sus efectos comerciales) y su confirmación de
  sincronización en una transacción. Reintentos concurrentes comparten el resultado.
- Cada clave queda ligada al usuario y al contenido original. Reutilizarla para
  otra operación o cuenta falla sin entregar el comprobante ajeno.
- Una excepción al guardar la confirmación revierte la venta; la misma operación
  puede reintentarse sin duplicar. Prueba con fallo inyectado en PostgreSQL aislado.
- Adaptador SQLite real: cola, caché y cursor separados por API, negocio, usuario,
  sucursal y caja. Recupera envíos interrumpidos y conserva ventas pendientes.
- El motor serializa envíos y descargas; las respuestas parciales o incompatibles
  vuelven a la cola con espera entre reintentos. Un error de caché no avanza el cursor.
- Migraciones SQLite registradas en Tauri; instancia única y permisos SQL limitados
  a la ventana local. Apertura desde web-pos preparada, con WAL y error recuperable.
  Este módulo todavía no se invoca desde la pantalla de venta.

## Pruebas de esta continuación

- API sync: 15 pruebas aprobadas con PostgreSQL en `qa_fixes_20260915`.
- Cliente sync: 30 pruebas aprobadas, incluidas 10 con SQLite en disco mediante
  Python 3; cada consulta reabre la conexión.
- POS: 141 regresiones aprobadas y 4 pruebas nuevas de apertura nativa aprobadas.
- Plan de empaquetado: 18 pruebas aprobadas.
- Puente de impresión recompilado: 2 pruebas Rust y 1 integración TCP con reinicio
  aprobadas. Paquete local actualizado: `apps/print-bridge/dist/gaespos-print-bridge-0.2.0-linux-x64-20260917.tar.gz`.
  SHA-256: `a742b04b3bc25ae908dd6f0ab2481d3c3c027ce7a67acf81ba9b90ed480aec54`.
  Simulación TCP; impresora física pendiente.
- Tipos API, sync-client y POS aprobados; compilación web POS aprobada.
- `cargo check --locked --offline -j 2` aprobado en contenedor Debian 12 con
  WebKitGTK 4.1 y Rust 1.98.1, incluyendo las migraciones/capabilities y el plugin
  de instancia única. `cargo fmt --check` aprobado. No se generó instalador Tauri
  ni se probó una ventana nativa o dispositivo físico. El host carece de GLib de
  desarrollo, resuelto para esta comprobación dentro del contenedor.
- Dependencias Rust fijadas en `Cargo.lock`; mínimo requerido por ellas: Rust 1.88.
  Entorno de bibliotecas reproducible en `apps/pos-desktop/scripts/Dockerfile.linux-check`.

## Pendientes para habilitar ventas sin internet

1. Completar descarga de catálogo: el endpoint actual limita 500 filas por entidad
   y necesita paginación/checkpoint consistente, incluyendo cambios concurrentes.
2. Integrar sesión y permisos locales con expiración, apertura de caja y trabajadores
   que se detengan al cambiar cuenta. Nunca reutilizar el token de la siguiente sesión.
3. Persistir venta, comprobante y efecto local de inventario de forma atómica;
   conservar precios/impuestos/descuentos aceptados y reconciliar aperturas cerradas.
4. Conectar cobro, recibos y revisión de pendientes al POS; cubrir pérdida de red,
   reinicio y recuperación de respuesta desde la interfaz real.
5. Completar devoluciones, apartados y cortes offline conforme al alcance vigente;
   resolver conflictos mediante una nueva operación revisada, no reenviar indefinidamente
   la misma clave cuyo conflicto ya quedó registrado.
6. Instaladores Windows/macOS/Linux, firma, instalación/actualización real y periféricos.
   Validaciones bancarias/fiscales reales y paridad móvil siguen en sus entregas previas.

## Despliegue y compatibilidad

La migración `20260917000000_sync_receipts_identity` debe aplicarse antes de desplegar
este servidor. Solo se aplicó en pruebas. Los acuses antiguos sin usuario/huella
no se atribuyen automáticamente: sus reintentos requieren revisión, evitando
repetir efectos o revelar información de otra cuenta. No borrar esas filas.

Las tablas SQLite antiguas sin ámbito se conservan sin asignarlas al usuario actual.
La base SQLite contiene información local sin cifrado; cifrado/retención y
credenciales offline requieren cierre antes de habilitar uso comercial.

No se modificó producción ni se habilitó cobro offline en la interfaz.
