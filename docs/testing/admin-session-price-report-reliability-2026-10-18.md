# Sesiones, permisos y recuperación del panel del negocio — 18 octubre 2026

## Alcance y límites

Auditoría de código y regresiones locales de `web-admin`, `web-pos` y cliente API de `web-superadmin`. Se ejecutó además la suite existente de `mobile-negocio`, sin modificar su código ni comprobar pantallas nativas. No se realizaron escrituras remotas, ventas, pagos, correos ni cambios en producción. Esta revisión no certifica todos los módulos administrativos ni todos los permisos del servidor.

## Hallazgos corregidos

1. **Inicio de sesión admin/POS en dominios compartidos:** el primer segmento de Railway y de dominios propios se interpretaba como negocio, aunque no fuera un subdominio de plataforma. Ambos accesos ahora infieren el negocio solo de dominios GaesSoft conocidos o `.localhost`; conservan `?negocio=` explícito. Un dominio compartido usa la resolución por correo del servidor.
2. **Permisos administrativos al restaurar:** se mostraba una sesión genérica con permisos guardados sin consultar la identidad vigente. Ahora `/auth/tenant/me` verifica nombre, negocio, ID y permisos antes de mostrar páginas; la lectura tiene límite de 30 segundos. Una respuesta exitosa también debe contener ID, nombre y negocio de texto no vacío y permisos como arreglo de strings; no se coercionan datos inválidos. La caída o estructura inválida ofrece reintento y no muestra privilegios cacheados. Foco y sondeo actualizan permisos.
3. **Contexto de otras pestañas:** admin/POS conservaban un token en memoria tras su sustitución o eliminación en otra pestaña. Cada petición lee el token actual; un cambio de sesión descarta la pantalla anterior mediante recarga. Salir del admin elimina también permisos, ID y diálogos de la cuenta anterior.
4. **401 y respuestas de proxy en admin:** JSON inválido impedía procesar una sesión expirada. Ahora se procesa el estado primero y se devuelven errores públicos controlados. Un 401 tardío del token anterior no cierra una cuenta nueva; un token explícito de MFA tampoco cierra la sesión general. Se corrigió la misma carrera de 401 tardío en plataforma. Un éxito con respuesta ilegible se informa como resultado incierto y no se reenvía automáticamente una escritura.
5. **Notificaciones administrativas:** fallos de lectura parecían bandeja vacía; errores al marcar una o todas se mostraban como éxito y disminuían el contador. Ahora hay errores visibles y recuperación, el estado cambia solo tras confirmación y el bloqueo inmediato evita escrituras duplicadas por clics rápidos.
6. **Listas de precios solo lectura:** `precios.leer` ocultaba crear listas, pero dejaba los controles para guardar y quitar precios. Se ocultan también esas acciones y los manejadores comprueban el permiso de modificación. El servidor sigue siendo responsable de autorizar cada escritura.
7. **Detalle y búsqueda de precios:** el error de apertura se ocultaba; una respuesta tardía podía reemplazar la lista recién elegida; la búsqueda rechazaba sin manejar el error. Ahora hay carga/error/reintento y protección de orden de respuesta. Cambiar de lista descarta el formulario anterior. La búsqueda muestra su fallo y descarta respuestas de consultas anteriores.
8. **Reportes:** al cambiar rápidamente de rango, una respuesta vieja podía reemplazar los totales mientras la etiqueta indicaba el rango nuevo. Solo la última solicitud actualiza datos, error y carga; imprimir permanece deshabilitado durante la carga o el error.

## Evidencia local

- `pnpm --filter @gaespos/web-admin test`: **41/41** en el lote inicial (7 cliente admin, 2 carrera de plataforma, 32 resolución de dominio admin/POS). En la revisión de integración se añadieron y ejecutaron **14/14** casos específicos de validación estructural de identidad.
- `pnpm --filter @gaespos/web-pos test`: **174/174**; incluye 2 regresiones nuevas para eliminación externa del token y rechazo de token MFA explícito.
- `pnpm --filter @gaespos/mobile-negocio test`: **107/107**, suite sin cambios.
- Typecheck individual de `web-admin` y `web-pos`: correcto, incluido el estado final de listas/reportes.
- Biome de los archivos modificados: sin errores; conserva advertencias de complejidad.
- `node scripts/staging/check-admin-session-ui.cjs`: **15/15 grupos**, navegador Chromium contra Vite local. Todas las respuestas de cuenta, permisos, notificaciones, productos, precios y reportes son sintéticas; se bloquean destinos externos y escrituras no previstas. Cero errores JavaScript y cero escrituras remotas.

Los quince grupos cubren: retención inicial de permisos cacheados; fallo/reintento de verificación; tres respuestas exitosas de identidad inválidas con recuperación (nombre como objeto, permisos como string y permisos mixtos); revocación al enfocar; cambio de cuenta en otra pestaña; fallo/reintento al cargar notificaciones; fallo/reintento al marcar una; fallo al marcar todas y doble clic; controles de precios solo lectura; fallo/reintento del detalle; detalle fuera de orden; fallo de búsqueda; reportes fuera de orden con impresión bloqueada.

Para repetir el navegador:

```sh
pnpm --filter @gaespos/web-admin exec vite --host 127.0.0.1 --port 5417 --strictPort
```

En otra terminal, desde la raíz del repositorio:

```sh
node scripts/staging/check-admin-session-ui.cjs
```

## Validaciones que quedan fuera de esta evidencia

- Los flujos reales en base desechable, la compilación y la publicación del conjunto integrado los ejecuta la sesión coordinadora.
- El harness local no verifica que todas las rutas del servidor autoricen correctamente cada rol.
- No se ejecutaron cambios reales de precios ni notificaciones en staging o producción, ni se generó un APK de negocio.

## Cierre adicional: solicitudes que nunca responden

Los clientes API de admin, POS y plataforma tienen un plazo predeterminado de 30 segundos, activo hasta terminar de leer el cuerpo de la respuesta. Si el llamador proporciona su propia señal, se conserva esa señal sin imponer un segundo plazo. Agotar el plazo predeterminado produce un error controlado 408 y el aviso de verificar el resultado antes de repetir una operación; no elimina la sesión ni reenvía escrituras automáticamente. El temporizador se limpia cuando termina la solicitud.

`apps/web-admin/test/api-timeout.test.ts`: **15/15 casos focales** en los tres wrappers, con fetch simulado y reloj controlado. Se comprueba GET/POST pendiente hasta el límite, ausencia de reintentos, conservación de token, señal explícita del llamador, limpieza al completar y plazo durante un cuerpo de respuesta inconcluso. La ejecución focal combinada con regresiones API de admin/plataforma pasó **24/24**.

## Revalidación con dependencias integradas y almacenamiento denegado

Se encontró y corrigió otro fallo reproducible de arranque: una lectura de almacenamiento que arrojaba `SecurityError` dejaba admin en «Cargando…» y POS podía fallar durante su render inicial. Los tres paneles (admin, POS y plataforma) y sus componentes Login ahora comprueban explícitamente acceso de lectura antes de montar la sesión. Una lectura denegada ofrece «Reintentar acceso» y conserva la sesión y permisos guardados; no se interpreta como ausencia de sesión. Admin/plataforma también llevan una denegación surgida durante la consulta de identidad a esa recuperación. Plataforma deja de reutilizar un token en memoria al recuperar el acceso al almacenamiento.

- `pnpm --filter @gaespos/web-admin test`: **76/76**, incluidos seis renderizados SSR directos de App/Login con almacenamiento denegado y sin escrituras ni eliminaciones de credenciales.
- `node scripts/staging/check-admin-session-ui.cjs`: **15/15** con las dependencias integradas.
- `node scripts/staging/check-auth-storage-ui.cjs`: **11/11 grupos**, cubre aplicaciones reales servidas localmente, lectura/getter denegados y recuperación tanto de una sesión existente como del formulario de acceso; respuestas de cuenta sintéticas y cero escrituras remotas.
- Builds Vite de admin, POS y plataforma (`pnpm --filter <paquete> build`): **correctos** después de esta corrección.

También se repitieron, sin editar sus fuentes de negocio, `node scripts/staging/check-checkout-initialization-ui.cjs` (**13/13 grupos**) y `node scripts/testing/run-storefront-browser-regressions.cjs` (**14/14 scripts, 226 grupos**). Todas son pruebas locales con respuestas controladas; no verifican cobros ni entregas reales.

Los comandos se ejecutaron con Node 24.22.0 mediante un `PATH` limitado a cada comando. No se cambió Node global ni se volvieron a instalar dependencias durante esta revalidación. El typecheck global y los builds Next integrados los coordina el auditor de dependencias.

## Corrección posterior al E2E real: recorrido de bienvenida

El E2E de alta de producto con SKU y claves SAT detectó que el recorrido automático podía aparecer a los 900 ms mientras la persona ya trabajaba en el formulario y bloquear «Guardar». Además, cerrar un recorrido pulsaba el primer botón «Cancelar» visible, lo que podía descartar datos de un formulario ajeno al recorrido.

`Tour.tsx` conserva el plazo original y la oferta para quien permanece inactivo, pero cancela esa oferta pendiente ante `pointerdown`, `keydown`, un recorrido manual (`gaes-tour`) o navegación (`gaes-nav`). Los listeners de captura no consumen los eventos y se retiran al cancelar, iniciar o desmontar. Cerrar un recorrido ahora solo cierra el recorrido; deja disponible el formulario, tanto si ya existía como si el propio recorrido lo abrió.

- `node scripts/staging/check-admin-tour-ui.cjs`: **9/9 grupos**, Tour y formulario de productos reales con reloj controlado y plazo original de 900 ms. Cubre oferta en reposo, interacción de puntero/teclado aunque un descendiente detenga propagación, recorrido manual antes del plazo, navegación, repetición manual de un recorrido visto, conservación de datos de un formulario existente, conservación del formulario abierto por el recorrido y alta local sintética con SKU/ClaveSAT/UnidadSAT intactos. Cero escrituras remotas y cero errores JavaScript.
- `pnpm --filter @gaespos/web-admin build` con Node 24.22.0: correcto.
- No se ocultó el recorrido en el E2E ni se modificaron los asserts del producto. La sesión coordinadora vuelve a ejecutar el flujo real contra la base desechable.
