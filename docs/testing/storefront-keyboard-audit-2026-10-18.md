# ST007: recorrido de teclado de la tienda

## Cambios concretos

- Login y registro: el botón para mostrar/ocultar contraseña medía 18×18 px en staging. Ahora tiene un área de 44×44 px, con el icono centrado y sin cambiar el campo ni su comportamiento.
- Checkout: los selectores de dirección, método de pago y tarjeta guardada anunciaban `radio` pero las flechas no movían foco ni selección. Los tres grupos ahora comparten navegación con flechas, Home y End, vuelta de extremo a extremo y una sola parada Tab por grupo. Se conservan las funciones originales de selección y las validaciones del pago. Los controles deshabilitados, incluso por un fieldset, quedan excluidos.

## Prueba reutilizable

Desde la raíz del repositorio:

```sh
node scripts/staging/check-storefront-keyboard.cjs
KEYBOARD_QA_LOCAL_SOURCE=1 node scripts/staging/check-storefront-keyboard.cjs
```

El modo predeterminado usa exclusivamente `https://web-tienda-staging.up.railway.app`. El modo local compila los componentes reales de checkout y acceso con esbuild y procesa el CSS real con PostCSS/Tailwind; sustituye solamente navegación Next y respuestas de API. No necesita un build Next ni credenciales.

Se pueden acotar repeticiones con `KEYBOARD_QA_WIDTH=1280` o `390` y `KEYBOARD_QA_ROUTES=/checkout,/cuenta/login`; las rutas deben pertenecer a la lista autorizada. Los informes quedan separados en `/tmp/gaes-storefront-keyboard-source-report.json` y `/tmp/gaes-storefront-keyboard-staging-report.json`.

## Cobertura y seguridad

- Publicado: catálogo con búsqueda, detalle de una lámpara, carrito con un producto sintético, checkout, login, registro y acceso a `/cuenta` sin sesión; a 1280 y 390 px.
- Recorrido Tab y recorrido inverso Shift+Tab por los controles de cada pantalla, campos visibles con etiqueta y detección de outline/sombra de foco. El recorrido inverso empieza antes de salir hacia la barra del navegador: volver de ella provoca comprobaciones legítimas de sesión y recarga controles.
- Catálogo/detalle: agregar con Enter o Espacio y deshacer con teclado; carrito: aumentar y disminuir con teclado.
- Galería y filtros móviles: apertura con teclado, recorrido dentro del diálogo, Escape y devolución del foco al disparador. El paso intermedio de Chromium por `document.body` al envolver el diálogo nativo no se considera interacción con el fondo.
- Checkout: direcciones guardadas/nueva dirección, tres métodos y dos tarjetas guardadas/otra tarjeta. Se pulsan las cuatro flechas, Home y End, se comprueban selección y foco, vuelta entre extremos y una sola parada Tab. Una opción se deshabilita de forma sintética para verificar que se omite; no se altera el servidor.
- Login/registro: tamaño del botón de contraseña y conmutación con Espacio y Enter.
- Todas las peticiones ajenas al origen de pruebas se bloquean. Todos los métodos distintos de GET se bloquean, salvo la verificación de carrito, cuya respuesta se genera en memoria sin reenviar la solicitud. Cuenta de checkout, direcciones, tarjetas, configuración y envío son respuestas sintéticas. No se confirman pedidos, pagos, correos ni cuentas.

## Evidencia y límites

La comprobación de la fuente corregida completó seis pantallas (checkout/login/registro × dos tamaños), 48 paradas Tab y 16 campos etiquetados, sin hallazgos ni intentos de escritura. Antes del despliegue, el recorrido publicado había reproducido 34 aserciones fallidas de los dos defectos corregidos: radios y objetivo del botón de contraseña.

**Repetición final publicada aprobada:** staging desplegado desde `323bf8c7db8a0c07f47f05519ef8ebb365e80a62`, 14 pantallas a 1280/390 px, 453 paradas Tab, 46 campos etiquetados, cero hallazgos, cero intentos de mutación y cero escrituras reenviadas. El runner terminó con código 0. Las diez paradas menos respecto a la observación previa son coherentes con los selectores que ahora conservan una sola parada Tab por grupo. Se verificaron también agregar/deshacer, aumentar/disminuir, galería y filtros, radios con teclas y exclusión de deshabilitados, y contraseña de 44×44 px.

Evidencia: `/tmp/gaes-keyboard-published-323-final.log` y `/tmp/gaes-storefront-keyboard-staging-report.json`. Detalle/carrito también se habían repetido aisladamente: 81 paradas, sin hallazgos ni escrituras.

Las señales iniciales del comparador inverso y del foco del diálogo se aislaron como comportamiento del navegador/harness antes de darles tratamiento de defectos de aplicación; no justificaron cambios visuales. La repetición final ya incorpora estas correcciones del harness.

El helper `scripts/staging/storefront-keyboard-browser.cjs` exporta `auditKeyboardPage(page, nombre, {coverage, findings})` sin iniciar un navegador ni manejar credenciales. Permite ampliar la evidencia con una página de cuenta SSR real ya autenticada por el E2E local y su base desechable, sin compartir sesiones ni usar usuarios de producción. La integración retail se ejecutó tras un login real de comprador fixture contra una base desechable y Next local: cuenta SSR a 390 y 1280 px, 73 paradas Tab y 14 campos etiquetados, cero hallazgos, sin errores JS/red. Evidencia: `/tmp/gaes-shopper-account-keyboard.json`; E2E `/tmp/gaes-shopper-e2e-final-keyboard.log` terminó con código 0.

Esto no equivale a una matriz exhaustiva de accesibilidad: no se probó lector de pantalla, contraste de todos los estados, cuenta de producción, dispositivos físicos ni todos los productos y combinaciones del negocio. `/cuenta` sin sesión en staging solo verifica su redirección a login; la cuenta SSR autenticada se verificó por separado en el fixture local. La detección CSS de foco comprueba un indicador declarado; no certifica su contraste. ST-007 queda cerrada únicamente para los recorridos y tamaños descritos, con la cuenta SSR autenticada cubierta por el E2E local. Los demás límites anteriores permanecen explícitos.
