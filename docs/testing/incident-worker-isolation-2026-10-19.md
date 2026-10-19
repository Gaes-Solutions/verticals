# Conexión del trabajador aislado de incidentes

## Resultado del cambio

Se conecta la cola de incidentes aprobados con un trabajador de GitHub Actions.
El servidor del negocio entrega datos saneados y recibe resultados tipados; no ejecuta modelos ni código generado.
El resultado publicable es un **PR borrador a `staging`**, pendiente de revisión humana.
Crear el PR no marca el incidente como resuelto, no integra código ni despliega producción.

## Fases y credenciales

| Fase | Función | Credenciales disponibles |
| --- | --- | --- |
| Broker | Reserva el siguiente incidente aprobado y fija el commit de `staging` | Token exclusivo del puente |
| Ejecutor | Codex prepara un parche de alcance limitado | Autenticación temporal del modelo |
| Validador | Typecheck, build, regresiones aisladas y suite API en PostgreSQL desechable | PostgreSQL sintético local |
| Auditor | Otro proceso Codex revisa el parche exacto con sandbox de lectura | Autenticación temporal del modelo |
| Publicador | Verifica las evidencias y abre un PR borrador | Token GitHub con escritura limitada al job |
| Informador | Registra éxito o fallo sin copiar las salidas del modelo | Token exclusivo del puente |

Cada fase usa una máquina nueva. Los procesos de IA no reciben el token del puente,
credenciales de correo, pagos ni bases del negocio. La autenticación temporal se elimina antes de subir artefactos.
Esto describe separación entre máquinas de GitHub; no pretende demostrar aislamiento absoluto frente a cualquier fallo de plataforma.

El parche, el incidente, el commit base, el controlador y las evidencias se enlazan mediante hashes.
Cambiar artefactos, tocar rutas sensibles, publicar tras vencer la reserva o sustituir un resultado detiene la fase.
El alcance inicial permite módulos API de tienda/tenant y sus pruebas, excluyendo autenticación, permisos,
pagos, facturación, secretos, configuración, dependencias y migraciones.

## API del puente

- `POST /internal/incident-worker/claim`, cuerpo `{}`: entrega `{handoff:null}` o una reserva exclusiva de 90 minutos.
- `POST /internal/incident-worker/result`: acepta únicamente identidad de reserva, huella, resultado tipado y enlaces del repositorio autorizado.
- Ambos exigen `Authorization: Bearer <INCIDENT_WORKER_TOKEN>`; mínimo 32 caracteres. Una sesión administrativa no sustituye este token.
- Sin token configurado: `503`. Autenticación incorrecta: `401`. Callback vencido, conflictivo o de otra reserva: `409`.
- El mismo callback aceptado puede repetirse sin duplicar eventos.
- `pr_created` deja `approved_pr`; un fallo permite reintento después de 15 minutos. Los fallos repetidos terminan bloqueados para revisión.
- La aprobación administrativa y el handoff antiguo dejan el trabajo disponible de inmediato; ya no heredan la espera de 24 horas de la revisión IA.

El cliente rechaza redirecciones HTTP, destinos ajenos, JSON ambiguo, huellas incorrectas,
archivos simbólicos, resultados de otro incidente y enlaces GitHub fuera del repositorio.
Ni errores de transporte ni callbacks contienen el token o la respuesta cruda del servidor.

## Activación pendiente

El código y sus pruebas no equivalen a un trabajador real activado.
El workflow programado exige estar publicado en la rama predeterminada `main` y
`AUTONOMOUS_INCIDENT_ENABLED=true`. Esta ronda no autoriza ni realiza esa promoción.

Para activarlo después de revisar el cambio:

1. Guardar el mismo token aleatorio `INCIDENT_WORKER_TOKEN` en el API de **staging** y como secreto de GitHub.
2. Configurar `OPENAI_API_KEY` únicamente en GitHub; preparar por separado el proveedor de propuestas del API si se desea revisión remota.
3. Configurar el destinatario de alertas y comprobar recepción con autorización para un envío real.
4. Promover el workflow revisado a `main`, habilitar su variable y verificar un incidente controlado completo.

La URL del puente está fijada a staging. Cambiarla a producción requiere otra revisión.
No se ejecutó inferencia, correo ni pago real durante estas pruebas. Los jobs de seguridad usan herramientas simuladas y PostgreSQL temporal.

## Verificación reproducible

```sh
python3 scripts/testing/test_incident_worker_client.py
python3 scripts/testing/autonomous-incident-cycle-phase.test.py
pnpm --filter @gaespos/api exec vitest run --config test/run-approved-incident-unit.config.ts
pnpm --filter @gaespos/api typecheck
pnpm exec dotenv -e .env -- node scripts/testing/run-api-isolated.cjs --incidents-only
```

El último comando exige PostgreSQL local, crea una base privada y la elimina al terminar.
El workflow `autonomous-incident-safety.yml` repite las pruebas sintéticas sin claves del negocio.

## Evidencia de esta ronda

- API aislado: **138/138** (46 casos nuevos del puente, además de las regresiones previas).
- Transporte Python: **20/20**, incluida comparación de JSON canónico con Node y casos Unicode.
- Controlador y arquitectura del workflow: **24/24** con herramientas simuladas y checkouts separados por SHA.
- PostgreSQL desechable: **11/11**; reservas concurrentes, callbacks duplicados, renovación, estado del PR y agotamiento de tres reintentos comprobados en persistencia real.
- Compatibilidad del payload producido por el servicio JavaScript y consumido por Python comprobada con Unicode.
- Los dos workflows pasan `actionlint` 1.7.12.

Evidencia local de persistencia: `/tmp/gaes-api-isolated-R2bzHy/results.json`.
La base temporal fue eliminada. Las pruebas no habilitaron el cron ni consumieron incidentes del negocio.
El puente HTTP se habilita mediante su token; `AGENT_RUNNER_ENABLED` continúa siendo la protección del comando CLI antiguo, no del workflow nuevo.
