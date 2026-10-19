# Backlog priorizado del storefront

El ciclo autónomo toma siempre la primera tarea `pendiente`. Solo Codex puede
darla por aprobada después de revisar diff, pruebas, accesibilidad, tenant,
precios y responsive. Si falla, conserva la tarea pendiente para el siguiente
intento.

- [x] ST-001 | Prueba Vitest del catálogo: verifica que una tarjeta publicada muestra su título y enlace de detalle. No agregues E2E ni fixtures externos.
- [x] ST-002 | Galería de producto: miniaturas, cambio de imagen, zoom configurable y fallback de URL rota.
- [x] ST-003 | Catálogo web: estados de carga, vacío, error con reintento y filtros sin perder contexto.
- [x] ST-004 | Carrito web: revalidar precios e inventario antes de checkout y mostrar cambios claramente.
- [x] ST-005 | Checkout: evitar doble envío, conservar datos al volver atrás y cubrir pago pendiente/reintento.
- [x] ST-006 | Móvil cliente: filtros, búsqueda, imagen fallback, precio promocional y carrito con resumen completo.
- [x] ST-007 | Accesibilidad: labels, foco visible, navegación por teclado y botones táctiles en pantallas críticas.
- [x] ST-008 | Rendimiento storefront: lazy images, tamaños estables, errores de red y revisión de bundle.
- [x] ST-009 | E2E de recuperación de contraseña y carrito abandonado con estados expirado, inválido y exitoso.
- [x] ST-010 | Limpieza final: resolver advertencias de lint del storefront sin relajar reglas.
- [x] ST-011 | Completar E2E del comprador: búsqueda, detalle, carrito y responsive 360/768/1440 sobre el fixture de ST-001.


## Conciliación con la auditoría de cierre (19 de octubre de 2026)

Las casillas corresponden al alcance escrito de cada tarea. Una casilla pendiente
puede requerir solamente evidencia adicional: no autoriza a rehacer las partes ya
implementadas. Las rutas de la tabla son relativas a la raíz del repositorio.
Las ejecuciones integradas y sus límites están en
`docs/testing/retail-integrated-audit-2026-10-18.md`.

| Tarea | Implementación y evidencia revisadas | Trabajo restante dentro del criterio |
| --- | --- | --- |
| ST-001 | `apps/web-tienda/test/producto-card.test.ts` renderiza `ProductoCard` y `next/link` reales con producto publicado inline; verifica el título dentro del enlace de detalle por slug, no por ID. Vitest focal 1/1; suite tienda 53 archivos, 1045 pruebas verdes. | Cerrada con Vitest; sin E2E ni fixture externo. |
| ST-002 | `apps/web-tienda/src/components/galeria-producto.tsx`, `imagen-compra.tsx`; `apps/web-tienda/test/imagen.test.ts`; `scripts/staging/check-product-media-ui.cjs` y `check-product-media-published.cjs`. Check publicado: 5 grupos, incluidos cambio de imagen, zoom/rotación, Escape, recuperación y tamaño táctil. | Cerrada en el alcance de la tarea. |
| ST-003 | `apps/web-tienda/src/app/page.tsx`, `loading.tsx`, componentes de filtros/error; `apps/web-tienda/test/catalogo-query.test.ts`, `catalogo-error-filtros.test.ts`, `loading.test.ts`; `scripts/staging/check-catalog-filters-ui.cjs`. Carga inicial con skeleton neutro y error recuperable conservando filtros. | Cerrada en el alcance de la tarea. |
| ST-004 | `apps/web-tienda/src/lib/use-carrito-verificado.ts`, `verificar-carrito-contract.ts`, `src/app/api/carrito/verificar/route.ts`; `apps/web-tienda/test/verificar-carrito.test.ts`; `scripts/staging/check-cart-verification-ui.cjs`: 20 grupos con precio actualizado visible, falta de stock/no publicado, bloqueo, reintento y cambios concurrentes. `check-checkout-initialization-ui.cjs`: 13 grupos, incluido cambio silencioso del carrito inmediatamente antes de pagar. | Cerrada en el alcance de la tarea. |
| ST-005 | `apps/web-tienda/src/app/checkout/page.tsx` guarda y restaura contacto/dirección al montar, aislados por propietario; `apps/web-tienda/test/checkout-draft.test.ts` (7 casos) verifica conservación/CP/identidad/caducidad. `checkout-attempt.test.ts` (5 casos) verifica doble pestaña, clave estable y prohibición de reenvío ambiguo. `checkout-pending-payment.test.ts` y `scripts/staging/check-checkout-recovery.cjs` cubren referencia pendiente, recarga, consulta repetida, error y recuperación explícita. `check-payment-forms-ui.cjs` cubre SDKs simulados y doble envío. | Cerrada para el flujo frontend. La conservación al volver se sustenta en persistencia/restauración y pruebas de borrador; no se afirma un E2E independiente del botón Atrás ni cobro real/3DS. |
| ST-006 | `apps/mobile-cliente/app/(app)/tienda.tsx`: búsqueda/paginación, `ProductPhoto` con fallback, promoción y `CartDock`; carrito y pruebas en `apps/mobile-cliente/test/`. Filtros, borrador aplicar/cancelar/limpiar y orden implementados en `catalog-state.ts`, `CatalogFilters.tsx` y consultas de `src/services/comercio.ts`; 153/153 pruebas móviles. | Cerrada con cliente 17, fuente 4798c6a: corrida Android 39210310553 aprobó filtros/aplicar/cancelar/limpiar, catálogo, cuenta/carrito/dirección y setup de kiosco, tres JUnit sin fallos ni skipped; publicación verificada. Recuperación de página y categoría cambiante cubierta por seis regresiones adicionales. Validación física se informa aparte. |
| ST-007 | `scripts/staging/check-storefront-keyboard.cjs`: staging `323bf8c`, 14 pantallas a 390/1280 px, 453 paradas Tab/Shift+Tab y 46 campos etiquetados, cero hallazgos/escrituras. Comprueba catálogo, detalle, carrito, checkout, acceso, registro y cuenta sin sesión; teclado de radios, botones de contraseña 44 px, galería/filtros y agregar/deshacer. Cuenta SSR real autenticada en DB desechable: 36/37 paradas y 7 inputs etiquetados por ancho, sin hallazgos. Fuente local: 6 pantallas verdes. `docs/testing/storefront-keyboard-audit-2026-10-18.md`. | Cerrada en el alcance comprobado. No certifica lector de pantalla, contraste completo, dispositivos físicos ni todas las combinaciones de estados. |
| ST-008 | `apps/web-tienda/src/components/imagen-compra.tsx`: `loading="lazy"`, decodificación asíncrona y fallback; `producto-card.tsx`: `aspect-square` y espacio estable. Fallos de imagen/red y recuperación cubiertos por media/carrito/checkout. Revisado build final Next: First Load JS compartido 102 kB; catálogo 120 kB, detalle 126 kB, carrito 113 kB, checkout 129 kB (build d39e736). `check-product-hydration.cjs`: 8 cargas publicadas, 834–1661 ms, sin errores JS/assets. | Cerrada para la revisión pedida; estas mediciones no constituyen garantía de Core Web Vitals para todo dispositivo/red. |
| ST-009 | `scripts/staging/check-cart-recovery-ui.cjs`: recibo válido, 404 inválido, 410 expirado, consentimiento y carrito conservado. Contraseña: `apps/api/test/cliente-password-reset.test.ts`, contratos BFF y `scripts/testing/shopper-recovery-workflows.cjs` contra Next/API/DB reales: inválido, expirado, válido, reuso, contraseña vieja rechazada y nueva aceptada. El mismo E2E usa carritos reales abandonado/expirado/desconocido y exige consentimiento para reemplazar. | Cerrada: 8 grupos recovery reales, más 2 de teclado en cuenta autenticada. No se usa proveedor de correo ni se declara probado su envío. Evidencia: `docs/testing/shopper-e2e-2026-10-18.md`. |
| ST-010 | Fuente d39e736: Biome estricto sobre los 238 archivos de tienda (`check . --error-on-warnings`), 0 errores/0 advertencias, sin relajar reglas ni añadir excepciones. Las 67 advertencias anteriores se resolvieron con extracciones y dependencias que expresan contexto/reintentos reales. Tipos 30/30, tienda 1047/1047, build Next, 21 suites de navegador y 22 grupos Next/API/DB reales aprobados. Revisión independiente de guards/AST y 3006 comparaciones diferenciales. | Cerrada en su alcance. Dispositivos físicos, proveedores y activación de autonomía siguen separados y no se certifican con lint/tests. |
| ST-011 | `scripts/testing/run-platform-workflows.cjs --shopper-e2e` levanta Next/API reales con DB local desechable; `shopper-fixture.cjs` publica producto equivalente al inline ST-001 y un control negativo; `shopper-workflows.cjs` recorre búsqueda → detalle → carrito, cambia cantidad, recarga y elimina en 360/768/1440. | Cerrada: 12 grupos comprador; 3 recargas por ancho. Invariantes finales verifican ambos modelos Pedido/PedidoEcommerce, ventas, stock y reservas intactos; puertos y DB eliminados. `tests/e2e/catalog.e2e.ts` sigue siendo POS y no se usa como evidencia de comprador. |

Los checks publicados citados conservaron su evidencia inicial de `1178dbb`; la comprobación final de tienda y teclado observó `323bf8c`. No todos los resultados corresponden a una sola corrida. Los recorridos no modificaron
pedidos, stock ni correos. SDKs simulados, pruebas locales y resultados de build
no certifican proveedores reales, biometría, sonido o comportamiento físico de
cada teléfono. No se declara el producto terminado al 100 %.


### Evidencia de ejecución local con datos desechables

`docs/testing/shopper-e2e-2026-10-18.md` registra 22 grupos reales (12 comprador,
8 recuperación, 2 teclado de cuenta) y la verificación de invariantes. Next usa
`NODE_ENV=production`; la API conserva `test`. Un error React 418 observado en
una pasada anterior permanece registrado: corregida esa inconsistencia del
harness, no reapareció en 18 recargas de dos pasadas. No se afirma una causa raíz
ni una corrección de fuente para ese evento.
