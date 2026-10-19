# Auditoría de incidentes y privacidad · 19 de octubre de 2026

## Resultado publicado

Runtime comprobado: `ef5944f74b76748c89feb08edb62535e449c1e89`, únicamente en
staging. Los cinco servicios de Railway terminaron SUCCESS para ese mismo commit:
API, tienda, administración, POS y superadmin.

El [build de GitHub 39287427721](https://github.com/Gaes-Solutions/verticals/actions/runs/39287427721)
terminó success con las cinco imágenes aprobadas. La comprobación HTTP posterior
pasó sus siete verificaciones: salud y conexión master del API, cuatro webs y
rechazo 401 de `/admin/incidents` sin sesión.

- [Tienda de pruebas](https://web-tienda-staging.up.railway.app/).
- [Administración de pruebas](https://web-admin-staging-84b0.up.railway.app/).

`main` permaneció en `d14694ed31cebcb1c70cec55dd3b9fd8ca985aca`. No hubo push ni
despliegue a producción. Este registro posterior no requiere otro despliegue.

## Correcciones

- Saneamiento de texto, contexto, notas y rutas antes de guardar o enviar incidentes.
- Logs con proyección explícita de diagnóstico; excluyen configuraciones Axios,
  solicitudes, respuestas y campos personalizados. Se sanea también `msg`, donde
  Pino duplicaba el mensaje original, y se eliminan consultas de las URLs.
- Contador y evento de ocurrencia transaccionales; primeras apariciones concurrentes
  no pierden registros. La reapertura de un incidente resuelto invalida su aprobación.
- Revisión IA con reserva temporal y comprobación de versión, estado, contador y
  vencimiento. Descarta resultados obsoletos y reintenta respuestas vacías.
- Bandeja de salida con eventos durables: pendiente, enviado, fallido y sustituido.
  Recupera reservas abandonadas y evita reclamaciones simultáneas habituales.
- Aprobación con propuesta válida y versión revisada obligatoria; decisión, evento
  y auditoría atómicos, con huella SHA-256 de la propuesta revisada.
- Entrega saneada para un trabajador externo; se retiró la ejecución de una CLI
  dentro del servidor con credenciales del negocio.
- Resend limitado a treinta segundos y resumen remoto a sesenta, sin reintentos
  internos que excedan la reserva del scheduler.
- La respuesta de error al comprador se envía antes de esperar al correo.
- Una fábrica de correo mal configurada no bloquea la revisión del incidente.

Se usaron agentes Codex para ejecución y revisión independiente. Las pruebas no
hicieron inferencia remota, envío real de correo, pagos ni escrituras en bases de
negocio. No se utilizó Kimi.

## Validación

| Área | Evidencia |
| --- | --- |
| API con PostgreSQL temporal | 117 archivos / 1,407 casos verificados, con las repeticiones descritas abajo |
| Cambios finales de incidentes, permisos, logs y respuesta | 92/92 pruebas aisladas |
| Logger | Ocho regresiones con Pino y Fastify reales |
| Correo e IA | 36/36 pruebas con transportes simulados: correo 28, IA 8 |
| Aislamiento del harness | 5/5 pruebas de seguridad |
| Tipos globales | 30/30 tareas, también en el último precommit de código |
| Revisión independiente final | 41/41 en incidentes y privacidad de logs, sin nuevos hallazgos |
| Build y despliegue | Cinco imágenes GitHub y cinco servicios Railway correctos para ef5944f |
| Comprobación publicada | 7/7: `/health`, `/ready`, cuatro webs y protección de incidentes |

Los archivos nuevos pasan Biome estricto y los workflows pasan actionlint.
`app.ts` conserva dos avisos de complejidad preexistentes; su integración solo
sustituye la fábrica de serializadores, sin modificar rutas ni permisos.

### Ejecución amplia y repeticiones

La primera ejecución amplia no fue completamente verde. El HOME temporal ocultó
Chromium y la lista de variables permitidas omitió tres secretos de sesión
sintéticos que dos módulos leen directamente. Se corrigió el harness sin restaurar
credenciales personales ni proveedores reales.

- Primer bloque: 678 casos aprobados; 11 de WebAuthn no arrancaron por Chromium.
- Segundo bloque: 698 casos aprobados; 20 fallaron por las variables sintéticas omitidas.
- Repetición con entorno corregido: 59/59 en incidentes, WebAuthn, marketplace y
  recordatorios de citas, incluyendo todas las suites afectadas.

La consolidación por archivo, sin sumar repeticiones, cubre 117 archivos y 1,407
casos. La evidencia conserva `rawFullRunGreen:false` y `allCoveredPassed:true`.

Las seis regresiones PostgreSQL comprueban 25 primeras apariciones concurrentes,
diez trabajadores de correo, reapertura sin aprobación heredada, recuperación de
reserva abandonada, rechazo del proveedor y descarte de IA tras una decisión humana.
Todas las bases temporales creadas se eliminaron.

Los ajustes posteriores de respuesta, serialización de logs y separación entre
correo/revisión se comprobaron con sus regresiones específicas, tipos globales y
el despliegue final. No se presenta la suite amplia anterior como una nueva ejecución
después de estos ajustes.

### Evidencia local

- `/tmp/gaes-api-isolated-final-coverage.json`
- `/tmp/gaes-api-isolated-E61inB/{shard-1.log,shard-2.log,results.json}`
- `/tmp/gaes-api-isolated-qqatFx/{shard-1.log,results.json}`
- `/tmp/gaes-incident-unit-final.log`
- `/tmp/gaes-incident-provider-tests.log`
- `/tmp/gaes-incident-scheduler-isolation-commit.log`
- `/tmp/gaes-incident-staging-final.json`
- `/tmp/gaes-incident-staging-health.json`
- `/tmp/gaes-incident-staging-ci.json`
- `/tmp/gaes-incident-staging-readiness.json`

## Estado operativo y límites

La lectura final de staging confirmó: scheduler habilitado, runner deshabilitado,
Brevo configurado, destinatario de alertas ausente y proveedor de IA remoto ausente.
Se registraron únicamente estados; no se expusieron valores de credenciales.

El circuito prepara propuestas y entregas revisables. La recepción real de alertas,
la revisión con IA configurada y la conexión de un trabajador externo aislado están
pendientes de validación e integración operativa. El comando `incident:agent` no
implementa ese consumidor externo ni aplica cambios. El mantenimiento de frontend
es otro circuito y no consume automáticamente estas entregas. No interpretar este
despliegue como una autocorrección real activa o como autorización para promover a
producción.

Una caída después del envío y antes de guardar su confirmación puede producir un
correo duplicado al reintentar. La aceptación del proveedor no demuestra recepción
en la bandeja. El saneamiento es de mejor esfuerzo y puede no reconocer todos los
secretos o datos personales. No se afirma seguridad total ni cobertura de toda
combinación imaginable.

Límites previos: [dependencias](dependency-security-2026-10-18.md) y
[auditoría integrada](retail-integrated-audit-2026-10-18.md).
Contrato y comandos: [automatización de incidentes](../automatizacion-incidentes.md).
