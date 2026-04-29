# GaesSoft POS — Flujo Cajero retail (Flujo 1 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_pos_retail.md`
> **Descripción:** Flujo completo del cajero retail aprobado por Gaby — login, POS, cobro, cierre Z

Flujo 1 (Cajero/a en POS retail) aprobado por Gaby tras Análisis 3.2.1. Ver detalle completo en transcripción de sesión 2026-04-24.

**Decisiones específicas cerradas:**
- **Atajos de teclado personalizables**: por defecto F2 (búsqueda), F4 (cliente), F12 (cobrar), Esc (cancelar), Ctrl+P (suspender), Ctrl+R (reanudar), Ctrl+D (descuento) — siguiendo Eleventa para que el mercado MX no se sienta perdido. PERO cada cajero puede personalizar los suyos en su perfil, y el dueño puede sobreescribir defaults a nivel tenant.
- **CFDI**: ambos modos disponibles — cajero puede facturar en el momento (Eleventa-style) **o** dar código de auto-facturación al cliente con QR en el ticket (cliente factura solo desde portal con UUID). Tenant elige cuál es el default.

**Layout principal POS aprobado:** dual-pane horizontal en desktop (productos a la izquierda, carrito a la derecha) + tabs intercambiables Productos/Carrito en móvil PWA.

**Referencias incorporadas:** Square (UX general, recibos digitales, modo entrenamiento), Shopify (variantes, devoluciones), Lightspeed (atajos, multi-sucursal, X/Z reports), Toast (split payments), Eleventa/BindERP (CFDI, ESC/POS, mercado MX), Clip/MercadoPago Point (terminal integrada, MSI).

**Acciones cubiertas:** apertura de turno (con foto opcional, fondo sugerido del cierre anterior), búsqueda inteligente (nombre/SKU/barcode/código corto/cámara), tiles configurables, agregar productos (scanner/click/búsqueda/voz futura), variantes en modal, productos a granel con balanza, modificación línea (cantidad/precio/descuento línea/nota), descuentos multi-nivel (auto-promocional, línea, global, cupón) con aprobación gerente >X%, asignación cliente (default Público en general, F4 buscar, modal crear), cobro (efectivo con cambio, tarjeta con MSI y terminal integrada, mixto, SPEI, OXXO, crédito), cierre venta (folio único tenant-sucursal-caja-folio, ticket térmica + opción digital email/SMS/WhatsApp default, CFDI inmediato o por QR, broadcast Socket.io stock, limpieza carrito), suspender/reanudar venta, cancelar (con permiso y motivo), devolución (parcial/total con motivo y reposición de stock), re-imprimir último ticket, corte X (snapshot), corte Z (resumen esperado, conteo real con denominaciones, foto opcional, reporte impreso + digital).

**Permisos definidos:** pos.usar, cajas.abrir, cajas.cerrar, ventas.create, precios.modificar, descuentos.aprobar_alto, ventas.cancelar, devoluciones.procesar, clientes.create, productos.read, ventas.reimprimir, reportes.corte_propio, reportes.corte_todos.

**Métricas capturadas por cajero:** ventas turno, ticket promedio, top productos, tasa devoluciones, tiempo por venta, diferencia promedio en cortes, clientes nuevos creados.

**Why:** Flujo modelado contra los líderes globales de POS adaptado al mercado MX. Los cajeros son el rol más usado del producto — UX equivocada aquí mata el producto.

**How to apply:** Cuando se diseñe la UI del POS retail, este es el contrato. Si Gaby cambia algo, actualizar este memory.
