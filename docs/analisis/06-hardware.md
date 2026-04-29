# Análisis 6 — Hardware soportado

> **Estado:** ✅ Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_analisis_6_hardware.md`
> **ADRs relacionados:** ADR-002 (Tauri sobre Electron), ADR-003 (Print Bridge sobre WebUSB)

Define qué hardware soporta GaesSoft V1 y la arquitectura técnica para integrarlo.

## Decisión arquitectónica fundacional: Print Bridge Tauri

Servicio local en cada PC POS:
- **Tauri** (Rust + WebView del OS) ~10MB vs Electron ~80MB
- WebSocket localhost:9876 + HTTP fallback
- Auto-start con OS, **auto-update silencioso transparente** Sparkle/Squirrel
- Detección PnP dispositivos
- **Heartbeat 60s** al backend (versión, dispositivos detectados, errores)
- **Funciona offline**: cola peticiones, sync al reconectar
- Logs locales rotados

```
Browser POS web ↔ ws://localhost:9876 ↔ Print Bridge Tauri ↔ USB/Serial/IP/BT/RJ-11
```

**API:**
- `GET /devices` listar detectados
- `POST /print/ticket` ESC/POS
- `POST /print/label` ZPL
- `POST /cashbox/open` kick
- `WS /balance` stream peso
- `GET /status` health

**Distribución:** Windows MSI firmado, macOS DMG firmado/notarizado, Linux DEB/RPM.

**Por qué bridge vs WebUSB:** WebUSB requiere drivers específicos por dispositivo + permisos por sesión + soporte irregular Chromium-only. Bridge estable cross-browser cross-OS sin permisos repetidos. WebUSB queda V2 como fallback ligero.

## Hardware certificado V1

### Impresoras térmicas
- **Epson TM-T20III** (USB, 80mm) — más popular MX
- **Epson TM-T88VI** (USB/Ethernet, 80mm) — gama alta
- **Star TSP143 IIIBI** (USB, 80mm)
- **Bixolon SRP-330II** (USB, 80mm)
- **Xprinter genéricas** (USB, **58mm + 80mm**) — abarrotes pequeños

Protocolo ESC/POS estándar Epson. Conexiones: USB, Ethernet TCP:9100, Bluetooth, Serial (legado).

### Lectores código de barras
USB HID emulan teclado — **plug&play sin driver**. Honeywell Voyager, Symbol/Zebra LS2208, Datalogic QuickScan, genéricos chinos. Configuración: prefijo opcional + sufijo Enter. **Lectores 2D requeridos** para validar CFDI (QR/Aztec/Data Matrix).

### Balanzas
- **Tor-Rey LSQ-40L / PCR-40** (RS232/USB)
- **CAS PR-II / SW-1** (RS232)
- **Ohaus Defender** (RS232/USB)

Protocolo serial ASCII varía por modelo. Modo continuo o por demanda. Manejado por bridge vía Node SerialPort (o equivalente Rust).

### Scanner móvil cámara (PWA)
ZXing/Quagga2 librerías JS. EAN-13/UPC-A/QR/Code-128. Single-shot + continuo (toggle). `getUserMedia` API. Para campo mayoreo (4.10) y verificación inventario.

### Cajón monedero
**V1 solo conectado a impresora térmica** vía RJ-11, comando ESC/POS `ESC p m t1 t2`. Cajón directo USB/Serial = V2.

### Terminales pago V1
- **Clip** (USB-C smartphone) — SDK Clip Mobile
- **MercadoPago Point** (BT, gratis con cuenta MP) — SDK MPP
- **Stripe Terminal** (BBPos WisePOS E / M2) — SDK Stripe Terminal Reader, **V1 si disponible MX al lanzar**, ampliación V1.5

V2: BBVA Smart Terminal. Modo manual fallback siempre disponible (cajero captura referencia auth manual).

### Impresoras etiquetas
- **Zebra ZD220** (USB) — ZPL II V1
- **Brother QL-820NWB** (red/USB papel continuo) — Brother PT
- Genéricas Xprinter etiqueta

Uso: códigos barra productos internos + etiquetas envío ecommerce.

### PCs/dispositivos POS
- Mini-PC Windows 11 / Ubuntu (i3/i5, 8GB, SSD)
- All-in-one Elo Touch / Posiflex / HiSense (touch x86) — recomendado
- Tablets Android 10+ campo mayoreo
- iPad portales paciente / telemedicina

**Apps:**
- Desktop: Tauri + bridge (Windows/Linux/macOS)
- Móvil V1: **PWA pura** con ZXing
- Móvil V2: Capacitor app si feedback pide más integración nativa

## Catálogo hardware certificado público

GaesSoft **solo recomienda V1**, no revende. Lista oficial pública con modelo/costo MX/conexión/status (Tested/Plug&Play/Quirks). Documentación pública accesible antes de contratar. **V2: marketplace partner con descuentos** (sin logística hardware en V1).

## Estrategia futura V2+
- WebUSB/WebSerial fallback ligero
- Lector huella digital login cajero
- Cámara IP/DVR correlación venta-video (enterprise)
- Lectores INE validación KYC paciente
- Pinpad NFC independientes

## Why
Print Bridge Tauri es la apuesta V1 porque WebUSB no es viable cross-browser ni cross-OS de forma estable. Tauri vs Electron: 8x más pequeño, mejor performance, suficiente madurez 2025+. Bridge offline-ready es crítico porque POS no puede depender de internet (caída inhabilita venta). Solo recomendar hardware (no revender) evita distraer del core SaaS.

## How to apply
Repo separado `gaespos-bridge/` (Tauri + Rust) con builds CI por OS. Bridge instala con flag `tenant_id` para auto-emparejarse al backend. Backend tiene tabla `bridges_instalados` por sucursal con last_heartbeat, version, devices_detected jsonb. Catálogo hardware certificado en docs públicos `gaessoft.com/hardware`. Admin GaesSoft puede ver dashboard de bridges activos con health.
