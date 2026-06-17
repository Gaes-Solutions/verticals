# Análisis de gaps — Vertical de Ventas (retail/mayoreo/abarrotes)

> Generado en modo autónomo (2026-06-17). Compara los PRDs (hito-1-pos-core, hito-2-comercial, análisis 03-flujos/04-modelo-datos, memorias flujo_pos_retail / modelo 4.7 / 4.9 / requisitos_funcionales) contra el código real en `apps/api/src/modules/tenant/*`, `apps/web-pos`, `apps/web-admin`.

## Estado general

La vertical de ventas está **muy madura** (tag `retail-v1` cerrado, hito-1 y hito-2 casi 100%). Módulos backend implementados y con tests: usuarios, roles, sucursales, cajas, productos, variantes, inventario, listas-precios, promociones, ventas, apartados, cxc, devoluciones, clientes, clientes-b2b, cotizaciones, pedidos, cortes, ordenes-compra, cfdis, cfdis-recibidos, lealtad, segmentos, campanas, recargas, tickets.

## Gaps REALES y realizables de forma autónoma

Ordenados por valor/independencia. Cada uno se implementa con tests + commit propio.

1. **`vistas-guardadas/` (atajos personalizables)** — RF / hito-1 1.6 lo dejó diferido. Modelo `UsuarioVistaGuardada` YA existe en el schema. Falta el módulo CRUD `/t/vistas-guardadas` (listar mías, crear, actualizar, borrar, marcar default) gated por sesión tenant (cada quien las suyas). Lo consume el POS/admin para filtros guardados. **Backend puro, seguro.**

2. **Autofactura pública (`POST /autofactura`)** — hito-1 1.5.c diferido. Endpoint público (sin auth tenant) que recibe el token JWT del QR del ticket + datos fiscales del cliente y emite el CFDI reusando `emitirCfdi(..., esAutofactura)`. Requiere: firmar un token de autofactura al cerrar venta (corto, con ventaId+tenant) y un endpoint público que lo valide. **Backend, reusa lógica CFDI existente.**

3. **Fiado → CxC formal (`POST /clientes/:id/fiado/regularizar`)** — hito-2 diferido (necesitaba CxC, que YA existe). Convierte el saldo de fiado informal de un cliente en una Cuenta por Cobrar formal. **Backend, reusa cxc.**

4. **Método de pago `credito_b2b` con validación de línea** — hito-2 diferido. Permitir cobrar una venta/pedido B2B contra la línea de crédito del cliente, validando `linea_disponible = autorizada - sum(cxc abiertas)`. **Backend, reusa clientes-b2b + cxc.**

## Fuera de alcance autónomo (requieren hardware/infra/decisión)

- **Print-bridge (Tauri/ESC-POS, drivers Epson)** — necesita impresoras físicas para verificar (Hito 5).
- **Deploy/staging/tags + video demo** — necesita Hetzner+dominio (Gaby).
- **Benchmarks de performance (k6, P95)** — requieren setup de carga; medir contra staging.
- **Validación SAT API en tiempo real** — diferida a V2.

## Plan de ejecución (este loop)

FASE 1: implementar gaps 1→4 en orden, cada uno con su test y commit. Si al revisar el código un gap ya está cubierto, anotarlo aquí y seguir. Al cerrar los 4 (o documentar que no aplican), pasar a FASE 2 (plan veterinaria) y PAUSAR para aprobación de Gaby.
