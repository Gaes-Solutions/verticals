# Stripe para las compras de la tienda

## Implementación

- La tienda web toma del servidor el proveedor, la llave **pública** y la cuenta
  Connect del comercio. Stripe Elements recibe los datos de tarjeta directamente.
- Se crea y guarda el PaymentIntent antes de confirmar en el navegador. La creación
  usa una clave idempotente por pedido. Una tarjeta rechazada puede cambiarse y
  volver a confirmar el mismo intento con «Retomar pago».
- La consulta autenticada comprueba con Stripe cuenta, intent, pedido, tenant,
  moneda, importe e importe recibido antes de generar venta y descontar stock.
- El webhook público `/webhooks/stripe/commerce` permite finalizar aunque el
  comprador cierre la página. Verifica la firma y vuelve a consultar Stripe.
  Redeliveries y consultas repetidas no duplican la venta.
- Una tienda sin Connect habilitado no puede cobrar accidentalmente en la cuenta
  de la plataforma. Web y móvil no ofrecen tarjeta hasta completar la conexión.
- La página vuelve a «Mi suscripción» después del registro de Stripe para actualizar
  su estado; conserva el negocio de origen. El modo de prueba está señalado.

## Configuración

Además de `STRIPE_API_KEY` y `STRIPE_PUBLISHABLE_KEY`:

- `STRIPE_WEBHOOK_SECRET`: suscripciones de la plataforma, conserva su endpoint.
- `STRIPE_COMMERCE_WEBHOOK_SECRET`: eventos de la cuenta de la plataforma dirigidos
  a `/webhooks/stripe/commerce` (compatibilidad con pedidos anteriores).
- `STRIPE_CONNECT_WEBHOOK_SECRET`: otro endpoint con la misma URL, configurado para
  recibir eventos de **cuentas conectadas**.
- Los dos endpoints de comercio escuchan `payment_intent.succeeded` y
  `payment_intent.payment_failed`. Los rechazos no cierran el intento de tarjeta:
  se permite reintentar sin crear otro pedido.
- `WEB_ADMIN_URL`: URL del administrador del ambiente correspondiente.
- La tienda debe seleccionar Stripe como pasarela y terminar Connect Express.

No reutilizar el secreto de firma de suscripciones en los nuevos endpoints. Las
llaves y los secretos se guardan en Railway, nunca en documentos o comandos visibles.

## Verificación del 15 de octubre de 2026

- 110 pruebas del BFF/web en verde.
- 60 pruebas del paquete de pagos en verde.
- 49 pruebas de checkout/API en verde; después se añadió una de paridad web/móvil,
  y se repitieron sus dos suites afectadas: 25/25. Total único de este conjunto: 220.
- La suite nueva cubre conexión pendiente, propiedad de intentos, recuperación,
  importe/moneda/metadata/importe recibido incorrectos, firma inválida, cuenta ajena
  y entrega repetida de webhook sin duplicar venta.
- Typecheck de 30 paquetes y build de API y web-tienda en verde en la primera entrega.

**Estado externo:** las llaves y ambos endpoints reales de Stripe sandbox están
configurados en staging. Gaesland tiene seleccionada la pasarela Stripe y una
cuenta Express de **pruebas** creada, pero Stripe aún no habilita sus cobros: el
registro hospedado está pendiente. No se ha validado todavía una compra con tarjeta
completa en la tienda publicada, ni depósitos, comisiones, KYC real o producción.
No confundir esto con las pruebas reales anteriores de suscripciones SaaS y 3DS.

## Prueba que falta en la tienda publicada

1. Dueño: administrador staging → Mi suscripción → Cobros a tus clientes (Stripe)
   → Continuar registro. Completar el registro en **modo de prueba** de Stripe.
2. Regresar al administrador y comprobar «Conectado». La tienda debe ofrecer tarjeta.
3. Comprador: agregar producto, completar nombre/correo y dirección o recogida.
4. Pagar con una tarjeta de prueba de Stripe; verificar folio en la confirmación y
   el mismo pedido pagado en administración, venta generada y stock actualizado.
5. Repetir con tarjeta rechazada y autenticación 3DS; cambiar tarjeta y retomar el
   mismo intento. Recargar o cerrar la página después del cobro y comprobar que
   el webhook finaliza sin otro cobro ni otra venta.

Fuentes: [estado del pago y webhooks](https://docs.stripe.com/payments/payment-intents/verifying-status),
[Stripe Connect en pruebas](https://docs.stripe.com/connect/testing).
