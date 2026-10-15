# ADR 016 — Fachada de comercio móvil con identidad de cliente

Fecha: 2026-09-08. Estado: aceptada para la fase catálogo y carrito, autorizada por Gaby y coordinada en la revisión de tienda.

## Decisión

La app Cliente consume `/cliente-portal/comercio/*`, protegido por `authenticateCliente`. El tenant y cliente se obtienen únicamente del JWT validado; no se incluyen credenciales de empleado o cuenta de servicio en Expo. Los cuerpos son estrictos y rechazan identidad, precios u otros campos adicionales.

La fachada reutiliza el catálogo enriquecido y el motor de cálculo de carrito. Solo expone DTO de catálogo y carrito mediante listas explícitas de campos, sin costos internos, recuperación de carrito, email, datos de pago ni objetos Prisma completos. Productos y variantes deben estar publicados, activos, visibles y no archivados. El listado es informativo; el precio de carrito se recalcula en servidor.

El carrito es del comprador autenticado, canal `mobile`; POST reemplaza sus líneas activas y GET exige misma identidad y estado activo. No se modifica un carrito vinculado a un intento de pago. POST y DELETE serializan por cliente y bloquean la fila de carrito dentro de transacción antes de verificar intentos; checkout debe compartir ese bloqueo al registrar su intento y verificar estado/versión de carrito. El cupón queda registrado para evaluación posterior en checkout: este alcance no afirma que ya haya sido descontado.

## Alcance y límites

Incluye catálogo, detalle, categorías, configuración pública y carrito. Excluye iniciar pagos, checkout móvil, datos fiscales y suscripciones. No añade esquema ni proveedores. POST requiere al menos una línea; DELETE /carrito abandona los activos mobile del comprador, sin borrar historial y rechazando carritos con intento de pago. GET /carrito restaura el más reciente por updatedAt e id descendentes. El catálogo conserva el límite existente de cálculo en memoria para filtros/orden por precio; no es certificación de escalabilidad para catálogos mayores.

## Alternativa descartada

Reutilizar el token de servicio `/t/*` dentro de la app expondría privilegios del negocio. Duplicar el motor de precios en móvil produciría importes inconsistentes y permitiría manipulaciones.

## Actualización 2026-10-14: carrito compartido web y Android

La web autenticada usa también `/cliente-portal/comercio/carrito` mediante su BFF y la cookie HttpOnly del comprador. `mobile` permanece como valor histórico del canal de almacenamiento del carrito compartido. Los visitantes conservan su carrito local separado. Los artículos locales anteriores se ofrecen para importar explícitamente; no se adjudican automáticamente a una cuenta al iniciar sesión.

GET y POST incluyen una versión opaca basada en id y updatedAt. Los nuevos clientes envían `expectedVersion` (null si comprobaron que no existe carrito); el servidor la verifica bajo el bloqueo por cliente antes de reemplazar o vaciar. Un conflicto devuelve `409 CART_CHANGED`, conserva la escritura ganadora y obliga a revisar los artículos. Por compatibilidad los APK anteriores pueden seguir usando POST sin versión y DELETE; para protección de concurrencia completa hay que actualizar el APK. POST con líneas vacías abandona el carrito y responde 204.

Ambas interfaces consultan cambios en segundo plano mientras están activas y el carrito está guardado. Android consulta también al regresar al primer plano. Las respuestas tardías no reemplazan ediciones locales posteriores ni cambian el carrito de otra sesión. Checkout envía la versión que el comprador revisó y la comprueba bajo el bloqueo de carrito antes de registrar un intento o llamar al proveedor; la recuperación de un intento ya registrado mantiene sus reglas de idempotencia.

La verificación cubre escrituras simultáneas, vaciado con versión anterior, aislamiento de cuentas, reintentos de checkout y un recorrido de navegador contra la API real sin pedidos ni cobros. No sustituye una prueba física del APK instalado.
