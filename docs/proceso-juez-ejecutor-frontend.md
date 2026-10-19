# Proceso de mejora de la tienda: ejecutor y juez

Este proceso aplica a cambios de la tienda web y de la app cliente.

La lista de trabajo está en `automation/front-backlog.md`. El jefe técnico
define ahí el orden y los criterios; cada corrida toma una sola tarea. Una
tarea aprobada se marca `[x]` al preparar el PR y la siguiente corrida toma la
siguiente pendiente. Una tarea rechazada conserva `[ ]` y recibe otro intento.

El workflow programado está en `.github/workflows/autonomous-front-cycle.yml`.
Permanece apagado hasta activar `AUTONOMOUS_FRONT_ENABLED=true` en las variables
del repositorio y configurar las claves de los runners. Si se activa
`AUTONOMOUS_AUTO_MERGE=true`, el merge solo ocurre después de que Kimi deja
pruebas verdes y Codex responde `APPROVED` en la primera línea de su dictamen.
El job requiere un runner self-hosted etiquetado `kimi-codex` con `kimi`,
`codex` y `gh` instalados; un runner sin esas herramientas falla cerrado.
El workflow `autonomous-watchdog.yml` revisa cada 15 minutos el heartbeat del
ciclo. Si no hay una corrida reciente, relanza el proceso y abre una alerta;
si la última corrida falló, abre una alerta para impedir que el problema pase
desapercibido. La supervisión necesita que GitHub Actions siga disponible y que
el runner self-hosted esté encendido.
Cada ciclo envía a `gaessoft@gmail.com` el resultado, las pantallas/áreas
afectadas, la resolución solicitada, las pruebas, el dictamen de Codex y la
rama o PR generado. Los fallos del ciclo y los relanzamientos del watchdog
usan el proveedor configurado en `scripts/send-system-email.py` (Brevo o Resend).
No se da un correo por recibido solo porque el script intentó enviarlo.

## Roles

- **Kimi, ejecutor:** toma una tarea aprobada, implementa el cambio en un
  checkout del runner dedicado y una rama de tarea; agrega o ajusta las pruebas
  necesarias y entrega evidencia.
  No hace `push`, despliegues, migraciones ni cambia secretos.
- **Codex, juez:** convierte la petición en criterios comprobables, revisa el
  diff y emite el dictamen final; en la implementación actual no vuelve a ejecutar
  las pruebas. Las comprobaciones mecánicas previas son obligatorias; un dictamen
  no demuestra por sí solo todos los flujos ni otras verticales.

## Ciclo por cambio

1. **Inventario:** registrar el flujo afectado, pantallas, API, estados de
   carga/error/vacío y criterios de accesibilidad.
2. **Ejecución:** Kimi trabaja solo en el alcance asignado y deja un resumen de
   archivos, riesgos y comandos ejecutados.
3. **Revisión funcional:** Codex prueba el camino feliz y los fallos esperados
   en móvil y escritorio, incluyendo una vista de 360 px.
4. **Revisión técnica:** typecheck, lint, pruebas unitarias e integración/E2E
   relacionadas. Se revisan permisos, tenant, precios, imágenes y datos
   sensibles.
5. **Veredicto:** Codex acepta solo si todos los criterios están verdes; si no,
   devuelve una lista concreta de correcciones a Kimi.
6. **Promoción:** únicamente un cambio aprobado puede llegar a `main`; después
   se vigila el despliegue y se ejecuta smoke test de producción.

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
`AUTONOMOUS_FRONT_ENABLED=false`, auto merge desactivado, claves Kimi y OpenAI
no presentes, Resend presente y remitente configurado. No se transfirieron
secretos al proceso que escribió esa evidencia. No se declara operativo el
servicio Kimi/Codex con esa configuración.

La nueva separación de ejecución, validación aislada, juez y publicación se
está comprobando con repositorios desechables, modelos simulados y Docker real.
Estas pruebas comprueban el controlador; no demuestran autenticación, cuotas ni
calidad de respuesta de proveedores reales. El workflow de seguridad de la rama
de trabajo no recibe claves de modelos/correo ni permiso de publicación: prueba
el flujo sobre un origin Git local. No activa el cron de main ni despliega
producción.
