# Tienda: revisión y repetición segura de pedidos

## Ciclo de hallazgos y correcciones

1. La franja anterior copiaba precios históricos y validaba variantes recorriendo
   solo los primeros 100 productos del catálogo. Si la consulta fallaba o había
   más productos, agregaba todo de todas formas. Ahora consulta exactamente las
   variantes y cantidades del carrito resultante con el verificador público existente.
2. Ya no agrega una línea a la vez ni anuncia éxito cuando se omitieron todos los
   productos. Presenta una vista previa, explica cada producto retirado o sin
   existencia suficiente y permite elegir qué sumar. Solo guarda una selección
   no vacía tras confirmación explícita.
3. El guardado compara cuenta, tienda y carrito completo antes y después de las
   consultas. Un doble toque, otra cuenta, cambios de carrito, visibilidad oculta,
   desmontaje y respuestas tardías no pueden reutilizar esa confirmación.
4. Al confirmar, revisa otra vez los precios y la disponibilidad. Si cambian, muestra
   el resultado actualizado y exige una nueva confirmación. Comprueba la sesión
   real antes del guardado; una sesión distinta o vencida ofrece actualizar la página.
5. Una sola escritura local guarda el resultado combinado. Si el callback de
   sincronización falla después, comprueba lo guardado y evita ofrecer una segunda
   suma. El aviso distingue selección local de sincronización remota.
6. La revisión de teclado encontró pérdida de foco al cerrar el diálogo: el botón
   estuvo deshabilitado durante la consulta previa. El diálogo compartido admite
   un destino de foco explícito; Escape y cerrar restauran el botón. Tras agregar,
   el foco pasa a «Ver carrito» y el resultado tiene semántica de estado.
7. La comparación con el checkout real encontró que los snapshots persisten
   `cantidad` como texto decimal. Se normalizan decimales válidos, incluidas
   fracciones y variantes duplicadas, sin concatenar cantidades ni aceptar exponentes,
   hexadecimal, valores negativos o más de tres decimales.

## Límites y privacidad

`GET /api/cuenta/repetir-pedido` es una lectura privada nueva. Usa el token del
comprador verificado para listar sus últimos pedidos y consultar el detalle del
último entregado/recogido. No usa el email para reclamar compras ajenas. Filtra
la respuesta a cuenta/tienda, folio y variante/nombre/cantidad; no envía dirección,
correo, pago ni precios históricos a esta franja. La variante de consulta de sesión
no consulta pedidos. El propietario esperado solo es una comprobación, nunca
decide la identidad del servidor.

Sesión y lecturas comparten un límite de 15 segundos; el navegador usa 20 segundos,
cancelación y respuestas sin caché. Los errores no reenvían mensajes privados del
backend. Una selección admite como máximo 100 variantes y 100000 unidades por
variante, hasta tres decimales. La existencia se revisa para la suma de cantidad
actual más repetida. Los límites inválidos no producen escrituras parciales.

No se crean pedidos, cobros, reservas ni notificaciones al revisar o repetir.
Repetir solo modifica el carrito; la sincronización habitual sigue usando sus
controles de versión. El stock y costo definitivos se confirman al pagar.

## Validación local final

- **898/898** pruebas web, incluidas 48 nuevas de contratos, cantidades y límite privado.
- Compilación Next de producción aprobada; typecheck del hook de commit **30/30**.
- **25 escenarios** de `check-repeat-order-ui.cjs`: componentes reales y carrito
  real del navegador; cuenta, pedidos y respuestas de precios sintéticos. Cubren
  selección parcial, cero seleccionados, cantidad combinada, precio cambiado,
  producto retirado, doble toque, guardado antes/después de fallar, sesión distinta
  y vencida, almacenamiento cambiado sin evento, caducidad de consultas,
  cambio de cuenta, página oculta, desmontaje y foco de teclado.
- **76 escenarios de regresión**: catálogo 19, filtros 17, verificación del carrito
  20 y recuperación de carrito 20. No modifican datos remotos de compradores.
- Vista previa de 320 px inspeccionada en `/tmp/gaes-repeat-preview-320.png`;
  diálogo nativo modal, controles completos y sin desbordamiento horizontal.

La última pasada local no encontró nuevos fallos en esos casos. Esto no certifica
la ausencia global de errores, pagos reales, correos, APK ni todas las integraciones
del sistema. El caso positivo de escritura se prueba solo en almacenamiento local
con cuentas simuladas; la comprobación publicada mantiene bloqueadas las escrituras.

## Comprobación publicada final

- Fuente: `433b503432cc3b85c7f302cf591bdbadd85a80c8` (incluye
  `decdd6abaebe60f943461c1a9ea00dcaefa926c3`), subida a trabajo y staging.
- Railway `web-tienda`, ambiente staging: despliegue
  `30f2cb7a-6372-4212-905a-117ccc2dbc95`, **SUCCESS** para ese SHA.
- `REPEAT_QA_ACCOUNT=<archivo-privado> node
  scripts/staging/check-repeat-order-published.cjs`: **8 escenarios aprobados**.
  Autenticación con comprador de pruebas existente; lecturas reales de la respuesta
  privada, confirmación de sesión y rechazo de propietario distinto. La UI publicada
  usa esa identidad real con pedido, precios y carrito vacío sintéticos. El caso de
  precio cambiado exige nueva confirmación; se cierra sin agregar productos.
- Las rutas de escritura del navegador permanecen bloqueadas; no se escribieron
  carritos remotos ni se crearon pedidos, cobros, reservas o correos. Las credenciales
  nunca se imprimieron, persistieron en Git ni se modificaron; se eliminó el archivo
  temporal de autenticación al terminar.
- Captura publicada de 320 px inspeccionada:
  `/tmp/gaes-repeat-published-320.png`. Sin errores JavaScript o desbordamiento en
  los casos comprobados. Escape y cerrar restituyen el foco del botón original.
- Producción y APK no se modificaron. La última pasada publicada no encontró
  nuevos fallos en los escenarios anteriores; las condiciones externas de salida
  a producción siguen requiriendo su validación propia.
