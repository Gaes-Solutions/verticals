# ADR 002 — Tauri sobre Electron para apps desktop

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS necesita dos apps desktop nativas:
1. **Print Bridge** — servicio local en cada PC POS que conecta browser con hardware (impresoras ESC/POS, balanzas, lectores serial, cajón monedero) y debe correr siempre, con auto-update silencioso.
2. **POS Desktop** — shell desktop del POS web con SQLite local, sync engine offline, auto-start.

Ambas deben distribuirse como instaladores firmados/notarizados Windows + macOS + Linux, instalarse en hardware modesto (Mini-PCs i3/8GB), y consumir poca RAM (la PC POS también corre browser, antivirus, etc.).

## Decisión

**Tauri** (Rust + WebView del OS) para Print Bridge y POS Desktop.

## Alternativas consideradas

- **A) Electron**
  - ✅ Ecosistema maduro (Slack, VSCode, Discord)
  - ✅ Stack JS puro (familiar)
  - ✅ Plugins disponibles (auto-update Squirrel, etc.)
  - ❌ Bundle ~80MB+, RAM ~150-300MB en idle
  - ❌ Cada app empaca su propio Chromium → varias apps Electron en una PC consumen GB de RAM
  - ❌ Performance aceptable pero notablemente peor que nativo en PCs modestas

- **B) Tauri** ← elegida
  - ✅ Bundle ~10MB (8x menos que Electron)
  - ✅ Usa WebView del OS (WebView2 Win, WKWebView Mac, WebKitGTK Linux) → no empaqueta Chromium
  - ✅ RAM ~30-80MB en idle
  - ✅ Backend en Rust → ideal para Print Bridge (acceso serial USB Bluetooth confiable)
  - ✅ Madurez 2025+: v2 estable, plugins oficiales (updater, fs, dialog, etc.)
  - ✅ Auto-update via plugin oficial
  - ⚠️ Curva Rust para code shell del bridge (manejable, mucho boilerplate generado)
  - ⚠️ WebView2 requiere Edge Runtime en Windows 10 (preinstalado Win 11; instalador-bundle Win 10)

- **C) Native puro (Qt, Swift, .NET MAUI)**
  - ✅ Performance máxima
  - ❌ Stack triple (1 por OS) → 3x el código
  - ❌ Sin reuso de UI con web POS

## Consecuencias

- ✅ Print Bridge ~10MB, instalación rápida en PCs cliente
- ✅ POS Desktop sentimiento "nativo" en hardware modesto
- ✅ Reuso de UI React entre web POS y POS Desktop (mismo bundle Vite cargado en WebView)
- ✅ Rust ideal para acceso a hardware serial/USB con `serialport-rs`
- ⚠️ Onboarding inicial: aprender bases de Rust (ownership, async tokio) — costo upfront 1-2 semanas
- ⚠️ WebView2 dependencia en Windows 10 — instalador bootstrapper
- 🔁 Si Tauri se vuelve dolor (reportes consistentes de bugs cross-OS), fallback Electron con costo de re-empaque

## Referencias

- Análisis 6 — Hardware (Print Bridge)
- Análisis 9 — Arquitectura
- Memoria: `project_gaes_pos_analisis_6_hardware.md`, `project_gaes_pos_analisis_9_arquitectura.md`
- Pattern referenciado: Spotify desktop (parcialmente Tauri), 1Password 8 (Rust + WebView)
