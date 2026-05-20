# GaesSoft Print Bridge

Sidecar nativo Tauri 2.x + Rust que expone un HTTP server local
(`127.0.0.1:9876`) para que el POS web (browser o desktop) imprima
tickets y cortes en impresoras ESC/POS (Epson TM-T20III/T88VI/etc.) y
otros equipos del hardware certificado por GaesSoft.

## Por qué existe

Los browsers no pueden hablar directo con USB sin permisos especiales
(WebUSB tiene cobertura inconsistente) ni con impresoras térmicas via
ESC/POS. El POS web hace `POST localhost:9876/print/ticket` con el JSON
estructurado que devuelve `GET /t/ventas/:id/ticket` del backend, y
este sidecar:

1. Carga la impresora configurada para esta caja (USB/red local).
2. Genera los comandos ESC/POS desde el JSON.
3. Imprime.

## Estado actual (Hito 1.6.a)

- ✅ Estructura del crate Rust + Tauri scaffold
- ✅ Contrato JSON estable (tipos del backend en `apps/api/src/modules/tenant/tickets/service.ts`)
- ✅ Endpoint backend `/t/ventas/:id/ticket` y `/t/cortes/:id/ticket`
- ⏳ Implementación ESC/POS Rust (`escpos-rs` crate) — pendiente para
  cuando Gaby tenga la TM-T20III en escritorio
- ⏳ Descubrimiento USB con `rusb`
- ⏳ Build de instalador Tauri por OS (Windows .msi, macOS .dmg, Linux
  .AppImage)

## Cómo arrancar local (cuando esté implementado)

```bash
# Instalar Rust + Tauri prerequisites (una vez):
# https://tauri.app/start/prerequisites/

cd apps/print-bridge
cargo tauri dev
```

El sidecar abre tray icon y escucha en `127.0.0.1:9876`. Configurar el
POS web con `printBridgeUrl: "http://127.0.0.1:9876"`.

## Contrato JSON (estable)

Ver `TicketVenta` y `TicketCorte` en
`apps/api/src/modules/tenant/tickets/service.ts`. El backend genera
estos objetos; el bridge solo los renderiza a ESC/POS.

## Decisiones cerradas

- **Standalone, no embebido en pos-desktop**: el bridge es independiente
  para que también funcione cuando el cajero usa el POS web desde
  Chrome sin desktop.
- **Solo USB V1**: red TCP/IP (impresoras IP) → V1.5.
- **Solo Epson V1**: Star TSP650, Zebra ZD230, etc. → V1.5 cuando
  cliente lo pida.
- **Sin cola persistente V1**: si la impresora falla, el bridge devuelve
  error y el POS muestra modal "Reintentar / saltar impresión". Cola
  con BullMQ Redis local → V1.5.
- **Sin firma de comandos V1**: el bridge solo acepta requests de
  `127.0.0.1`. CORS abierto a `localhost:*`. Si en V1.5 se necesita
  multi-equipo en red local, agregar token compartido.
