# web-superadmin

Panel de la **plataforma GaesSoft** (super-administración del SaaS). NO es el back-office de un negocio (eso es `web-admin`); aquí se opera la plataforma completa: métricas cross-tenant, cobranza, auditoría y el equipo de GaesSoft.

- **Stack**: Vite + React + Tailwind (design system `gx-*`), acento índigo para distinguirlo del back-office.
- **Auth**: password + **2FA TOTP obligatorio** (primer login enrola con QR; los siguientes piden el código). Roles: `superadmin` (todo), `support`, `billing`.
- **Puerto dev**: 5176.

## Probar en local

1. API arriba: `FISCAL_PROVIDER=mock RECARGA_PROVIDER=mock pnpm dev:api`
2. Sembrar el admin inicial (idempotente): `pnpm db:seed` → crea `admin@gaessoft.local` / `ChangeMe!2026` (rol superadmin, **sin** 2FA; el primer login lo enrola).
3. `pnpm --filter @gaespos/web-superadmin dev` → http://localhost:5176
4. Login → escanear el QR con Google Authenticator / Authy → código de 6 dígitos.

## Pantallas

| Sección | Endpoint | Qué hace |
|---|---|---|
| Dashboard | `/admin/metrics/dashboard` | MRR por moneda, suscripciones, trials, conversión, churn, alertas |
| Uso en vivo | `/admin/metrics/uso-hoy` | Ventas/GMV de hoy cross-tenant + top negocios |
| Cobranza | `/admin/billing-ops/overview` | KPIs: ingresos hoy, fallos, renovaciones, suspendidos |
| Facturas | `/admin/billing-ops/invoices` | Lista + filtro + **anular** (write-off con motivo → audit) |
| Suscripciones | `/admin/billing-ops/subscriptions` | Lista read-only por estado |
| Auditoría | `/admin/audit` | Log inmutable con filtros actor/acción |
| Equipo | `/admin/team` | CRUD de admins (solo superadmin) + reset password / 2FA |
