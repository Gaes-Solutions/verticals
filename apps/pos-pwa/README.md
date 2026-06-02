# @gaespos/pos-pwa — PWA móvil del POS

PWA para vender desde el teléfono: escáner de códigos de barras con cámara
(`@zxing/browser`) + operación offline-first vía `@gaespos/sync-client`.

## Stack

- Next.js 15 (App Router) + React 19
- `@zxing/browser` para decodificar EAN/UPC/Code128 desde la cámara trasera
- Service worker manual (`public/sw.js`): app shell cache-first, API nunca cacheada
- `manifest.json` instalable (Add to Home Screen)

## Rutas

- `/` — home con acceso al escáner
- `/scan` — escáner en vivo (client component, requiere cámara + HTTPS)

## Dev

```bash
pnpm --filter @gaespos/pos-pwa dev     # http://localhost:3002
pnpm --filter @gaespos/pos-pwa build   # build producción
```

## ⚠️ Limitaciones de verificación

- El **escáner con cámara** requiere un dispositivo real con permiso de cámara y
  contexto seguro (HTTPS/localhost). No es verificable en CI headless — sí lo es
  el typecheck y el build de Next.
- El service worker solo activa en navegador real (no en build SSR).

## Pendiente para completar Hito 5 packaging

- [ ] `IndexedDbStorage` (LocalStorage de `@gaespos/sync-client` sobre IndexedDB)
- [ ] Wire `SyncApiClient` + `RealNetworkProbe` (GET /t/sync/heartbeat) con JWT tenant
- [ ] Pantalla de venta (buscar producto escaneado en cache local → carrito → cobro offline)
- [ ] Banner offline + panel de conflictos (`getConflicts`/`resolveConflict`)
- [ ] Iconos PWA (`public/icons/icon-192.png`, `icon-512.png`)
