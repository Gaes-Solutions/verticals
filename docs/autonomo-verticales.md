# Bitácora — Loop autónomo de verticales pendientes

Rama: `autonomo/verticales-pendientes` · Base: `origin/main` (b6a23e3, incluye superadmin, NO veterinaria)
Regla: push solo a esta rama, nunca a main. No tocar áreas en vuelo de veterinaria (web-clinical, web-marketplace, salud/*).

## Checklist de verticales

| # | Vertical | Estado | Notas |
|---|----------|--------|-------|
| 1 | Abarrotes (flujo 2 / 4.14) | ✅ hecha | Admin campos balanza+IEPS (c5c71fe) · Ticket IEPS/IVA +fix $NaN (c581828) · Recargas/servicios POS (87b0e26) · Fiado/CxC en cobro (d141730) · Apartados (d89cc81) · Captura de peso/balanza (aa5cdce) |
| 2 | Vendedor mayoreo PWA campo (flujo 3) | ⬜ pendiente | CRM ligero, pedidos offline, firma, gamificación comisiones |
| 3 | Médico humano + Paciente + telemedicina (flujos 6,7) | ⬜ pendiente | pediatría, CFDI exento, marketplace, Daily.co, PHR; SIN IA clínica |
| 4 | Partner Contador / despacho (flujo 9 / 4.12) | 🟡 parcial | Portal partner ⛔ (falta auth, ver BLOQUEADOS). Despacho contable UI ✅ (f3e94f3): CFDIs recibidos + categorización IA + DIOT en web-admin |

Estados: ⬜ pendiente · 🟡 en curso · ✅ hecha · ⛔ bloqueada

## BLOQUEADOS

- **TIER A #5 Checkout/billing del tenant** (⛔ decisión de arquitectura + llaves). Los endpoints `/billing/*` (me, invoices, payment-methods, change-plan) usan `authenticateAdminTenant` (token kind `admin_tenant`, del owner creado en signup), DISTINTO del token RBAC con que entra web-admin (`/auth/tenant/login`). Para una sección "Mi suscripción" dentro de web-admin sin segundo login se necesita decidir: (a) sesión unificada (que el login RBAC del owner también emita/acepte acceso billing), (b) que `authenticateAdminTenant` acepte el token RBAC del owner, o (c) portal de billing separado. Además el cobro real es MOCK (`mockCobrar`), necesita llaves Stripe/Conekta. Un segundo login sería shortcut → mejor decidir con ADR. Se salta.
- **TIER A #2 Portal Partner Contador** (⛔ decisión de arquitectura). El modelo `Partner` (master) tiene `emailContacto` único pero SIN credenciales; NO existe auth partner-facing (todo `/partners/*` es `authenticateAdmin`). Un portal self-serve exige diseñar autenticación de partner nueva: kind `partner` en JWT, password/flujo de invitación-set-password, endpoints partner-scoped (`/partner/me`, `/partner/referrals`, `/partner/commissions`, `/partner/payouts`). Decisión para Gaby: ¿login propio del partner (email+password+2FA como admin) o magic-link, y flujo de alta? Requiere ADR antes de codear. Mientras tanto se salta.

## Progreso TIER A (cross-cutting)
- #1 Abarrotes ✅ · #2 Portal Partner ⛔ (auth) · #3 Despacho contable UI ✅ (f3e94f3)
- #4 Signup SaaS público ✅ (72fef5e): `GET /auth/plans` público + `signupPublico` ahora usa `onboardTenant` (crea dueño RBAC → tenant usable) + pantalla Signup en web-admin. Billing tests 12/12 verdes.
- #5 Checkout/billing tenant ⛔ (split auth + llaves, ver BLOQUEADOS)
- #8 Firma real B2B ✅ (d2e41d4): columna firma_data_url (migración aditiva) + SignaturePad canvas en web-b2b. 33 tests verdes.
- #7 Doctoralia ✅ (1fe4a9e): app nueva apps/web-doctoralia (directorio público — buscador, tarjetas con rating/badges, perfil con bio/ubicaciones/reseñas). Sin auth.
- #6 Portal Paciente ✅ (0446183): app nueva apps/web-paciente (login OTP kind patient, expediente, consentimientos revocar, familia, QR emergencia, export ARCO).
- ✅✅ TIER A CERRADO: 6 construidos, 2 bloqueados por decisión/llaves. Ver RESUMEN FINAL abajo.

## 🏁 RESUMEN FINAL (TIER A cerrado, loop detenido)

**HECHO (6 de 8, todo lo construible sin decisiones/llaves de Gaby):**
- #1 Abarrotes (POS): admin balanza+IEPS, ticket IEPS/IVA (+fix $NaN), recargas/servicios, fiado/CxC, apartados, captura de peso.
- #3 Despacho contable UI (web-admin): CFDIs recibidos + categorización IA + DIOT.
- #4 Signup SaaS público: /auth/plans + signupPublico con onboardTenant (dueño RBAC) + pantalla Signup.
- #7 Doctoralia: app nueva web-doctoralia (directorio público).
- #8 Firma real B2B: columna firma_data_url (migración aditiva) + SignaturePad.
- #6 Portal Paciente: app nueva web-paciente (login OTP, expediente, consentimientos, familia, QR emergencia, export ARCO).

**BLOQUEADO (necesita decisión/llaves de Gaby):**
- #2 Portal Partner Contador ⛔ — falta diseñar auth partner-facing (ADR).
- #5 Checkout/billing tenant ⛔ — split de auth (RBAC vs admin_tenant) + llaves Stripe/Conekta para cobro real.

**LO QUE FALTA DE GABY:**
1. Decidir auth del Partner (para #2).
2. Decidir integración auth billing + dar llaves Stripe/Conekta (para #5, cobro real; hoy es mock).
3. Revisar y mergear la rama `autonomo/verticales-pendientes` a main.
4. Al mergear/deploy: aplicar migración tenant `20260702090000_add_cotizacion_firma` (prisma migrate deploy) y `prisma generate`.

## FASE 2 (2026-07-03) — Decisiones destrabadas + Vendedor Mayoreo

Gaby cerró las 2 decisiones bloqueantes (ver ADR 013 y 014):
- Partner: email + password + 2FA TOTP (invitación → set password). → #2 DESBLOQUEADO.
- Billing: sesión unificada del dueño (token RBAC rol `*` válido en /billing/*). → #5 DESBLOQUEADO (cobro sigue mock hasta llaves).

Orden de trabajo acordado:
1. **Vendedor mayoreo PWA campo (flujo 3)** — única vertical sin construir. Ya existe: Cotizacion/Pedido con vendedorId, CxC con vendedorId, ClienteB2bVendedorAsignado, rol preset vendedor, firma en cotización. Falta: comisiones configurables (reglas por venta/cobro, bonos escalonados, metas), CRM de visitas (checkin geo opcional, notas, fotos, cierre de día), dashboard vendedor, app PWA `web-vendedor` (puerto 5179) con pedido offline (borrador IndexedDB + cola pending_upload) y firma en pedido.
2. **Portal Partner Contador** (ADR 013): credenciales+invitación, JWT kind partner, app `web-partner`.
3. **Billing "Mi suscripción"** en web-admin (ADR 014): guard dual + sección UI.

Reglas vigentes: push solo a `autonomo/verticales-pendientes`, no tocar áreas veterinaria (web-clinical/web-marketplace/salud), design system gx-*, responsive mobile-first, gating por permisos, tests Vitest por módulo.

## Diario de iteraciones

### Setup (2026-07-02)
- Worktree creado, pnpm install + prisma:generate OK, .env copiado.
- Bitácora y PROMPT-LOOP-VERTICALES.md listos.

### Iteración 1 — DESCUBRIMIENTO: las 4 verticales YA están cerradas (2026-07-02)
Antes de codear, mapeé el estado real contra docs/hitos:
- **Hito 3 CERRADO 100%**: Abarrotes (recargas+IEPS+Bait+saldo prefondeado, demo verde), Salud Humana/Vet/N3, Partners+Despacho contable. TODO en backend + tests.
- **Hito 4 COMPLETO** (476 tests): Ecommerce, Marketing, Doctoralia, Portal paciente PHR.
- Hito 5 (multiplataforma) EN CURSO: core sync ✅, falta build nativo firmado (needs Rust/certs → ⛔ bloqueado por entorno).
- Hito 6 (SaaS) EN CURSO: billing self-serve ✅ + superadmin (recién mergeado).
- NO existe módulo/app dedicada de "vendedor mayoreo de campo" separada — flujo 3 quedó cubierto por web-b2b/ventas. No hay comisiones/crm module dedicado.

**Conclusión**: la premisa del loop (4 verticales pendientes) NO aplica — el backend de todas está hecho. Lo genuinamente pendiente es otra cosa (frontends específicos, Hito 5/6). DETENIDO el loop para que Gaby redefina el alcance real. No se construyó código (habría sido duplicado).

### Iteración 2 — AUDITORÍA profunda (4 agentes paralelos, 2026-07-02)
**TIER A — Frontend puro, backend LISTO+testeado (construible de noche):**
1. POS Abarrotes: granel/balanza (flag `requiresBalanza` sin UI), recargas tiempo aire (módulo `recargas/` sin UI), fiados/CxC en CobroModal (solo efectivo/tarjeta/monedero), IEPS en Recibo.tsx (solo muestra IVA) + editable en ProductosPage, apartados (módulo sin UI). Archivos: web-pos/src/components/{PosScreen,CobroModal,Recibo}.tsx, web-admin ProductosPage.
2. Portal Partner Contador: NO existe apps/web-partner (backend partners/* completo). Solo hay admin-side en superadmin.
3. UI Despacho contable: CFDIs recibidos + categorización IA + DIOT (backend cfdis-recibidos/, diot/ listos) — sin pantallas.
4. UI signup SaaS público: 0 llamadas a /auth/signup desde frontend (backend billing/routes.ts:60 listo).
5. UI billing/checkout tenant: 0 llamadas a /billing/* (backend existe; cobro subyacente MOCK).
6. Portal Paciente web (apps/salud-paciente diferida): backend patient-portal/ listo (PHR, familia, QR).
7. Doctoralia frontend (apps/web-doctoralia diferida): backend doctoralia/ listo (perfil, búsqueda FTS, reseñas).
8. Firma real B2B (signature pad): hoy "aceptar cotización" es firma implícita.

**TIER B — Falta end-to-end (backend+frontend nuevos):**
- Pago de servicios/Bait (sin módulo). Cotizaciones PDF real (hoy placeholder, Puppeteer V1.5). Telemedicina Daily.co (solo flags; needs key).

**TIER C — Integraciones MOCK/STUB (necesitan llaves/contratos, no solo código):**
- WhatsApp Cloud (Meta) + SMS Twilio = stubs. Cobro suscripción SaaS real Stripe/Conekta (billing mock). CFDI facturas SaaS real (Facturama). Recargas: RecargaKi sin probar, mtscellular/pymeya sin implementar.

**TIER D — Bloqueado por ENTORNO (NO de noche):**
- Build nativo firmado Tauri (pos-desktop) + notarización CI. Verificación cámara PWA headless.
- PARCIALMENTE construible: SqliteStorage/IndexedDbStorage adapters + wire apps a sync-client + banner offline/panel conflictos (código sí, verificación nativa no).

FUERA DE ALCANCE: todo frontend clínico (web-clinical/web-marketplace) = sesión veterinaria.
