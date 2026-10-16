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

## Configuración externa pendiente

Staging no tenía claves Stripe ni configuración del emisor SaaS al revisar esta
entrega. Las pruebas de cobro usan simulación explícita en una base desechable.
Antes de habilitar cargos comerciales:

1. Configurar en el servicio API de **staging** las tres variables de Stripe
   sandbox: `STRIPE_API_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
   Guardarlas en Railway, nunca en un commit ni en el chat. Endpoint:
   `https://verticals-staging.up.railway.app/webhooks/stripe`.
2. Probar guardar tarjeta, cobro, rechazo, recuperación y autenticación 3DS con
   Stripe real en modo test. La recuperación de autenticación pendiente y la
   reutilización de intenciones rechazadas ya están implementadas y probadas con
   contratos simulados; aún requieren validación con Stripe externo.
   El dueño entra a **Mi suscripción → Facturas → Completar pago**. La API
   `POST /billing/invoices/:id/recover-payment` consulta la intención existente y
   solo entrega su client secret al titular autorizado, sin caché. Al volver del
   banco se consulta nuevamente Stripe antes de acreditar el pago.
3. Definir el dominio del negocio, publicar DNS y comprobar HTTPS desde fuera.
   Staging solo tiene dominios automáticos de Railway, sin dominio propio.
4. Completar la integración de CFDI SaaS con emisor real: RFC, razón social,
   régimen, código postal y certificados registrados en la cuenta fiscal;
   además del perfil del receptor y la política de impuestos/precios. No usar
   las credenciales fiscales de una tienda como emisor de la plataforma.

La [documentación oficial de Facturama](https://facturama.mx/docs/es/api-lite/pasos-api-multiemisor)
requiere registrar el CSD del emisor antes de timbrar en Multiemisor. Un pago
exitoso de Stripe no equivale a un CFDI emitido. No se habilita emisión automática
con datos inventados ni se considera certificada por estas pruebas.
