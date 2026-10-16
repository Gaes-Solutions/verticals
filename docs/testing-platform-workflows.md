# Flujos de plataforma — auditoría del 15 de octubre de 2026

## Alcance y ambiente

Se revisaron los flujos del panel de plataforma y sus límites con el dueño y los compradores. Las operaciones de escritura se probaron en bases PostgreSQL locales independientes, con migraciones reales, sesiones y TOTP reales y credenciales externas excluidas. La simulación de cobros exige `NODE_ENV=test|development` y `PAGOS_ALLOW_MOCK=true`; no puede acreditar pagos en producción.

| Flujo | Validación realizada |
| --- | --- |
| Plan comercial | Alta desde navegador con descripción vacía; precio mensual persistido; precios antiguos sin `PlanPrice` compatibles; planes inactivos fuera del catálogo público. |
| Alta de tienda | Formulario completo, esquema y defaults, dueño, directorio de correo, primer login sin slug, suscripción trial y correo de cobro. Repetir el alta no reemplaza la contraseña. |
| Ciclo de vida | Suspender/archivar bloquea la operación con tokens anteriores. Reactivar restaura acceso. El dueño suspendido conserva acceso a facturación para resolver su suscripción. Compradores de negocios suspendidos/archivados no conservan acceso al portal. |
| Plan y suscripción | Cambio desde el panel actualiza negocio y suscripción vigente; las suscripciones canceladas no se modifican ni sustituyen a la vigente al consultar. |
| Dominio | Conectar, TXT positivo simulado, resolver host, desconectar y dejar de resolver. Una reserva concurrente solo puede pertenecer a un negocio. Una reserva fallida revierte la configuración local. La verificación comprueba que el dominio no cambió durante la consulta DNS. |
| Facturas | Importe convertido de centavos a moneda, 53 registros accesibles por páginas, filtros, reprogramación, motivo inválido, anulación y estados finales. La página ignora respuestas anteriores de su propia consulta al cambiar de filtro/página. |
| Cobro y mora | Conversión de trial, éxito/fallo simulado, reintentos y suspensión de mora; dos cobradores no duplican pagos; negocios cancelados o archivados quedan fuera de cobro automático. |
| Webhook de prueba | Repetición simultánea acredita una sola vez; no resucita facturas anuladas. El endpoint sin firma sigue limitado a desarrollo/test. |
| Partners | Alta desde navegador, aprobación/rechazo concurrentes, generación de payout, doble envío, registro manual de pago y actualización de comisiones. Un payout conserva la moneda de sus comisiones y rechaza mezclar monedas. |
| Datos inválidos | Periodos inexistentes como 202613, porcentajes de texto mayores a 100, fechas inválidas, alta inválida y recursos inexistentes. |
| Sesiones y permisos | Tokens vencidos, revocación del rol dueño y desactivación con JWT anterior, administrador de facturación archivado y usuario de consulta sin permiso de escribir. Se conserva la matriz mínima de Superadmin/Soporte/Cobranza. |

## Fallos corregidos

- El alta administrativa creaba el dueño pero no la suscripción ni la configuración inicial de cobro. Ahora utiliza el mismo alta completa que el registro de negocio y mantiene el formato de entrega de credenciales del panel.
- El formulario de plan enviaba `description: null`, rechazado por su propia API; además el catálogo no guardaba el precio mensual que utiliza billing.
- Suspender o archivar no bloqueaba las peticiones operativas de sesiones ya emitidas.
- Facturas mostraba centavos como pesos y no ofrecía acceso a registros posteriores a los primeros 50.
- Operaciones simultáneas podían acreditar dos pagos, tomar dos decisiones sobre una comisión o sobrescribir el folio de un payout. Se agregaron transacciones, actualizaciones condicionales y bloqueos de PostgreSQL compartidos entre procesos.
- Una reserva de host usaba comprobación seguida de upsert, que podía transferir el dominio en una carrera. La reserva ahora se serializa y solo actualiza al dueño del host.
- Billing confiaba en el rol guardado dentro del token del dueño; ahora recarga el usuario y sus roles actuales. Los administradores antiguos se validan contra la base y un viewer no escribe.
- Faltando proveedor, el cobro podía recurrir al mock fuera de pruebas. Ya no acredita dinero ni guarda tarjetas ficticias en producción. Los CFDI simulados tampoco se crean para cobros de producción. La tarjeta se valida contra el customer de Stripe de su propio negocio antes de guardarla. El cliente Stripe tiene límite de espera. La ausencia de proveedor devuelve 503 con una explicación en las rutas de tarjeta, SetupIntent y Connect; no se convierte en un 500 genérico ni en un incidente inesperado.

## Repetir el recorrido de navegador

Con PostgreSQL local y permisos para crear una base desechable:

```sh
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs
```

El comando rechaza servidores de base de datos remotos, crea una base exclusiva, aplica migraciones, inicia API y panel locales y prueba los formularios con Chromium. Al terminar, incluso con error, cierra ambos servidores y elimina la base y las sesiones privadas. Usa los puertos 3059 y 5179 y falla si están ocupados. No debe apuntarse a una base de producción.

Las regresiones de API están en `apps/api/test/platform-workflows.test.ts`, junto a las suites existentes de billing, tenants, roles y partners. El recorrido de navegador se añadió a `.github/workflows/pr.yml` después de las pruebas unitarias/integración.

## Límites y pendientes para una liberación comercial

- Stripe sandbox ya quedó configurado y validado externamente: tarjeta guardada, cobro, webhook real firmado, rechazo y recuperación sobre la misma intención, y 3DS en la vista móvil desplegada. Ver [evidencia y alcance](testing-saas-renewals.md#validación-externa-con-stripe-sandbox). La tienda y el cliente temporales se eliminaron y los cargos de prueba se reembolsaron. Esto no certifica dinero real ni la activación de Stripe Connect de cada comercio.
- La prueba TXT positiva usa un resolver DNS simulado. Falta conectar un dominio real, publicar CNAME/TXT y comprobar el certificado HTTPS y el acceso público desde ese dominio.
- Los payouts son registros de pago manual. La prueba no realiza una transferencia SPEI/PayPal/Connect.
- El cálculo V1 de comisiones toma el precio del plan del referido activo; no se probó una conciliación automática contra cobros reales.
- El motor de renovación mensual/anual y su scheduler ya tienen pruebas de PostgreSQL y concurrencia; ver [renovaciones SaaS](testing-saas-renewals.md). El cobro del worker también se verificó con Stripe sandbox; la renovación de periodos mensuales/anuales y su concurrencia conservan las pruebas aisladas de PostgreSQL.
- La emisión fiscal real del SaaS sigue pendiente de integración y validación con los datos del emisor y su cuenta/CSD de Facturama. El cobro confirmado no fabrica un UUID fiscal de producción.
- Esta batería no certifica todos los flujos del POS, tienda y APK ni todos los posibles fallos distribuidos o de infraestructura. Esos productos conservan sus suites específicas.
