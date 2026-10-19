# Tienda: historial opcional y galería de productos

## Hallazgos y cambios

1. El historial aceptaba cualquier JSON como si fuera un arreglo. Se reprodujo
   contra la fuente anterior el error `leerVistos(...).filter is not a function`
   con `{}`; una escritura denegada también escapaba de `registrarVisto`.
   Ahora lectura, validación y escritura son acotadas y tolerantes a fallos.
   Un historial que no se puede leer no se sobrescribe ni emite una confirmación.
   Esta recomendación opcional nunca debe interrumpir la ficha o la compra.
2. La validación conserva como máximo doce productos únicos, con slug de producto,
   título e importe decimal válidos; elimina campos ajenos e imágenes con esquemas
   no admitidos. Se limita también el tamaño del dato guardado. No convierte un
   precio inválido en gratuito o NaN.
3. «Vistos recientemente» aclara que muestra el último precio visto y que hay que
   confirmar precio y disponibilidad al abrir la ficha. Actualiza la selección
   ante visitas en la misma pestaña y cambios/borrado desde otra. Usa el componente
   de imagen con alternativa accesible ante una URL rota y dos columnas en móviles.
4. En la galería web varios botones medían menos de 44 px. Todos los controles del
   visor tienen ahora un área de al menos 44 × 44 px. La imagen cede altura para
   mantener los controles dentro de una pantalla horizontal de 640 × 360.
5. Al cambiar producto, colección de fotos o configuración de zoom se reinicia la
   galería web: índice, modal, escala y giro pertenecen a ese contexto. También se
   limpia el gesto al cancelar, cerrar, cambiar foto o perder captura del puntero.
   Se agregaron flechas de teclado para recorrer fotos. Cerrar o desmontar restaura
   el desplazamiento de la página y Escape devuelve el foco al disparador.
6. En el código de la app se aplica igualmente el reinicio de galería al cambiar
   título o colección de fotos; evita heredar un índice anterior en una colección
   más corta o vacía. Esto es un cambio de fuente, no un APK publicado o probado.
7. Una comprobación anterior de recomendaciones revisaba `naturalWidth` justo
   después de que aparecía el elemento `<img>`, antes de completarse la descarga.
   Ahora espera explícitamente la carga real. No se cambió el componente de imagen
   para resolver esa carrera de la comprobación.

## Validación local

- Web: **969/969 pruebas**, 48 archivos; incluye 32 casos nuevos del historial.
- App: **102/102 pruebas**, 13 archivos. Estas pruebas existentes no equivalen a
  interacción con el visor en un dispositivo físico.
- Typecheck del repositorio: **30/30**.
- Build de producción de Next correcto.
- `expo export --platform android --output-dir dist/media-qa`: correcto; bundle
  Hermes generado. Valida el empaquetado, no la instalación ni el flujo nativo.
- `check-product-media-ui.cjs`: **12 escenarios**, componentes React reales con
  historial, fotos y navegación sintéticos. Incluye JSON de formas incorrectas,
  lectura/escritura denegadas, cambio de pestaña y borrado, foto rota y reemplazada,
  zoom/giro/restablecer, pellizco mediante eventos táctiles CDP, cancelación,
  teclado/Escape/foco, cambio de producto, colección vacía, 320 px, horizontal corto,
  escritorio y desmontaje del modal.
- Regresión local: tarjetas **20**, recomendaciones/imágenes **18**, formularios de
  producto **26**, compra desde ficha/carrito **27**. Total: **103 escenarios** de
  navegador en este lote, todos aprobados. Los formularios usan recibos simulados:
  no se registraron avisos reales de stock ni preguntas ni correos.
- Capturas locales inspeccionadas: `/tmp/gaes-media-gallery-320.png` y
  `/tmp/gaes-media-gallery-landscape.png`.

## Publicación

Fuente: `45b5d8d` en la rama de trabajo y staging. La verificación publicada usa el
producto público real `/producto/demo-lampara`; el historial de prueba y los fallos
de almacenamiento son sintéticos y locales al navegador. Las escrituras de API
se bloquean. No se hacen pedidos, cobros, reservas ni envíos de correo.

Producción y APK permanecen sin actualizar. No se afirma que todos los flujos del
sistema ni todos los dispositivos hayan sido certificados.

## Última pasada sobre staging

- Fuente completa: `45b5d8db52b87d1e3d7b6390a06b65bb42602b9c`.
- Railway `web-tienda`, ambiente staging, despliegue
  `49f46e0c-8d2e-448e-93f0-46bd9ffc47ab`: **SUCCESS** para ese SHA.
- `check-product-media-published.cjs`: **5/5 escenarios aprobados**. Incluye tres
  formas de historial dañado, lectura y escritura denegadas, precio histórico e
  imagen rota, zoom/giro/restablecer/Escape/foco y controles dentro de 640 × 360.
  La espera comprueba que la ficha esté interactiva, sin depender del silencio
  total de la red; ambas operaciones tienen tiempos máximos explícitos.
- `check-product-purchase-published.cjs`: **7/7 escenarios aprobados**, incluidos
  carrito local, doble clic, reversión exacta, edición externa, almacenamiento
  denegado y actualización del precio. Ningún pedido ni escritura remota.
- `check-product-hydration.cjs`: **8/8 entradas nuevas aprobadas**, campos
  interactivos entre **1015 y 1515 ms**, conservando el texto introducido; cero
  errores JavaScript, archivos fallidos o escrituras de negocio. Es una muestra
  de esa web/red/dispositivo de prueba, no una garantía para cualquier teléfono.
- Capturas publicadas inspeccionadas: `/tmp/gaes-media-published-320.png` y
  `/tmp/gaes-media-published-landscape.png`.

La última pasada no dejó fallos reproducibles pendientes dentro de estos casos.
No amplía esa conclusión a todos los flujos del repositorio. La instalación y
prueba física de un APK con este código siguen fuera de la evidencia anterior.
