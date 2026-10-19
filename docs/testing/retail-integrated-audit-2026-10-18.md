# Auditoría integrada de la vertical Tienda — 18 de octubre de 2026

## Alcance y criterio de cierre

La revisión cubre las funciones existentes de la vertical Tienda: comprador web,
cliente/kiosco Android, administración del negocio, POS, plataforma, permisos de
API y respaldo/restauración. No certifica ausencia de todos los errores posibles,
la equivalencia de funciones con Amazon ni las verticales clínicas/contables.

Cada hallazgo reproducible se corrige y se comprueba; las pruebas se distinguen
entre respuestas sintéticas, recorridos con API/DB reales desechables y despliegue.
No se cambian datos de producción. Los cobros de pruebas son simulados; una prueba
con SDK/respuesta sintética no equivale a una operación Stripe/Conekta real.

## Inventario de cobertura

| Superficie/flujo | Evidencia de esta ronda |
| --- | --- |
| Catálogo/producto público y disponibilidad del negocio | Suite API integral; nuevas pruebas de estados de tenant y proyección pública; pruebas web y ficha publicada. |
| Galería, historial, precios, favoritos y reseñas | Pruebas de componentes reales, contratos web y regresión de preferencias/imágenes; lote previo documentado. |
| Carrito, stock, propietario, múltiples pestañas y recuperación | Pruebas web/API; nuevo chequeo del carrito vivo antes del envío; móvil vuelve a leer propietario y cantidades. |
| Inicio de sesión, recuperación, perfil y direcciones | Pruebas API/web/móviles; regresiones de perfil/dirección; login inicial y cuenta nativa con límite de red. |
| Passkeys | Componente real con autenticador virtual y respuestas locales; no certifica biometría física. |
| Checkout, entrega, cupón y tarjetas guardadas | 13 escenarios nuevos de inicialización, contratos y regresiones de envío/cupones/tarjetas/pago. |
| Referencias de pago, pedidos, cancelación, devoluciones y chat | Suite API y regresiones de componentes con estados sintéticos; ningún mensaje real ni dinero movido. |
| Facturación del comprador | Contratos/rutas y regresión de pantalla con respuestas sintéticas; sin timbrado fiscal real. |
| Admin: seis roles, lectura y formularios | 226 comprobaciones de pantallas a 1280/390 px y 18 aperturas/cancelaciones; sesiones reales en DB desechable. |
| Admin: sesión, notificaciones, precios y reportes | Regresiones nuevas con respuestas controladas, fuera de orden, error y reintento; solo lectura para quien no puede modificar. |
| POS: caja, venta, búsqueda, promociones y devolución | Suite POS y 11 recorridos E2E con dueño/cajero distintos y DB local desechable. |
| POS escritorio: catálogo sin red y configuración | Pruebas POS/escritorio y recorrido de catálogo persistido; no certifica impresoras/cajones físicos. |
| Plataforma: superadmin, soporte, cobranza | 54 pantallas y flujos de planes, alta de tienda/dueño, suspensión/reactivación, factura/cupón/partner; DB desechable. |
| Dominios y separación de tiendas | DNS/HTTPS público de gaesland.shop.angaes.com y rechazo de un hostname wildcard sin asignar. |
| APK cliente y kiosco | Pruebas, tipos y bundle Metro; compilación EAS staging nueva de ambos con IDs separados de producción. |
| Respaldo y restauración | Dos últimas ejecuciones diarias existentes exitosas; ensayo corregido con Docker18 y datos sintéticos, más pruebas de fallo/limpieza. La mejora del workflow se registra por separado de su activación en la rama por defecto. |

## Hallazgos corregidos

- Móvil: error SecureStore dejaba el arranque pendiente; falta de plazo de red,
  selección/stock anteriores al render, deep link inválido e importes inválidos
  presentados como cero. Ver `mobile-startup-cart-reliability-2026-10-18.md`.
- API: detalle del token limitado de tienda exponía datos internos de variantes y
  reseñas; catálogo anónimo y servicios de cliente aceptaban negocios suspendidos,
  archivados o impagados. Conservan `trial`, `active` y `past_due` (gracia).
- Almacenamiento del navegador: los tres paneles recuperan una lectura denegada
  con explicación/reintento; no borran la sesión ni asumen que no existe. Once
  escenarios en navegador cubren arranque, login y denegación durante la consulta.
- Admin/POS/plataforma: restauración de sesión/permisos sin verificar, tokens y
  respuestas tardías de otra sesión, host confundido con negocio, falsos éxitos
  de notificaciones, precios editables con permiso solo lectura y resultados
  viejos en listas/reportes. Ver `admin-session-price-report-reliability-2026-10-18.md`.
- Checkout web: lectura denegada del carrito causaba excepción; respuestas 200
  incompletas de configuración/entrega/direcciones/tarjetas podían romper la
  pantalla; configuración fallida carecía de reintento. Ahora se validan antes de
  habilitar acciones y se conservan los campos al recuperar la carga. Una edición
  silenciosa del carrito obliga a revisar de nuevo antes de enviar. Un 401 HTML
  conduce a login y el error de sesión no muestra detalles técnicos del servidor.
- Políticas: HTML con entidades podía evadir el saneado por expresiones regulares
  y ejecutar JavaScript al pulsar un enlace. Se sustituyó por un parser con lista
  permitida; 44 pruebas y 13 grupos Chromium verifican contenido malicioso inerte
  y recuperación de la pantalla.
- Carga inicial: el fallback pedía parámetros que Next no entrega y mostraba
  siempre 24 tarjetas del inicio, incluso al filtrar. Ahora es un skeleton servidor
  neutro de ocho tarjetas, con estado legible y respeto a movimiento reducido.
- API BFF: las lecturas iniciales sin señal podían quedar pendientes sin plazo;
  autenticación/datos comparten un límite por defecto y las imágenes también lo
  tienen. Tokens malformados no se cachean; un token rechazado se invalida para la
  próxima acción, sin repetir automáticamente una escritura.
- Respaldo: el ensayo toleraba un `pg_restore` fallido y podía anunciar fin con
  contenido incompleto. Ahora es estricto, aislado, acotado y limpia sus recursos;
  distingue restaurabilidad de completitud del origen. El workflow ensaya antes
  de cifrar y elimina el archivo sin cifrar incluso si falla.
- Pruebas API: cuatro archivos fallaban solo con la precarga del setup general.
  Se corrigió el caché anterior a los mocks sin debilitar aserciones; se revisaron
  todos los unitarios con dobles. La corrida integral se repite después del arreglo.

## Resultados registrados

- Primera suite de apps/paquetes: **22 tareas aprobadas**, **1800 pruebas**
  (1782 Vitest + 18 del runner Node de escritorio). Web 989 antes de ampliar el BFF;
  después de su ampliación, **997/997 web**. Tipos del repositorio: **30/30**.
- API inicial: 1392 pruebas, 1372 aprobadas y 20 fallos de aislamiento en cuatro
  archivos. No se oculta esta corrida. Repetición de tres archivos con setup real:
  **47/47**; todos los 13 unitarios con precarga: **130/130**. La repetición
  integral posterior pasó **1392/1392**; durante ella se actualizó el árbol de
  dependencias, por lo que se lanzó otra verificación completa con dos bases
  independientes y el lockfile estable. La primera repetición con Fastify nuevo
  detectó una fixture de recuperación que dependía de X-Forwarded-For falsificado;
  se corrigió para simular sockets reales, sin relajar el rate limit. La corrida
  final completa se registra abajo.
- Regresión web en navegador: **14 scripts aprobados**, respuestas controladas,
  sin cobros/mensajes/escrituras de negocio reales. Log de resultados en
  `/tmp/gaes-full-storefront-audit/summary.json`.
- Inicialización checkout: **13/13 escenarios**, sin pedido ni escritura real.
- Recorridos integrados de plataforma/admin: correctos, con DB local desechable
  eliminada al terminar. Incluye 226 pantallas de negocio, 18 formularios y 54 de
  plataforma, además de las operaciones descritas en el inventario.
- Retail E2E: **11/11 aprobados**, DB desechable eliminada, incluye venta en
  efectivo y devolución sintéticas, catálogo sin red y alta fiscal de producto.
- Build web-tienda, web-admin, web-pos, web-superadmin y API correctos. Se repiten
  los afectados si cambia código después de su comprobación.

## Verificación con dependencias corregidas

- API final: **1401/1401 pruebas**, **116 archivos**; dos shards con bases
  independientes, **760/760** y **641/641**, ambos exit 0 y bases eliminadas.
  Incluye nueve pruebas nuevas de privacidad Sentry y frontera de proxies,
  además de las comprobaciones de proyección/estados del catálogo.
- Apps/paquetes: **22 tareas, 1890 pruebas aprobadas** con el lockfile estable
  (1872 Vitest + 18 Node). Incluye **1044/1044** de tienda, **76/76** del
  administrador, **174/174** POS, **119/119** cliente y **39/39** kiosco.
- Tipos globales: **30/30**, con el conjunto final de dependencias, los nuevos
  contratos de checkout, el saneado HTML y las barreras de almacenamiento.
- Dependencias: 95 avisos únicos → 7; cero críticos. Inventario, mitigaciones,
  fuentes y límites en `dependency-security-2026-10-18.md`. No hay excepciones
  para ocultar resultados del auditor.
- Claves locales: Git ignora también `.env.production`/`.env.staging` y archivos
  de firma/credenciales Android; Docker excluye las claves. Los ejemplos siguen
  disponibles y no se encontraron archivos de firma ya registrados en Git.
- APK cliente v12 y kiosco staging v2: EAS terminó ambos. Esas instantáneas
  preceden los parches runtime de dependencias y no se presentan como la entrega
  de seguridad final. EAS rechazó el rebuild posterior por cuota gratuita agotada;
  se intenta compilación local sin contratar servicios.

## Límites que requieren evidencia adicional

No se da por probado un cargo bancario real, 3DS en dispositivo, timbrado real,
biometría física, cámara/escáner/sonido de una tablet o impresora/cajón. Los APK
nuevos deben comprobarse como artefactos y en ejecución; el bundle no es el APK.
La modificación del respaldo en una rama de trabajo no cambia por sí sola el
cron de la rama por defecto. Producción no se declara actualizada por publicar
cambios solo en staging.

## Condiciones conocidas antes de promover a producción

- Revisar el contrato de ingress para distinguir IPs de clientes sin confiar en
  headers de conexiones no acreditadas. `TRUST_PROXY_PEERS` permite declarar
  peers concretos; vacío conserva el modo seguro por socket. El límite anónimo
  agregado en Railway queda explicado en la auditoría de dependencias.
- Activar la mejora del workflow de respaldos en la rama principal solo mediante
  la promoción revisada. El cron existente exitoso no prueba la nueva versión.
- Siete avisos de dependencias permanecen inventariados: tres sobre código con
  backport verificado, cuatro sobre herramientas sin un parche compatible aplicado.
- Distinguir siempre pruebas de proveedores simuladas de cobros, correos y
  timbrado reales; no se han realizado operaciones con dinero ni datos productivos.

## Repetición integrada del conjunto final

La repetición con Node 24, Fastify nuevo y cambios de almacenamiento verificó de
nuevo el alta de tienda/dueño, planes, suspensión/reactivación, facturas, cupón,
partners y registro manual de pago. Pasaron **226 comprobaciones de pantallas
para seis roles de negocio**, **18 formularios abiertos/cancelados**, **54
pantallas de plataforma** para superadmin/soporte/cobranza y los caminos de
red desconectada, respuesta inválida, plazo agotado y cancelación. La base local
desechable y las sesiones privadas se eliminaron. No hubo cargo real, transferencia
bancaria, correo enviado ni cambio de registros productivos.

Fuente publicada para staging: `b12b7dab48c5a3e5fa78ef450f4c5ad1c9e62447`.
La comprobación del snapshot de APK cliente comparó 99 archivos relevantes
(móvil, api-client, manifests/lock y parches) con ese commit: sin diferencias.
Huella SHA-256 del inventario: `86588d4c9c9c847d285ecf273a910f82d77054df18da18c6dbf8a298c36046b1`.

## Hallazgos de la repetición y del despliegue

La repetición Retail detectó un fallo adicional real (10/11 antes del arreglo):
la bienvenida de 900 ms podía abrirse sobre el formulario de producto y bloquear
Guardar; cerrar el Tour también pulsaba Cancelar de un formulario ajeno. Ahora
se cancela el inicio automático cuando el usuario ya interactúa/navega/pide otra
guía, y cerrar la guía conserva el formulario. Nueve escenarios de navegador
verifican la interacción y guardado de SKU/SAT. El E2E original no se ocultó ni
se relajó: repetición final **11/11 aprobados**, DB desechable eliminada.

Railway publicó los cuatro frontends de `b12b7da`, pero el empaquetado final de
API rechazó los dos patches móviles ausentes en su grafo podado. Se corrigió
exclusivamente la invocación Docker `deploy` con `--config.allow-unused-patches=true`;
las instalaciones generales y la aplicación de parches siguen estrictas. Se
reprodujo el deploy en un directorio aislado: exit 0 y carga completa de
`dist/app.js` con el `node_modules` standalone, sin consultas de DB ni llamadas
a proveedores. La comprobación del despliegue corregido se registra por separado.

El APK cliente local final v15 ya pasó firma, certificado de actualización,
paquete staging, cuatro arquitecturas, permisos mínimos, fuente Ionicons por
SHA-256, módulo nativo ExpoFontLoader y URL staging. No se confunde esta revisión
estática del APK con una ejecución de sus flujos en Android.

## Confirmación del despliegue corregido

Railway confirmó **SUCCESS** para API, tienda, admin, POS y superadmin en el mismo
commit `1178dbb000d50b5dec3823f82c7b585f7eb07379` (19 de octubre,
05:20 UTC; noche del 18 en México). El error anterior de empaquetado no se oculta:
la API de `b12b7da` falló y la revisión posterior sí se desplegó.

Los APK finales corresponden al código móvil de `b12b7da`; los cambios de `1178dbb`
son del Tour web y Docker de API. Antes de ejecutar Android, un guard verifica
90 archivos de runtime cliente y 56 de kiosco (incluidos lockfile, dependencias
compartidas y parches). Una modificación de runtime obliga a reconstruir; no se
presenta una prueba de un binario anterior como validación del código nuevo.

El kiosco final v4 también pasó firma, paquete staging, cuatro arquitecturas,
font y beep empaquetados, módulo nativo de fuentes y ausencia de permisos de
micrófono, almacenamiento y superposición. Cliente v15 y kiosco v4 tienen sus
SHA-256 registrados en `scripts/testing/android-staging-artifacts.json`.

El flujo QA crea una prerelease de pruebas únicamente después de aprobar Android.
Primero mantiene un borrador, carga dos APK y dos archivos de procedencia,
descarga los cuatro y compara bytes/hashes antes de publicarlo. Seis pruebas
sin red cubren publicación completa, subida parcial, descarga adulterada, tag
incorrecto y reejecución segura. Cinco pruebas adicionales verifican el resolver,
rechazo por autenticación y hashes, sin caer a un artefacto distinto. El tag apunta
al código fuente y no al transporte temporal de los binarios.

### Recorridos sobre la web publicada

Con los cinco servicios todavía en `1178dbb`, pasaron **7/7** grupos de producto
(compra/carrito), **5/5** de medios/galería, **8/8** cargas de hidratación y
**13/13** escenarios de inicialización de checkout. Las cargas medidas quedaron
entre 834 y 1661 ms, sin errores JavaScript ni assets fallidos en esas ocho
muestras; no constituyen un compromiso de rendimiento para toda red/dispositivo.
Checkout usa respuestas sintéticas de configuración/cuenta/envío. Los scripts
bloquearon escrituras: cero pedidos y cero cambios de negocio reales. `/health`
de API respondió 200.

La primera comprobación de compra falló por leer `aria-describedby` antes de la
hidratación de los controles, aunque el header ya estaba listo. Se observó luego
el ID y mensaje correctos, y el script original pasó 7/7 al repetirlo. Se corrigió
la sincronización esperando explícitamente el atributo antes de leerlo; conserva
todas las aserciones y la corrida final también pasó 7/7. No se cambió el producto
para disimular el fallo del harness.

## Auditoría del proceso autónomo

Se reprodujeron dos fallos del control de aprobación: Bash ignoraba fallos dentro
de `run_checks` por invocarlo bajo `if !`, y el dictamen podía encontrarse en los
logs aunque el juez terminara con error/timeout. Los checks ahora propagan cada
fallo; solo se admite exit 0 y primera línea `APPROVED` del mensaje final de
Codex. El ejecutor tampoco puede continuar por dejar un diff después de fallar.

La publicación tiene un límite mecánico de archivos frontend; inspecciona
worktree, índice, untracked y ambos lados de renombrados, rechaza enlaces y rutas
sensibles. Conserva HEAD inicial en memoria, lo comprueba antes/después y compara
hashes del estado validado antes/después del juez: no integra cambios que el juez
haya introducido después de pasar las pruebas. **11/11 grupos de regresión**
verifican fallos de cada check, agentes, timeout, scope, staging, commit oculto y
modificación del juez; usan agentes/gh falsos y repositorios Git temporales,
ningún push/merge/servicio real. Sintaxis Bash y tipos 30/30 correctos al integrar.

La consulta de las cinco últimas ejecuciones programadas encontró todas
`skipped`, incluida 39200815748. No se declara servicio activo ni envío de correos
verificado. El arreglo está publicado en la rama de trabajo, no en main; cron,
variables y disponibilidad del runner deben comprobarse con una ejecución real
antes de prometer trabajo autónomo. No se cambiaron esas variables ni producción.

## Ejecución Android de los APK finales

La corrida GitHub Actions **39204599746**, sobre
`3a0488053bd91034cfeae7df71ba429e96d725af`, aprobó los tres flujos Maestro:
catálogo/galería/login invitado, registro/carrito/dirección con cuenta sintética
y setup del kiosco sin activarlo. Se recuperaron los tres JUnit mediante la rama
QA separada y se comprobaron **un testcase por flujo, cero fallos, cero errores,
sin skipped**. No se infiere esto de un bundle ni de un emulador que no arrancó.

El job terminó rojo en el paso posterior de publicación, no en Android. Esa
separación se conserva al registrar resultados. Se corrige el diagnóstico y la
publicación sin llamar aprobada una descarga que todavía no existe. La ejecución
anterior 39204243703 se canceló al corregir la recogida de screenshots del harness;
su cuenta sintética se eliminó con guardas de staging e identidad, sin pedidos.
La limpieza de la cuenta de la ejecución final se registra al concluirla.

Limpieza de la corrida final completada: cuenta exacta encontrada, cero pedidos,
un carrito con cantidad dos, cero direcciones restantes (el propio flujo verifica
alta/edición/persistencia y eliminación), `deleted: true`. No se tocaron cuentas
ajenas. Se eliminó también el carrito sintético restante.

## Cierre del comprador con tienda, API y DB locales reales

Se añadió `--shopper-e2e` al runner de bases desechables existente. Levanta Next
y API locales, siembra un catálogo ecommerce publicado con producto de control
no relacionado, y limpia servidores/DB en `finally`. No sustituye este recorrido
por el catálogo POS ni por respuestas simuladas del BFF.

La corrida final aprobó **12 grupos de búsqueda → detalle → agregar → carrito,
cantidad, recarga y eliminación** en 360/768/1440, **ocho grupos reales de
recuperación de contraseña/carrito** y **dos comprobaciones de teclado de cuenta
SSR autenticada** en 390/1280. Contraseña cubre token desconocido, expirado,
válido, reuso y login con contraseña vieja rechazada/nueva admitida; no se envían
correos. Carrito abandonado cubre inválido, expirado y éxito con consentimiento.
Los invariantes cuentan explícitamente `Pedido` de POS y `PedidoEcommerce`,
ventas, stock y reservas: sin cambios. Las sesiones privadas, servidores y base
se eliminaron.

Las primeras pasadas corrigieron expectativas del fixture y un locator ambiguo,
no la aplicación. Una pasada observó React 418 en recarga; se conservó como
hallazgo y se instrumentó con URL/stack. Next heredaba `NODE_ENV=test` del API;
ahora únicamente el hijo Next usa `production`, acorde con su build. No se
silenciaron pageerrors ni se aplicó `suppressHydrationWarning`. Dos pasadas con
esa configuración acumularon **18 recargas sin reproducir el error**. Esto
registra la corrección del entorno de prueba y la no recurrencia observada; no
atribuye una causa del producto sin reproducción controlada.

La prueba nueva de `ProductoCard` renderiza el componente y enlace Next reales:
la suite final de tienda pasó **1045/1045**; tipos globales **30/30** y build Next
final correctos. No se volvieron a ejecutar las apps sin cambios por añadir esta
prueba del catálogo.

### Publicación Android confirmada

La ejecución **39205813365 terminó success**. Reutilizó exclusivamente el smoke
nativo fijado por ID, HEAD y manifiesto idéntico, verificando pasos concretos
aprobados; el emulador quedó `skipped` por esa prueba inmutable, no por omitir una
prueba pendiente. La publicación descargó y verificó dos APK, SHA256SUMS y
source.json antes de promover el borrador. La consulta pública confirmó cuatro
assets, digests, tamaños, prerelease visible y tag en el commit fuente b12b7da.

Descargas y límites en `mobile-startup-cart-reliability-2026-10-18.md`. Se eliminó
solo la rama temporal de transporte, tras comprobar la release. El primer error
de publicación queda sin causa demostrada por logs remotos inaccesibles (403);
no se atribuye a un proveedor ni se oculta. Diagnóstico seguro persistido y
verificación de reutilización cuentan con nueve y siete pruebas aisladas,
respectivamente.

## Verificación final del despliegue de pruebas y siguiente APK

Los cinco servicios de Railway staging terminaron `SUCCESS` sobre
`323bf8c7db8a0c07f47f05519ef8ebb365e80a62`: API, tienda, administración, POS y
superadministración. Salud del API y las cuatro entradas web respondieron 200.
La comprobación publicada de tienda aprobó compra 7/7, medios 5/5 e inicialización
de checkout 13/13; esta última controla respuestas de cuenta/configuración/envío
y no representa un cobro real. Ocho cargas en frío terminaron sin errores JS ni
assets fallidos, con tiempos observados de 696 a 1611 ms.

La auditoría publicada de teclado recorrió 14 pantallas, 453 movimientos Tab y
Shift+Tab y 46 campos, sin hallazgos en sus reglas ni mutaciones. La comprobación
local de cuenta autenticada añade cobertura SSR privada, sin afirmar certificación
con lector de pantalla ni sustituir una prueba física de accesibilidad.

El cliente Android 16 incorpora categorías, rango de precio, ofertas,
disponibilidad y orden del catálogo. Sus 147 pruebas y el chequeo global de tipos
30/30 pasaron. Se construyó localmente, se verificaron firma, permisos, cuatro
arquitecturas, endpoint de staging y correspondencia byte a byte de 92 archivos
de runtime con `e448f21bc51798f1777a6735c3da12e66c045f17`.
SHA-256 del APK: `b24d3a17f64ba6063fd01a60c6a9896cdd76a0cad66f0a00e50f182a58cb9f60`.
La prueba nativa de filtros y publicación del cliente 16 siguen pendientes de su
corrida específica; la evidencia Android del cliente 15 no se les atribuye.

### Hallazgo adicional del catálogo móvil y corrección

La segunda revisión detectó que, si un refetch reduce el total del catálogo
mientras el comprador está en una página avanzada, el pie de paginación podía
ocultarse y dejarlo sin botón Anterior. `4798c6a` agrega recuperación explícita:
«El catálogo se actualizó» y «Volver a la primera página», conservando búsqueda
y filtros. No agrega efectos ni bucles automáticos de consulta ni muestra
«Página 3 de 1». Una categoría seleccionada que desaparece también permanece
visible; solo se etiqueta no disponible tras una respuesta de categorías
correcta, no por error de red o carga.

La suite cliente pasó **153/153**, con seis regresiones adicionales para cambio
de total, total cero, navegación válida, conservación de contexto y categoría
faltante frente a carga/error. Tipos globales 30/30 correctos. Esta corrección es
posterior al binario 16: se compila un cliente 17 y requiere su propia evidencia
Android; no se transfiere automáticamente el resultado del cliente anterior.

El smoke específico de cliente 16 terminó con los tres JUnit aprobados en
39208697447, sin skipped; falló solamente el publisher posterior. La cuenta
sintética quedó eliminada con guardas de staging y cero pedidos. El diagnóstico
seguro aún no identifica la causa del fallo de verificación; se amplía antes de
la publicación del cliente 17. Readiness booleano del runner: automatización
desactivada y claves Kimi/OpenAI ausentes; no hay evidencia de servicio autónomo
operativo aunque las pruebas aisladas del controlador pasen.

## Cliente Android 17 publicado y probado

La corrida 39210310553 terminó `success`. Los tres JUnit específicos del binario
17 contienen un testcase aprobado, cero errores/fallos/skipped; el emulador se
ejecutó en esta corrida. La publicación verificó dos APK, SHA256SUMS y source.json
por descarga antes de publicar. Consulta pública posterior confirmó cuatro
assets, hashes, versión de pruebas visible y tag en 4798c6a. ST-006 cerrada en
su alcance probado. No se convierte un resultado del cliente 15/16 en prueba del
17 ni se atribuye una causa no demostrada al fallo histórico de publicación.

La cuenta de la corrida 17 quedó eliminada con cero pedidos y sin direcciones;
se retiraron solo las ramas temporales de transporte 16/17 tras verificar los
SHA y la publicación. Los archivos de release permanecen disponibles.

## Auditoría independiente del controlador autónomo

Se corrigieron fronteras de credenciales y evidencia, rechazo de rutas sensibles
antes de escribir, mutación de artefactos/índice/copia fuente, salto indebido por
`no-work` y reintentos parciales. El pipeline separa ejecución Kimi, checks en
Docker sin red, juez Codex de lectura, publisher y notificación. Ningún modelo
recibe claves de publicación o correo. No se llama firma criptográfica a un hash.

Pruebas independientes: fase 10/10, legacy 11/11 e integración 13/13 con Docker
real, pnpm standalone y Git bare local; modelos, GitHub y correo simulados. La
validación independiente de root contra el storefront real terminó exit 0,
1045 pruebas y build correctos, `validation.json` generado y ligado a base/patch,
con SHA de controlador `0a7bc304f6effb30a8cadea954844e72ffc345bbb1b29cf12830667f1b57e2aa`.
El primer ensayo usó node_modules de un worktree desactualizado; instalación
offline/frozen restauró React/DOM 19.2.6 sin cambios de dependencias. Las pasadas
intermedias de fingerprint fallidas se conservan y no cuentan como validación
completa aunque sus tests/build hubieran pasado.

La primera comprobación en runner limpio 39211928010 aprobó los checks locales
y falló el paso de integración Docker; sigue en diagnóstico. No se declara
operativa la automatización real por estas pruebas: está desactivada y ese
runner no recibe claves Kimi/OpenAI. No se promueve main ni producción.

## Cierre de validación del controlador en runner limpio

La evidencia de 39213072007 permitió reproducir la entrada pnpm de
`pnpm/action-setup`: un shim shell regular, no un enlace simbólico. Se resolvió
la entrada usando metadata del paquete contiguo, validando nombre, bin y rutas
reales dentro del paquete, sin ejecutar ni interpretar el shim. Se agregaron
regresiones de shim hostil y escape de directorio. La corrida 39213651628
(bafdc3f) pasó las 15 integraciones con Docker real, sin skipped.

La revisión final e09b15d añade un bloqueo específico para ST-010: Biome debe
pasar con `--error-on-warnings` antes de tipos, Vitest y build. El caso de fallo
comprueba que no se genere evidencia de validación ni se permita juez,
publicación o correo, tanto con fixtures como con Docker. Los avisos de PR
incluyen tarea, pantallas inferidas, propuesta, archivos y pasos numerados;
expresan que está pendiente de revisión/merge y que solo puede probarse tras
el despliegue correspondiente o un APK nuevo.

La corrida [39214567265](https://github.com/Gaes-Solutions/verticals/actions/runs/39214567265)
terminó success para e09b15d: sintaxis, legacy 11/11, fase 10/10 e integración
16/16, Docker real sin casos omitidos, más actionlint y regresión de privacidad.
Root descargó por Git la evidencia saneada, verificó commit, códigos de salida,
resultado completo y SHA-256 del log. Son pruebas del controlador con agentes,
Git remoto bare y correo simulados; no acreditan credenciales ni ejecución de
modelos reales. La configuración sigue desactivada y sin claves Kimi/OpenAI.

## Limpieza final ST-010 y repetición integral

Fuente `d39e736d1bdfd41b4caed64fa8457d448956ec6e`. Se cerraron las 67 advertencias
anteriores del storefront sin cambiar reglas ni añadir ignores: se separaron
validaciones, consultas y vistas; los reintentos y cambios de contexto se
expresan con identidad de solicitud y comprobaciones reales. No se borraron las
invalidaciones de precio, cotización, cupón, cuenta o pago para silenciar lint.
Las comparaciones AST independientes conservaron controles, eventos, valores,
labels y condiciones disabled del checkout. Otras 3006 comparaciones de contratos
y cantidad frente al baseline no encontraron diferencias.

La revisión antes del commit detectó y corrigió riesgos de la propia extracción:
await perdido en la captura de errores de la segunda lectura de devoluciones y
la lectura de tarjetas, guardia de aborto posterior a JSON, discriminación del
resultado de tarjeta válida y un await innecesario antes de comprobar el flush.
No se atribuyen a fallos previos de producción. Se agregaron regresiones para
fallo de red privado, aborto al leer cuerpo de tarjetas y tres grupos de
sincronización: flush correcto/fallido, recuperación con versión coincidente y
conflicto que conserva ambas selecciones sin sobrescritura automática.

Validación final sobre la fuente congelada:

- Biome `check . --error-on-warnings`: 238 archivos, cero errores/advertencias.
- Vitest tienda: 53 archivos, **1047/1047** pruebas.
- Tipos globales: **30/30**; Next producción exit 0.
- **21/21 suites de navegador**, incluidos productos, cuenta, direcciones,
  tarjetas/SDKs simulados, checkout, recuperación, pedidos, chat y preferencias.
- **22 grupos reales** Next/API/PostgreSQL local: búsqueda, compra/carrito,
  recuperación de contraseña/carrito y teclado de cuenta en anchos móviles y
  escritorio. Invariantes de ambos modelos de pedido, ventas, stock y reservas
  intactas; DB/sesiones privadas eliminadas, 3058/3059 cerrados.

Logs locales: `/tmp/gaes-st010-final-{biome,vitest,types,build,browser,shopper}.log`.
El runner `scripts/testing/run-storefront-browser-regressions.cjs` ahora incluye
las 21 suites, limpia también el selector de modo publicado del checkout y usa
el mismo CSS vigente en los fixtures heredados. La pasada final utilizó el CSS
del build Next comprobado. Los ensayos iniciales de dos fixtures sin CSS fallaron
sus tamaños táctiles y se conservan como fallos de configuración del harness;
las repeticiones con CSS y la suite integral final están aprobadas.

No se cambió runtime nativo en esta limpieza: el cliente Android recomendado
sigue siendo 17, ya publicado y probado. Tampoco se declara seguridad absoluta,
proveedores/biometría físicos probados, ni automatización con modelos activa.
