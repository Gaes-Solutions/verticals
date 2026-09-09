# Reparto de trabajo Codex ↔ Claude (rumbo al 25-sep)

> Los dos agentes trabajan el MISMO repo. La regla que evita destrozos: **cada uno es dueño de
> sus rutas** y **Codex trabaja siempre en su propia rama**. Si dos agentes tocan el mismo
> archivo sin commitear, se pierde trabajo.

## Reglas de convivencia (no negociables)

1. **Codex trabaja en rama propia**: `codex/<tarea>`. Nunca en `main`.
2. **Codex commitea al terminar cada tarea.** El 8-sep dejó 222 archivos sin commitear y
   estuvimos a un borrado de perder 6828 líneas.
3. **Nadie aplica migraciones a producción.** Las escribe, las prueba en local, y las corre Gaby.
4. **Antes de empezar**: `git fetch && git status`. Si hay cambios ajenos sin commitear, parar.
5. Cada tarea entrega: código + pruebas que pasan + `pnpm turbo typecheck` en verde.

## Reparto por dueño de rutas

| Área | Dueño | Por qué |
|---|---|---|
| `apps/api/src/modules/**` (auditoría de seguridad) | Claude | Necesita criterio transversal y contexto de la auditoría previa |
| Merge a `main`, deploy, migraciones en prod | Claude + Gaby | Toca producción |
| `tests/carga/**` (k6) | **Codex** | Carpeta nueva, cero colisión |
| `apps/mobile-negocio/**` (brechas de profundidad) | **Codex** | Archivos propios de la app |
| `packages/sat-catalogos/**` | **Codex** | Paquete nuevo |
| `apps/mobile-kiosko/**` (Fase 2) | **Codex** | App aislada |
| `tests/e2e/**` (Playwright) | **Codex** | Carpeta nueva |

---

## Tareas listas para pegarle a Codex

### 1. Pruebas de carga (k6) — alta prioridad, es criterio de salida

```
Trabaja en la rama codex/carga-k6. Crea tests/carga/ con scripts k6 que validen los
presupuestos de rendimiento que están en CLAUDE.md: búsqueda de producto <100ms P95,
agregar línea a venta <50ms P95, checkout completo sin CFDI <500ms P95, y sync push de
100 operaciones <1s P95. Apunta a la API local, no a producción. Incluye un README con
cómo correrlos y un script npm. Documenta los resultados que obtengas en local.
Commitea al terminar.
```

### 2. Catálogo SAT completo y buscable — desbloquea facturar en serio

```
Trabaja en la rama codex/sat-catalogos. Crea packages/sat-catalogos con el catálogo
c_ClaveProdServ y c_ClaveUnidad del SAT, con búsqueda por texto. Hoy ProductosPage.tsx
solo tiene 17 claves sugeridas escritas a mano y el resto es campo libre. Expón un
endpoint de búsqueda en la API y cambia el campo del formulario de producto por un
buscador. Ojo: el archivo del catálogo son decenas de miles de entradas, cuida el peso
del bundle (cárgalo desde el backend, no lo empaquetes en el front). Commitea al terminar.
```

### 3. Brechas de profundidad en la app Negocio

```
Trabaja en la rama codex/movil-profundidad. En apps/mobile-negocio faltan acciones que
sí existen en la web: crear promoción, crear usuario y asignarle rol, emitir CFDI de una
venta, y configurar zonas/tarifas de envío. Hoy esas pantallas son solo de consulta.
Impleméntalas reusando src/services/negocio.ts y el kit de UI de src/ui. Respeta el
gating por permisos con el helper puede(). Commitea al terminar.
```

### 4. Happy paths automatizados (Playwright)

```
Trabaja en la rama codex/e2e-playwright. Crea tests/e2e/ con Playwright cubriendo el
checklist de la sección 4 de docs/plan-liberacion-retail-25sep.md: POS (buscar producto,
carrito, cobrar en efectivo, ticket), devolución, corte X/Z, alta de producto, ajuste de
stock, importar CSV, promoción aplicada en venta, y el flujo del cliente (registro,
login, ver pedido, favoritos, direcciones). Contra la app local, con datos sembrados.
Commitea al terminar.
```

### 5. Kiosko Fase 2 — solo si sobra tiempo, no bloquea el piloto

```
Trabaja en la rama codex/kiosko-fase2. En apps/mobile-kiosko agrega: soporte de escáner
USB/Bluetooth tipo HID (capturando por un TextInput oculto), caché offline del catálogo
de precios en SQLite para que el verificador siga funcionando sin WiFi, y analítica de
escaneos (qué productos se consultan más). El plan está en
docs/plan-kiosko-verificador-precios.md. Commitea al terminar.
```

## Lo que NO se le da a Codex

- **La segunda auditoría de seguridad.** Necesita ver el sistema completo y ya hay contexto
  acumulado de la primera ronda.
- **Cualquier cosa que toque producción**: merges a `main`, migraciones, variables de entorno,
  despliegues.
- **Decisiones de producto**: qué tenant es el piloto, qué catálogo cargar, qué llaves usar.

## Orden sugerido

Codex arranca por la 1 y la 2, que son las que más acercan a los criterios de salida.
Claude va en paralelo con la auditoría de seguridad y la coordinación del despliegue.
