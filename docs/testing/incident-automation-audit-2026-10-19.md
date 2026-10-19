# Auditoría del circuito de incidentes · 19 de octubre de 2026

## Resultado

Correcciones en la rama `trabajo/codex-tienda-08sep`, revisadas por un segundo
agente Codex. No se usó Kimi ni se ejecutaron modelos remotos, correos reales,
pagos o cambios en bases de negocio durante estas pruebas. Producción no se modificó.

Se corrigieron:

- Credenciales que podían persistir dentro de texto, contexto, rutas o notas.
- Primeras ocurrencias concurrentes que podían perder contador o evento.
- Propuestas IA que podían sobrescribir una decisión humana o una versión nueva.
- Alertas duplicadas entre procesos y reservas de correo abandonadas tras un reinicio.
- Aprobaciones sin propuesta válida, sin versión revisada o sin auditoría atómica.
- Ejecución insegura de una CLI en el servidor con credenciales del negocio.
- Peticiones de correo o IA sin un presupuesto de tiempo apropiado para el scheduler.
- Respuestas de error al comprador que esperaban al proveedor de correo.

El runner de incidentes prepara ahora una entrega saneada y durable para revisión;
no ejecuta agentes en el servidor. Esto no equivale a conectar un ejecutor externo.
Las aprobaciones consumidas quedan como `approved_handoff` y conservan su evento.

## Validación

- **83 pruebas aisladas** de privacidad, concurrencia, recuperación de alertas,
  decisiones, autorización, versionado, entrega y respuesta HTTP.
- **36 pruebas de proveedores**: correo 28 y AI 8, con transportes simulados.
- **5 pruebas de seguridad del harness**, Biome estricto y actionlint sin hallazgos.
- Typecheck global: **30/30 tareas**; build del API y comprobación final de tipos correctos.
- **117 archivos / 1,407 casos API verificados**, con la salvedad de repetición explicada abajo.
- Revisión independiente final del manejador: **4/4 pruebas**, sin nuevos defectos.

### Ejecución amplia y repeticiones

No hubo una ejecución amplia completamente verde de un solo intento. El aislamiento
nuevo ocultó inicialmente Chromium bajo un HOME temporal y omitió tres variables de
sesión sintéticas que dos módulos leen directamente. Son defectos del harness;
se corrigieron sin restaurar credenciales personales ni proveedores reales.

La ejecución amplia produjo:

- Primer bloque: 678 casos aprobados; 11 de WebAuthn no arrancaron por Chromium.
- Segundo bloque: 698 casos aprobados; 20 fallaron por las variables sintéticas omitidas.
- Repetición con entorno corregido: **59/59** en los cuatro archivos afectados
  o relevantes: incidentes, WebAuthn, marketplace y recordatorios de citas.

La consolidación por archivo, sin sumar casos repetidos, cubre los 117 archivos
actuales y sus 1,407 casos. La evidencia conserva `rawFullRunGreen:false` y
`allCoveredPassed:true`; no se ocultó el fallo ambiental original.

Las seis regresiones PostgreSQL prueban 25 primeras apariciones concurrentes,
diez trabajadores de correo, reapertura sin aprobación heredada, recuperación de
una reserva abandonada, rechazo del proveedor y descarte de IA tras rechazo humano.
Todas las bases temporales creadas se eliminaron; los tres reportes indican limpieza.

Evidencia local privada:

- `/tmp/gaes-api-isolated-final-coverage.json`
- `/tmp/gaes-api-isolated-E61inB/{shard-1.log,shard-2.log,results.json}`
- `/tmp/gaes-api-isolated-qqatFx/{shard-1.log,results.json}`
- `/tmp/gaes-incident-unit-final.log`
- `/tmp/gaes-incident-provider-tests.log`
- `/tmp/gaes-incident-global-typecheck-final.log`

La corrección posterior de respuesta HTTP se comprobó con Fastify real y correo
bloqueado simulado, más regresiones de errores Prisma. No se volvió a atribuir la
suite amplia anterior a ese cambio posterior.

## Estado operativo y límites

La lectura de configuración de staging durante esta revisión mostró únicamente
booleanos: scheduler habilitado, runner deshabilitado, proveedor de correo presente,
destinatario de alertas ausente y proveedor de IA remoto ausente. No se expusieron
valores. La disponibilidad del código no demuestra automatización real activa.

La revisión con IA configurada, la recepción real de correo y la conexión de un
trabajador externo aislado requieren validación operativa separada. Este circuito
no hace merge ni despliega propuestas automáticamente. El mantenimiento de frontend
es un circuito separado y no consume estas entregas de incidentes.

La bandeja de salida recupera pendientes, pero una caída después del envío y antes
de guardar la confirmación puede producir un duplicado al reintentar. La aceptación
del proveedor no demuestra recepción en la bandeja del destinatario. El saneamiento
es de mejor esfuerzo y no reconoce necesariamente todos los secretos o datos personales.

No se afirma seguridad total ni cobertura de toda combinación imaginable. Se mantiene
el seguimiento de límites previos en [dependencias](dependency-security-2026-10-18.md)
y en la [auditoría integrada](retail-integrated-audit-2026-10-18.md).

Contrato y comandos reproducibles: [automatización de incidentes](../automatizacion-incidentes.md).
