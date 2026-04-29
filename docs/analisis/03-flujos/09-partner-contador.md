# GaesSoft POS — Flujo Partner Contador (Flujo 9 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_partner_contador.md`
> **Descripción:** Programa de partners + despacho contable integrado — el contador como canal de distribución

Flujo 9 (Partner Contador) aprobado por Gaby completo. Combina programa de partners (estilo PartnerStack) + despacho contable integrado. Modelo único MX: contador es canal + cliente del producto.

**Doble rol del partner contador:**
1. **Reseller** — refiere GaesSoft a sus clientes y cobra **25% recurring lifetime** sobre la suscripción
2. **Despacho contable** — usa GaesSoft para llevar la contabilidad de esos mismos clientes (relación tenant padre-hijo)

Un contador puede ser solo (1), solo (2), o ambos. La mayoría harán **ambos**.

**Aplicación al programa:** form con cédula profesional, RFC despacho, años experiencia, referencias. Aprobación curada manual primeros 50 partners (Gaby pone cara/calidad), luego automático con validación cédula + entrevista video corta.

**Pantalla principal del partner:**
- KPIs del mes: comisión generada, clientes activos, nuevos firmados, visitas a página
- KPIs lifetime: clientes referidos totales, MRR acumulado, comisión MRR (25%), total cobrado de por vida
- Acciones rápidas: links, referidos, despacho contable, pagos, materiales, soporte
- 💡 Oportunidades IA: clientes cerca de límite plan (sugerir upsell), bonos por lealtad, alertas de churn

**Sistema de referidos — links únicos:**
- Link general: `gaessoft.com/r/MARGARITA`
- Links por vertical (mejor conversión): `/r/MARGARITA-retail`, `/r/MARGARITA-vet`, etc.
- QR generado, compartible WhatsApp
- Cupones personalizados con nombre del partner (descuento al cliente, partner pierde algo de comisión proporcional)
- UTM tracking
- **Atribución first-touch con cookie 30 días** (decisión cerrada — más justo que last-touch de PartnerStack)
- Comisión sobre TODO lo recurrente (incluye add-ons: créditos AI, sucursales extra, paquetes WhatsApp). NO sobre one-time setup.

**Mis referidos (lista de clientes):**
- Estado, plan, fecha firma, comisión mensual, total cobrado lifetime
- 🤖 Riesgo de churn detectado por IA (uso bajo, problemas, pagos demorados)
- Sugerencia IA de acción ("llamarle, capacitar de nuevo")
- Si cancela → motivo + opción "Reactivar (oferta)"
- **Lifetime garantizado**: si cliente cambia de contador en el sistema, partner original sigue cobrando

**Comisiones y pagos:**
- Frecuencia mensual (día 1) default, configurable
- Mínimo payout $500 MXN (acumula si menor)
- Métodos: Transferencia SPEI default MX, Stripe Connect partner conecta su Stripe, PayPal internacional, Crédito GaesSoft (aplica a su propia suscripción)
- CFDI de comisiones emitido por GaesSoft a nombre del despacho del partner

**Vista despacho contable — gestión tenants hijos:**
- Vista consolidada de los negocios que el contador lleva
- Resumen por cliente: ventas mes, IVA por declarar, fechas vencimiento, alertas
- Resumen global: ventas totales (todos), IVA por declarar total, pagos provisionales pendientes, errores a revisar
- Click "Entrar a su sistema" → impersonation con permisos contables (lectura default + edición con autorización del cliente)
- Vista contable: ventas, gastos, facturas emitidas/recibidas
- Generar pólizas contables IA-asistidas
- Conciliación bancaria
- **V1**: exportar a CONTPAQi/Aspel/Bind Cloud con formatos XLS estándar
- **V2**: conectores nativos (requieren acuerdos formales)
- Reportes fiscales: DIOT, declaración mensual IVA, pago provisional ISR
- Subir CFDIs recibidos del cliente; V2 scraping automático SAT
- Cliente debe AUTORIZAR al contador desde su lado (consentimiento explícito) + auditoría

**IA específica despacho contable:**
- Auto-categorización de gastos al recibir CFDIs
- Conciliación bancaria inteligente (matching automático)
- Generación de pólizas en formato del software contable
- Alertas fiscales ("80% gasto en una cuenta — revisar")
- Resumen ejecutivo del mes para entregar al cliente

**Niveles de partner (estilo HubSpot):**
- 🥉 Bronze (1+ cliente): 25% comisión, materiales básicos
- 🥈 Silver (5+ clientes): + cupones personalizados, soporte priority
- 🥇 Gold (10+ clientes): + branding suave (logo footer), capacitación 1:1 mensual
- 💎 Diamond (25+ clientes): + branding completo (subdominio propio `margarita.gaessoft.com`), evento partner anual, comisión 30% en nuevos referidos

**Branding/white-label (Gold+):** logo del despacho en footer del portal de sus clientes, color, subdominio (Diamond), firma email, página landing personalizada, mensaje "atendido por CPC X" en soporte.

**Materiales de venta (kit del partner):** PowerPoint, demo video, one-pager por vertical, plantillas (cotización, email, WhatsApp), comparativa vs Eleventa/BindERP, curso online "Cómo vender GaesSoft", webinars mensuales con Gaby, casos de éxito.

**Reportes/analytics del partner:** pipeline (visitas → demos → cotizaciones → firmados), conversion por vertical, LTV de cada cliente referido, comisión proyectada 12m, comparación anonimizada vs otros partners ("top 10% por conversión").

**Permisos:** partner.dashboard.read, partner.referidos.read/detalle, partner.comisiones.read, partner.payouts.gestionar, partner.cupones.crear, partner.materiales.descargar, despacho.tenants.gestionar, despacho.tenant.impersonar (con autorización + log), despacho.contable.exportar, branding.editar (Gold+), subdominio.configurar (Diamond).

**Decisiones cerradas Q&A final:**
- Aprobación curada primeros 50 partners, automático después
- Atribución first-touch con cookie 30 días (NO last-touch)
- Multi-nivel sub-partners: NO V1 ni V2 (riesgo MLM, daña marca)
- Comisión sobre add-ons recurrentes: SÍ. Sobre one-time setup: NO
- Exportación contable: V1 XLS, V2 conectores nativos CONTPAQi/Aspel
- Cliente cambia de contador: partner original sigue cobrando lifetime

**Diferenciador masivo vs PartnerStack:** PartnerStack y similares son SOLO programa de referido. GaesSoft Partners = programa referido + despacho contable integrado + branding + capacitación + IA contable. Modelo único MX donde contador es canal + cliente del producto. Multiplica la velocidad de adquisición de tenants.

**Why:** Los contadores conocen a TODOS los negocios de su zona. Es la fuerza de ventas natural de un POS B2B en MX. Si lo armamos bien, son la diferencia entre vender 50 tenants/año vs 500. Los 2 contadores que Gaby tiene esperando son el seed del programa.

**How to apply:** En backend, modelar `partners`, `partner_referrals`, `partner_commissions`, `partner_payouts` en master DB. Tenants padre-hijo con `parent_partner_id`. Auth y permisos del partner separados del tenant. En frontend, app `apps/partners-portal` separada con dashboard del partner.
