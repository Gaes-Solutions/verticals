# Tienda: compra desde producto y «Deshacer»

## Cambios

- La ficha vuelve a leer el carrito antes de agregar. Comprueba formato decimal,
  cantidad combinada, inventario público y límites de 100 variantes / 100000
  unidades por variante. No usa la cantidad de un render anterior para decidir
  si queda inventario. Un bloqueo inmediato evita dobles adiciones y navegaciones
  duplicadas desde «Comprar ahora».
- Una generación de contexto y botones renovados impiden que un clic de la cuenta
  anterior agregue a la siguiente. Cambiar producto o variante limpia confirmaciones,
  cantidades y temporizadores que ya no corresponden. Los temporizadores se cancelan
  al desmontar; cambiar de variante permite seguir comprando inmediatamente.
- Las cantidades se suman en milésimas y se muestran sin residuos de coma flotante.
  El producto agregado actualiza precio y metadatos de esa línea. El comprobante
  local conserva las selecciones anterior y posterior, vinculadas a cuenta y tienda.
- «Deshacer» restaura la selección anterior completa solo si el carrito sigue
  coincidiendo exactamente con la selección posterior. Cualquier edición, cambio
  de cuenta o cambio externo invalida la opción; también comprueba el almacenamiento
  al pulsar para detectar cambios sin evento. Dos clics no deshacen dos veces.
- Los errores de lectura y escritura no producen confirmación falsa ni navegación
  a checkout. Si la escritura local terminó y después falló el callback de
  sincronización, se comprueba lo guardado y se evita agregar otra vez automáticamente.
  No equivale a confirmar guardado remoto.
- El contador distingue una lectura fallida de un carrito vacío. La ficha ofrece
  volver a leer. La sincronización de cuenta maneja errores de almacenamiento al
  iniciar; sus mensajes no muestran las excepciones internas simuladas.
- La adición central rechaza una variante 101 sin escribir ni descartarla después
  silenciosamente. Favoritos maneja esa excepción. Combinar selección local con una
  cuenta comprueba primero el resultado entero y conserva ambas si supera límites;
  tampoco borra una selección invitada ajena a la que se eligió combinar.
- Un precio inválido no muestra NaN ni permite agregar, financiar o estimar envío
  como si el artículo fuera gratuito. El carrito flotante dice «Subtotal estimado».
  Los controles de acción y confirmación disponen de 44 px de alto; importes largos
  pueden ocupar varias líneas en el resumen móvil.

El inventario consultado en la ficha es el inventario público de esa página, no una
reserva. El verificador del carrito y el checkout conservan la comprobación final.

## Validación local

- **937/937** pruebas web: 39 nuevas (23 de cantidades y 16 de adición/recibos).
- Build Next de producción aprobado; hook de commit con **30/30** typechecks.
- **27 escenarios** de `check-product-purchase-ui.cjs`, con componentes y almacén
  reales del navegador, productos/cuentas/respuestas de sincronización sintéticos.
  Incluye stock contra lectura reciente, cantidades fraccionadas, doble clic,
  cambio de cuenta sin nuevo render, cambio de variante/producto, compra inmediata,
  fallos antes/después de guardar, precio ausente, envío, límite combinado y deshacer.
- **64 escenarios de regresión**: tarjetas 20, sugerencias/imágenes 18,
  preferencias/favoritos/reseñas 22 y coherencia/sincronización de carrito 4.
  La coherencia se repitió después de los cambios en la combinación de selecciones.
- Captura local de 320 px inspeccionada: `/tmp/gaes-purchase-local-320.png`.
  Sin desbordamiento en los escenarios revisados, incluido un carrito de 100000
  unidades. Respuestas privadas/cambios de cuenta son fixtures; no certifican todos
  los casos de un servidor real ni el comportamiento del APK.
- No se ejecutó checkout, cobro, reserva ni envío de correo; los casos locales
  interceptan las APIs y las comprobaciones publicadas bloquean escrituras remotas.

## Consulta sobre el aviso de la primera entrada

Antes del despliegue, tres contextos nuevos de Chromium en la web de pruebas
mostraron el marcador accesible «Cargando catálogo» del skeleton durante unos
477–561 ms; el primer artículo quedó visible entre 947 y 1287 ms. No hubo errores
JavaScript ni escrituras. Eso corresponde a esa web y esas condiciones de red,
no a todos los teléfonos o conexiones. No se detectó un bloqueo permanente en
esas muestras. Sigue siendo importante distinguir ese aviso de la pantalla nativa
de arranque del APK; no se modificó la carga nativa en esta entrega.

## Primera publicación y comprobación

- Fuente `22c5ae265d140e177038ed23c5207a19dcfc6578`, que incluye `8824ad1` y
  `774075b`, subida a la rama de trabajo y staging. Railway `web-tienda`, ambiente
  staging, despliegue `e4f34058-0bd7-4cf0-a5e6-4b8ec0a4758a`: **SUCCESS** para ese SHA.
- `node scripts/staging/check-product-purchase-published.cjs`: **7 escenarios
  aprobados** con catálogo, precio y existencia públicos reales. Los cambios son
  solo del carrito invitado en el navegador. Incluye doble clic, reversión exacta,
  edición externa con/sin evento, lectura denegada y recuperada, escritura denegada
  y actualización de precio/restitución de metadatos. Ningún pedido ni escritura
  remota. No abre checkout para hacer un cobro.
- La comprobación de lectura recuperada encontró un aviso antiguo que seguía en
  tarjetas relacionadas. Ahora se borra cuando se puede leer de nuevo; se añadió
  su prueba de regresión y se comprobó también en la página publicada completa.
- Capturas publicadas: `/tmp/gaes-purchase-published-320.png` y
  `/tmp/gaes-purchase-published-viewport320.png` (viewport para inspección legible).
- Tres entradas nuevas de Chromium sobre la versión `22c5ae2`: catálogo visible a
  **1519, 980 y 970 ms**; evento de carga completa a **1520, 981 y 970 ms**.
  El marcador «Cargando catálogo» desapareció después de **599, 503 y 478 ms**.
  Sin errores JavaScript ni escrituras. Es una observación de esas muestras; no
  representa una garantía de tiempo para otras redes, dispositivos o para el APK.
- Producción y APK no se modificaron. La última pasada no encontró nuevos fallos
  en los casos anteriores; esto no certifica todos los flujos del sistema.


## Ajuste posterior de la presentación móvil

La inspección del viewport publicado de 320 px detectó que el subtotal normal
se partía en dos líneas. En móviles, el resumen usa ahora una cuadrícula con
el botón de compra debajo, a todo el ancho. El precio conserva espacio suficiente.
Un `ResizeObserver` reserva debajo de la página la altura real del panel, incluidos
los avisos, para evitar que tape los últimos controles; al ocultarlo se limpia
la reserva de espacio.

- Fuente del ajuste: `04340c1d0829f28e3ded952725df8328ea3b7184`.
- Compilación web correcta y typecheck del repositorio **30/30**.
- Los **27 escenarios locales** siguen aprobados. Se añadió a la comprobación
  inicial una aserción de precio en una sola línea y espacio inferior suficiente.
- La comprobación publicada añade esas aserciones y verifica que al vaciar el
  carrito se retiren tanto la clase como la variable de espacio reservado.
- Railway staging `web-tienda`: despliegue
  `dc9ee5ae-d037-4818-b5f6-d6fbd9667d9a` **SUCCESS** para el SHA anterior.
- Repetición publicada: **7/7 escenarios aprobados**, sin pedidos ni escrituras
  remotas. Captura `/tmp/gaes-purchase-published-viewport320.png` inspeccionada:
  `$509.00` se lee en una línea y el botón ocupa la fila completa.
