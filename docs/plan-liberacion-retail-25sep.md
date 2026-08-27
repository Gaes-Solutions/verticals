# Plan de liberación — Vertical Retail (meta: 25 de septiembre 2026)

> Objetivo: liberar la vertical **Retail** al 100% para **pruebas humanas (piloto)** el
> **25-sep-2026**, con: web-admin + POS, **app Negocio** (APK), **app Cliente** (APK) y el
> **kiosko verificador** funcionando; errores encontrados y corregidos, seguridad blindada,
> happy paths garantizados. Hoy: 2026-08-27 → **~4 semanas**.

## 0. Regla de oro
Nada se libera sin pasar los **criterios de salida** (§2). Si algo no está, se corta alcance
de esa pieza (ej. kiosko sale como Fase 1) pero NO se baja la barra de calidad/seguridad del core.

## 1. Estado actual (honesto, 27-ago)
- ✅ Backend + web-admin (31 módulos) + POS web: en producción (`app.angaes.com`).
- ✅ App **Negocio** (APK): paridad 31 módulos, dark + huella + importador (commit `f5e780a`, en `mobile/apps`).
- ✅ App **Cliente** (APK): nivelada (pedidos+timeline, favoritos, direcciones, perfil).
- 🔴 **BLOQUEANTE**: rama `seguridad/auditoria` (≈65 hallazgos arreglados) **sin mergear** — falta
  correr **7 migraciones** en prod + `DATABASE_URL`. Está en el camino crítico.
- 🟡 `mobile/apps` sin mergear a `main`; falta merge + deploy coordinado.
- 🔴 **Kiosko**: solo plan (`docs/plan-kiosko-verificador-precios.md`), sin construir.
- 🟡 Builds: cupo EAS gratis agotado (reinicia 1-sep) → usar **build local** (Java 17) mientras.
- 🟡 Brechas de profundidad en app móvil: crear promo/usuario/CFDI/tarifas envío (hoy vista/simplificado).

## 2. Criterios de salida ("listo para pruebas humanas") — GO/NO-GO
Se libera SOLO si TODO esto es verde:
- [ ] **0 bugs P0/P1 abiertos** (P0=corrupción datos/caída/cobro mal; P1=flujo core roto).
- [ ] **Seguridad**: rama de auditoría mergeada + migraciones aplicadas; **0 críticos/altos abiertos**;
      aislamiento por tenant verificado; 2FA/passkey OK; rate-limit y validación Zod en todo endpoint.
- [ ] **Happy paths** del vertical pasan e2e automatizado + manual (lista §4).
- [ ] **Apps**: Negocio y Cliente instalan y corren en la **matriz de dispositivos** (Android 10–14).
- [ ] **Kiosko**: verifica precio (mismo que POS) + modo comercial idle, en 1 dispositivo real.
- [ ] **Datos de precio consistentes** POS ↔ verificador ↔ tienda (tema PROFECO).
- [ ] **Observabilidad viva**: Sentry (errores) + logs + alertas; **backup + rollback probados**.
- [ ] **Datos demo limpios** + tenant piloto listo + manual/onboarding + canal de soporte.

## 3. Frentes de trabajo (workstreams)

### A. Estabilización y corrección de errores
- **Caza multi-agente**: revisión adversarial del diff/branch (correctness, edge cases) por módulo.
- **QA manual** de los 20 RF y los flujos del vertical (checklist §4), en web + móvil.
- **Triage**: tablero P0/P1/P2/P3; loop encontrar→reproducir→corregir→verificar→regresión.
- **Tests automatizados**: subir cobertura de los caminos críticos (Vitest unit + Playwright e2e).
- CI en verde obligatorio (typecheck 29 pkgs + lint + tests) antes de cada merge.

### B. Seguridad (blindaje)
- **Mergear `seguridad/auditoria`** (correr las 7 migraciones — DESBLOQUEAR YA con Gaby).
- Segunda ronda de **auditoría** (hacker ético) sobre el estado ya parchado; cerrar críticos/altos.
- Revisar: RBAC granular, aislamiento schema-per-tenant (nunca `masterPrisma` por error),
  authz en cada ruta, secretos fuera del repo, rotación de llaves expuestas, headers seguros,
  rate-limit, subida de archivos (importador/CFDI), tokens de dispositivo (kiosko).
- **Dependencias**: `pnpm audit` + actualizar vulnerables. **Pentest** de auth/tenant-hopping/IDOR.

### C. Pruebas
- **Happy path** automatizado por rol (dueño, cajero, cliente) — flujos §4.
- **Edge cases**: sin stock, pago insuficiente, cancelación, offline/reconexión, concurrencia de caja.
- **Carga** (k6): búsqueda producto <100ms P95, checkout <500ms P95 (presupuestos de CLAUDE.md).
- **Dispositivos**: matriz Android (gama baja/alta, 10–14), tablets del kiosko.
- **Sync offline** del POS/kiosko (cola idempotente, LWW).

### D. Kiosko (MVP para el 25)
- Construir **Fase 1** del plan: app `mobile-kiosko`, escaneo por cámara → precio, idle → carrusel
  auto (promos+destacados), token de dispositivo, endpoint por token. 1 APK instalable + probado.
- (Fase 2/3 quedan post-lanzamiento; no bloquean el piloto.)

### E. Infra / deploy / observabilidad
- **Merge `mobile/apps` → main** coordinado + deploy Railway (runbook `docs/deploy-railway.md`).
- Migraciones prod (manual, NO auto). **Sentry + PostHog + alertas** activos.
- **Backups** automáticos + **prueba de restore** + **plan de rollback** documentado y ensayado.
- Builds: Java 17 local (o esperar 1-sep / plan EAS) para APK firmados de las 3 apps.

### F. Piloto humano (readiness)
- **Reset de datos demo** → tenant piloto real con catálogo/inventario cargado.
- **Onboarding** (guía de inicio ya existe) + manual con imágenes (ya en la app) + video corto.
- **Canal de soporte** (WhatsApp/ticket) + bitácora de incidencias del piloto.

## 4. Checklist de happy paths del vertical (deben pasar)
POS: buscar producto → carrito → cobrar (efectivo/tarjeta/mixto) → ticket/CFDI · devolución ·
corte X/Z. Inventario: alta producto · ajuste stock · importar CSV. Comercial: promoción activa
aplica en venta · monedero/gift card · fiado/CxC abono. Cliente app: registro/login · ver pedido
+ timeline · favoritos · direcciones. Kiosko: escanear → precio correcto · idle → anuncios.
Admin: alta usuario+rol · 2FA · reportes.

## 5. Cronograma (4 semanas)
- **Sem 1 (28 ago–3 sep)** — DESBLOQUEAR seguridad: migraciones + merge auditoría. Merge `mobile/apps`→main + deploy.
  Setup CI/tests + Sentry. Arrancar **kiosko Fase 1**. Build local Negocio/Cliente (Java 17).
- **Sem 2 (4–10 sep)** — Caza de bugs multi-agente + QA manual de todos los flujos. 2ª auditoría de
  seguridad. Kiosko MVP funcional. Cerrar brechas de profundidad prioritarias (crear promo/usuario).
- **Sem 3 (11–17 sep)** — Pruebas de carga + offline + matriz de dispositivos. Corregir P0/P1.
  Kiosko probado en dispositivo real. **Piloto en staging** con tenant demo (ensayo general).
- **Sem 4 (18–24 sep)** — **Freeze** (solo P0/P1). Regresión completa. Go/No-Go (§2). Builds finales
  firmados. Deploy prod + monitoreo + reset datos + onboarding. **25-sep: liberación a piloto humano.**

## 6. Riesgos y mitigación
- **Migraciones/seguridad no desbloquean** → arriesga todo. Mitiga: resolver `DATABASE_URL` en Sem 1 (máxima prioridad).
- **Cupo/credenciales de build** → build local Java 17 desde ya; o plan EAS Starter.
- **Kiosko no llega a tiempo** → sale Fase 1 mínima o se pospone (NO bloquea el core del piloto).
- **Regresiones por merges** → CI verde obligatorio + freeze en Sem 4.
- **Precio inconsistente POS/kiosko** → ambos usan el MISMO motor de precios (verificar en pruebas).

## 7. Decisiones/insumos que necesito de Gaby (Sem 1)
1. `DATABASE_URL` de prod (o correr tú las 7 migraciones) — DESBLOQUEA seguridad.
2. Build: ¿Java 17 local ya, o esperamos EAS 1-sep / plan pago?
3. Kiosko Fase 1: las 4 decisiones del `plan-kiosko-verificador-precios.md`.
4. Tenant piloto real (nombre/catálogo) para cargar datos de verdad.
