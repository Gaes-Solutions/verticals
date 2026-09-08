# ADR 020: efectos postpago durables

Fecha: 2026-09-08. Estado: aceptado para implementación.

Pago confirmado puede repetirse por webhook, respuesta de tarjeta y recuperación. Autoguía y push no contaban con deduplicación persistente. Un lock de proceso ni check-then-act evita dos instancias o un reinicio.

Se crea una cola transaccional por pedido/tipo. Confirmación de venta inserta autoguía y push en la misma TX. Claim CAS cambia pending a processing con token; sólo el dueño finaliza. El barrido del servidor recupera pendientes. Processing vencido pasa a uncertain y nunca se reenvía automáticamente: proveedor puede haber aceptado antes del corte. Incertidumbre queda consultable para gestión. No se promete entrega exactamente una vez.

Guía manual y automática comparten el mismo registro. Errores anteriores a crearGuia son reintentables; una vez invocado el proveedor cualquier fallo es incierto. Respuesta recibida se guarda antes de persistir tracking para ayudar conciliación. No se crea otra guía tras cancelación sin un flujo explícito de regeneración autorizado (pendiente).

Push conserva resultado parcial e incertidumbre; no repite lote tras éxito parcial. Errores/metadata persistidos no incluyen secretos ni texto de proveedor. No se llama proveedor dentro de transacciones. Email/campana existentes de confirmación conservan su guardia nueva-confirmación; migrarlos a esta cola queda fuera del alcance inmediato.


## Operación y límites

GET `/t/checkout/efectos-postpago` requiere gestionar pedidos y lista hasta 100 pendientes/en proceso/inciertos. No expone resultados privados del proveedor. Un resultado guía recibido se conserva en la cola para conciliación administrativa, pero todavía no existe UI/endpoint para aplicar ese resultado al tracking ni para resolver una incertidumbre sin respuesta. Nunca limpiar o volver pending un incierto sin verificar proveedor. Regeneración tras cancelación queda bloqueada deliberadamente hasta ese flujo.

Worker interno iniciado con el servidor revisa cada minuto tenants activos; pruebas buildTestApp no inician scheduler. Migración requerida antes de arrancar versión nueva. Processing de más de diez minutos se marca incierto. Resultados tardíos del dueño original pueden finalizar con su token sin autorizar otro envío.

Push sin VAPID o suscripciones conserva resultado cero; no significa entrega al dispositivo. Lote parcialmente fallido se marca incierto sin repetir suscripciones ya aceptadas. No se implementó reenvío por suscripción individual.

Pruebas DB preparadas: tenant-post-pago (6), atomicidad e idempotencia de checkout. Proveedor y push simulados, sin red real.
