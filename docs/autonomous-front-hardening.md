# Endurecimiento del ciclo autónomo de storefront

El ciclo se divide en cuatro jobs: `executor`, `validate`, `judge` y
`publish`, más un job de notificación de fallos. Cada checkout usa
`persist-credentials: false`. El ejecutor y el juez son dos procesos Codex
independientes, en runners Ubuntu separados, con Node 24 y la misma CLI oficial
fijada `@openai/codex@0.130.0`. Kimi ya no forma parte del flujo.

Cada agente tiene un `CODEX_HOME` temporal distinto, fuera del checkout y de
los artefactos. Solo el paso de login recibe `OPENAI_API_KEY` por entorno;
la ejecución recibe `CODEX_AUTH_READY=true` y su directorio de autenticación,
sin la clave cruda en el entorno. Un paso `always()` elimina ese directorio,
incluso tras un fallo, antes de intentar subir artefactos. El login usa
`codex login --with-api-key`; no se reutilizan sesiones personales.

Antes de instalar la CLI o iniciar sesión, un preflight confiable comprueba si
hay un PR del ciclo pendiente o si el backlog está vacío. En ambos casos deja
un marcador explícito y omite instalación, login y ejecución del agente; las
fases posteriores se saltan sin exigir una clave OpenAI. Un fallo consultando
GitHub o leyendo el backlog detiene el ciclo, sin tratarlo como backlog vacío.

## Límites por fase

- `executor`: Codex puede modificar el worktree permitido con
  `--sandbox workspace-write --ephemeral`. Usa únicamente su autenticación
  OpenAI aislada, sin tokens de publicación ni correo. El límite por defecto
  es ocho minutos. Exporta un patch binario, `base_sha`, `task_id` y
  `patch_sha256`.
- `validate`: no recibe secretos. Verifica base, hash, rutas y symlinks; después
  copia el checkout ya validado a un contenedor `node:24-bookworm-slim` fijado
  por digest, sin red, sin `.git`, sin el controlador ni el directorio de
  artefactos, y ejecuta ahí typecheck, tests y build con `bash -euo
  pipefail`. El controlador compara la huella de los archivos fuente de esa
  copia antes y después de los checks. Si Docker, pnpm offline o la imagen no
  están disponibles, falla cerrada. `AUTONOMY_VALIDATE_TEST_MODE` solo existe
  para los fixtures fake del test suite y nunca se habilita en el workflow.
- `judge`: otro proceso Codex, con autenticación y runner separados, se
  ejecuta con `--sandbox read-only --ephemeral` y límite por defecto de cinco
  minutos; el snapshot staged se comprueba antes y después. No recibe el token
  de GitHub ni credenciales de correo.
- `publish`: no ejecuta modelos ni package scripts. Verifica nuevamente base,
  hash, alcance y dictamen `APPROVED`, después aplica el patch y publica con
  `GH_TOKEN`. El auto merge conserva `false` por defecto.

Los artefactos no contienen entornos ni archivos de autenticación. La fase de
publicación falla cerrada si falta el patch, la metadata, la validación, el
dictamen o el token requerido. Si falta la CLI Codex o su autenticación aislada,
no se publica. El publisher requiere `GH_TOKEN`; los modelos no lo reciben.
No hay fallback a sesiones del `HOME` personal.

La fuente de control es el checkout confiable de la revisión del workflow. El
publisher no vuelve a ejecutar código del paquete después de recibir las
credenciales de publicación. Los hashes ligan patch, metadata y evidencia entre
fases; no son una firma criptográfica ni sustituyen una identidad de confianza.

## Validación y notificación

ST-010 agrega `biome check . --error-on-warnings` antes de los demás checks,
tanto en el contenedor real como en los fixtures. No se relajan reglas para
aprobar una limpieza. La regresión de fallo bloquea evidencia, juez y publicación.
La corrida 39214567265 sobre e09b15d aprobó las 16 integraciones Docker sin
omisiones; los modelos y el correo son simulados en esa prueba.

El aviso del publisher corresponde a un PR pendiente, no a una integración:
incluye descripción de backlog, pantallas inferidas de rutas, hasta 25 archivos
y pasos de prueba por tarea. Aclara que staging o APK deben contener el cambio
antes de probarlo. No afirma que se haya desplegado ni que el merge ocurriera.

## Estado de la migración a Codex

La configuración se migró para usar únicamente Codex como ejecutor y juez.
No se activaron `AUTONOMOUS_FRONT_ENABLED` ni auto merge, no se promovió código
a main y no se ejecutaron modelos reales durante esta migración. Las pruebas
con agentes simulados verifican el controlador, no autenticación, cuota ni
calidad del proveedor. Para declarar el servicio activo hace falta configurar
`OPENAI_API_KEY` en GitHub, promover y activar el workflow y observar una
corrida real aprobada. Ya no se utiliza ninguna configuración de Kimi.

Referencia oficial del patrón de reparación iterativa con Codex:
https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex

## Evidencia de migración exclusivamente a Codex (19 de octubre de 2026)

El controlador usa versión `2026-10-19-v3-codex-only`, por lo que no acepta
artefactos de la versión anterior. El ejecutor y el juez usan `-a never` con
sandbox y `--ephemeral`: no se deshabilita el aislamiento para evitar prompts.
Además de `CODEX_HOME`, el HOME del proceso es su directorio temporal privado.
Se comprueban propietario, rutas sin symlinks, ubicación temporal fuera del
checkout y permisos privados (directorio 0700 / archivo 0600). La clave de auth se
captura solo en el controlador antes de ejecutar al agente; el filtro de
artefactos sigue detectándola aunque el agente borre su archivo de login.

Pruebas locales: 16/16 de fases, 1/1 de retiro definitivo del controlador
antiguo y 18/18 integraciones con Docker real, sin omitidas. Incluyen los dos
roles Codex simulados, homes separados, errores del ejecutor/juez, filtración de
claves, mutación de evidencia, rutas sensibles, pnpm shim del runner y lint
estricto. La prueba de preflight ejecuta su shell real en cuatro situaciones:
tarea pendiente, backlog vacío, PR pendiente y error de consulta de GitHub.
La última falla cerrada; las dos intermedias no instalan ni autentican agentes.

Se instaló y probó la CLI oficial real 0.130.0 únicamente con `--help` y un login
local de clave sintética no funcional. Se verificaron opciones, formato de
`auth.json` y permisos 0600; no se invocó inferencia ni se usó una clave real.
Esto verifica compatibilidad del arranque, no disponibilidad de crédito,
autenticación del proveedor o calidad de respuesta de un modelo real.

El script antiguo `autonomous-front-cycle.sh` termina siempre con código 2,
incluso con su antigua variable de opt-in; no existe un camino alterno que
vuelva a habilitar al ejecutor retirado. La activación y promoción permanecen
separadas: esta migración no cambia main, producción ni las variables de GitHub.

### Comprobación en GitHub

La corrida [39263903443](https://github.com/Gaes-Solutions/verticals/actions/runs/39263903443)
sobre `49484d3627126ff26b8be65ef0358c2498acaf04` terminó success:
retiro 1/1, fases 16/16 e integración con Docker 18/18 sin omisiones, más
sintaxis, actionlint y privacidad de evidencia. El job independiente de evidencia
también terminó success. Se descargaron los resultados por Git y se verificaron
commit, códigos de salida y SHA-256 de logs. No se ejecutaron modelos reales,
no se enviaron correos ni se crearon PR de producto en estas pruebas.

### Ejecutor opcional de incidentes

`apps/api/src/scripts/run-approved-incident.ts` rechaza proveedores distintos de
`codex` antes de consultar incidentes. La revisión posterior encontró que arrancar
una CLI en el servidor del API heredaba credenciales y usaba opciones incompatibles.
Por seguridad, este comando ahora prepara únicamente una entrega JSON saneada y
persistida; **no inicia una CLI ni aplica cambios**. La aprobación se consume con
una comparación atómica y el evento `agent_handoff` se guarda en la misma transacción.
Un trabajador externo aislado sigue siendo necesario para ejecutar esa entrega;
esta ruta no está conectada automáticamente al ciclo de frontend.

Las pruebas aisladas cubren privacidad, concurrencia, decisiones del administrador,
versión de la propuesta y preparación de entregas, sin claves, DB ni modelos reales:

```bash
pnpm --filter @gaespos/api exec vitest run --config test/run-approved-incident-unit.config.ts
```

La configuración `.unit.ts` evita el setup de DB de la suite API. Las pruebas de
persistencia y concurrencia reales están en `incidents-persistence.test.ts` y se
corren aparte dentro de la suite API sobre PostgreSQL desechable. El contrato y
las limitaciones de entrega están en [automatizacion-incidentes.md](automatizacion-incidentes.md).
Ninguna de estas pruebas activa agentes o acredita una ejecución con modelos reales.

### Comprobación adicional de readiness y Android

La corrida [39263903539](https://github.com/Gaes-Solutions/verticals/actions/runs/39263903539)
sobre 49484d3 terminó success. Se repitieron los tres flujos Android con los APK
existentes (cliente17/kiosco4); los tres JUnit contienen un caso aprobado, sin
fallos, errores ni omisiones. La cuenta sintética se eliminó tras comprobar
cero pedidos y cero direcciones; no se cambió el runtime de los APK.

El runner registró únicamente booleanos: enabled=false, auto_merge=false,
openai_key=false, resend_key=true y email_sender=true. No recibió valores de
credenciales en ese registro. Por tanto, la sustitución de código está probada,
pero no existe evidencia de operación con modelos reales. Para arrancar fuera
de esta conversación faltan OPENAI_API_KEY en GitHub, promoción del workflow
nuevo y activación explícita. Ningún paso de esta migración modifica main,
staging, producción ni las variables/secretos del repositorio.
