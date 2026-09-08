# ADR 015: conservar el acuerdo comercial del checkout

Fecha: 2026-09-08. Estado: aceptada para implementación por coordinación de la entrega de tienda.

## Contexto

La confirmación del pago recalculaba los artículos con el catálogo vigente y no representaba descuentos de checkout ni envío en la venta. Un cambio de precio o impuesto entre intento y webhook alteraba el registro comercial respecto del cobro.

## Decisión

Guardar un snapshot JSON versionado en el pedido antes de contactar al proveedor, en la misma transacción que la reserva de cupón. Incluye identidad del artículo y sus datos fiscales, tipo de venta, importes por línea, distribución del descuento, moneda, sucursal y totales. La confirmación materializa ese snapshot en la venta sin consultar precios vigentes ni reservar cupones de nuevo. Los importes cobrables se redondean a centavos con reparto determinista de residuos; los totales de líneas, pedido, venta y pago coinciden.

El envío con costo se representa mediante una variante de producto de tipo servicio configurada por negocio. No crear productos ni tasas automáticamente. Sin un servicio activo válido, rechazar antes del cobro. El precio del concepto es el cargo de envío validado, no el precio de catálogo del servicio. Los servicios no producen movimientos de inventario al vender, cancelar ni devolver; se utiliza el tipo congelado en el snapshot.

El panel conserva la configuración mediante `envioVarianteId` nullable y consulta opciones autorizadas por `ecommerce.configurar`. Los pedidos históricos sin snapshot requieren conciliación explícita y no se recalculan automáticamente.

## Límites

No certifica timbrado: la inferencia de IVA fijo en el adaptador CFDI es un pendiente separado T14. Tampoco introduce reembolsos externos ni decide políticas comerciales de devolución del envío. La operación sin snapshot histórico queda bloqueada para evitar revalorar un cobro anterior. No aplicar migraciones ni cambiar configuraciones de producción como parte de esta implementación.
