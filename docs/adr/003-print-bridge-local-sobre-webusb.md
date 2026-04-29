# ADR 003 — Print Bridge local sobre WebUSB/WebSerial

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

El POS necesita comunicarse con hardware periférico:
- Impresoras térmicas ESC/POS (Epson, Star, Bixolon, Xprinter) por USB / Ethernet TCP:9100 / Bluetooth / Serial RS232
- Balanzas (Tor-Rey, CAS, Ohaus) por RS232 / USB
- Lectores código de barras (Symbol, Honeywell, Datalogic) USB-HID (plug&play)
- Cajón monedero por RJ-11 vía impresora térmica
- Impresoras de etiquetas Zebra ZPL II
- Terminales pago (Clip USB-C, MercadoPago Point BT, Stripe Terminal BT/USB)

El POS corre en browser (Vite+React+TanStack). Browsers no acceden a USB/Serial nativamente sin APIs específicas (WebUSB, WebSerial) que tienen limitaciones.

## Decisión

**Servicio local "Print Bridge" en cada PC POS**, construido en Tauri (Rust+WebView), exponiendo WebSocket en `ws://localhost:9876` + HTTP fallback. El browser POS habla con el bridge local; el bridge habla con el hardware vía drivers/SDKs OS-nativos.

API: `GET /devices`, `POST /print/ticket`, `POST /print/label`, `POST /cashbox/open`, `WS /balance`, `GET /status`.

## Alternativas consideradas

- **A) WebUSB / WebSerial directo desde browser**
  - ✅ Sin instalación adicional
  - ✅ Stack puramente web
  - ❌ Soporte irregular: solo Chromium (Chrome, Edge); Firefox/Safari sin soporte
  - ❌ Cada sesión pide permiso al usuario → fricción operativa para cajeros
  - ❌ Drivers específicos por dispositivo aún requeridos en Windows
  - ❌ No funciona con TCP/IP (impresora red) o Bluetooth Classic (RFCOMM)
  - ❌ Imposible auto-arranque al iniciar OS

- **B) Print Bridge local** ← elegida
  - ✅ Cross-browser (Chrome, Firefox, Edge, Safari) — funciona en cualquiera
  - ✅ Cross-OS (Windows, macOS, Linux) con builds firmados
  - ✅ Acceso completo: USB, Serial, BT Classic, TCP/IP, RJ-11 vía impresora
  - ✅ Funciona offline (cola peticiones, sync al reconectar) — crítico para POS
  - ✅ Auto-start con OS, heartbeat 60s al backend
  - ✅ Auto-update silencioso transparente (Sparkle/Squirrel)
  - ✅ Logs locales rotados para debugging remoto
  - ⚠️ Instalación inicial requerida en cada PC POS (instalador firmado mitigará SmartScreen/Gatekeeper)
  - ⚠️ Mantenimiento de un binario más en CI (multi-OS)

- **C) Driver OS-nativo + servicio Windows/launchd**
  - ✅ Performance máxima
  - ❌ Implementación distinta por OS (3x el código)
  - ❌ Sin reuso UI

## Consecuencias

- ✅ Hardware funciona igual en cualquier browser y OS — sin "solo Chrome"
- ✅ Permisos OS se piden 1 vez al instalar; cajero no ve permisos por sesión
- ✅ Funciona offline (cola peticiones)
- ✅ Soporta toda la lista certificada de Análisis 6 sin compromisos
- ⚠️ Distribución requiere instaladores firmados (~$300/año cert Windows, $99/año Apple Developer) — costo aceptado
- ⚠️ Instalación es paso extra en onboarding tenant (mitigado: instalador 1-click + auto-update)
- 🔁 WebUSB/WebSerial queda como fallback ligero V2 para casos edge donde no se puede instalar bridge

## Referencias

- Análisis 6 — Hardware
- ADR-002 (Tauri sobre Electron — Tauri es el framework del bridge)
- Memoria: `project_gaes_pos_analisis_6_hardware.md`
- Pattern referenciado: Square, Toast (todos usan agentes locales para hardware POS)
