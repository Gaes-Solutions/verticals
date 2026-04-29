# GaesSoft POS — Alcance V1 (verticales y módulos cerrados)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_alcance_v1.md`
> **Descripción:** Verticales V1, niveles de profundidad, sistema de partners y todas las decisiones de Análisis 2

Verticales V1 cerradas tras Análisis 2 (sesión 2026-04-24). Estrategia = Ruta B (construir solo para verticales con cliente real, no POS universal configurable). Cubre los 5 clientes esperando + el pediatra (sexto caso emergente).

**Verticales V1:**

1. **Retail + Mayoreo B2B** — Cliente: tienda grande tipo Novedades GAES con mayoreo
   - 3 sucursales hoy → multi-sucursal V1 (no opcional)
   - Variantes (talla×color×material)
   - Listas de precios multi-nivel (Plata/Oro/Platino) **Y** por cliente individual (ambos)
   - Crédito B2B con plazos (15/30/60 días)
   - Ecommerce público desde día 1
   - Órdenes de compra a proveedor
   - Comisiones a vendedoras

2. **Abarrotes** — Cliente: tienda de la esquina
   - Balanza integrada
   - Productos a granel / por peso
   - Fiados informales
   - Recargas tiempo aire
   - Cobro ultrarrápido

3. **Salud — Vet + Medicina humana** — Clientes: veterinaria + pediatra
   - **Veterinaria Nivel 3 completo**: expediente clínico, cartilla de vacunación, citas, recetas, recordatorios WhatsApp, lotes/caducidad medicamentos, **hospitalización (cama virtual + medicación programada + signos vitales), laboratorio (órdenes y resultados), imagenología (subir/ver radiografías DICOM)**
   - **Medicina humana**: misma vertical con sub-tipo "humana", expediente clínico de pacientes, citas, recetas, recordatorios
   - **Portal público GaesSoft Salud Plus tipo Doctoralia**: marketplace de profesionales (vet + médicos), búsqueda por especialidad/ciudad, reserva online sin login, reseñas, confirmaciones WhatsApp, pago en línea (anticipo/completo), SEO por especialidad+ciudad
   - 90% del código compartido entre vet y humano; sub-tipo activa lo específico

4. **Despacho contable + Canal de Partners** — Clientes: 2 contadores
   - **Despacho contable (escenario A)**: el contador usa GaesSoft para llevar a SUS clientes (multi-tenant gestionado por contador, tenants padre-hijo, contador ve agrupado a todos sus clientes contables)
   - **Canal de Partners (escenario B)**: contadores como revendedores → fuerza de ventas natural (conocen TODOS los negocios de su zona)
   - **Comisión: 25% del MRR del cliente referido, recurrente de por vida** (estándar SaaS B2B)
   - Dashboard de partner: MRR de referidos, comisiones acumuladas, payout mensual
   - Branding personalizado: contador con su logo en portal de sus clientes (white-label suave)
   - Códigos de referido únicos + links trackables
   - Payouts automáticos (Stripe Connect / transferencia / PayPal)

**Implicaciones arquitectónicas confirmadas:**
- Multi-sucursal desde V1 (todas las tablas con `sucursal_id` cuando aplica)
- Sistema de Partners en master DB: `partners`, `partner_referrals`, `partner_commissions`, `partner_payouts`
- Tenants padre-hijo: relación parent_tenant_id en master para que contadores gestionen tenants de sus clientes
- Listas de precios sofisticadas: multi-nivel + per-cliente + per-sucursal
- Vertical Salud unificada con sub-tipo (vet | humana)
- Portal público (Doctoralia-like) es app separada (Next.js) en el monorepo

**Verticales V2 (post-lanzamiento):** Restaurantes (mesas, comandas, KDS, modificadores), Talleres (órdenes de servicio, garantías), Farmacia humana (recetas controladas)

**Verticales V3:** Multi-marca dentro de un cliente, Franquicias, ERP avanzado, integración con sistemas contables externos (CONTPAQi/Aspel)

**Why:** Con este alcance V1 cubrimos a los 6 negocios reales que ya están esperando + nos diferenciamos profundamente del mercado. Eleventa cubre solo retail; nadie cubre Salud Nivel 3 + canal de partners contadores en un mismo producto en el rango de precio MXN. Es el sweet spot competitivo de Gaby. Confirmado por Gaby explícitamente: "no voy a elegir lo más fácil" / "estamos desarrollando esto, debe quedar bien".

**How to apply:** Cuando se diseñen schemas, módulos, gating de planes y UI, asumir que estas verticales y profundidades están dentro del alcance V1. No proponer recortes para "MVP mínimo".
