# Bitácora — Loop autónomo de verticales pendientes

Rama: `autonomo/verticales-pendientes` · Base: `origin/main` (b6a23e3, incluye superadmin, NO veterinaria)
Regla: push solo a esta rama, nunca a main. No tocar áreas en vuelo de veterinaria (web-clinical, web-marketplace, salud/*).

## Checklist de verticales

| # | Vertical | Estado | Notas |
|---|----------|--------|-------|
| 1 | Abarrotes (flujo 2 / 4.14) | ✅ hecha | Admin campos balanza+IEPS (c5c71fe) · Ticket IEPS/IVA +fix $NaN (c581828) · Recargas/servicios POS (87b0e26) · Fiado/CxC en cobro (d141730) · Apartados (d89cc81) · Captura de peso/balanza (aa5cdce) |
| 2 | Vendedor mayoreo PWA campo (flujo 3) | ⬜ pendiente | CRM ligero, pedidos offline, firma, gamificación comisiones |
| 3 | Médico humano + Paciente + telemedicina (flujos 6,7) | ⬜ pendiente | pediatría, CFDI exento, marketplace, Daily.co, PHR; SIN IA clínica |
| 4 | Partner Contador / despacho (flujo 9 / 4.12) | ⛔ bloqueada | Portal partner requiere auth partner-facing nueva (ver BLOQUEADOS). Despacho contable UI (CFDIs recibidos/DIOT) sí es construible en web-admin |

Estados: ⬜ pendiente · 🟡 en curso · ✅ hecha · ⛔ bloqueada

## BLOQUEADOS

- **TIER A #2 Portal Partner Contador** (⛔ decisión de arquitectura). El modelo `Partner` (master) tiene `emailContacto` único pero SIN credenciales; NO existe auth partner-facing (todo `/partners/*` es `authenticateAdmin`). Un portal self-serve exige diseñar autenticación de partner nueva: kind `partner` en JWT, password/flujo de invitación-set-password, endpoints partner-scoped (`/partner/me`, `/partner/referrals`, `/partner/commissions`, `/partner/payouts`). Decisión para Gaby: ¿login propio del partner (email+password+2FA como admin) o magic-link, y flujo de alta? Requiere ADR antes de codear. Mientras tanto se salta.

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
