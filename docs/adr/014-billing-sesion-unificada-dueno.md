# ADR 014 — Billing self-serve del tenant: sesión unificada del dueño

**Fecha:** 2026-07-03
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

Los endpoints `/billing/*` (me, invoices, payment-methods, change-plan) usan `authenticateAdminTenant` (token `kind: "admin_tenant"`, emitido en `/auth/admin-tenant/login` con las credenciales del owner creadas en el signup). Es un login DISTINTO del RBAC con el que se entra a web-admin (`/auth/tenant/login`). Este split ya confundió a Gaby una vez (gotcha documentado en superadmin) y bloqueaba la sección "Mi suscripción" dentro de web-admin (TIER A #5): habría exigido un segundo login.

## Decisión

**Sesión unificada del dueño**: el token RBAC del dueño del tenant (rol con permiso `*`) también es válido para `/billing/*` de SU tenant.

- El guard de billing acepta dos credenciales: (a) token `admin_tenant` (se conserva, nada existente se rompe), o (b) token RBAC de tenant cuyo usuario tenga rol `*` — se resuelve el `tenantId` del propio token, nunca de parámetros.
- web-admin agrega la sección **"Mi suscripción"** usando la sesión que ya tiene.
- El cobro subyacente sigue **MOCK** (`mockCobrar`) hasta que Gaby entregue llaves Stripe/Conekta — el flujo de UI/estados es real.

## Alternativas consideradas

- **A) Sesión unificada dueño** ← elegida
  - ✅ Un solo login para el dueño; cero fricción
  - ✅ No rompe el token `admin_tenant` existente (superadmin/scripts lo siguen usando)
  - ✅ Autorización clara: solo rol `*` ve billing, empleados no
- **B) Portal billing separado con login `admin_tenant`**
  - ❌ Dos logins para la misma persona (ya causó confusión real)
- **C) Posponer**
  - ❌ El signup público ya existe (TIER A #4); sin "Mi suscripción" el SaaS self-serve queda cojo

## Consecuencias

- Guard nuevo `authenticateBillingOwner` (acepta ambos tokens); endpoints `/billing/*` migran a él.
- Riesgo controlado: un empleado con rol amplio pero ≠ `*` NO accede; tests deben cubrirlo.
- Cuando lleguen las llaves solo se cambia el provider de cobro, no el auth.
