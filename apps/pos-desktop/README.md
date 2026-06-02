# @gaespos/pos-desktop — Shell Tauri del POS

Empaqueta el POS web (`apps/web-pos`) como app de escritorio nativa con SQLite
local, para operar **offline-first** (Análisis 8). Usa `@gaespos/sync-client`
para la cola de operaciones + cache de catálogos + reconciliación al reconectar.

## Arquitectura

```
┌─────────────────────────────────────────┐
│  Tauri shell (Rust)                       │
│  ├── WebView OS → web-pos (React)         │
│  ├── tauri-plugin-sql → SQLite local      │
│  └── @gaespos/sync-client                 │
│        ├── SyncQueue  (push FIFO+backoff) │
│        ├── PullWorker (cada 30s)          │
│        └── NetworkMonitor (3 pings → off) │
└───────────────────┬───────────────────────┘
                     │ HTTPS
              /t/sync/{push,pull,heartbeat}
```

El `LocalStorage` de `@gaespos/sync-client` se implementa sobre SQLite
(`src-tauri/migrations/001_sync_local.sql`) — misma interfaz que el
`InMemoryStorage` usado en tests.

## ⚠️ Estado actual

Scaffold + configuración. **El build nativo no se compila en CI headless**
(requiere toolchain Rust + WebKitGTK/WebView2 + certificados de firma). Se
construye en una máquina con el entorno completo:

## Build local (en tu máquina)

Requisitos: Rust ≥1.77, pnpm, y por plataforma:
- **Windows**: Visual Studio Build Tools + WebView2 (preinstalado en Win11)
- **macOS**: Xcode Command Line Tools
- **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, etc.

```bash
pnpm install
pnpm --filter @gaespos/pos-desktop dev      # desarrollo con hot-reload
pnpm --filter @gaespos/pos-desktop build     # bundle del SO actual
```

Salida en `src-tauri/target/release/bundle/`:
- Windows → `.msi` (WiX) + `.exe` (NSIS)
- macOS → `.dmg` + `.app`
- Linux → `.deb` + `.AppImage`

## Firma / notarización (release público)

- **Windows**: code signing cert (EV recomendado) → `bundle.windows.certificateThumbprint`
- **macOS**: Apple Developer ID → `bundle.macOS.signingIdentity` + `xcrun notarytool` para notarizar el DMG
- **Linux**: firma GPG del repo APT/AppImage (opcional)

Las llaves NUNCA van al repo; se inyectan por env/secrets de CI (GitHub Actions
`tauri-action`). Ver `tauri.conf.json` → `bundle.{windows,macOS,linux}`.

## Pendiente para completar Hito 5 packaging

- [ ] Implementar `SqliteStorage` (LocalStorage sobre tauri-plugin-sql)
- [ ] Wire `SyncApiClient` con el JWT de tenant + `RealNetworkProbe` (GET /t/sync/heartbeat)
- [ ] Iconos de la app (`src-tauri/icons/`)
- [ ] GitHub Actions matrix build + firma (3 OS)
- [ ] UI banner offline + panel "conflictos por resolver" (consume `getConflicts`/`resolveConflict`)
