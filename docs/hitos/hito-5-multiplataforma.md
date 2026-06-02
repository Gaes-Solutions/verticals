# Hito 5 — Multi-plataforma + offline

> **Estado:** 🚧 EN CURSO · Núcleo motor de sync (5.a/5.b/5.c) ✅ · **Fase packaging** (5.2.a–d) ✅ cerebro cliente + scaffolds · build nativo firmado pendiente (entorno con Rust/certs)
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

## Fase packaging (5.2.a–d) — cerebro cliente + scaffolds

**Decisión (2026-05-28)**: el motor de sync del servidor ya está en main; esta fase construye el **cliente offline** (100% testeable) + scaffolds de las apps nativas (build firmado se hace en una máquina con Rust + certificados, no aquí).

### 5.2.a `@gaespos/sync-client` ✅ (15 tests)
- [x] `LocalStorage` interface (SQLite Tauri / IndexedDB PWA / `InMemoryStorage` tests) + `SyncApiClient` + `NetworkProbe`
- [x] `SyncClient`: `tickPush` (FIFO, marca synced/conflict/failed, backoff exponencial con cap+jitter al fallar red), `tickPull` (upserts + tombstones al cache, avanza lastSyncAt), `tickNetwork` (3 pings fallidos → offline, evento; éxito → online), `forceSync`, `resolveConflict` (retry/abandon), `getState`, `start/stop` con timers
- [x] `OperationBuilder` (buildVentaOp/buildClienteCreateOp/buildClienteUpdateOp con idempotency keys)
- [x] Tests: NetworkMonitor (offline/online + excepción=fallo), PushWorker (drena, offline no pushea, error→backoff, conflict→UI, resolve retry/abandon), PullWorker (upserts+tombstones, offline, lastSyncAt), forceSync, start/stop timers (fake timers), getState, backoff creciente con cap

### 5.2.b Backend additions ✅
- [x] `GET /t/sync/heartbeat` (ping barato para NetworkMonitor; requiere SYNC_USAR) — 11 tests sync
- [x] force-resync = `pull` sin `since` (ya soportado por el endpoint existente)

### 5.2.c Scaffold `apps/pos-desktop` (Tauri) ✅
- [x] `tauri.conf.json` (bundle msi/nsis/dmg/deb/appimage, CSP, plugin-sql preload), `Cargo.toml`, `main.rs` (carga web-pos + tauri-plugin-sql), `migrations/001_sync_local.sql` (sync_queue + sync_cache + sync_meta espejo del LocalStorage), README con build + firma por OS
- [x] ⚠️ NO compilable aquí (Rust + WebView + certificados). Pendientes documentados en README (SqliteStorage, wire SyncApiClient, iconos, CI matrix + firma)

### 5.2.d Scaffold `apps/pos-pwa` (Next.js + ZXing) ✅
- [x] Next.js 15 PWA: `manifest.json` instalable + `sw.js` (app shell cache-first, API nunca cacheada) + `ServiceWorkerRegister`
- [x] `BarcodeScanner` (`@zxing/browser`, cámara trasera, debounce anti-doble-venta, manejo permiso denegado) + `/scan` page + home
- [x] **Build verde** (typecheck + `next build` 5 páginas). Cámara real no verificable headless (documentado)

## Diferidos a V1.5 (post-packaging)
- Build nativo firmado/notarizado en CI (GitHub Actions `tauri-action` matrix 3 OS)
- `SqliteStorage` (Tauri) + `IndexedDbStorage` (PWA) implementando `LocalStorage`
- UI banner offline + panel "conflictos por resolver" en web-pos/PWA
- Multi-caja sucursal V1 (cada caja SQLite independiente) + reconciliación inventario al reconectar
- Más entityTypes sincronizables (apartados, CxC, cortes X/Z como evento atómico, movimientos inventario append)
- Políticas inventario offline (Soft retail / Strict salud)

## Performance budgets
- Sync push batch 100 ops: <1s P95
- Sync pull diffs: <500ms P95
