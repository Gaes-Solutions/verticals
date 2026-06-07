# web-b2b — Portal Mayorista (B2B)

Portal de autoservicio para el **cliente mayorista**: ve su catálogo con **sus
precios** (lista asignada), arma pedidos, acepta/rechaza cotizaciones (firma
desde el portal) y consulta su estado de cuenta y crédito. SPA Vite+React+Tailwind
conectada a la API GaesSoft (`/b2b-portal/*`, kind de sesión `cliente_b2b`).

## Diferencias con los otros frontends
- **web-admin** (teal): el dueño del negocio. **web-tienda**: comprador B2C.
- **web-b2b** (azul): empresa cliente que compra al mayoreo, con crédito y precios negociados.

## Probar en local
1. API mock:
   ```bash
   FISCAL_PROVIDER=mock RECARGA_PROVIDER=mock pnpm dev:api
   ```
2. Dar de alta un usuario del portal (desde el tenant, con token de dueño):
   `POST /t/clientes-b2b/:id/usuarios` → `{ nombre, email, password, rol }`
   (rol `admin` o `comprador`). El cliente B2B debe existir; opcionalmente
   asígnale una lista de precios y una línea de crédito.
3. Portal:
   ```bash
   pnpm --filter @gaespos/web-b2b dev   # http://localhost:5175
   ```
4. Login con `slug del negocio` + correo + contraseña del usuario del portal.

## Flujo
Inicio (crédito + pendientes) → Catálogo (mis precios) → Mi pedido (OC, dirección,
notas) → confirmar → Mis pedidos (estado + rastreo) · Cotizaciones (aceptar/rechazar)
· Estado de cuenta (línea de crédito + facturas).
