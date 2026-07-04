# ADR 013 — Auth del Portal Partner: email + password + 2FA TOTP

**Fecha:** 2026-07-03
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

El modelo `Partner` (master DB) tiene `emailContacto` único pero SIN credenciales; todos los endpoints `/partners/*` son admin-facing (`authenticateAdmin`). Para un portal self-serve del partner contador (ver flujo 9) se necesita autenticación partner-facing nueva. Estaba bloqueado en la bitácora del loop de verticales (TIER A #2).

## Decisión

**Email + password + 2FA TOTP opcional**, igual que admin y usuarios de negocio:

- Flujo de alta: el superadmin registra al partner → se envía **invitación por email** con token de un solo uso → el partner define su password → login normal.
- JWT con `kind: "partner"` (paralelo a `admin`, `admin_tenant`, `patient`).
- 2FA TOTP **opt-in** reusando la infraestructura existente (secret TOTP + recovery codes de un solo uso).
- Endpoints partner-scoped: `/partner/me`, `/partner/referrals`, `/partner/commissions`, `/partner/payouts`.

## Alternativas consideradas

- **A) Email + password + 2FA** ← elegida
  - ✅ Consistente con el resto del sistema (misma infra TOTP/recovery ya probada)
  - ✅ No depende del proveedor de email para cada login
  - ✅ Los partners son usuarios recurrentes (dashboard de comisiones mensual): password amortiza
  - ❌ Requiere flujo invitación/set-password (una vez)

- **B) Magic link**
  - ✅ Sin password que olvidar
  - ❌ Depende 100% de Resend en cada login (hoy mock en dev)
  - ❌ Patrón auth nuevo en el sistema — más superficie
  - ❌ Peor para sesiones frecuentes

- **C) Posponer portal**
  - ❌ El programa de partners es canal de venta clave (25% lifetime); el portal es su cara

## Consecuencias

- Migración master: credenciales de partner (`passwordHash`, `invitacionToken`, `invitacionExpiraAt`, campos 2FA) — aditiva.
- `authenticatePartner` nuevo en el API; ningún endpoint existente cambia.
- El envío de invitación usa el plugin email mock-first existente.
