# POS web — efectivo durable

Implementación local de ADR023. No acredita otros pagos, POS offline, hardware ni proveedor externo.

Antes de abrir modal se consulta cotización de servidor. Para efectivo puro, el intento y payload se guardan antes del POST, con expectedTotal y clave UUID emitida por API. Persistencia aislada por tenant/usuario/sucursal/caja verificados mediante /auth/tenant/me. No incluye datos de tarjeta ni dirección; sí IDs comerciales, cantidades y descuento/efectivo recibido. Efectivo puro conserva el monto realmente recibido (200 para total150), dejando al backend registrar cambio50. El total recuperado debe ser decimal válido y coincidir en céntimos con expectedTotal antes de desbloquear otra venta.

Web Locks con ifAvailable impide operaciones simultáneas entre pestañas; sin Web Locks se bloquea este flujo. Guardias síncronas evitan doble clic. Un intento pendiente bloquea ventas nuevas; mensajes storage sincronizan pestañas. POST exitoso no limpia: GET debe devolver ready y estado actual de venta. Fallo de recibo conserva venta e intento y nunca repite cobro.

not_found no demuestra fracaso ni permite otra clave. Reintento explícito conserva el payload y UUID originales. Descartar invoca tombstone backend; un timeout conserva intento. Sólo ready/cancelled verificados permiten acción explícita nueva venta; descartar nunca cancela una venta. Otros métodos siguen su contrato previo, sin garantía durable nueva.

Validación local: 74 pruebas POS (incluye búsqueda, efectivo recibido y conciliación de totales), tipos y build aprobados. La revisión visual/fixture la coordina root. Matriz navegador con Web Locks y dispositivos físicos pendiente. No se escribieron ventas de producción ni ejecutaron DB suites desde esta subtarea.
