# ADR 031 — Pagar al recoger en la tienda

Fecha: 21-sep-2026. Piloto Retail movido al 15-oct-2026.

## Problema

La tienda en línea solo podía cobrar con tarjeta y, en producción, el checkout
respondía "El pago no está disponible" si el negocio no tenía llave de Conekta
o Stripe. Un negocio recién dado de alta no puede vender nada hasta abrir su
cuenta con un proveedor, que tarda días y exige documentos. El API ya aceptaba
`oxxo`, `spei`, `transferencia` y `cod`, pero ningún camino los usaba.

## Decisión

Habilitar **pagar al recoger** como forma de pago que no pasa por proveedor:

- Solo aplica a pedidos que se recogen en tienda (`click_collect`). Un pedido
  que se manda por paquetería no se puede pagar al recoger: se rechaza con 422.
- El pedido se registra completo (folio, snapshot comercial, inventario
  comprometido según las reglas existentes) con `statusPago: "pendiente"` y sin
  `paymentProvider`. Su referencia es `mostrador_<folio>`, no la de un proveedor.
- El cobro se registra desde el panel, en el pedido:
  `POST /t/pedidos-ecommerce/:id/pago-recibido` con método (efectivo, tarjeta en
  terminal o transferencia) y referencia opcional.
- Ese cobro reusa la misma función que el webhook del proveedor
  (`confirmarPagoPedido`): genera la venta, descuenta inventario, marca el pedido
  y avisa al cliente. Los dos caminos dejan exactamente el mismo rastro, así que
  el corte de caja y el inventario cuadran igual.
- Es idempotente: cobrar dos veces el mismo pedido no duplica la venta.

## Lo que esto no resuelve

- No hay pago contra entrega a domicilio: exige política de riesgo y conciliación
  del repartidor, y no se habilita sin decidirlo.
- OXXO y SPEI siguen pendientes: el API los acepta, pero necesitan la cuenta del
  negocio en Conekta para emitir la referencia.
- El cobro en mostrador no pide caja abierta todavía; entra al corte por la venta
  que genera, no como movimiento de caja propio.

## Validación

5 pruebas en `apps/api/test/tenant-pago-mostrador.test.ts`: el pedido no toca al
proveedor, paquetería lo rechaza, el cobro genera venta y descuenta inventario,
cobrar dos veces no duplica, y un pedido con proveedor no se cobra en mostrador.
