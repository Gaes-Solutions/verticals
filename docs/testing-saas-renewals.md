# Renovaciones de suscripción SaaS

## Qué ejecuta el worker

`BILLING_SCHEDULER_ENABLED=true` activa un barrido al iniciar el API y cada
`BILLING_RUN_INTERVAL_MIN` minutos (15 por defecto). Ejecuta conversiones de prueba,
renovaciones de suscripciones locales y reintentos de facturas vencidas. Al apagar
el servidor espera al barrido en curso antes de cerrar conexiones.

La suscripción se bloquea en PostgreSQL al crear cada ciclo. La factura, su clave
única de ciclo y el avance del periodo se guardan en una sola transacción. Otro
proceso no genera el mismo ciclo. Si el proceso muere después de crear la factura,
el barrido de mora retoma la factura abierta. Con Stripe, se crea una intención sin
confirmarla y se guarda su ID antes de pedir el cargo. Un fallo de conexión al
confirmar conserva ese ID: el siguiente barrido consulta y reutiliza la misma
intención, en lugar de crear otro cargo. Pago y reactivación se confirman en
la misma transacción. El folio usa un contador anual atómico inicializado desde
el mayor folio histórico; eliminar una factura no reutiliza su número.

Se respeta cancelación al cierre del periodo, pausa de cobranza, negocios dados
de baja y suscripciones administradas por un proveedor externo. Desactivar
`autoChargeEnabled` conserva la factura abierta sin cobros automáticos ni mora
automática. Una factura de cero se liquida sin tarjeta ni crear un pago ficticio.
Una factura pendiente de un ciclo anterior impide acumular ciclos nuevos; una
factura de prorrateo independiente no impide convertir el trial.

Un fallo al preparar una suscripción revierte su periodo y se registra en el
resultado del barrido; las demás suscripciones continúan. Los logs del worker
identifican la etapa y los IDs pendientes sin imprimir credenciales del proveedor.
La selección procesa hasta 100 suscripciones vencidas por etapa y barrido. Debe
supervisarse el rezago si se amplía el volumen o hay configuraciones inválidas.

Los webhooks de Stripe se autentican con firma. Para confirmar el pago se valida
cliente, monto y moneda contra la factura; se acredita una sola vez y no se
resucitan facturas anuladas/no cobrables. Los metadatos de la intención permiten
recuperar una confirmación que llegue antes del guardado del intento síncrono.

## Verificación reproducible

```sh
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs --api-tests test/billing-recovery.test.ts test/billing-renewals.test.ts test/billing-scheduler.test.ts test/billing.test.ts test/platform-workflows.test.ts
pnpm --filter @gaespos/billing test
```

El runner exige PostgreSQL local, crea y migra una base exclusiva y la borra al
terminar. Excluye claves de Stripe, Facturama, correo y otros proveedores.
Nunca debe probarse el worker financiero contra los datos de producción.

Los casos nuevos incluyen mensual/anual, fin de enero y año bisiesto, dos workers,
folios concurrentes y tras eliminación, cancelación, pausa/reanudación,
importe cero, opt-out de cobro, error de precio con rollback, recuperación de
mora, trial simultáneo, cupón de una sola aplicación, webhook temprano/repetido,
importe/moneda/cliente distintos y estados finales de factura.

`billing-recovery.test.ts` verifica por HTTP autenticación y pertenencia de factura,
exclusión de viewers, validación de tarjeta contra el customer, recuperación de
autenticación pendiente y conciliación cuando el webhook se retrasa. Las pruebas
del cobro comprueban que el ID ya está confirmado en PostgreSQL antes de invocar
el cargo, que una respuesta perdida no crea otra intención y que un rechazo
reutiliza la intención con una nueva clave de confirmación.

El recorrido de navegador incluye ahora la pantalla real **Mi suscripción**, en
escritorio y 320 px: precio del plan vigente por moneda/intervalo, fecha del trial,
folio de factura e importes en centavos convertidos correctamente. La sección de
banco simulado prueba cancelar y completar la autenticación, y exige confirmación
del backend antes de mostrar el pago exitoso. El runner también usa el puerto 5180.

La recuperación usa el flujo de [confirmación de PaymentIntents de Stripe](https://docs.stripe.com/api/payment_intents/confirm), con Stripe.js para la interacción del banco. Una tarjeta guardada se valida contra el customer de su propio negocio.

Verificación de esta entrega: 277 pruebas de API en 20 suites, 13 contratos del
cliente Stripe, typecheck de 30 paquetes y recorrido de navegador de plataforma
y dueño. Las bases y sesiones usadas para estas pruebas se eliminan al finalizar.

## Validación externa con Stripe sandbox

Se conectaron las tres variables reales del **sandbox**, separadas de producción,
y un webhook habilitado para `payment_intent.succeeded` y
`payment_intent.payment_failed` en:
`https://verticals-staging.up.railway.app/webhooks/stripe`.

Durante la configuración se detectaron las claves publicable/secreta
intercambiadas. Se corrigieron directamente en Railway, sin imprimirlas. El API
ahora rechaza una clave publicable como credencial del backend y nunca devuelve
una clave secreta/restringida en `/billing/stripe-config`, aunque se configure por
error en el campo público. Cinco regresiones por HTTP cubren este último caso.
Conviene rotar la clave secreta de pruebas que estuvo en ese campo público.

Pruebas externas completadas con la versión desplegada:

- Ambas claves se autenticaron contra el mismo sandbox de Stripe.
- Alta de una tienda temporal, sesión real del dueño, SetupIntent real y guardado
  de tarjeta mediante la API del sistema.
- Un PaymentIntent de prueba emitió un webhook real firmado: la factura pasó de
  abierta a pagada sin confirmación manual ni webhook simulado.
- El cobrador desplegado preparó/persistió la intención, cobró y no duplicó el
  pago al ejecutarse de nuevo.
- Una tarjeta que rechaza cargos dejó la factura abierta. Al reemplazarla por
  una Visa de prueba se recuperó el pago usando la intención original.
- En la vista móvil del panel desplegado, Stripe.js abrió su ventana real de
  pruebas 3DS. Se completó la autenticación y el servidor confirmó la factura
  pagada. No se interceptaron ni simularon las respuestas de Stripe en ese recorrido.
- Se reembolsaron los cargos del sandbox, se cancelaron los intentos pendientes
  y se eliminaron el cliente temporal de Stripe, la tienda, su esquema y sus
  sesiones privadas locales. Gaesland conservó sus datos originales.

Estas verificaciones corresponden al **cobro de suscripciones SaaS** en sandbox.
El flujo comercial de cada tienda mediante Stripe Connect, activación/KYC,
comisiones, reembolsos operativos y dinero real conserva sus propias validaciones.
No se emitieron CFDI ni se enviaron transferencias reales.

El dueño recupera un pago desde **Mi suscripción → Facturas → Completar pago**.
`POST /billing/invoices/:id/recover-payment` consulta la intención existente y
solo entrega su client secret al titular autorizado, sin caché. Al volver del
banco se consulta nuevamente Stripe antes de acreditar el pago.

## Pendientes para habilitar cargos comerciales

1. Definir el dominio del negocio, publicar DNS y comprobar HTTPS desde fuera.
   Staging solo tiene dominios automáticos de Railway, sin dominio propio.
2. Completar la integración de CFDI SaaS con emisor real: RFC, razón social,
   régimen, código postal y certificados registrados en la cuenta fiscal;
   además del perfil del receptor y la política de impuestos/precios. No usar
   las credenciales fiscales de una tienda como emisor de la plataforma.

La [documentación oficial de Facturama](https://facturama.mx/docs/es/api-lite/pasos-api-multiemisor)
requiere registrar el CSD del emisor antes de timbrar en Multiemisor. Un pago
exitoso de Stripe no equivale a un CFDI emitido. No se habilita emisión automática
con datos inventados ni se considera certificada por estas pruebas.
