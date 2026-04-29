# ADR 007 — Stripe Connect Direct Charges sobre Platform Charges en MX

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS facilita que sus tenants cobren a sus clientes finales por:
- Ventas online (ecommerce 4.21)
- Cobros con tarjeta presencial (Stripe Terminal, Análisis 6)
- Pagos diferidos B2B (4.10)
- Honorarios médicos vía marketplace Doctoralia (4.17)

Stripe ofrece tres modelos para este caso:
- **Standard accounts** — tenant tiene su propia cuenta Stripe
- **Express accounts** — onboarding asistido por GaesSoft, cuenta Stripe ligada
- **Custom accounts** — GaesSoft controla todo, máxima flexibilidad

Y dos modelos de cargo:
- **Direct Charges** — el cargo se hace directamente a la cuenta del tenant; GaesSoft toma fee
- **Platform Charges** — el cargo se hace a GaesSoft, GaesSoft transfiere al tenant

México tiene regulación específica de "money transmitter" / instituciones de tecnología financiera (Ley Fintech 2018) que aplica si una entidad **recibe fondos** de un tercero para entregarlos a otro.

## Decisión

**Stripe Connect con Direct Charges V1** + cuentas **Standard** (tenant abre su propia cuenta Stripe). GaesSoft cobra fee como `application_fee_amount` en cada cargo.

**Conekta** como alternativa para tenants que prefieren cobertura MX nativa (OXXO Pay, SPEI). Tenant elige Stripe O Conekta O ambos.

**V2+:** evaluar Platform Charges si se justifica con compliance (registrar a GaesSoft como ITF, costo y proceso de meses).

## Alternativas consideradas

- **A) Platform Charges + Custom accounts**
  - ✅ Control total sobre split, refunds, disputes
  - ✅ Onboarding tenant más fluido (GaesSoft maneja KYC)
  - ❌ **GaesSoft recibe fondos del cliente final → ITF / money transmitter en MX**
  - ❌ Requiere registro CNBV como Institución de Tecnología Financiera (proceso 6-18 meses, costo legal alto)
  - ❌ Riesgo regulatorio si se opera sin licencia

- **B) Direct Charges + Express accounts**
  - ✅ Onboarding asistido (Stripe maneja KYC, GaesSoft solo redirige)
  - ❌ Express en MX limitado (no todas las features disponibles)
  - ❌ Tenant tiene menos control (no puede usar Stripe Dashboard completo)

- **C) Direct Charges + Standard accounts** ← elegida
  - ✅ Tenant abre su propia cuenta Stripe (KYC propio, dashboard completo)
  - ✅ **GaesSoft NO recibe fondos** → fuera del scope de regulación ITF
  - ✅ Fee de GaesSoft transparente (`application_fee_amount`)
  - ✅ Disputes y refunds responsabilidad del tenant (lógico legalmente)
  - ⚠️ Onboarding tenant requiere paso "conectar tu Stripe" (mitigado: link Stripe OAuth en wizard inicial)
  - ⚠️ Tenants sin cuenta Stripe deben crearla (Stripe MX disponible 2024+)

## Consecuencias

- ✅ GaesSoft NO requiere licencia ITF en MX V1 (huge win regulatorio)
- ✅ Tenants con control total de su Stripe (refunds, payouts, disputes)
- ✅ Webhook único `/webhooks/stripe` con HMAC + enrutamiento por header `account`
- ✅ Conekta como segunda opción cubre OXXO Pay (común MX) + SPEI
- ⚠️ Onboarding tenant tiene paso adicional (conectar Stripe) — mitigado con wizard
- ⚠️ Reportes consolidados requieren agregar fees por tenant via webhook events
- 🔁 V2+: si crecemos y se justifica, registrar GaesSoft como ITF → Platform Charges con más control (timeline 12+ meses, costo legal $200K-500K MXN)

## Referencias

- Análisis 7 — Integraciones, sección Stripe
- Análisis 4.1 — Tenants y Billing
- Memoria: `project_gaes_pos_analisis_7_integraciones.md`
- Ley Fintech MX 2018 — referencia regulatoria
- Pattern referenciado: Shopify Payments (variantes por país), Square (no opera MX directo)
