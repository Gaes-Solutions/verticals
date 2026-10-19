# Proceso de mejora de la tienda: ejecutor y juez

Este proceso aplica a cambios de la tienda web y de la app cliente.

La lista de trabajo está en `automation/front-backlog.md`. El jefe técnico
define ahí el orden y los criterios; cada corrida toma una sola tarea. Una
tarea aprobada se marca `[x]` al preparar el PR y la siguiente corrida toma la
siguiente pendiente. Una tarea rechazada conserva `[ ]` y recibe otro intento.

El workflow programado está en `.github/workflows/autonomous-front-cycle.yml`.
Permanece apagado hasta activar `AUTONOMOUS_FRONT_ENABLED=true` en las variables
del repositorio y configurar `OPENAI_API_KEY` en sus secretos. Usa runners
Ubuntu de GitHub Actions separados para ejecución, validación, juez y
publicación. Ambos agentes instalan Codex CLI 0.130.0 con Node 24. Cada uno
inicia sesión en su propio `CODEX_HOME` temporal; solo el login recibe la clave
en el entorno. La ejecución usa ese home aislado y la limpieza se intenta
siempre, antes de subir artefactos. No se usan sesiones personales.

Si se activa `AUTONOMOUS_AUTO_MERGE=true`, el merge solo puede ocurrir después
de pruebas verdes y del dictamen independiente `APPROVED`. Su valor por
defecto es `false`; esta migración no activa merge ni el ciclo.
El workflow `autonomous-watchdog.yml` revisa cada 15 minutos el heartbeat del
ciclo. Si no hay una corrida reciente, intenta relanzarlo y abre una alerta;
si la última corrida falló, abre una alerta. La supervisión necesita GitHub
Actions disponible y credenciales/permisos válidos; no garantiza continuidad.

El publisher avisa a `gaessoft@gmail.com` del PR pendiente con tarea,
pantallas, propuesta, pruebas y pasos para revisar el cambio. Indica que debe
estar desplegado en staging o incluido en un APK nuevo antes de probarlo.
Los fallos del ciclo y relanzamientos usan `scripts/send-system-email.py`
(Brevo o Resend). No se da un correo por recibido solo porque se intentó enviar.

## Roles

- **Codex, ejecutor:** toma una tarea aprobada, implementa el cambio en un
  checkout del job de ejecución; agrega o ajusta las pruebas
  necesarias y entrega evidencia.
  No hace `push`, despliegues, migraciones ni cambia secretos.
- **Codex, juez independiente:** convierte la petición en criterios comprobables, revisa el
  diff y emite el dictamen final; en la implementación actual no vuelve a ejecutar
  las pruebas. Las comprobaciones mecánicas previas son obligatorias; un dictamen
  no demuestra por sí solo todos los flujos ni otras verticales.

## Ciclo por cambio

1. **Inventario:** registrar el flujo afectado, pantallas, API, estados de
   carga/error/vacío y criterios de accesibilidad.
2. **Ejecución:** el ejecutor Codex trabaja solo en el alcance asignado y deja un resumen de
   archivos, riesgos y comandos ejecutados.
3. **Validación mecánica:** un job sin secretos ejecuta tipos, Vitest y build
   en Docker sin red; ST-010 además exige lint sin advertencias y ST-006 añade
   tipos y pruebas del cliente móvil. El alcance real de los checks se registra
   en la evidencia; no implica todos los E2E ni pruebas en teléfono físico.
4. **Revisión independiente:** el juez Codex revisa el diff y la evidencia en
   modo de solo lectura. Examina alcance, permisos, tenant, precios y datos
   sensibles; no vuelve a ejecutar pruebas ni certifica flujos no comprobados.
5. **Veredicto:** Codex acepta solo si todos los criterios están verdes; si no,
   devuelve una lista concreta de correcciones al ejecutor Codex.
6. **Publicación:** un job separado con permisos de GitHub puede preparar el
   PR. Auto merge está apagado por defecto. La promoción, despliegue y smoke
   test de producción requieren sus propios controles y evidencia.

## Criterios de la tienda

- El comprador entiende qué vende la tienda, puede buscar y filtrar sin
  perder contexto y ve precio, disponibilidad, promoción e imagen.
- Cada pantalla tiene estados explícitos de carga, vacío, error y reintento.
- El carrito conserva cantidades y total; el checkout no pierde datos al volver
  atrás ni duplica pedidos.
- El diseño funciona en 360, 768 y escritorio; botones táctiles y contraste
  cumplen el sistema visual.
- Las imágenes vienen del catálogo publicado, sin inventar precios ni datos del
  tenant. Los placeholders de QA se eliminan antes de una campaña real.
- El tenant siempre queda aislado y los permisos se vuelven a comprobar en el
  servidor.

## Evidencia obligatoria

Cada entrega debe incluir resultado de pruebas, rutas revisadas, capturas o
artefactos visuales cuando aplique, y una lista explícita de pendientes. Una
propuesta visual sin pruebas de flujo no se considera terminada.


## Estado verificado el 18 de octubre de 2026

El código corregido bloquea la publicación si falla cualquier validación o agente,
si el juez no termina con exit 0 y dictamen final `APPROVED`, si se cambia HEAD,
si aparecen archivos fuera del alcance, o si el juez altera el estado ya probado.
No se extrae una aprobación de los logs ni se acepta un timeout con cambios.
Pruebas de regresión: `python3 scripts/testing/autonomous-front-cycle.test.py`.

Las validaciones automáticas actuales son diff sin errores, tipos, Vitest y build
de tienda web; ST-006 añade tipos y pruebas cliente. No ejecutan por sí mismas
todos los E2E, dispositivos físicos, proveedores reales ni chequeos globales de
seguridad. Las revisiones integradas de esta ronda se documentan aparte en
`testing/retail-integrated-audit-2026-10-18.md`.

La consulta pública de las últimas cinco corridas del workflow mostró `skipped`,
incluida la ejecución 39200815748. No hay evidencia de trabajo autónomo activo en
esas corridas. El código corregido está en la rama de trabajo; no se promovió a
main ni se cambiaron variables del repositorio. El cron es cada cuatro horas;
el watchdog revisa cada quince minutos. Esto no equivale a ejecución continua ni
a garantía de que no se detenga. Se necesita una corrida real en el runner y
evidencia de entrega antes de declarar el servicio activo.

## Comprobación de configuración del 19 de octubre

El runner Android 39208697447 registró solo presencia booleana de configuración:
`AUTONOMOUS_FRONT_ENABLED=false`, auto merge desactivado, claves del antiguo ejecutor Kimi y OpenAI
no presentes, Resend presente y remitente configurado. No se transfirieron
secretos al proceso que escribió esa evidencia. No se declara operativo el
servicio con esa configuración. Esa medición es histórica: desde la migración
actual solo OpenAI es requisito del proveedor; la prueba booleana futura ya no
consulta una clave Kimi.

La nueva separación de ejecución, validación aislada, juez y publicación se
está comprobando con repositorios desechables, modelos simulados y Docker real.
Estas pruebas comprueban el controlador; no demuestran autenticación, cuotas ni
calidad de respuesta de proveedores reales. El workflow de seguridad de la rama
de trabajo no recibe claves de modelos/correo ni permiso de publicación: prueba
el flujo sobre un origin Git local. No activa el cron de main ni despliega
producción.

## Validación del controlador del 19 de octubre

La corrida 39214567265 de la rama de trabajo pasó fase 10/10, legacy 11/11 e
integración 16/16 con Docker real y sin skipped. ST-010 exige Biome sin
advertencias antes de tipos, Vitest y build. Un fallo impide juez/publicación.
El correo de PR detalla tarea, pantallas, propuesta y pasos, e indica revisión
pendiente y disponibilidad condicionada a despliegue o nuevo APK.

Esta evidencia valida el controlador aislado, no una operación con modelos
reales. La activación, configuración OpenAI y promoción del código siguen
pendientes; no hay un servicio autónomo activo probado. Kimi fue retirado del
workflow y no es requisito para activarlo.

## Cierre de la sustitución del ejecutor

El flujo ahora usa dos agentes Codex en jobs separados: uno implementa y el otro
revisa sin escritura, con validación aislada entre ambos. El script antiguo se
retiró permanentemente. Ya no se necesita CLI ni clave de Kimi. El preflight
omite login/instalación cuando no hay tarea o existe un PR esperando revisión.

Regresiones locales aprobadas: fases16/16, retiro1/1 e integración Docker18/18.
La CLI real0.130.0 se comprobó con ayuda y autenticación local sintética, sin
inferencia. Sigue pendiente una corrida con proveedor real para declarar activo
el proceso; no se cambió la activación ni main en esta sustitución.
