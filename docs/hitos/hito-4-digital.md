# Hito 4 — Digital y marketing

> **Estado:** En curso · **4.1 Ecommerce ✅ CERRADO (2026-05-26, incl. primer frontend Next.js)** · **Sub-hito activo:** 4.2 Marketing
> **Análisis:** [4.21 Ecommerce](../analisis/04-modelo-datos/4.21-ecommerce.md) · [4.18 Promociones/Marketing](../analisis/04-modelo-datos/4.18-promociones-marketing.md) · [4.17 Portal Doctoralia](../analisis/04-modelo-datos/4.17-portal-doctoralia.md) · [Flujo 7 Paciente portal](../analisis/03-flujos/07-paciente-portal.md) · [Análisis 7 Integraciones](../analisis/07-integraciones.md)

## Objetivo del Hito 4

Capa digital de cara al cliente final: tienda online, marketing multicanal y portal público de salud. Es el primer hito con **frontend real** (Next.js) además del backend.

Cierre del Hito 4 = tienda online operativa + campañas WhatsApp/email + Doctoralia funcional.

## Decisiones de arranque (confirmadas con Gaby 2026-05-26)

- **Orden**: Ecommerce primero (4.1), luego Marketing (4.2), luego Doctoralia (4.3), luego Portal paciente (4.4).
- **Frontend**: la tienda se construye como **Next.js real** (`apps/web-tienda`) — primer frontend del proyecto.
- **Integraciones externas**: **mock adapters V1** (mismo patrón que `@gaespos/fiscal`/`recargas`/`ai`): interface + MockProvider determinista + cliente real stub. Aplica a WhatsApp Cloud, Twilio SMS, Daily.co, pagos (Stripe/Conekta).
- **Email**: **Resend** (transaccional + campañas) con React Email para plantillas.

## Orden sub-hitos

| Sub-hito | Pieza | Modelo | Razón orden |
|----------|-------|--------|-------------|
| **4.1** | Ecommerce + tienda Next.js | 4.21 | Lo más tangible, reusa productos/inventario/precios. Primer frontend. |
| 4.2 | Marketing (promos + RFM + campañas) | 4.18 | Backend, reusa clientes/ventas. Alimenta recovery de carrito abandonado de 4.1. |
| 4.3 | Doctoralia + telemedicina | 4.17 | Portal público médicos cross-tenant + Daily.co + reseñas portables. |
| 4.4 | Portal paciente | Flujo 7 | PHR unificado + marketplace + telemedicina + gestión familiar. |
| 4.5 | Demo Hito 4 | — | Tienda online + Doctoralia + campañas WhatsApp end-to-end. |

---

## 4.1 Ecommerce (Modelo 4.21)

**Decisión clave del análisis**: `pedidos_ecommerce` ≠ `ventas`. Al confirmar pago, el pedido ecommerce genera una `Venta` (canal=ecommerce) con vínculo bidireccional. Ciclo de vida ecom (recibido→pago_confirmado→preparando→enviado→en_camino→entregado/recogido) no contamina el modelo de ventas POS.

### 4.1.a Schema ecommerce tenant + migration
- [x] `ConfigTiendaEcommerce` singleton — activa, subdominio, nombre/lema/SEO, idiomas, branding override, monedas, paisesEnvio, políticas HTML, whatsappWidget, tags GA4/Meta, modo [b2c|b2b_only] V1, mostrarInventarioPublico+buffer, guestCheckout, requiereAprobacionClienteNuevo
- [x] `ProductoPublicado` — subset de Producto (4.7) con tituloPublico/slugSeo, descripciones markdown, meta SEO, fotosArray, videoUrl, precioPublicoOverride+precioPromocion+vigencia, atributosPublicos JSONB, tags, rankingScore, destacadoHome, nuevo (auto <30d), agotado auto, relacionados/cross-sell
- [x] `CategoriaPublica` — árbol distinto del POS interno + slug SEO
- [x] `ProductoTraduccion` schema desde V1 (UI editor V2)
- [x] `CarritoEcommerce` — sessionIdAnonimo (cookie) + clienteId nullable + emailAnonimo + canal [web|mobile|whatsapp] + items JSONB con precioSnapshot + totales + cupones/promos + dirección + métodoEnvío+costo + métodoPago + status [activo|abandonado|convertido|expirado] + abandonadoAt + recordatorio24h/72h + recoveryCodigo (cupón auto) + convertidoAPedidoId + ip/UA/referrer/utm
- [x] `PedidoEcommerce` — folioPublico GP-NNNNNNNN + carritoOrigenId + totales+moneda+TC + cupones snapshot + direccionEnvio/factura snapshot JSONB + requiereFactura+datosFactura + statusPago + paymentIntentId + methodEnvio [paqueteria|click_collect|envio_local] + sucursalPickupId + paqueteria+guiaTracking+costoEnvioReal + statusPedido [recibido|pago_confirmado|preparando|enviado|en_camino|entregado|recogido|cancelado] + ventaIdGenerada + facturaCfdiId + timestamps por estado
- [x] `PedidoEcommerceEvento` — timeline con visibleCliente bool para tracking público
- [x] `ZonaEnvio` (cps/estados incluidos) + `TarifaEnvio` (paqueteria, tipoCalculo [fija|por_peso|por_monto] V1 fija, escalonPeso, montoMinimoEnvioGratis) + `EnvioPedido` (guiaTracking, etiquetaUrl, costoReal vs cobrado, statusExterno, eventosExternos, evidenciaEntrega)
- [x] `ProductoResena` — verificación obligatoria por pedidoId (solo entregado/recogido), rating 1-5, título, comentario, imágenes, moderación IA V1 (reusa `@gaespos/ai`), respuestaTienda, verificadaPorCompra
- [x] `Wishlist` + `WishlistItem` — V1 default "Mi lista", publica bool + slug compartible
- [x] `ConfigPickupSucursal` + `PickupPedido` — click&collect V1 (horario, tiempoPreparacion, requiereId, notificacionListo)
- [x] `SeoConfiguracionTienda` — robots, sitemap, redirects 301, structured_data, verifications, canonical
- [x] Permisos ecommerce: ECOMMERCE_CONFIGURAR, PRODUCTOS_PUBLICAR, PEDIDOS_ECOMMERCE_LEER/GESTIONAR, RESENAS_MODERAR, ENVIOS_GESTIONAR
- [x] Migration `add_ecommerce` cross-tenant

### 4.1.b Backend: catálogo publicado + carrito + checkout + tracking
- [x] `apps/api/.../ecommerce-config/` — PUT config tienda, gestión productos publicados/categorías públicas/SEO
- [x] `apps/api/.../carrito/` — crear/actualizar carrito (anónimo por sessionId o cliente), recalcular totales (reusa motor pricing), aplicar cupón
- [x] `apps/api/.../checkout/` — iniciar checkout → crear PaymentIntent (provider) → webhook confirma → `PedidoEcommerce` pago_confirmado → genera `Venta` canal=ecommerce + descuenta stock + CFDI si requiereFactura → eventos timeline
- [x] `apps/api/.../pedidos-ecommerce/` — listado tenant (gestión), transiciones estado (preparando→enviado→...), tracking público `GET /seguimiento/{folio}?email=` sin auth
- [x] `apps/api/.../resenas/` — crear (valida pedido entregado), moderar IA, responder
- [x] `apps/api/.../wishlists/` — CRUD simple
- [x] Endpoint catálogo público (sin auth, resuelve tenant por subdominio/header): productos publicados paginados + filtros + detalle por slug

### 4.1.c Paquetes adapters: pagos + email
- [x] **`@gaespos/pagos`** — `PaymentProvider` interface (createIntent, confirm, refund, webhook verify) + `MockPaymentProvider` determinista + `StripeClient` stub + `ConektaClient` stub (OXXO Pay/SPEI). Plugin Fastify factory.
- [x] **`@gaespos/email`** — `EmailProvider` interface (send, sendTemplate) + `MockEmailProvider` (captura en memoria para tests) + `ResendClient` stub. Plantillas base (confirmación pedido, envío, recovery carrito).

### 4.1.d Frontend `apps/web-tienda` (Next.js — primer frontend)
- [x] Scaffold Next.js 15 (App Router) + TanStack Query + Tailwind + shadcn/ui, multi-tenant runtime (resuelve subdominio), ISR catálogo 5min
- [x] Páginas V1: home/catálogo (grid), producto (galería+reseñas), carrito (localStorage), checkout (dirección+pago mock), confirmación+seguimiento público. Carrito en localStorage + persiste en DB al checkout.
- [ ] Páginas diferidas a 4.1.g: cuenta cliente (pedidos+wishlist UI) + login/registro cliente + filtros por categoría en catálogo (backend ya listo)

### 4.1.e Tests integración + e2e
- [x] Backend: config tienda, publicar producto, carrito anónimo→cliente, checkout mock pago→pedido→venta+stock+CFDI, tracking público por folio+email, reseña solo si pedido entregado, wishlist, click&collect, RBAC (14 tests verde)
- [ ] Frontend e2e Playwright del flujo comprar — diferido (frontend verificado por build + arranque live + curl al catálogo/producto/carrito en sesión 2026-05-26)

### 4.1.f Diferidos V1.5+
- Cotización automática paqueterías (FedEx/Paquete Express) + generación de guías + label ZPL (V1 = tarifas fijas)
- Reservas inventario al carrito (V1 = buffer + valida al pago)
- Productos digitales, dominio propio, multi-idioma editor UI, modo mixto b2c+b2b

## Performance budgets
- Catálogo público (ISR): TTFB <200ms
- Recalcular carrito: <150ms P95
- Checkout completo (sin pago externo): <800ms P95
