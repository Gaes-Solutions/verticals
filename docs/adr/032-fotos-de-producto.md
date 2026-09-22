# ADR 032 — Fotos de producto

Fecha: 21-sep-2026.

## Problema

La tienda en línea abrió con 2,049 productos **sin una sola foto**: el modelo
`producto_imagenes` existía desde el diseño pero nada lo usaba, no había forma de
subir una imagen desde el panel y `fotosArray` del producto publicado siempre
estaba vacío. Para una tienda de globos y regalos, un catálogo en gris no vende.

## Decisión

- **Dónde se guardan:** en el volumen del servicio API (`PRODUCTOS_MEDIA_ROOT`),
  con el mismo patrón que los anuncios del kiosco. Sin volumen configurado la
  carga responde 503 y lo dice; no se acepta una foto que se perdería al
  desplegar. El campo `s3Key` del modelo queda listo para mover el almacén a S3
  o Backblaze sin tocar el resto.
- **Qué se acepta:** JPG, PNG y WebP hasta 5 MB. SVG queda fuera a propósito:
  puede ejecutar scripts en el navegador de quien la vea.
- **Cómo se valida:** el encabezado y el nombre no prueban nada; se comparan los
  primeros bytes del archivo con la firma del formato. El cuerpo llega como
  stream y se corta en cuanto pasa del límite, sin autenticar antes de leer nada:
  sin sesión (401), sin tamaño (411), muy grande (413), formato raro (415), y
  como máximo 3 cargas a la vez en el proceso.
- **Cómo se sirven:** `GET /t/tienda/imagenes/:id`, público como el catálogo, con
  caché de una semana. Si el archivo no está, 404.
- **Carga en lote:** el panel sube muchas fotos de una vez y asigna cada archivo
  al producto cuyo **código de barras, SKU o código** coincida con el nombre del
  archivo (`7501234567890.jpg`). Al final lista exactamente cuáles no encontraron
  producto y por qué. Con miles de productos, abrir uno por uno no es una opción.
- **Publicación:** al publicar el catálogo y al subir o borrar una foto se
  rearma `fotosArray` del producto publicado, que es lo que lee la tienda.

## Lo que falta

- No se generan miniaturas ni se recomprime: una foto de 5 MB se sirve tal cual.
- No hay reordenar ni texto alternativo desde el panel (el modelo ya los soporta).
- El volumen es del servicio: con varias réplicas del API habría que compartirlo
  o mover el almacén a S3.

## Validación

7 pruebas en `apps/api/test/tenant-imagenes-producto.test.ts`: guarda y sirve la
foto, ordena varias, rechaza un archivo que miente sobre su formato, rechaza SVG,
rechaza sin sesión, actualiza la tienda al publicar y al borrar, y no acepta
fotos de un producto inexistente.
