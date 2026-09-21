# Reconciliación de ventas pendientes — 18 de septiembre de 2026

## Correcciones

La sincronización de una venta nueva requiere `payload.expectedTotal`,
`payload.expectedAperturaId` y `payload.cajaId`. El total es el del ticket original,
no el efectivo recibido (que puede incluir cambio). La apertura debe ser la que
estaba vigente al registrar la operación local.

- El servidor compara el total original con su cálculo antes de persistir. Tanto
  un aumento como una reducción de precio dejan la operación en `failed` para
  revisión, sin crear venta ni confirmación de sincronización.
- La apertura actual debe coincidir con la original. Una caja cerrada y reabierta
  no absorbe la venta del turno anterior. El bloqueo transaccional de la apertura
  sigue protegiendo contra un cierre durante la persistencia.
- Los reintentos de operaciones ya confirmadas recuperan su acuse antes de
  recalcular o consultar una nueva apertura; conservan su idempotencia.
- SQLite conserva la operación rechazada. Tras reiniciar, un reintento utiliza
  exactamente la misma clave, total, apertura, productos y pagos. Reutilizar la
  clave con otros importes o apertura se rechaza sin sobrescribir el original.
- La demo `apps/api/scripts/demo-offline-sync.ts` incluye los campos requeridos.
- El intento de efectivo del POS también guarda `expectedAperturaId` junto con el
  total; una recuperación usa ese mismo turno y no el que esté abierto después.

## Compatibilidad y alcance

Las operaciones antiguas sin total/apertura que todavía no fueron aplicadas se
rechazan para revisión. **No completar estos campos con los datos actuales al
reconectar:** no prueban qué importe se cobró ni a qué turno corresponde.
Los acuses existentes y ligados a usuario/contenido siguen siendo recuperables.

Esto impide cambiar silenciosamente el total o la apertura. No implementa todavía
la aceptación de precios históricos: si el precio cambió, la venta requiere
reconciliación. Tampoco garantiza conservar el desglose de impuestos, promociones
y precios por línea cuando dos cambios se compensan dejando el mismo total.
El contrato completo del comprobante y el cálculo local siguen pendientes.

## Validación

- **24 pruebas API** aprobadas en PostgreSQL/Redis aislados, incluidas omisiones
  de los campos obligatorios, cambios de precio en ambas direcciones, cambio de
  apertura, recuperación del acuse previo, concurrencia y rollback del acuse.
- **35 pruebas sync-client** aprobadas, incluida persistencia real SQLite tras
  rechazo/reinicio y protección frente a sobrescritura de total/apertura.
- TypeScript API aprobado. Formato verificado; sin cambios de interfaz en esta etapa.
- El POS conserva y valida la apertura del intento de efectivo; sus pruebas quedan
  en **164 aprobadas**.
- No se ejecutó la demo ni se operó producción. La demo se actualizó al contrato;
  su flujo de ventas se cubre mediante la prueba API aislada.

## Próximo paso

Definir y persistir el comprobante completo junto con la operación local, con
cálculo de precios/impuestos equivalente al servidor y autorización offline de
turno. Después conectar el cobro y la revisión de discrepancias al POS. El cobro
sin conexión permanece deshabilitado hasta cerrar esos requisitos.
