# App móvil Negocio — Paridad con el panel web (web-admin)

Objetivo: la app móvil Negocio debe tener las MISMAS funciones que `web-admin`.
Se construye por tandas nativas. Estado por módulo (31 páginas del panel web):

## ✅ Hechas
- [x] Dashboard / Inicio (KPIs, top productos, accesos)
- [x] Ventas (lista + estado)
- [x] Cobros / POS (buscar, carrito, cobrar efectivo) — falta: multipago, cliente, descuentos
- [x] Productos (lista + búsqueda) — falta: crear/editar, precios
- [x] Inventario (ver + ajuste stock)
- [x] Reportes (KPIs + gráfica por día/canal/top)

## ⏳ Pendientes (paridad web)
- [ ] Pedidos (ecommerce: lista, detalle, cambiar estado)
- [ ] Clientes B2C/B2B (lista, alta, detalle)
- [x] CxC (cuentas por cobrar: resumen, abonos, condonar/incobrable) — cuentas por cobrar / fiados (saldos, abonos)
- [x] Devoluciones (lista, aprobar con metodo reembolso, rechazar)
- [x] Compras (OC: lista, detalle, autorizar, recibir, cancelar)
- [ ] Cobros avanzados (link de pago, multipago)
- [x] Precios (listas: ver, detalle, crear)
- [ ] Inventario Insights (rotación, sugerencias)
- [x] Promociones (lista + activar/pausar/archivar)
- [x] Monedero (gift cards: emitir, cancelar)
- [x] CFDI/Facturacion (emitidos: lista, cancelar SAT)
- [x] Contabilidad (CFDIs recibidos, categorizar, auto, DIOT)
- [x] Comisiones (reglas: ver, eliminar)
- [x] Reseñas (moderar aprobar/rechazar, responder)
- [x] Preguntas (responder, rechazar)
- [x] Envios (tarifas, zonas, pickup: vista)
- [ ] Etiquetas (impresión)
- [x] Tienda (config: activa, subdominio, publicados)
- [ ] Dominio B2B
- [x] Usuarios y Roles (usuarios: activar/roles; roles: ver)
- [x] Seguridad (2FA: activar/desactivar/regenerar respaldo)
- [x] Configuracion (tope de descuento)
- [ ] Suscripción / Billing
- [ ] Automatizaciones (flows)
- [ ] Importador (carga masiva)
- [ ] Guía de inicio / Ayuda (manual)

## Notas
- Cada módulo reusa el kit UI en `apps/mobile-negocio/src/ui` + `theme.ts`.
- Gating por permisos en cada tab/acción (helper `puede`).
- Se rebuildeará el APK por tandas. Ver [[project_gaes_pos_movil_eas_builds]].
