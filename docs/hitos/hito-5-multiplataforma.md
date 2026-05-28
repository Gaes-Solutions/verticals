# Hito 5 — Multi-plataforma + offline

> **Estado:** 🚧 EN CURSO · **Núcleo motor de sync** (5.a/5.b/5.c) ✅ · empaquetado Tauri/PWA diferido
> **Análisis:** [Análisis 8 Offline-first y sync](../analisis/08-offline-sync.md) · [Análisis 9 Arquitectura](../analisis/09-arquitectura.md)

## Objetivo del Hito 5

El POS retail/abarrotes funciona **sin internet** (sin red ≠ sin negocio — como Eleventa). El motor de sync reconcilia las operaciones offline al reconectar, sin pérdida ni duplicados.

## Decisión de arranque (confirmada 2026-05-28)

- **Núcleo V1 = motor de sync (backend + paquete `@gaespos/sync`)**, 100% verificable con tests. Difiere el empaquetado **Tauri firmado/notarizado** y la **PWA scanner** a una fase de packaging (no compilables/verificables en el entorno actual).
- Estrategia de conflictos cerrada en Análisis 8: **idempotency + LWW + flag `merge_required`**, sin CRDTs/vector clocks (sobre-engineering para POS con ventas inmutables).

## 5.a Paquete `@gaespos/sync` (lógica pura) ✅
- [x] Tipos del contrato: `SyncOperation`, `SyncOpResult`, `SyncPushResult`, `SyncPullResult/Diff`, `SyncEntityStrategy` (immutable/lww/append/backend_authoritative).
- [x] `resolveLww(localAt, remoteAt)` — last-write-wins (empate ⇒ local).
- [x] `detectFieldConflicts(base, local, remote, fields)` — campos que divergieron en ambos lados.
- [x] `decideUpdate(...)` — apply / skip / conflict(merge_required) combinando base-unchanged + divergencia field-level + LWW.
- [x] 12 tests unitarios.

## 5.b Backend sync endpoints + schema ✅
- [x] Modelos tenant: `SyncProcessedOp` (idempotency_key único → resultado almacenado) + `SyncTombstone` (borrados duros para pull). Migration `add_sync`.
- [x] Permiso `SYNC_USAR` (presets dueño/gerente/cajero/vendedor).
- [x] `POST /t/sync/push` — batch idempotente. Dispatch por entityType:
  - **venta** (immutable): dedup por idempotency_key; reusa `crearVenta`; duplicado ⇒ `deduped`.
  - **cliente** (lww): create directo; update vía `decideUpdate` → apply / skip / `conflict` merge_required sin sobrescribir.
- [x] `GET /t/sync/pull?since=` — diffs (upserts `updatedAt > since`) + tombstones por entidad (producto/variante/cliente/promoción). Sin `since` ⇒ snapshot completo (primer login).

## 5.c Tests + demo offline→sync ✅
- [x] **10 tests** integración (`tenant-sync.test.ts`): RBAC 403 sin SYNC_USAR; push venta aplica; re-push deduped sin duplicar; venta inválida → failed reintentable; cliente create; update LWW con base; **conflicto merge_required sin sobrescribir servidor**; pull snapshot; pull `since` solo cambios; tombstones.
- [x] Demo `demo-offline-sync.ts` (`pnpm --filter @gaespos/api demo:offline-sync`): offline encola 2 ventas + cliente → reconexión push (3 aplicadas) → re-push (3 deduped, 0 duplicados) → conflicto merge_required → pull diffs. Verde contra API live.

## 5.d Diferidos a fase de packaging / V1.5
- Empaquetado Tauri desktop firmado/notarizado (Windows MSI / macOS DMG / Linux DEB) — `apps/pos-desktop`
- Cliente SQLite local + sync queue worker (push FIFO con backoff + pull cada 30s) + network monitor (3 pings = offline)
- UI conflict resolver para `merge_required` (`sync_conflicts` local)
- PWA móvil con ZXing scanner cámara
- Multi-caja sucursal V1 (cada caja SQLite independiente) + reconciliación inventario al reconectar
- Más entityTypes sincronizables (apartados, CxC, cortes X/Z como evento atómico, movimientos inventario append)
- Políticas inventario offline (Soft retail / Strict salud) + "forzar resync"

## Performance budgets
- Sync push batch 100 ops: <1s P95
- Sync pull diffs: <500ms P95
