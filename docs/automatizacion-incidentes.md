# Registro de incidentes, propuestas y entregas para revisión

Este circuito registra errores y prepara propuestas. No aplica correcciones ni despliega código desde el servidor del API. Tener las variables o el código disponible no demuestra que el circuito esté habilitado o conectado a un ejecutor externo.

## Registro y privacidad

El API registra errores 5xx en `system_incidents` (base master), agrupa ocurrencias por huella y guarda contador y evento de aparición en una transacción. El upsert evita perder la primera aparición cuando llegan errores concurrentes. Las rutas se almacenan sin consulta ni fragmento.

El texto, el contexto, las notas del auditor y los datos enviados a proveedores se sanean con reglas que reconocen credenciales habituales: autorización, cookies, tokens, contraseñas, claves API y credenciales en conexiones. El saneamiento es una defensa de mejor esfuerzo; no garantiza reconocer todos los secretos o datos personales. No agregar credenciales al contexto de un error.

Una nueva aparición de un incidente `resolved` lo reabre como `open`, elimina decisiones anteriores e invalida la propuesta. Una decisión `ignored` se respeta: nuevas apariciones incrementan el contador, sin deshacer el rechazo del auditor.

## Revisión y alertas

`INCIDENT_AUDITOR_ENABLED=true` habilita el scheduler; `INCIDENT_AUDITOR_INTERVAL_MIN` define el intervalo, con cinco minutos por defecto. Cada lote procesa hasta diez incidentes `open` cuya revisión vence. La fábrica de IA configurada genera una propuesta; un fallback local no equivale a una revisión por un modelo remoto.

La revisión reclama la fila durante quince minutos mediante comparaciones atómicas de estado, versión y ocurrencias. Publica propuesta y evento juntos solo si conserva la reserva, la fila sigue abierta y no cambió durante la consulta a IA. El resumen remoto tiene un límite total de sesenta segundos y no hace reintentos internos; el scheduler decide cuándo reintentar. Brevo y Resend limitan sus peticiones a treinta segundos. Un error de IA permite reintentar después de un minuto; una reserva vencida puede recuperarse. La propuesta exige `requiresHumanApproval=true` y `autoFixAllowed=false`.

Para las alertas configura `BREVO_API_KEY`, `EMAIL_REMITENTE` e `INCIDENT_ALERT_EMAIL`. Brevo tiene prioridad; `RESEND_API_KEY` queda como alternativa si no hay clave Brevo. `INCIDENT_ALERT_COOLDOWN_MIN` limita notificaciones por incidente (treinta minutos por defecto). La reserva atómica evita envíos simultáneos habituales. La reserva y el evento `alert_delivery_pending` se guardan juntos como bandeja de salida durable, usando la tabla de eventos existente. Si el proveedor acepta el envío, el evento pasa a `alert_delivery_sent`; si lo rechaza o lanza un error, se libera la reserva propia y se marca `alert_delivery_failed`.

El scheduler reintenta alertas de incidentes activos `proposed` o `audited` sin reserva, y recupera reservas pendientes abandonadas cuando vence el periodo de espera. Una nueva reserva sustituye los eventos pendientes anteriores por `alert_delivery_superseded`. Los incidentes `ignored` o `resolved` no generan envíos nuevos.

El proveedor simulado no cuenta como envío: si no hay correo real configurado, no se registra una confirmación y el incidente permanece pendiente.

Una aceptación del proveedor no confirma la entrega en la bandeja de entrada. Si el proceso termina después del envío y antes de registrar la aceptación, el reintento puede duplicar el correo: se favorece recuperar la alerta, sin garantizar entrega exactamente una vez. No interpretar `lastNotifiedAt` como comprobante de recepción.

## Contrato del auditor

Solo una sesión administrativa con rol `superadmin` puede consultar `GET /admin/incidents` o decidir con `POST /admin/incidents/:id/auditar`.

Para aprobar, obtener primero la fila de la bandeja y enviar su `updatedAt` como `expectedUpdatedAt`:

```json
{
  "aprobada": true,
  "expectedUpdatedAt": "2026-10-19T00:00:00.000Z",
  "notas": "Revisé la causa y el plan de regresión."
}
```

La fecha es un ejemplo; usar la versión recibida en la consulta. Una aprobación requiere estado `proposed`, ausencia de decisión o resolución previa y una propuesta estructurada con resumen y plan de pruebas no vacíos, aprobación humana obligatoria y corrección automática deshabilitada.

El rechazo (`aprobada:false`) puede detener un incidente `open` o `proposed` pendiente. `expectedUpdatedAt` es opcional al rechazar; si se envía, también se comprueba. No se revoca ni se reemplaza una aprobación ya registrada mediante este endpoint.

Respuestas:

- `400`: cuerpo inválido o aprobación sin `expectedUpdatedAt` ISO 8601.
- `404`: el incidente no existe.
- `409`: versión o estado cambiaron, hay una decisión anterior o falta una propuesta válida. Actualizar la bandeja y revisar antes de decidir otra vez.
- `200`: decisión, evento `auditor_decision` y `AuditLog` guardados en una sola transacción. Si falla cualquiera de las escrituras, se revierte la decisión.

Además de la versión enviada, se comparan estado, versión interna y contador antes de escribir; dos auditores no pueden guardar decisiones sobre el mismo estado pendiente. Las notas omitidas se guardan como nulas, sin heredar notas antiguas. Tanto el evento como el log guardan un `snapshot` con `reviewedUpdatedAt`, `occurrenceCount` y `proposalSha256`: identifican la versión revisada y la huella SHA-256 de su propuesta, sin copiar el texto de la propuesta al log. La huella se calcula sobre la serialización JSON de la instantánea de base de datos; no es una firma ni un formato JSON canónico.

## Entrega para un ejecutor externo

El comando opcional `pnpm --filter @gaespos/api incident:agent` exige `AGENT_RUNNER_ENABLED=true` y acepta únicamente `AGENT_RUNNER_PROVIDER=codex` (también es el valor predeterminado).

El comando toma una fila `audited` con `auditDecision=approved`, crea un evento JSON saneado `agent_handoff` y cambia la decisión a `approved_handoff`, en una transacción y con comparación de versión. Así una segunda ejecución no vuelve a entregar la misma aprobación. El evento conserva `applied:false`, `requiresReview:true` y `execution:external-isolated-worker-required`.

Este comando prepara la entrega; no inicia Codex, no usa claves de modelos, no crea worktrees y no ejecuta instrucciones de la propuesta. Un agente con acceso al sistema de archivos del servidor podría leer credenciales aunque su entorno se vacíe, por lo que el ejecutor debe operar en un entorno separado sin secretos del negocio. La conexión y activación de ese ejecutor no están implementadas por este comando. El flujo de mantenimiento del frontend tiene su propia configuración y no consume automáticamente estas entregas.

## Preparación y pruebas

Aplicar la migración `20260929090000_system_incidents` antes de habilitar el scheduler. Ver [configuración de correo](correo-brevo.md) para guardar las claves sin publicarlas.

Las pruebas aisladas de registro, concurrencia, decisiones, scheduler y entrega usan dobles de base de datos, IA y correo; no envían correos ni hacen inferencia real:

```sh
pnpm --filter @gaespos/api exec vitest run --config test/run-approved-incident-unit.config.ts
```

Estas pruebas comprueban los límites y fallos del código. La operación real requiere verificar por separado la migración, la configuración del proveedor, el scheduler y la recepción de una alerta controlada en el ambiente autorizado.

### Regresiones con PostgreSQL desechable

```sh
pnpm exec dotenv -e .env -- node scripts/testing/run-api-isolated.cjs
```

Este comando solo acepta PostgreSQL en localhost, conecta al catálogo de mantenimiento,
crea bases con nombres aleatorios y las elimina al terminar. Los procesos de prueba
reciben un entorno limitado sin claves ni endpoints de proveedores ni sesiones personales.
Los archivos de evidencia quedan privados en `/tmp/gaes-api-isolated-*`; las bases de
negocio indicadas en `.env` no se usan para las pruebas.

Para repetir solo persistencia de incidentes y WebAuthn después de ajustar el entorno:

```sh
pnpm exec dotenv -e .env -- node scripts/testing/run-api-isolated.cjs --release-fixes-only
```

Las seis regresiones de incidentes comprueban 25 primeras apariciones concurrentes,
reapertura sin aprobación heredada, diez trabajadores de correo concurrentes,
recuperación de reserva abandonada, proveedor que rechaza y revisión IA invalidada
por una decisión humana. Los proveedores son dobles locales sin comunicación externa.
