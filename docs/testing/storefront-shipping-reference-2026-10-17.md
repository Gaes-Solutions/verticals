# Tienda: envío gratis sujeto a dirección y tarifa

## Problema y cambio

El API publica el menor `montoMinimoEnvioGratis` entre las tarifas activas. No
selecciona una tarifa para la dirección del comprador. La barra mostraba
«¡Tienes envío gratis!» al alcanzar ese mínimo, y las tarjetas y el producto
también lo anunciaban sin condiciones. Eso podía contradecir la cotización final.

- Catálogo y producto muestran «Envío gratis según zona y tarifa».
- La barra compartida por carrito y checkout habla del monto de referencia y
  explica que dirección y tarifa determinan el costo confirmado al pagar.
- Los importes de la barra se comparan en centavos. Un centavo faltante no se
  redondea a 100%. Un mínimo cero es válido; importes no finitos, negativos o
  fuera del rango seguro no muestran la barra.
- El carrito no usa como configuración el cuerpo de una respuesta HTTP fallida;
  exige un umbral de tipo string no vacío y cancela la consulta al desmontar,
  con un límite de 20 segundos.
- La condición de envío de una tarjeta queda junto al precio y puede ocupar
  varias líneas. Ya no compite con el descuento sobre una imagen estrecha.

No se modificó el cálculo de tarifas, cupones ni cobros del servidor.

## Validación local

- `pnpm --filter @gaespos/web-tienda test`: **850/850**, incluidos 17 casos nuevos
  de importes inválidos, umbral cero, diferencia de centavos y mensajes condicionales.
- `pnpm --filter @gaespos/web-tienda build`: aprobado.
- Hook de commit: **30/30** tareas de typecheck aprobadas y lint sin errores.
- `node scripts/staging/check-shipping-reference-ui.cjs`: **14 escenarios** con
  componentes reales y respuestas de configuración/precios sintéticas.
- Vista de 320 px; tarjeta de oferta de 140 px; sin desbordamiento horizontal.
  Capturas inspeccionadas: `/tmp/gaes-shipping-products-320.png` y
  `/tmp/gaes-shipping-local-320.png`.
- El navegador conserva exactamente el carrito local inicial. Las verificaciones
  de precio se interceptan y todas las demás escrituras remotas se bloquean.
  No se generaron pedidos, reservas ni correos.

## Alcance pendiente

La revisión también detectó problemas en `RepetirDespensa`: agrega precios
históricos, omite la verificación si el catálogo supera 100 productos, escribe
una línea a la vez y no cancela el pedido mostrado al cambiar de cuenta. No se
cambió ese flujo en esta entrega. Necesita una revisión propia con precios
vigentes, selección explícita y protección contra respuestas de otra sesión y
reintentos que dupliquen cantidades.

Esta entrega corresponde a la web de pruebas; no certifica todos los flujos del
sistema ni actualiza el APK o producción.

## Despliegue y comprobación publicada

- Fuente: `06aa1f8deceeee6f0ee66ccbd2d3a3011489a6dd`, subida a la rama de trabajo
  y a `staging`.
- Railway `web-tienda`, ambiente staging: despliegue
  `8d8ef199-66a6-4678-b347-eb104e7adc97`, estado **SUCCESS** para ese SHA.
- `SHIPPING_QA_URL=https://web-tienda-staging.up.railway.app node
  scripts/staging/check-shipping-reference-ui.cjs`: **13 escenarios aprobados**.
  Ejecuta el carrito publicado con respuestas sintéticas de precio y configuración;
  no representa una cotización real de entrega. El escenario adicional de catálogo
  y producto se ejecutó localmente con los componentes reales.
- Captura publicada de 320 px inspeccionada:
  `/tmp/gaes-shipping-published-320.png`. No se detectaron errores JavaScript,
  desbordamiento horizontal, cambios del carrito ni escrituras remotas en los casos
  comprobados.
