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
también se notifican por Resend.

## Roles

- **Kimi, ejecutor:** toma una tarea aprobada, implementa el cambio en un
  worktree aislado, agrega o ajusta las pruebas necesarias y entrega evidencia.
  No hace `push`, despliegues, migraciones ni cambia secretos.
- **Codex, juez:** convierte la petición en criterios comprobables, revisa el
  diff, prueba los flujos completos y decide `aprobado`, `corregir` o
  `rechazado`. También verifica que el cambio no rompa otras verticales.

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
