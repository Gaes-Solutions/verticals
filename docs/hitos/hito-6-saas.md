# Hito 6 — Negocio SaaS (registro público + billing)

> **Estado:** 🚧 EN CURSO · **Núcleo billing self-serve** (6.a/6.b/6.c/6.d) ✅
> **Análisis:** [Modelo 4.1 Tenants/Billing](../analisis/04-modelo-datos/4.1-tenants-billing.md) · [Modelo de negocio](../analisis/01-modelo-negocio.md) · [Flujo 10 Superadmin](../analisis/03-flujos/10-superadmin.md)

## Objetivo del Hito 6

Convertir GaesSoft en un SaaS que **se vende solo**: cualquier negocio entra a la web, se registra, pasa un trial de 14 días, le cobramos automáticamente y queda facturando. Es la gate de comercialización — sin esto Gaby tiene que registrar tenants a mano para los 5 pilotos.

## Decisión de arranque (confirmada 2026-05-28)

**Núcleo V1 = registro público + billing core**:
- Schema expandido (Tenant + Subscription + Invoice + Coupon + PlanFeature + PlanPrice + TenantUserAdmin separado)
- 4 planes seed con precios MXN+USD + features (Starter/Pro/Business/Enterprise)
- Signup público (`/auth/signup`) crea tenant + admin + trial 14d
- Lifecycle: trial → cobrar default PM → active. Si falla → past_due → dunning (1/3/7 días) → suspended
- Cupones con prorrateo Stripe-style en upgrade
- CFDI uuid stub al pagar (timbrado real Facturama diferido a hardening)

**Difiere a fase 2 / V1.5**:
- Admin panel `apps/admin-gaessoft` (Next.js separado con observabilidad, métricas MRR/ARR, impersonation, soporte IA, etc.)
- CFDI timbrado real vía Facturama (V1 solo guarda `cfdi-mock-{uuid}`)
- Tenants padre-hijo despacho contable (schema listo: `parentTenantId`; ops dedicadas pendientes)
- Multi-currency USD cobro activo (precios seed listos, lifecycle ya genérico, pero validar flujos USD reales pendiente)
- IA: health score, onboarding asistido, sugerencia upsell, sentiment tickets
- Dunning real con Stripe webhooks (V1 = worker in-process determinista)
- Dominios custom + SSL (`tenant_domains` schema diferida)
- Tiers/loyalty internos del partner program ya están (Hito 3.5); aquí solo se respeta `partnerId` al signup

## 6.a Schema billing master + seed planes ✅
- [x] `Tenant` expandido: legalName, rfc, vertical (enum: retail_mayoreo/abarrotes/salud_vet/salud_humana/despacho_contable/otro), country, currencyDefault, languageDefault, timezone, parentTenantId, partnerId, partnerAttributedUntil, trialEndsAt, onboardingCompletedAt, healthScore, metadata, deletedAt
- [x] `TenantStatus` extendido: trial/active/past_due/suspended/unpaid/cancelled/archived
- [x] `Plan` extendido: tierOrder, isPublic + relations a PlanFeature/PlanPrice/Subscription
- [x] Nuevos: `PlanFeature` (gating dinámico), `PlanPrice` (multi-currency × intervalo), `Subscription`, `SubscriptionItem`, `Invoice`, `InvoiceItem`, `InvoicePayment`, `PaymentMethod`, `Coupon`, `CouponRedemption`, `TenantUserAdmin` (separado de `usuarios` del tenant), `TenantSettingsMaster`
- [x] Migration `add_billing` master
- [x] Seed 5 planes (free + 4 públicos: starter/pro=growth/business=scale/enterprise) con PlanPrice MXN+USD monthly+yearly + PlanFeature (límites + flags por feature_key)

## 6.b Auth admin tenant + registro público + endpoints billing ✅
- [x] JWT kind `admin_tenant` + `authenticateAdminTenant` decorator + `AdminTenantPrincipal` (tenantId/tenantSlug/roleAdmin owner|billing_only|viewer)
- [x] `POST /auth/signup` (público, rate-limited): crea Tenant (status=trial, trialEndsAt=+14d) + provisiona schema + TenantUserAdmin (owner primary) + TenantSettingsMaster + Subscription (trialing) + asocia cupón si aplica. Devuelve JWT admin_tenant
- [x] `POST /auth/admin-tenant/login` con email+slug+password
- [x] `GET /billing/me` (admin_tenant): contexto completo tenant + plan + features + subscription + payment methods
- [x] `GET /billing/invoices` con items + payments
- [x] `POST /billing/payment-methods` (mock: card/oxxo/spei/manual; setDefault)
- [x] `POST /billing/subscription/coupon` valida y redime cupón
- [x] `POST /billing/subscription/change-plan` con **prorrateo Stripe-style** en upgrade (calcula diff por días remanentes); downgrade explícitamente 400 V1
- [x] `POST /billing/webhook` (mock, sin auth): confirma invoice → genera CFDI uuid + activa subscription
- [x] `POST /admin/billing/run-trial-conversions` (admin GaesSoft): scan subscriptions trialing vencidas → genera invoice ciclo + intenta cobro → active|past_due
- [x] `POST /admin/billing/run-dunning` (admin GaesSoft): scan invoices open vencidas → siguiente intento según calendario 1/3/7d → tras 3 fallos suspende tenant
- [x] `POST /admin/billing/mock-set-failures` (dev/demo): inyecta N fallos en cobro mock de un payment method para test/demo

## 6.c Paquete @gaespos/billing + worker dunning + CFDI stub ✅
- [x] `@gaespos/billing` (lógica pura, 14 tests):
  - `calcularProrrateo` Stripe-style (newDailyRate − oldDailyRate) × daysRemaining
  - `aplicarCupon` percent/fixed con clamp 0..100 y no-negativo
  - `siguienteDunning` calendario fijo [1,3,7] días → tras `DUNNING_MAX_ATTEMPTS` → suspend
  - `siguientePeriodo` monthly/yearly advance
  - `formatInvoiceNumber` formato `INV-YYYY-NNNNNN`
- [x] Worker `correrTrialConversions` in-process (paralelo al patrón `procesarColaEnvios` de marketing)
- [x] Worker `correrDunningCiclo` in-process
- [x] CFDI uuid stub `cfdi-mock-{uuid}` al pagar invoice (Facturama real diferido)
- [x] Mock charge controlable por `setMockChargeFailures(pmId, n)` para test/demo determinista

## 6.d Tests integración + demo SaaS onboarding ✅
- [x] **12 tests** integración (`billing.test.ts`):
  - signup público crea tenant trial + admin owner + subscription trialing
  - signup slug duplicado → 409
  - login admin tenant credenciales válidas
  - `GET /billing/me` devuelve contexto con plan + features
  - agregar payment method default
  - aplicar cupón a subscripción
  - upgrade starter→pro genera invoice prorrateada con amount>0
  - downgrade rechazado V1 con 400
  - vencimiento trial → conversión cobra default PM + CFDI mock emitido
  - subscription queda `active` y tenant `active`
  - invoice paid tiene `cfdi-mock-{uuid}`
  - webhook mock confirma invoice (otro upgrade)
  - dunning 3 fallos consecutivos → invoice `uncollectible`, subscription `unpaid`, tenant `suspended`
- [x] Demo `demo-saas-onboarding.ts` (`pnpm --filter @gaespos/api demo:saas-onboarding`): 8 pasos contra API live — cupón → signup → tarjeta → upgrade prorrateado ($400) → trial vence → conversión + CFDI → upgrade + webhook ($700) → dunning 3 intentos → SUSPENDED. **Verde end-to-end.**

## Performance budgets
- Signup público: <500ms P95 (incluye provisión schema tenant)
- Cobro invoice mock: <100ms P95
- Worker dunning (lote 100 invoices): <2s P95
