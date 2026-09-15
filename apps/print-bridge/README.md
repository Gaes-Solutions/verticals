# Puente de impresión ESC/POS 0.2.0

Envía tickets de venta y corte por TCP a una impresora ESC/POS, o al spooler
`lp` de Linux/macOS. Escucha únicamente en `127.0.0.1:9876`.

## Configuración por equipo

Define estas variables antes de ejecutar `gaespos-print-bridge`:

- `GAES_PRINT_TOKEN`: clave aleatoria de al menos 32 caracteres. Genera una con
  `openssl rand -hex 32`, guárdala y pégala en «Impresión directa ESC/POS» del POS.
- `GAES_PRINT_ORIGIN`: origen exacto del POS, por ejemplo `https://pos.example.com`.
  Para Tauri usa el origen mostrado por la pantalla de impresión del equipo.
- `GAES_PRINT_TCP`: dirección IP y puerto de la impresora, por ejemplo
  `192.168.1.50:9100`. Disponible en los sistemas que compilen este binario.
- Alternativa: `GAES_PRINT_SPOOL`: nombre de la cola local, por ejemplo `Tickets`.
  Requiere `lp` y una cola que acepte ESC/POS sin transformar los bytes.
- `GAES_PRINT_JOBS`: directorio absoluto, persistente y privado del usuario.
  No borres su contenido mientras existan impresiones por revisar.
- `GAES_PRINT_COLUMNS`: `32` (58 mm) o `48` (80 mm); predeterminado 32.
- `GAES_PRINT_CUT=1`: activa corte de papel solamente en equipos compatibles.

No abre el cajón automáticamente. Un modelo USB de Windows necesita un
transporte propio o una impresora accesible por TCP; no se certificó USB Windows.

## Uso

En el recibo del POS abre **Impresión directa ESC/POS**, captura la clave local
y pulsa **Enviar / consultar mismo ticket**. Conserva el mismo identificador
entre reintentos y después de reiniciar el puente. **Imprimir otra copia** genera
un identificador nuevo y debe usarse después de revisar el papel.

`accepted` significa que el transporte aceptó todos los bytes; no demuestra
que haya papel ni que el cabezal haya impreso. Una respuesta perdida o fallo de
registro queda incierto y no provoca otro envío automático. La clave se guarda
solo durante la sesión del navegador. Las impresiones conservan su registro en
el directorio indicado. No se permiten comandos ESC/POS provenientes de los
nombres de productos: se normaliza el texto y se eliminan los controles.

## Construcción y verificación

```bash
cargo test --locked
cargo build --release --locked
python3 tests/transport.py
```

La prueba integra el proceso real con un receptor TCP local: verifica bytes,
autorización, estado de venta cancelada, reintento y reinicio sin duplicación.
Se compiló y ejecutó en Linux x64. Faltan pruebas con la impresora física y
construcciones/firmas de Windows/macOS. Este puente no completa el POS offline
ni sustituye el instalador Tauri.
