# @gaespos/web-pos — POS web de cajero

El primer frontend **tocable y vendible** del POS: login de cajero, búsqueda de
producto (texto o escaneo), ticket en vivo y cobro. SPA Vite + React + Tailwind
conectada a la API GaesSoft.

## Qué hace hoy

- **Login** del cajero (negocio + correo + contraseña) contra `/auth/tenant/login`
- **Sesión**: resuelve sucursal default y abre la caja automáticamente (monto 0);
  si no puede, vende a nivel sucursal sin bloquear
- **Búsqueda** de producto con debounce (`/t/productos?q=`) + Enter para match
  exacto por código de barras (`/t/productos/buscar/:codigo`)
- **Ticket** en vivo: agregar, +/− cantidad, quitar línea, total
- **Cliente**: busca existentes (`/t/clientes?q=`) o alta rápida (nombre + RFC),
  o vende a público en general
- **Cobro** multi-método (efectivo con cambio sugerido, débito, crédito,
  transferencia) → `POST /t/ventas` canal `pos`
- **Comprobante**: folio + total, con:
  - **Imprimir** ticket de 58mm (`window.print()`, listo para térmica o PDF)
  - **Facturar (CFDI)** — best-effort: timbra si el negocio tiene datos fiscales
    configurados, si no muestra un aviso claro (no bloquea la venta)
  - Nueva venta
- **Corte de caja X/Z** (botón en el header): conteo de denominaciones
  (billetes + monedas) → `POST /t/cortes` → muestra diferencia vs lo esperado.
  X = lectura (caja sigue abierta), Z = cierre (termina el turno)
- Token en el navegador (localStorage), restaura sesión al recargar

## Probarlo en 4 pasos

### 1. Levanta la API con adapters mock
```bash
FISCAL_PROVIDER=mock RECARGA_PROVIDER=mock pnpm dev:api
```

### 2. Crea un negocio + cajero + un producto con stock
Con la API arriba, en otra terminal (ajusta nada, copia-pega):
```bash
API=http://localhost:3000
ADM=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@gaessoft.local","password":"ChangeMe!2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# negocio + dueño
curl -s -X POST $API/tenants -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' \
  -d '{"slug":"mi-tienda","name":"Mi Tienda","planCode":"growth"}' >/dev/null
curl -s -X POST $API/tenants/mi-tienda/bootstrap-owner -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' \
  -d '{"email":"caja@mitienda.mx","password":"Caja!2026","nombre":"Mi Cajero"}' >/dev/null

# login cajero + producto con stock
TOK=$(curl -s -X POST $API/auth/tenant/login -H 'Content-Type: application/json' \
  -d '{"tenantSlug":"mi-tienda","email":"caja@mitienda.mx","password":"Caja!2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
SUC=$(curl -s $API/t/sucursales -H "Authorization: Bearer $TOK" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
CAT=$(curl -s -X POST $API/t/categorias -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"nombre":"Abarrotes","slug":"abarrotes"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
VAR=$(curl -s -X POST $API/t/productos -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"skuPadre\":\"COCA-600\",\"nombre\":\"Coca-Cola 600ml\",\"categoriaId\":\"$CAT\",\"precioBase\":\"18.00\",\"aplicaIva\":true,\"tasaIva\":\"16\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["variantes"][0]["id"])')
curl -s -X POST $API/t/inventario/ajustes -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"varianteId\":\"$VAR\",\"sucursalId\":\"$SUC\",\"tipo\":\"ajuste_positivo\",\"cantidad\":\"50\",\"motivo\":\"Inicial\"}" >/dev/null
echo "Listo: negocio 'mi-tienda', cajero caja@mitienda.mx / Caja!2026"
```

### 3. Levanta el POS
```bash
pnpm --filter @gaespos/web-pos dev
```

### 4. Abre y vende
Abre **http://localhost:5173** y entra con:
- Negocio: `mi-tienda`
- Correo: `caja@mitienda.mx`
- Contraseña: `Caja!2026`

Escribe "coca" en el buscador → click en el producto → **Cobrar** → Confirmar.
Verás el folio y el total. ¡Vendiste!

## Pendiente (siguiente iteración)

- Descuentos por línea / globales, devoluciones, apartados desde el POS
- Datos fiscales del receptor en CFDI (uso/régimen/CP) — hoy emite con uso G03 default
- Atajos de teclado completos, modo pantalla táctil
- Búsqueda de cliente sin acentos (backend Postgres sin `unaccent` hoy)
- Empaquetar dentro de `apps/pos-desktop` (Tauri) para usar offline con `@gaespos/sync-client`
