# GaesSoft POS — Modelo de negocio (cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_modelo_negocio.md`
> **Descripción:** Tiers, pricing, billing, idiomas, WhatsApp y ecommerce — decisiones cerradas tras Análisis 1

Decisiones cerradas en sesión 2026-04-24 para el SaaS GaesSoft POS:

**Tiers y pricing:**
- Starter: $399 MXN / $24 USD por mes — 1 sucursal, 2 usuarios, 500 productos, POS+Inventario+Clientes+Caja+Dashboard, 1k ventas/mes
- Pro: $799 MXN / $49 USD por mes — 3 sucursales, 10 usuarios, productos ilimitados, +Apartados+CxC+Cotizaciones+Comisiones+Reportes+Excel+PDFs+Catálogos, 5k ventas/mes, ecommerce básico (catálogo+carrito+pedidos), WhatsApp transaccional 500 msgs incluidos
- Business: $1,499 MXN / $89 USD por mes — sucursales y usuarios ilimitados, +pagos online (Stripe/Conekta)+integración paqueterías+WhatsApp marketing 2k msgs+app desktop offline+API+dominio propio del cliente, 20k ventas/mes
- Enterprise: desde $3,499 MXN / $199 USD por mes — multi-marca, white-label, SLA, servidor dedicado opcional

**Add-ons consumo:**
- Sucursal extra Pro: +$199/mes
- Usuario extra Starter/Pro: +$49/mes
- 100 facturas CFDI: $99 MXN (margen sobre Facturama ~$0.50/timbre)
- 1,000 mensajes WhatsApp: $299 MXN
- Storage extra 10 GB: $99/mes
- API access en planes <Business: +$299/mes

**Otros ingresos:** Onboarding $1,500 una vez, capacitación $500/hr, hardware con margen, customización por cotización

**Billing:**
- Trial 14 días Pro **con tarjeta** (filtrar basura, estándar SaaS)
- Cobro mensual o anual (anual con 2 meses gratis = 17% off)
- Stripe (internacional + MX) y Conekta (solo MX, para SPEI/OXXO recurring)
- CFDI automático al cliente desde nuestro Facturama
- Dunning: 3 intentos, suspensión a 7 días mora, borrado a 90

**Internacional:**
- Cobro en MXN y USD
- App multi-idioma desde día 1: mínimo es/en, framework react-i18next, JSON files, productos/categorías con traducción opcional (JSONB), plantillas (tickets/emails/WhatsApp/PDFs) por idioma del tenant

**Estrategia comercial inicial:**
- Aplicar descuento de lanzamiento a los 5 clientes esperando (precio reducido primer año o tier superior a precio de inferior) — ayudan a debuggear y dan testimonios
- Sistema de billing con soporte para coupon codes y price overrides por tenant desde el inicio

**Why:** Decisiones tomadas para ganar margen, escalar internacional y no convertir features comerciales clave (WhatsApp, ecommerce básico, pagos online) en upsell forzado solo del tier más alto. WhatsApp es central, no opcional. Ecommerce básico en Pro empuja Pro como tier estrella; pagos online y paqueterías quedan como diferenciador real de Business.

**How to apply:** Cuando se diseñen tablas de billing, suscripciones, planes, límites por plan, gating de features y pantallas de upsell, usar estas decisiones como verdad. Si Gaby cambia algo, actualizar este memory.
