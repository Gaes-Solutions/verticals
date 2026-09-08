# ADR 023 — Intentos durables de venta en efectivo

Fecha: 2026-09-08. Estado: implementación.

POST ventas no tenía clave durable. Un timeout del dispositivo no demuestra fracaso; repetir generaba otra venta. Para efectivo, todos los efectos son transaccionales locales, por lo que intento y venta se persisten en una única TX, sin claim previo independiente ni proveedor externo.

Clave UUID por operación y usuario dentro de tenant; hash canónico del payload incluyendo total esperado. Lock advisory transaccional por schema/usuario/clave serializa intentos. Tras lock se relee resultado antes de persistir venta+intento. Errores revierten ambos. Datos originales conservados aunque caja, precios o venta cambien después. No borrar intentos de ventas canceladas.

Preparación de precios permanece fuera TX. Se consulta replay antes y ante fallo de preparación. GET intenta lock para distinguir processing, pero not_found NO garantiza ausencia de POST: puede estar en preparación o en tránsito. Cliente nunca genera una clave nueva por timeout/not_found; conserva payload e identidad y sólo repite misma clave explícitamente. Estado actual de venta acompaña resultado recuperado, para no presentar venta cancelada como cobrada.

Contrato: POST /t/ventas permite idempotencyKey UUID opcional (legacy sin clave mantiene contrato), expectedTotal decimal obligatorio con clave y pagos sólo efectivo. GET /t/ventas/intentos/:key requiere ventas.crear y devuelve ready+result+ventaEstado, processing o not_found. Resultado fuera del propio tenant/user nunca se divulga. POST /t/ventas/intentos/preparar genera UUID sin escritura ni venta para clientes sin RNG nativo; sólo se solicita antes de una nueva operación sin pendiente.

Diferente payload misma clave→409 SALE_ATTEMPT_CONFLICT; total calculado diferente al esperado→409 SALE_TOTAL_CHANGED. Preparar/reintentar no solicita efectivo de nuevo ni ejecuta proveedor. Alcance no incluye otros métodos de pago, /:id/cobrar, sincronización offline o recibos impresos.


## Descarte durable explícito

Para permitir recotizar tras rechazo de total se agrega POST `/t/ventas/intentos/:key/cancelar`, mismo permiso/identidad y lock. Si ya existe venta, devuelve ready con estado actual y no cambia venta ni pagos. Si no existe, guarda tombstone cancelled permanente (campos venta/result/hash nulos). POST tardío revisa esa marca después de preparación y bajo el mismo lock, por lo que nunca confirma venta con la clave descartada. GET devuelve cancelled; sólo esa respuesta durable autoriza al cliente a limpiar marca y preparar otra clave tras acción explícita. Un timeout del descarte no autoriza limpiar: se consulta o repite descarte con la misma clave.

Migración adicional conserva intentos previos como ready y exige consistencia de estado en DB. No borra registros ni anula cobros/ventas. Pruebas incluyen pausa determinista del POST durante preparación, descarte antes del commit, venta ya confirmada, doble descarte y aislamiento de usuario/tenant.
