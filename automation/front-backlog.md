# Backlog priorizado del storefront

El ciclo autónomo toma siempre la primera tarea `pendiente`. Solo Codex puede
darla por aprobada después de revisar diff, pruebas, accesibilidad, tenant,
precios y responsive. Si falla, conserva la tarea pendiente para el siguiente
intento.

- [x] ST-001 | Prueba Vitest del catálogo: verifica que una tarjeta publicada muestra su título y enlace de detalle. No agregues E2E ni fixtures externos.
- [x] ST-002 | Galería de producto: miniaturas, cambio de imagen, zoom configurable y fallback de URL rota.
- [x] ST-003 | Catálogo web: estados de carga, vacío, error con reintento y filtros sin perder contexto.
- [ ] ST-004 | Carrito web: revalidar precios e inventario antes de checkout y mostrar cambios claramente.
- [ ] ST-005 | Checkout: evitar doble envío, conservar datos al volver atrás y cubrir pago pendiente/reintento.
- [ ] ST-006 | Móvil cliente: filtros, búsqueda, imagen fallback, precio promocional y carrito con resumen completo.
- [ ] ST-007 | Accesibilidad: labels, foco visible, navegación por teclado y botones táctiles en pantallas críticas.
- [ ] ST-008 | Rendimiento storefront: lazy images, tamaños estables, errores de red y revisión de bundle.
- [ ] ST-009 | E2E de recuperación de contraseña y carrito abandonado con estados expirado, inválido y exitoso.
- [ ] ST-010 | Limpieza final: resolver advertencias de lint del storefront sin relajar reglas.
- [ ] ST-011 | Completar E2E del comprador: búsqueda, detalle, carrito y responsive 360/768/1440 sobre el fixture de ST-001.
