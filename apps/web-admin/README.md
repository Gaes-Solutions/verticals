# @gaespos/web-admin — Back-office del negocio

El panel del **dueño/gerente**: gestiona su catálogo, inventario, ve cómo va el
negocio y configura su tienda online. Es la pieza que cierra el vertical RETAIL
de punta a punta: **dueño gestiona (admin) → cajero vende (web-pos) → cliente
compra (web-tienda)**. SPA Vite + React + Tailwind conectada a la API GaesSoft.

## Qué hace

- **Login** del dueño/gerente (`/auth/tenant/login`)
- **Resumen (dashboard)**: ventas de hoy ($ + # tickets) y alertas de productos
  bajo stock
- **Reportes**: ventas del periodo (7/30/90 días) con gráfica de barras por día,
  ticket promedio, IVA, top productos y desglose por canal
- **Productos**: tabla con búsqueda, alta (SKU, nombre, precio, categoría, IVA),
  edición y archivado
- **Inventario**: stock por producto/sucursal (resalta bajo mínimo) + ajuste de
  entrada/salida con motivo
- **Ventas**: listado con filtros (canal, estado) + detalle (líneas, pagos, total)
- **Tienda online**: activar la tienda, nombre y subdominio, y publicar productos
  al catálogo público (los que verá la `web-tienda`)
- Token en el navegador (localStorage)

## Probarlo

```bash
# 1. API con mocks
FISCAL_PROVIDER=mock RECARGA_PROVIDER=mock pnpm dev:api

# 2. crear negocio + dueño (si no tienes uno)
API=http://localhost:3000
ADM=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@gaessoft.local","password":"ChangeMe!2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s -X POST $API/tenants -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' \
  -d '{"slug":"mi-negocio","name":"Mi Negocio","planCode":"growth"}' >/dev/null
curl -s -X POST $API/tenants/mi-negocio/bootstrap-owner -H "Authorization: Bearer $ADM" -H 'Content-Type: application/json' \
  -d '{"email":"dueno@mi-negocio.mx","password":"Admin!2026","nombre":"Dueño"}' >/dev/null

# 3. abrir el panel
pnpm --filter @gaespos/web-admin dev   # http://localhost:5174
```

Entra con `mi-negocio` / `dueno@mi-negocio.mx` / `Admin!2026`. Crea un producto,
ajústale stock, publícalo en la tienda — y lo verás en la `web-tienda` (mismo
tenant). El cajero lo venderá en la `web-pos`.

## Pendiente (siguiente iteración)

- Gestión de usuarios y roles del negocio
- Clientes, cortes de caja, pedidos ecommerce desde el panel
- Editor de producto con variantes, fotos, precios escalonados
- Reportes: comparativa vs periodo anterior, exportar a Excel/PDF
