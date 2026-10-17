# Validación de roles y recorridos de tienda — 16 de octubre de 2026

## Ambiente y límites

Se ejecutaron las escrituras de API, permisos, plataforma y POS en bases PostgreSQL
locales desechables con migraciones reales. Las llaves externas se excluyen de esos
procesos. Cada ejecución elimina su base, procesos y sesiones al terminar.

También se ejerció el storefront publicado de **Gaesland en staging** con compradores
QA y pedidos para pagar al recoger, sin cargos con tarjeta ni dinero real. No se
modificó producción. Las primeras rondas conservaron las credenciales/MFA de
usuarios existentes; el alta posterior autorizada de 2FA de cobranza en staging
se documenta al final.

## Usuarios revisados

| Rol | Comprobación |
| --- | --- |
| Superadmin | Pantallas, formularios, filtros, errores/reintentos y operaciones de plataforma. |
| Soporte | Solo negocios y tickets; facturación, equipo y controles globales bloqueados por defecto. |
| Cobranza | Negocios y facturación; soporte, equipo y controles globales bloqueados por defecto. |
| Dueño | Catálogo, configuración, usuarios, roles, reportes y suscripción de su negocio. |
| Gerente | Operación y administración permitida; no puede convertirse en dueño ni restablecer la contraseña del dueño. |
| Cajero | Catálogo/POS; no accede a usuarios, roles, configuración de tienda o suscripción. |
| Vendedor | Catálogo y operación comercial; no administración de usuarios ni suscripción. |
| Almacén | Productos/inventario; no usuarios, reportes de ventas o suscripción. |
| Contador interno | Consulta financiera y reportes; no altas de productos ni administración de usuarios. |
| Comprador | Registro, carrito, checkout, recuperación de sesión, dirección, pedido, cancelación y avisos. |

La matriz de los seis roles retail verifica lecturas y escrituras con sesiones
reales, concesión y revocación de un permiso sin renovar JWT, desactivación de
empleados, separación de sesiones de comprador/plataforma y escalada a dueño.
Los permisos adicionales de plataforma conservan sus pruebas de concesión y
revocación por superadmin.

Se consultó la configuración **existente en staging**: las tres cuentas de
plataforma y las seis de tienda están activas con sus roles correspondientes;
soporte/cobranza no tienen extras, y solo `dueno` tiene wildcard en los seis roles.
No se resetearon sus contraseñas ni sus autenticadores para correr esta auditoría.

## Resultados reproducibles

- API completa: **1,302 pruebas en 105 suites**. La primera corrida tuvo 1,299 en
  verde y tres fallos encadenados del decodificador de kiosco: FFmpeg estaba instalado
  en el directorio del usuario, no en `/usr/bin`. Se corrigió la detección de
  ejecutables del runner y se repitió la suite afectada: **8/8 en verde**, con
  decodificación real y bubblewrap activo. No se desactivó el aislamiento.
- Matriz nueva de roles retail: **24/24**. Además se repitieron CFDI (33 pruebas
  en su corrida conjunta) y las cuatro suites de roles/pedidos/inventario/compras
  (114 pruebas en su corrida conjunta). Total único de API cubierto: **1,326**.
- Paquetes y apps excepto API: **834 pruebas en verde**, incluidas 114 de tienda,
  172 de POS, 102 de móvil cliente, 107 de móvil negocio y 29 de kiosco.
- Panel de tienda: **226 verificaciones de pantallas** a 1280 y 390 px para los
  seis roles, más **18 aperturas/cancelaciones de formularios** de productos,
  inventario y compras. Se comprobaron consultas iniciales, errores HTTP, errores
  JavaScript, fin de carga y desbordamiento horizontal de página. El contador
  tiene 13 pantallas permitidas tras corregir el acceso a la guía de configuración.
- Plataforma: **54 verificaciones de pantallas** en escritorio/móvil para los tres
  roles, incluidos 14 recorridos de fallo/reintento. También se probaron red caída,
  respuesta inválida, timeout y cancelación de una acción sin escribir.
- Plataforma de punta a punta: alta de plan/tienda/dueño, suspensión/reactivación,
  facturas paginadas, cupón, partner y registro manual de payout. El cobro de este
  recorrido es simulado; no representa una transferencia bancaria.
- POS/panel en navegador: **11/11**. Los siete recorridos del POS se repitieron
  con un usuario `cajero` real, separado del dueño que prepara el catálogo. Cubren
  venta en efectivo, apertura, búsqueda,
  catálogo SQLite sin red, alta fiscal de producto, plantilla masiva, lectura X
  fallida/reintento, devolución y promoción. El modo aislado de CI conserva esta
  separación de cuentas.
- Gestos publicados: cinco grupos en verde para móvil/escritorio, incluidos gestos
  inválidos, doble toque, cancelación, Deshacer y teclado, sin desbordamiento.
- Carrito publicado: navegación rápida, recarga con POST sin conexión, reintento
  persistente y conflicto con otro dispositivo, sin sobrescritura silenciosa.
  El comprador y carrito temporales de esa prueba se eliminaron.
- Recuperación publicada: registro con selección de invitado sin perder formulario,
  sesión inválida con retorno al mismo carrito, fallo de red que no habilita un
  segundo pago, intento inexistente confirmado por servidor y dirección guardada
  tras un error sin perder los campos.
- Posventa publicada: pedido para pagar al recoger, cancelación persistente,
  repetición sin duplicados, recuperación de errores de red, avisos que se marcan
  leídos y avisos nuevos que aparecen sin recargar. No se cobró dinero.
- Typecheck: **30/30**. Build de producción de web-tienda en verde.

Las correcciones funcionales hasta `b4c3dc4` se desplegaron correctamente en
API, panel, tienda, POS y superadmin de staging. La API (`/health`), el panel y
la tienda respondieron HTTP 200 tras el despliegue.

## Problemas corregidos

1. Los cambios de carrito pendientes podían desaparecer de la vista al recargar.
   Ahora guardan su versión original, se recuperan automáticamente si sigue vigente,
   reconocen una respuesta guardada que se perdió y conservan conflictos para revisión.
2. Una cuenta nueva podía entrar al checkout vacío después de registrarse con una
   selección de invitado. Ahora se traslada de forma duradera al carrito de la cuenta
   si está vacío, conservando la comprobación de versión del servidor.
3. Pagar antes de terminar el guardado del carrito podía devolver un conflicto.
   El checkout espera el guardado antes de marcar/enviar el intento de compra.
4. Una sesión vencida podía ocultar el enlace para volver a entrar al mostrar el
   carrito vacío. Ahora la recuperación de sesión sigue disponible.
5. El correo de recuperación de carrito no incluía su enlace en texto plano.
   Se corrigió y se escaparon los valores HTML; los enlaces ejecutables se rechazan.
6. Gerente y contador tenían visible Facturación, pero no podían consultar los datos
   del emisor. Ahora el permiso de lectura fiscal permite esa consulta sin entregar
   la llave de Facturama ni dar permiso para modificar la configuración.
7. Pedidos online solicitaba el directorio administrativo de usuarios para asignar
   surtido: vendedor/almacén recibían 403. Ahora recibe únicamente nombres e IDs
   de empleados activos, sin correos, roles ni otros datos administrativos. Las
   cuentas internas de servicio no pueden asignarse al surtido.
8. Inventario y compras necesitaban opciones de sucursal para roles sin permiso
   de configuración. Ahora consultan un catálogo mínimo de sucursales activas;
   los detalles completos y la administración de sucursales siguen bloqueados.
9. El resumen del contador solicitaba inventario operativo sin permiso y fallaba
   completo. Ahora consulta y muestra las alertas de inventario solo para roles
   autorizados; el contador conserva su resumen de ventas sin recibir ese acceso.
10. La consulta de clientes de mayoreo pedía listas de precios incluso para el
    contador, que no puede crear clientes ni leer esas listas. Ahora esa consulta
    solo se hace para quien puede crear clientes y consultar precios.
11. La guía de configuración aparecía al contador pese a requerir consulta de
    configuración. Su menú ahora usa el mismo permiso que la API. Además, el panel
    comprueba la sección permitida antes de montar la pantalla, evitando consultas
    prohibidas durante la restauración de sesión o al cambiar a una sección oculta.
12. La tienda no tenía su script `test` dentro de la batería ordinaria. Ya está
   incluido y CI ejecuta también roles/pantallas y POS en ambientes desechables.

## Cómo repetir

```sh
# API completa (base exclusiva, sin usar datos de desarrollo)
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs --api-tests
# Roles y recorridos de plataforma, incluidos los 54 controles de pantallas
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs
# POS y panel en navegador con base exclusiva
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs --retail-e2e
# Matriz específica de roles
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs --api-tests test/retail-role-matrix.test.ts
```

Los scripts `scripts/staging/check-storefront-*.cjs` contienen verificaciones del
sitio publicado. Algunos crean compradores QA, direcciones y pedidos sin cobro;
no deben apuntarse a producción.

## Pendientes externos y alcance que no debe confundirse con aprobado

- **Stripe Connect de Gaesland continúa pendiente de registro.** Se volvió a comprobar contra
  Stripe el 16 de octubre: registro sin enviar, cobros y depósitos deshabilitados; no se da por aprobada la compra publicada con tarjeta, 3DS de comprador,
  comisiones o depósitos. Suscripciones SaaS tienen su evidencia externa aparte.
- La emisión fiscal real y el dominio propio conservan los pendientes descritos en
  `testing-platform-workflows.md`. Esta auditoría no los habilita.
- Las pruebas de código móvil no certifican una APK instalada, cámara, huella,
  notificaciones del sistema o comportamiento de cada teléfono físico.
- Tener esta batería en verde no significa seguridad absoluta ni todas las
  combinaciones posibles. Los resultados corresponden a los recorridos descritos.

## Continuación de la validación — Android y servicios externos

- Cliente móvil: **102/102 pruebas** repetidas y exportación Android/Hermes del
  código actual completada. Esto verifica el empaquetado JavaScript y sus assets,
  no una instalación en un teléfono.
- APK publicada versión 8: firma Android válida, paquete separado de staging,
  API de staging y tienda fija Gaesland presentes en el bundle. El código de la
  app y `api-client` coincide con el commit del artefacto; los cambios posteriores
  del lockfile eran del panel superadmin. No se detectaron patrones de llaves
  privadas Stripe o secretos de webhook en el bundle; no es una auditoría completa
  de secretos del archivo ni sustituye las verificaciones de servidor.
- Se encontraron permisos heredados de lectura/escritura de almacenamiento y
  superposición sobre otras apps, que la tienda no utiliza. Se bloquearon los
  tres en `app.config.ts`. La introspección de Expo verifica su eliminación y
  mantiene ubicación, biometría y vibración. La nueva APK versión 9 se solicitó
  desde `72c817e`, perfil `gaesland-staging-phone`. El verificador reproducible es
  `python3 scripts/testing/check-customer-apk.py archivo.apk --version 9`
  (requiere Android SDK). Como control negativo, rechazó la APK 8 precisamente
  por los tres permisos retirados.
- **APK 9 terminada y descargada:** el verificador del archivo real pasó. Firma
  válida, mismo certificado que la versión 8 para admitir su actualización,
  paquete de staging, ARM de 32/64 bits, sin modo depurable y sin los tres
  permisos innecesarios. Conserva ubicación, biometría, red y vibración. API
  de staging y tienda fija Gaesland verificadas en el bundle.
  [Descargar APK 9](https://expo.dev/artifacts/eas/4_IpGgcrV6Av--X6M7tfs09bmCdSZuoNqaOuEhaQitA.apk).
  SHA-256: `231f7656cc88f8593c066072a4e1b69dd1e8694b0b50e197f121a33f3bd858e6`.
  Comando adicional: `--previous anterior.apk` comprueba continuidad del
  certificado de firma. La inspección del instalable no sustituye su ejecución
  en un teléfono.
- **12 comprobaciones públicas de staging** aprobadas: cuatro rechazos de firma
  Stripe (suscripciones y pedidos), inexistencia del webhook de simulación,
  seis rutas financieras/administrativas sin sesión y coherencia de la
  configuración pública de tarjeta. Script repetible:
  `node scripts/staging/check-payment-boundaries.cjs`.
- Catálogo publicado de web y app: **12/12 productos coinciden** en visibilidad,
  variantes comprables, precios, ofertas, stock total e imágenes. Las doce imágenes
  distintas responden HTTP 200 con contenido de imagen. El script normaliza el
  formato anidado de variantes web frente al formato plano móvil, sin comparar
  campos que solo ofrece una de las dos interfaces:
  `node scripts/staging/check-public-catalog-parity.cjs`.
- Lectura guardada de la base de staging: sin `CfdiConfig` de Gaesland; dominio
  propio sin configurar; solo está registrado/verificado el host de Railway.
  Stripe confirma cuenta vinculada, registro sin enviar y cobros/depósitos
  deshabilitados. No se cambiaron estos datos ni se fabricaron habilitaciones.
- Se corrigió la documentación de sandbox y `.env.example`: el cliente obtiene
  la llave pública desde la API, el webhook actual de Conekta es
  `/webhooks/conekta`, y los cobros de pedidos Stripe/Connect tienen firma y ruta
  distintas de las suscripciones. La ausencia de proveedor no acredita pagos
  simulados en producción.

No hay un teléfono conectado por ADB. El emulador disponible es x86_64 y la APK
para teléfonos contiene ARM; además la máquina no dispone de `/dev/kvm`. Un
intento de emulador desechable sin aceleración no habilitó ADB durante esta
revisión. La ejecución nativa de invitado se validó después en un emulador de GitHub
Actions (resultado abajo). Los permisos interactivos, biometría, ubicación,
notificaciones y cierre brusco con cambios pendientes aún requieren validación
específica; el recorrido de invitado no los certifica.

## Cierre de pendientes que sí se pudieron avanzar

- Se verificó el dominio de plataforma que ya existía:
  `https://gaesland.shop.angaes.com`. DNS, HTTPS y nombre de negocio correctos;
  un subdominio aleatorio sin negocio devuelve 503. Fue una consulta pública,
  sin cambiar producción. Esto corrige la impresión anterior de que faltaba
  cualquier dominio: lo pendiente es conectar uno de marca diferente, si se desea,
  y validar la aplicación/cobro de la versión que se libere.
- La ejecución nativa mediante EAS Maestro fue rechazada por la cuenta gratuita
  antes de crear el job: requiere un plan de pago. No se contrató ni actualizó
  ninguna suscripción. Se preparó una alternativa en GitHub Actions usando la
  APK 10 universal verificada, un emulador desechable y un flujo Maestro sin cuenta ni
  pedidos. El flujo revisa navegación inicial sin selector de tienda, búsqueda,
  producto, zoom, giro, entrada desde Agregar al carrito y recuperación de acceso.
  Su resultado se registra en una rama `qa-native/` separada; nunca modifica
  `main`, `staging` ni datos del negocio. La ejecución aprobó: ver resultado abajo.
- Se reintentó el registro oficial de la cuenta Stripe sandbox, con el botón
  oficial de teléfono de prueba. Stripe presentó un desafío hCaptcha que
  interceptó la continuación. No se resolvió ni eludió automáticamente. Se
  preparó un enlace nuevo y privado para que el dueño complete ese paso; el
  enlace y las sesiones de Stripe no se guardan en el repositorio.
- No se encontraron credenciales de Facturama ni del administrador DNS en las
  configuraciones local y de staging consultadas. El dominio existente no
  necesitó cambios DNS. Facturación externa sigue pendiente de una conexión
  válida al proveedor.

### Contrato de Facturama corregido durante la revisión

- La autenticación utiliza `usuario:contraseña` (Basic) y el encabezado
  `User-Agent` con el usuario. La pantalla ya explica este formato y enlaza el
  registro sandbox, sin mostrar credenciales guardadas. También aclara el alta
  del CSD en API-Lite; guardar la configuración local no registra el certificado.
- Se conserva emisión API-Lite y se corrigen las descargas a
  `/api/Cfdi/{xml|pdf}/issuedLite/{id}` y cancelación a
  `/api-lite/cfdis/{id}`. El código anterior mezclaba API Web con API-Lite.
- Las descargas se reciben como JSON con `Content` Base64: se decodifica el XML
  y se conserva el PDF Base64. El timbre y sellos se leen del XML con un parser,
  rechazando DTD y documentos sin timbre, en lugar de exigir un campo de respuesta
  `Complemento.TimbreFiscalDigital` que no representa el contrato del proveedor.
  Se corrige el CP receptor a `TaxZipCode`.
- Validación local: 13/13 pruebas del paquete fiscal; 31/31 pruebas relacionadas
  de API en base desechable migrada, con limpieza al terminar. No se emitió ni
  canceló ningún CFDI externo. La conexión sandbox real sigue pendiente de
  credenciales y certificado de pruebas del dueño.

Referencia técnica primaria: [colecciones oficiales de Facturama](https://github.com/Facturama/facturama-api-collections),
incluidas las solicitudes de la carpeta API-Lite.

### APK universal para ejecutar la validación nativa

- Build EAS `2907f640-d7ff-4589-9ef5-42d95776c791`, versión Android 10,
  perfil `gaesland-staging`, fuente `0407587dd41e525990a69678d8b251809f160921`.
- Firma válida y mismo certificado que la versión 9: permite actualizarla.
  Incluye React Native y Hermes para ARM32, ARM64, x86 y x86_64; sin los tres
  permisos innecesarios retirados en la versión 9. Paquete de staging fijo a
  Gaesland y API de pruebas verificados.
- SHA256 APK: `0359997e95ee90b593b99d22a2aa3af0172936742366e910d846eddea47c9d3e`.
- El bundle JavaScript de las APK 9 y 10 es idéntico: SHA256
  `86ed0767067ba4e45d8c574d4113de6c2c3aebb847b21772522d2ac780367a39`.
  El cambio de arquitectura no altera las pantallas ni los flujos.
- La APK 9 se instaló en el emulador x86_64, pero se cerró antes de mostrar la
  interfaz: SoLoader no encontró la biblioteca x86_64 `libreactnative.so`. La
  traducción ARM del emulador no resolvió esa configuración de React Native.
  No se omitió el fallo: se compiló la versión universal para poder probarla
  con bibliotecas nativas del emulador Android 15.
- [Descargar APK 10 de staging](https://expo.dev/artifacts/eas/9VMjiNMARcgEsBWhAavocn039okqGQwclbNNI-cJdyY.apk).

### Resultado nativo ejecutado: aprobado

- [GitHub Actions 38999197173](https://github.com/Gaes-Solutions/verticals/actions/runs/38999197173):
  APK 10 instalada y un recorrido Maestro completo aprobado en Android 15
  x86_64, sin fallos (46.2 segundos de recorrido). No son múltiples casos
  independientes: es un escenario encadenado.
- Pasos ejecutados: abrir Gaesland sin selector de tienda; buscar Licuadora;
  abrir producto; ampliar imagen al 150%; girar; restablecer al 100%; cerrar
  galería; tocar Agregar al carrito sin sesión; comprobar mensaje de retorno al
  artículo; abrir recuperación de contraseña sin pedir tienda.
- Cinco capturas revisadas visualmente: inicio, producto, imagen girada, acceso
  y recuperación. No hay envío de correo, creación de cuentas, pedidos ni
  operaciones de dinero en este recorrido. No certifica compra con sesión,
  tarjeta, sensores, huella ni notificaciones del teléfono.
- Evidencia pública anónima y acotada en rama separada
  `qa-native/19cda0d1954a-38999197173-1`, con resumen, JUnit y capturas.
  La rama fuente del job es `19cda0d1954a3858548e169c9e0fcce8e4ad4289`;
  la fuente del artefacto APK se identifica por separado arriba.

## Ampliación de recorridos nativos con cuenta temporal

La batería Android ahora incluye dos escenarios encadenados sobre la APK 11 de
staging: invitado y cliente con una cuenta sintética nueva por ejecución. No se
usan usuarios del dueño ni contraseñas guardadas. La APK 11 incorpora el ajuste
de direcciones descrito abajo; el workflow comprueba su versión y hash exactos.

El escenario con cuenta cubre registro sin selector de tienda, búsqueda, agregar
un producto, aumentar a dos unidades, guardar el carrito, reabrir la app, entrar
a entrega y pago sin confirmar compra, crear y editar una dirección con CP
`06060`, consultar ubicación simulada, cerrar sesión, entrar de nuevo y recuperar
el carrito y la dirección. También comprueba cancelar y confirmar la eliminación
de la dirección. Las coordenadas son las de un punto público de Ciudad de México;
no se guarda una segunda dirección a partir del mapa.

Durante la preparación se identificaron y corrigieron dos fallas de la batería:

- El iniciador Pixel Launcher del emulador presentó un ANR que cubrió la app. Se
  aumentó memoria a 4 GB, se redujo la resolución a 1080×1920 y se deshabilitó
  únicamente ese iniciador en el emulador desechable. No se ocultan errores o
  bloqueos de Gaesland; sus diagnósticos siguen capturándose.
- Una expresión de comprobación con el cuantificador de regex `{4}` fue truncada
  al expandir `${...}` en Maestro. Se corrigió y se añadió una revisión de sintaxis
  de todas las expresiones antes de descargar herramientas y arrancar el emulador:
  `node scripts/testing/check-native-flows.cjs`. El control negativo reproduce y
  rechaza la expresión que falló.

Las credenciales se generan dentro del runner, se ocultan en sus logs y se eliminan
de los archivos de texto publicables. No se sube la carpeta de reportes crudos de
Maestro. Se verificó el saneamiento con valores sintéticos y un JWT de muestra.
Las capturas autenticadas contienen exclusivamente datos de la cuenta de prueba.

La limpieza desde la sesión local está acotada al correo sintético de una corrida,
Gaesland y la base de staging. Exige nombre de fixture, antigüedad menor de seis
horas y ausencia de ventas, pedidos y tarjetas antes de borrar carrito y cuenta:
`node scripts/staging/cleanup-native-fixture.cjs RUN_ID ATTEMPT --delete`.
Sin `--delete` solo informa cantidades del carrito y si se conserva la dirección
editada con cero inicial. Este comando requiere autenticación local de Railway.

Las capturas de la ejecución `39000581861` confirmaron visualmente seis etiquetas
inferiores completas, dos unidades y subtotal $1,798.00, dirección editada con
CP `06060`, y autollenado de calle, colonia, municipio, estado y CP desde el GPS
simulado. Esa corrida se detuvo por la expresión de la prueba y no se cuenta
como escenario completo aprobado. Su fixture se eliminó: cero pedidos, un
carrito de dos unidades y una dirección antes de la limpieza.

### Corrección de controles de dirección en pantallas pequeñas

- La corrida `39001123475` detectó un problema real en la APK 10: después de
  editar un campo y cerrar el teclado, Guardar quedaba parcialmente debajo del
  área visible. No se rebajó la condición de visibilidad de la prueba.
- El cambio `1d060ae` separa el pie de acciones del contenido desplazable en
  Android y web. En Android conserva SafeAreaView, la adaptación nativa a la
  altura del teclado y los bloqueos contra guardado duplicado. El botón de
  eliminar ahora tiene una etiqueta accesible y área táctil de al menos 44 px.
- En web se usa un diálogo HTML modal con título accesible, fondo bloqueado,
  cierre con Escape y acciones fijas. Los campos y el mapa se desplazan dentro
  del diálogo. Mientras se guarda, no se puede cerrar ni guardar otra vez.
- Pruebas locales de los cambios de interfaz: 102/102 del cliente Android,
  114/114 de la tienda web y typecheck 30/30 del repositorio.
- El formulario web desplegado en staging pasó en Chromium a 320×568, 390×640,
  390×420 y 1280×800: Guardar permanece completamente visible y no se desplaza
  junto con los campos; Tab no entra a controles del fondo; Escape cierra el
  formulario. Son tamaños de viewport, no una certificación del teclado físico
  ni de todos los navegadores de un teléfono.
- Se comprobó con un cliente sintético el autollenado desde ubicación simulada
  y consulta real al servicio de mapas, crear dirección conservando CP `06060`,
  editar calle y eliminar con confirmación. No hubo errores JavaScript del
  navegador. La cuenta y sus datos se eliminaron; no se crearon pedidos.
  Repetible con `node scripts/staging/check-address-footer.cjs` usando Chromium
  instalado y autenticación local de Railway para limpiar el fixture.
- También se eliminaron los fixtures de ambas corridas Android fallidas:
  cero pedidos y un carrito de dos unidades en cada una. La ejecución cancelada
  `39000540024` no llegó a crear cuenta.

### APK 11 de pruebas: artefacto verificado

- Build EAS `01723bec-2e82-4879-a53f-c59d1bfc329e`, versión Android 11,
  fuente `1d060ae5a23883b5a3aaee20acdd4849ff65d6f5`, perfil `gaesland-staging`.
- Firma válida y mismo certificado que la versión 10; bibliotecas React Native
  y Hermes para ARM32, ARM64, x86 y x86_64. API de staging y Gaesland fijos.
  No es un paquete conectado a producción.
- SHA256: `29145201ac315ec75cb8cd055347e9948052f40e7b82093b00834a5df68abae1`.
- [Descargar APK 11 de staging](https://expo.dev/artifacts/eas/ynM6hBP1H12TyddYVQoJ99i0biLowZ1OrPTw1F2Me5Q.apk).

### Resultado nativo APK 11: ambos escenarios aprobados

- [GitHub Actions 39003491483](https://github.com/Gaes-Solutions/verticals/actions/runs/39003491483),
  fuente de la batería `081078a4fa170fe91db4e247bf7525d8bb81bac9`, concluyó
  correctamente en Android 15 x86_64: invitado 1/1 en 53.7 s y cliente con
  cuenta 1/1 en 245.2 s, cero fallos. Son dos recorridos encadenados, no cientos
  de casos independientes. La fuente del APK es `1d060ae`, identificada arriba.
- Se comprobó que Guardar dirección permanece visible con el teclado abierto
  al editar, y que se puede guardar tras cerrarlo. El escenario también pasó
  registro, carrito con dos unidades, reapertura de app, entrega/pago sin
  confirmar pedido, dirección manual y edición con CP `06060`, autollenado con
  ubicación simulada, cierre/reingreso y recuperación del carrito/dirección.
- La eliminación se probó en ambas ramas: cancelar conserva la dirección;
  confirmar muestra la lista vacía. La cuenta temporal se borró al finalizar:
  cero pedidos, una entrada de carrito con dos unidades y cero direcciones.
- Evidencia acotada en `qa-native/081078a4fa17-39003491483-1`: resultados JUnit,
  logs saneados y capturas. Se revisaron visualmente Guardar sobre el teclado,
  carrito recuperado con dos unidades y subtotal $1,798.00, datos del mapa con
  CP `06060` y lista vacía tras eliminar, con las seis etiquetas inferiores
  completas. La prueba no envía correos ni crea cargos/pedidos.
- No certifica GPS físico, huella, notificaciones del dispositivo, todos los
  modelos Android ni cobro con tarjeta. Stripe sandbox se consultó de nuevo
  después de iniciar esta corrida: registro aún incompleto, `charges_enabled`
  y `payouts_enabled` falsos. No se cambió ningún indicador para saltar ese bloqueo.

## Verificación de las cuentas entregadas en staging

Se usó el archivo privado de accesos de PRUEBAS del Escritorio para verificar
las cuentas entregadas, sin sustituirlas por usuarios QA nuevos. Las URL se
comprobaron como staging antes de autenticar. No se usó el archivo de producción.

- Las diez contraseñas del archivo fueron aceptadas por sus endpoints reales.
  Son diez claves distintas, todas de al menos doce caracteres; los valores no
  se imprimieron ni se incorporaron al repositorio. El TXT y ZIP locales de
  accesos de pruebas quedaron con permisos de lectura/escritura solo para su dueño.
- Dueño, gerente, cajero, vendedor interno, almacén y contador recibieron sesiones
  reales de Gaesland. Se cotejaron identidad, negocio y rol; los seis permisos
  persistidos coinciden con sus presets actuales. Solo el dueño tiene wildcard.
- El recorrido de las seis cuentas existentes pasó **226 comprobaciones de
  pantallas a 1280 y 390 px**, más **18 aperturas/cancelaciones de formularios**,
  con el ingreso real desde el formulario de cada cuenta. Se compararon menús
  con permisos y se revisaron lecturas de API, errores JavaScript, carga y
  desbordamiento horizontal. No hubo escrituras de negocio. Pantallas por vista:
  dueño 34, gerente 32, cajero 11, vendedor 13, almacén 10 y contador 13.
- Las tres cuentas de plataforma existen y están activas. Soporte y cobranza
  no tienen permisos adicionales. Superadmin y soporte tienen MFA configurado;
  cobranza conserva pendiente el alta inicial de MFA.
- Matriz publicada de **80 comprobaciones, cero fallos**: lecturas permitidas,
  bloqueo de usuarios/roles/configuración/reportes/suscripción según el rol,
  rechazo de escrituras no permitidas de productos/usuarios/roles, separación
  de sesiones de empleados frente a plataforma/compradores y rechazo de los
  tokens intermedios MFA en rutas administrativas. Las escrituras rechazadas
  no crean registros de negocio.
- Comprador: ingreso real desde el formulario web, lectura de su perfil, pedidos
  y direcciones, y cierre de esa sesión de prueba, sin crear compras ni cambiar
  sus datos.
- Superadmin y soporte: se comprobó desde el navegador que la contraseña válida
  muestra el formulario de código 2FA y no concede menú ni token de sesión de
  plataforma. En esa primera pasada el ingreso completo quedó pendiente del
  código 2FA;
  la comprobación posterior con TOTP registrado se documenta abajo. No se usaron
  códigos de respaldo ni se modificó su configuración MFA. La cuenta de cobranza
  requiere su alta inicial de 2FA.
- Validación complementaria en PostgreSQL desechable: **136/136** en siete suites
  de administración, permisos de plataforma, matriz retail, autenticación de
  empleados, 2FA y sesiones/recuperación de cobranza. Incluye operaciones
  permitidas, rechazos, concesión/revocación con JWT existente y restricciones
  contra elevar privilegios. La base, servidores y sesiones QA se limpiaron.

La prueba de navegador de cuentas existentes se conserva en
`scripts/staging/check-existing-retail-accounts.cjs`. Recibe `RETAIL_ACCESS_FILE`
como ruta a un JSON privado de registros `{role,email,password,url}`; se ejecuta
desde la raíz del repositorio. Solo admite el panel staging de Gaesland, inicia
sesión mediante el formulario real, compara menús con los permisos, abre vistas
de escritorio/móvil y abre/cancela formularios. Bloquea cualquier escritura de
negocio y no registra secretos en sus resultados. No debe publicarse el JSON.

### Fallo encontrado: los roles archivados conservaban permisos

- El archivado de un rol personalizado guardaba `isActive: false`, pero las
  consultas de autenticación seguían incorporando sus permisos. Un empleado
  asignado conservaba el permiso archivado tanto en sesiones existentes como
  al volver a entrar.
- La nueva regresión reprodujo el fallo contra PostgreSQL aislado: después de
  archivar un rol de consulta de reportes, la misma sesión seguía recibiendo
  HTTP 200 cuando debía recibir 403.
- El cambio `f4af348` filtra roles activos tanto en el ingreso como al reconstruir
  el usuario de una sesión. Los pasos MFA y `/auth/tenant/me` reutilizan esa
  misma consulta. No cambia los permisos definidos para cada rol activo.
- La prueba ahora comprueba retirada inmediata con JWT existente, ausencia del
  rol/permiso en el perfil y en un ingreso nuevo, y recuperación del acceso si
  el dueño reactiva el rol. Se conserva cualquier otro rol activo del usuario.
- Las siete suites afectadas pasaron: 136 pruebas únicas; typecheck 30/30.
  La consulta guardada de Gaesland mostró cero asignaciones de roles inactivos
  en empleados activos. La reproducción no cambió roles, contraseñas ni MFA de
  las cuentas entregadas.
- API desplegada en staging: `779850eb-8829-44ff-8f4b-ba9b79d89df5`, fuente
  `f5691313cbfae4f5ada2fb28be20518734d52bb6`, estado SUCCESS y `/health` HTTP 200.
  Se verificó el commit del proceso activo y los dos filtros de roles vigentes
  en su código compilado. Después del despliegue se repitió el ingreso de las
  diez cuentas y pasaron **86/86 comprobaciones de API**: la matriz anterior más
  seis consultas de perfil con identidad, roles y permisos coherentes con el
  ingreso. En esa pasada los tres accesos de plataforma conservaron el paso MFA
  pendiente;
  el ingreso posterior de superadmin y soporte se documenta abajo.

### Estado del correo durante esta revisión

Brevo respondió correctamente desde el API de staging. Los cuatro remitentes
`notifications@angaes.com`, `alerts@angaes.com`, `support@angaes.com` y
`contact@angaes.com` aparecen registrados y activos; `angaes.com` aparece
registrado, verificado y autenticado. Esta comprobación fue de lectura y no
certifica entrega al buzón: no se envió un correo de prueba en esta ronda.

### Ingreso completo de las cuentas de plataforma existentes

Tras la indicación del propietario de usar el secreto TOTP registrado, se
comprobó el ingreso real desde el navegador de las cuentas entregadas de
superadmin y soporte: contraseña, desafío MFA y código temporal por
`/auth/mfa/verify`, seguido de `/auth/me` con identidad coincidente. El código
se generó dentro del servicio de staging; la clave del autenticador no salió
del servicio ni se publicó. No se firmaron sesiones manualmente, no se
restableció MFA y no se consumieron códigos de respaldo. Reutilizar el mismo
código en un nuevo desafío fue rechazado con HTTP 401 para ambas cuentas.

Esta prueba acredita el flujo del sistema con la clave registrada; no acredita
la disponibilidad ni la sincronización del autenticador físico del propietario.
Cobranza sigue pendiente del alta inicial de su propio autenticador; no se
inscribió silenciosamente durante las pruebas.

Con esas sesiones reales pasaron **20/20 comprobaciones de API**: superadmin
puede consultar sus áreas; soporte puede consultar negocios/tickets y recibe
403 al intentar acceder a equipo, métricas, cobranza, catálogo, plantillas de
roles, observabilidad, incidentes y auditoría, además de las escrituras probadas
de equipo, negocios, catálogo y roles. No hubo escrituras de negocio exitosas.
Dos comprobaciones adicionales de `/auth/me` confirmaron identidad, rol y
permisos exactos de los valores predeterminados, sin privilegios adicionales.

Con la sesión real de superadmin también pasaron las cuatro comprobaciones
de recuperación: desconexión, JSON inválido, tiempo de espera agotado y cancelar
el rechazo de un perfil sintético sin enviar escritura. Los tres errores de
lectura mostraron aviso y se recuperaron al reintentar.

El recorrido publicado con estas dos cuentas completó **46/46 comprobaciones**
(32 visitas a pantallas en escritorio de 1280 px y móvil de 320 px, y 14
escenarios de error/reintento de superadmin). También abrió y canceló los siete
formularios de administración en ambos tamaños: **14 comprobaciones de
formularios**, sin recortes de ventana ni desbordamiento horizontal. Se
comprobaron menús de 14 secciones para superadmin y dos para soporte, pestañas,
filtros, ausencia de errores JavaScript y ausencia de respuestas API fallidas
fuera de los errores inyectados. Las escrituras de negocio fueron bloqueadas
por el navegador de prueba. No aparecieron fallos nuevos en este recorrido.

Al finalizar se eliminaron los archivos temporales de entrada con contraseñas
y los tokens de acceso utilizados por la auditoría. El archivo original de
accesos de staging conserva permisos de lectura/escritura solo para su dueño.
No se modificó producción ni se activó MFA en la cuenta de cobranza.

## Pendientes de lanzamiento: cobranza y sesiones de plataforma

### Cobranza real de staging

Por indicación del propietario de probar los pendientes, se completó el alta
inicial de MFA de la cuenta de cobranza entregada, desde la pantalla web real.
La clave TOTP y los códigos de respaldo se guardaron en un archivo privado del
escritorio del propietario con permisos 0600; no se incluyen en el repositorio
ni en los registros. Se comprobó un segundo ingreso con contraseña y TOTP,
identidad correcta y exactamente `tenants.read`, `billing.read`, `billing.manage`.
El propietario todavía debe importar esa clave en su propio autenticador.

Pasaron **8/8 visitas de pantallas** (cuatro secciones en escritorio y móvil) y
**14/14 comprobaciones de API**: consultas de negocios/cobranza/facturas/
suscripciones permitidas; equipo, tickets, métricas, catálogo, plantillas y
observabilidad bloqueados; escrituras ajenas al rol rechazadas. No se realizaron
escrituras de negocio exitosas.

### Fallo confirmado en la cookie de plataforma y el cierre de sesión

La cookie de renovación emitida por el API usaba `Path=/auth`, pero el navegador
accede a esos endpoints por `/api/auth`. Un navegador real reprodujo HTTP 401
al renovar porque no enviaba esa cookie. Además, el botón Salir solo borraba
el token local y no llamaba al cierre del servidor.

Se corrige el alcance de cookies en el proxy Nginx compartido para conservar
el prefijo `/api`; el proxy Vite del panel adapta `/auth` a `/api/auth`. Salir
llama ahora a `/auth/logout` antes de borrar el acceso local, evita dobles clics
y muestra un error reintentable si el cierre no pudo confirmarse. No cambia
la duración del access JWT ni incorpora renovación automática.

La regresión reproducible `scripts/staging/check-platform-session.cjs` recibe
un JSON privado `{email,password,totpSecret}` mediante `PLATFORM_SESSION_ACCOUNT`.
Solo permite el panel staging o localhost. Con Nginx real en contenedor, el
frontend compilado y el API staging, pasaron las cuatro comprobaciones:

- Cookie con ruta `/api/auth`, HttpOnly y Secure.
- Renovación desde el navegador con rotación y rechazo del token anterior.
- Fallo de cierre simulado: aviso visible y posibilidad de reintentar.
- Cierre real: token local y cookie eliminados, refresh revocado en el servidor.

No se publican claves ni cookies. Las comprobaciones de replay usan un cliente
HTTP independiente para que la limpieza de una cookie inválida no altere la
sesión válida del navegador de prueba.

### Servicios externos todavía pendientes

- Stripe sandbox respondió HTTP 200 para Gaesland: `charges_enabled=false`,
  `payouts_enabled=false`, `details_submitted=false`, estado
  `requirements.past_due`; faltan cinco campos de dirección y la fecha/IP de
  aceptación de términos. No se inventaron datos legales ni se aceptaron
  términos en nombre del propietario. El registro se continúa en el panel de
  staging, Mi suscripción → Continuar registro.
- Las **12 comprobaciones publicadas de límites de pagos** pasaron: webhooks sin
  firma/con firma inválida rechazados, endpoint simulado ausente, rutas privadas
  protegidas y tarjeta oculta mientras el comercio no puede cobrar. Esto no
  acredita una compra de tienda con tarjeta exitosa.
- La base de Gaesland no contiene configuración fiscal (`CfdiConfig`: cero
  registros). Pasaron **13/13 pruebas del paquete fiscal**, incluidas diez del
  contrato Facturama, pero no se emitió ni canceló un CFDI externo. Se requiere
  una cuenta sandbox y su configuración de emisor/CSD; el procedimiento está
  descrito en el [SDK oficial de Facturama](https://github.com/Facturama/facturama-javascript-sdk).
- Brevo sigue configurado. El envío nuevo y la revisión de su evento de entrega
  esperan confirmar el destinatario: el historial contiene dos direcciones
  distintas. No se marca como entrega verificada. Los eventos se consultan con
  el [reporte oficial de Brevo](https://developers.brevo.com/reference/get-email-event-report).

### Verificación del despliegue de la corrección

La corrección `191034c6254f6aeddb1fca8f06f155221c63f554` se publicó solo en
staging y en la rama de trabajo. Railway completó el despliegue del panel
`787ea960-3898-4292-8fab-4fb7f53a812f` con estado SUCCESS. La misma regresión
se ejecutó después contra `https://web-superadmin-staging.up.railway.app` y
pasaron sus cuatro comprobaciones, incluida la revocación efectiva del refresh
al pulsar Salir. Build del panel, lint sin errores y typecheck 30/30 correctos
(lint conserva avisos de complejidad). No se desplegó producción.

Se retiraron el contenedor Nginx y el proxy locales usados en la prueba. La
limpieza de sesiones QA se limita al usuario de cobranza y al user-agent
exclusivo de esta auditoría; no cierra sesiones de otros usuarios o dispositivos.
Se revocaron cuatro sesiones QA remanentes y se eliminaron las copias
temporales de credenciales, claves y cookies. La configuración del autenticador
queda únicamente en el archivo privado del escritorio para que el propietario pueda importarla; no se cambió su contraseña.

## Cierre de sesión del comprador ante errores de red — 17 de octubre de 2026

La revisión posterior de los demás paneles encontró un fallo en la tienda web:
`LogoutBoton` no comprobaba el estado HTTP y navegaba al inicio incluso si
`/api/cuenta/logout` devolvía 503. Una desconexión dejaba una promesa rechazada
sin aviso ni reintento explícito. Esto podía dar impresión de haber salido sin
haber eliminado la cookie.

La tienda ahora confirma la respuesta antes de limpiar el borrador de compra
y navegar, limita la espera a 15 segundos, muestra un aviso reintentable ante
fallos y bloquea solicitudes duplicadas incluso con dos clics inmediatos.

La regresión de navegador `scripts/staging/check-storefront-logout.cjs` usa
`STOREFRONT_LOGOUT_ACCOUNT` (JSON privado con email/password), admite solamente
localhost o staging y bloquea escrituras de negocio. Contra el frontend local
y API staging, con la cuenta real de comprador entregada, pasaron cuatro casos:

- HTTP 503: sesión y borrador conservados, error visible y botón habilitado.
- Desconexión: mismo comportamiento seguro y posibilidad de reintentar.
- Espera agotada: termina a los 15 segundos y permite reintentar.
- Reintento exitoso con dos clics inmediatos: una sola solicitud, cookie y
  borrador eliminados, y `/api/cuenta/me` rechazado con 401.

No se crearon pedidos, direcciones, cuentas ni cobros. El cierre afecta solo a
la sesión del navegador de prueba; no cambia la contraseña del comprador.

La compilación de producción de web-tienda, lint de los dos archivos cambiados
y typecheck 30/30 terminaron correctamente. Un primer typecheck se ejecutó
mientras Next dev regeneraba `.next/types` y falló por archivos generados que
se estaban sustituyendo; tras detener el servidor local, el build completo y
el chequeo de tipos terminaron sin errores.

Desplegado en staging: fuente `1831356e659eb04cbc8cf235a549dd88fd805987`,
deployment de web-tienda `0c055021-2838-4330-9e87-78ec68be0f03`, estado SUCCESS.
Los mismos cuatro casos de navegador pasaron contra la tienda publicada después
del despliegue. Se detuvo el servidor local y se eliminó el JSON temporal con
las credenciales del comprador. Producción no se modificó.

## Acceso y recuperación de contraseña — 17 de octubre de 2026

La revisión posterior encontró dos fallos de confirmación y un bloqueo de
usabilidad en los formularios públicos de cuenta:

- Login/registro: si el API devolvía HTTP 200 sin `accessToken`, el intermediario
  devolvía un error con estado 200; el formulario lo interpretaba como ingreso
  correcto. Ahora se exige token no vacío e identidad válida antes de emitir
  cookie; una respuesta exitosa mal formada devuelve 502 y no crea cookie.
- Recuperación/restablecimiento: un HTTP 200 con cuerpo vacío o HTML se convertía
  en `{}` y el formulario mostraba éxito. Ahora el proxy y los formularios
  exigen el contrato `{mensaje: string}` no vacío antes de confirmar.
- Los formularios no tenían límite de espera y recuperación/restablecimiento
  no bloqueaban envíos repetidos. Ahora el servidor limita la solicitud al
  API a 10 segundos y el navegador a 15, permite reintentar, conserva los campos
  y bloquea envíos simultáneos mediante una referencia inmediata. Los campos
  se deshabilitan mientras se procesa el envío.

La regresión inicial reprodujo **13 fallos nuevos** con las otras 114 pruebas
en verde. Con el cambio, la suite final de la tienda pasó **127/127**. Las
pruebas de login comprueban el límite real del route handler: devuelve 502 y
no incluye `Set-Cookie` ante token/cuenta incompletos. Las de recuperación
comprueban HTML, JSON vacío/nulo, fallo de red, estado de error conservado y
resolución del tenant desde la tienda, sin aceptar el tenant del navegador.

La regresión `scripts/staging/check-storefront-auth-errors.cjs` no necesita
credenciales. Intercepta todos los POST de autenticación y bloquea las demás
escrituras. Pasaron **26 casos de navegador** contra el frontend local con
configuración staging: cuatro formularios (ingreso, registro, pedir enlace,
restablecer) por seis errores/condiciones (HTML 200, JSON vacío 200, HTTP 503,
desconexión, espera agotada, envío doble), más dos reintentos de recuperación
con respuesta válida simulada. En cada error se conservan los datos y el
formulario, se muestra aviso y se permite reintentar; se verificó ausencia de
desbordamiento en escritorio/móvil.

Además se comprobó ingreso y cierre reales del comprador entregado, verificando
identidad, cookie HttpOnly y rechazo del perfil después de salir. No se creó
ninguna cuenta, pedido, dirección o cobro; no se envió un correo ni se cambió
una contraseña real. Los éxitos simulados de recuperación no acreditan entrega
SMTP ni un canje de token de correo real. Esos límites externos siguen vigentes.

### Verificación publicada de acceso y recuperación

Build de web-tienda, lint sin errores y typecheck **30/30** correctos; lint
conserva avisos de complejidad. Se desplegó únicamente staging, fuente
`e228886dfb356593239d0a9a6e7a8f555ff74b66`, deployment de web-tienda
`eaa85020-7661-4d79-b893-380914e9fe95`, estado SUCCESS. Las **26 comprobaciones
de formularios** se repitieron contra la tienda publicada y pasaron. También
pasó el ingreso real del comprador entregado, consulta de identidad y cierre
con perfil privado rechazado después de salir. No se publicaron credenciales
ni tokens; el servidor local de pruebas fue detenido.

Alcance de esta ronda: web de staging. No se generó un nuevo APK ni se
certificó su comportamiento equivalente. La entrega de correo y el canje real
de recuperación siguen pendientes de probar con el buzón confirmado por el
propietario. Producción no se modificó.

## Aislamiento de borradores y referencias de checkout — 17 de octubre de 2026

Se reprodujeron dos fallos en el staging anterior usando exclusivamente datos
sintéticos en un navegador invitado: un borrador marcado como otra cuenta
rellenaba el checkout, y una referencia de pago global sin propietario se
mostraba sin verificar la identidad. No se accedió a datos de otro comprador.
Siete pruebas nuevas de borrador reprodujeron cuatro fallos antes del cambio.

El checkout ahora verifica su contexto antes de restaurar datos. El contexto
existente está ligado por HMAC a la cookie privada del navegador, la tienda y
el comprador validado por el servidor; no se acepta un identificador de cuenta
propuesto por el formulario. El endpoint de preparación añade el contexto del
invitado de esa misma tienda/navegador, sin devolver el secreto de la cookie.
Esto permite conservar el borrador al iniciar sesión durante una compra.

- Los borradores incluyen propietario; otra cuenta, otro contexto de invitado
  o una sesión sin verificar no pueden recuperarlos. No se guardan campos de
  un propietario bajo el contexto del siguiente al cambiar el contexto.
- Se conservan la caducidad de 30 minutos y los ceros iniciales del código
  postal. La adopción de invitado conserva la caducidad original al leer.
- Las referencias OXXO/SPEI se guardan por contexto y solo se muestran después
  de verificarlo. Borrar una referencia no borra las de otras cuentas.
- Si falla la preparación, se muestra un aviso con reintento antes de mostrar
  el formulario privado; la espera se limita a 15 segundos. No se borran datos
  simplemente por no haber podido verificar la sesión.
- Se limpian direcciones/tarjetas seleccionadas al cambiar el contexto y se
  cancelan las lecturas de la identidad anterior. Se conserva la protección
  existente que impide iniciar otro pago con un intento enviado pendiente.

Migración local: los borradores antiguos sin propietario se descartan porque
no se puede atribuir su dirección de forma segura. Las referencias antiguas
sin propietario no se muestran ni se borran automáticamente; el pedido puede
consultarse con la cuenta o con el intento original. No se adopta una referencia
de pago de invitado al ingresar a una cuenta diferente.

La suite final pasó **139/139 pruebas**, incluidas siete de borrador, cuatro de
referencias y la verificación adicional de los contextos públicos devueltos por
el endpoint. El contexto de invitado de otro negocio no coincide y el token
de cuenta no aparece en esa respuesta.

La regresión `scripts/staging/check-checkout-privacy.cjs` requiere el archivo
privado `STOREFRONT_PRIVACY_ACCOUNT` con email/password. Contra el frontend local
y el API staging pasaron **ocho escenarios de navegador**: recarga de borrador
invitado, conservación al ingresar, rechazo de borrador de otro propietario,
rechazo de borrador antiguo sin dueño, exclusión de referencias ajenas/antiguas,
recuperación de referencia propia, paso de cuenta a invitado y fallo/reintento
de verificación. Se usó una cuenta real entregada; los datos de otro propietario,
las líneas del carrito y las referencias fueron fixtures sintéticos locales.
Las escrituras de negocio del navegador se bloquearon. No se crearon cuentas,
pedidos, correos, direcciones o pagos ni se modificó el carrito del servidor.

### Verificación del checkout publicado

Build de web-tienda, lint sin errores y typecheck **30/30** correctos (se
conservan avisos de complejidad del checkout). Fuente desplegada únicamente
en staging: `0ce74edd319311de2f842cbd352c79b32390cbbd`, deployment web-tienda
`da507dce-a7e4-47fa-a74d-c37a652b524f`, estado SUCCESS. Los mismos **ocho
escenarios de privacidad** pasaron contra la tienda publicada después del
despliegue, con una cuenta real y fixtures locales de datos ajenos.

Se detuvo el servidor local y se eliminó la copia temporal de credenciales.
Los navegadores de prueba fueron cerrados. No se aplicaron migraciones de
base, no se generó un APK y no se modificó producción. Esta validación no
certifica entrega de correo ni cobro/facturación externos, todavía pendientes.

## Privacidad offline y apertura de notificaciones — 17 de octubre de 2026

Se reprodujo en staging que el service worker guardaba el HTML de inicio con
la identidad de la cuenta real de prueba. Después de quitar su cookie y perder
la conexión, una navegación a cuenta reutilizaba ese HTML. Solo se inspeccionaron
datos de la cuenta entregada, sin acceder a otros compradores. Se conservó un
perfil temporal con el worker anterior para verificar su actualización publicada.

Ahora se precarga únicamente `/offline.html`, estático y sin cookies. Las
navegaciones sin conexión reciben ese aviso público con estado 503 y reintento;
si se elimina la caché, existe un aviso mínimo de respaldo. Las API y escrituras
no se cachean ni se encolan. La activación elimina las cachés antiguas de la
tienda y conserva las de otros componentes. La página estática no requiere
resolver un negocio para poder instalar el nuevo worker.

También se corrigieron el icono de push (`/icono.svg`), la selección de pestaña
por URL exacta y la validación del destino: solo HTTP(S) del mismo origen sin
credenciales en la URL. El pedido `/123` ya no selecciona la pestaña `/1234`.

Validación previa al despliegue:

- Catorce pruebas del worker: diez reprodujeron fallos antes de corregirlo;
  las catorce pasan después. Suite total de web-tienda: **153/153**.
- Lint de los cuatro archivos JS/TS sin errores.
- Seis grupos de navegador local con API staging: limpieza de caché antigua,
  cuenta/checkout/seguimiento offline, API sin HTML sustituido, diseño a 320 y
  1280 px, caché eliminada y reconexión mediante el botón Reintentar. No reaparece
  la cuenta anterior. Capturas revisadas sin recortes ni desbordamiento; botón
  principal de al menos 44 px.
- Regresión reutilizable: `scripts/staging/check-storefront-offline.cjs`, con
  credenciales privadas en `STOREFRONT_OFFLINE_ACCOUNT`. El perfil opcional
  `OFFLINE_QA_PROFILE` permite comprobar la actualización de un worker antiguo.

Los eventos push se verificaron con mocks; esto no certifica entrega real de
notificaciones. No se enviaron correos ni notificaciones, ni se crearon pedidos,
pagos o direcciones. Estos cambios corresponden a la tienda web, no al APK.

### Verificación publicada de la actualización offline

Build de web-tienda correcto y typecheck **30/30**. Fuente staging
`0eb4c3939e5ebe6d79c1b1ac124774681b35dbec`, deployment web-tienda
`be1ad832-d79f-4bba-8183-1f7ecc25d802`, estado SUCCESS. Los **seis grupos de
navegador** pasaron también en la tienda publicada.

Antes de reconectar, el navegador persistente cargó realmente el worker anterior
y su caché con HTML autenticado. Al actualizar, se eliminó esa caché; quedó solo
el aviso estático sin cookies ni identidad y se conservó la caché ajena de prueba.
Después de retirar la cookie, cuenta, checkout y seguimiento devolvieron el aviso
offline; al reconectar con Reintentar se mostró Iniciar sesión y la API respondió
401. También pasó el respaldo con la caché eliminada.

Se cerró el navegador, se detuvo el servidor local y se eliminaron tanto la copia
temporal de credenciales como el perfil de navegador que contenía la caché
anterior. No se modificó producción, no hubo migración y no se generó APK.

## Recuperación de facturación y descarga privada — 17 de octubre de 2026

Se reprodujeron seis fallos del BFF con ocho pruebas de contrato: respuestas
vacías/HTML se aceptaban como emisión, fallos de red no se convertían en un
error seguro y faltaban límites del proveedor y cabeceras de caché privada.
En navegador, un error de red dejaba el formulario sin aviso y sin recuperarse.
El enlace PDF apuntaba a una ruta web inexistente (404 en staging antes del cambio).

- BFF de estado y emisión con validación explícita del contrato, errores seguros,
  caché `private, no-store`, escape del folio, sesión del comprador y límite de
  espera del proveedor (15 s lectura, 60 s emisión). No hay reenvío automático.
- Nueva ruta privada `/api/cuenta/pedidos/[folio]/factura/pdf`: exige sesión y
  conserva los controles de propiedad del API. Rechaza redirecciones, tipos de
  archivo distintos a PDF, cuerpos vacíos y firmas incorrectas. Preserva los
  bytes binarios y no copia cookies ni nombres de archivo del proveedor.
- El formulario conserva sus datos ante errores/401, limita la espera del envío
  a 65 s, impide envíos concurrentes desde la misma instancia y no afirma una
  emisión sin identificador/folio válidos. Ante resultado incierto requiere una
  consulta explícita antes de habilitar otro envío. Esto no sustituye la
  idempotencia fiscal del servidor ni certifica que un proveedor haya cancelado
  una solicitud al agotarse la espera.
- La disponibilidad del enlace PDF se obtiene al consultar el estado; ya no se
  inventa a partir de la respuesta de emisión. Una consulta vacía posterior no
  elimina una emisión que esta instancia ya confirmó.
- Se utiliza el diálogo accesible compartido, con Escape, foco contenido y
  retorno al botón de origen. Cierre mínimo 44 px, controles de facturación
  ampliados y campos fiscales apilados en pantallas pequeñas.

La suite final pasó **172/172** (19 pruebas nuevas de contrato/PDF). Ocho grupos
de navegador local pasaron con el componente real compilado, estilos reales y
respuestas fiscales sintéticas: red, timeout, 200 inválido, 401, envío repetido,
diálogo/foco, fallo inicial de consulta y disponibilidad del PDF. El timeout del
navegador se acorta únicamente en la prueba. Se revisaron anchos 320/1280 px,
sin desbordamiento horizontal, con envío alcanzable y de al menos 44 px.

Regresión local: `node scripts/staging/check-invoice-ui.cjs`. Para comprobar
también el diseño, generar CSS con Tailwind de web-tienda y pasar su ruta como
`INVOICE_QA_CSS`. El servidor de fixtures solo escucha en localhost. No se
hicieron solicitudes fiscales externas, pedidos, pagos ni envíos de correo.
La emisión/descarga de una factura real sigue pendiente de configurar el
proveedor fiscal y de disponer de un pedido pagado de prueba.

### Despliegue y control de acceso publicados de facturación

Build de web-tienda correcto, lint de los archivos nuevos/modificados de
facturación sin errores y typecheck **30/30**. Se conservan las advertencias
de complejidad preexistentes del detalle de pedido, donde solo se añadió la
clave del componente por folio para aislar su estado entre pedidos.

Fuente staging `0c738b83267ea4241cbeb692a21af89be7208caa`, deployment web-tienda
`e3e88ce3-4e5b-44d9-b727-2eb8ae3461b4`, estado SUCCESS. La regresión publicada
`scripts/staging/check-invoice-access.cjs` pasó con el comprador real entregado:

- Invitado: GET estado, POST factura y GET PDF responden 401 y caché privada
  deshabilitada. No se hizo POST fiscal con sesión.
- Cuenta real: perfil validado; consultar un folio inexistente devuelve `null`
  y su PDF devuelve JSON 404 con `private, no-store`, sin documento inventado.
- Un contexto separado sin cookies sigue recibiendo 401 al intentar el PDF.

Se cerraron los contextos de prueba y se eliminó la copia temporal de las
credenciales. Las ocho pruebas de interfaz son locales con respuestas
sintéticas; la comprobación publicada certifica estas rutas y su acceso, no
la emisión ni una descarga real de Facturama. No se modificó producción,
no se aplicaron migraciones y no se generó un APK.

## Coherencia del carrito entre pestañas y respuestas incompletas — 17 de octubre de 2026

Se reprodujeron cuatro fallos de contrato antes de corregir el proxy: un 200
con `null`, un objeto incompleto o una cantidad inválida se aceptaban como
carrito, y un 204 inesperado podía confirmar una selección no vacía. También
fallaron cuatro grupos de navegador local con los componentes reales. La prueba
contra el staging anterior confirmó que agregar en la ficha de producto no
actualizaba el contador de la otra pestaña.

- El proxy solo devuelve una instantánea con versión, cupón y líneas válidas,
  sin variantes repetidas ni precios/cantidades inválidos. Un GET 404 explícito
  sigue representando carrito inexistente; un 204 solo confirma vaciado cuando
  se solicitó con `items: []`. Los éxitos incompletos devuelven 502.
- El cliente valida también la identidad y la instantánea antes de reemplazar
  su selección o eliminar cambios pendientes. Ante fallos muestra un mensaje
  recuperable y conserva los artículos y su versión pendiente. Las protecciones
  existentes de versión/CAS, tienda y cuenta se conservan.
- Los cambios de localStorage del carrito activo notifican a todas las vistas:
  encabezado, carrito, ficha, tarjetas de producto y resumen flotante. También
  se contempla `localStorage.clear()`; se ignora sessionStorage y las claves de
  otros carritos. Esto complementa la sincronización de cuenta con el servidor;
  no sincroniza invitados entre dispositivos distintos.
- Se retira la confirmación con Deshacer al cambiar de cuenta/contexto o recibir
  una selección de otra pestaña, para no restar artículos de una compra distinta.

La suite final pasó **187/187** (15 pruebas nuevas). Los cuatro grupos locales
pasaron después de la corrección: cambios de invitado entre pestañas y vaciado,
cambio entre cuentas sintéticas, GET incompleto sin pérdida de selección y POST
incompleto conservando los cambios pendientes hasta un reintento correcto.
Estas pruebas usan API simulada y no escriben datos de negocio.

Regresiones: `scripts/staging/check-cart-consistency.cjs` (componentes reales y
cuentas sintéticas, solo localhost) y `scripts/staging/check-cart-tabs.cjs`
(tienda local o staging, dos pestañas de invitado y escrituras de API bloqueadas).
El segundo permite una lectura opcional del carrito de una cuenta entregada
mediante `STOREFRONT_CART_ACCOUNT`, archivo privado con email/password; nunca
modifica ese carrito ni envía checkout. No se generó APK en este lote.

### Verificación publicada de coherencia del carrito

Build de web-tienda y typecheck **30/30** correctos; lint sin errores, con
advertencias de complejidad en el proxy/sincronizador y el interceptor de QA.
Fuente staging `72fe55f9036024c30c829781dd287367aba3a6ef`, deployment web-tienda
`09b7f51d-efac-4892-be2f-a965e4c4fd8c`, estado SUCCESS.

La prueba `check-cart-tabs.cjs` pasó las tres operaciones contra el frontend
publicado: agregar en una ficha actualiza encabezado/carrito de otra pestaña;
aumentar desde el carrito actualiza la ficha e invalida Deshacer; quitar deja
ambas vistas vacías sin recarga. Fue un contexto invitado aislado, con escrituras
de API del navegador bloqueadas y selección únicamente local.

Además se repitió `check-storefront-cart-reload.cjs` con escrituras reales del
carrito en staging y una cuenta temporal de QA:

- Navegación rápida al checkout y recarga con POST de carrito bloqueado:
  se conserva el artículo pendiente.
- Al restablecer POST, se guarda correctamente el carrito y se retira su copia
  pendiente. Esto verifica también el contrato real de respuesta del API.
- Una modificación remota posterior gana sobre una edición local con versión
  antigua; la selección local queda disponible para combinar sin sobrescritura
  silenciosa. La vista móvil no tiene desbordamiento horizontal.

El script eliminó su propio carrito y comprador después de comprobar que no
tenían ventas ni pedidos, con guardas del proyecto, ambiente staging y tenant.
Los navegadores fueron cerrados. No se crearon pedidos, cobros ni correos;
no se utilizaron ni copiaron las credenciales de los usuarios entregados.
No hubo migraciones, despliegue de producción ni generación de APK.

## Recuperación de direcciones y búsquedas tardías — 17 de octubre de 2026

Se reprodujeron once fallos de contrato del BFF antes de corregirlo: listas o
respuestas incompletas se aceptaban como éxito, un DELETE 200 podía confirmar
un borrado sin evidencia y las excepciones de red escapaban sin respuesta segura.
También fallaron ocho escenarios de navegador contra el componente anterior.
Una búsqueda pendiente completaba el formulario de una dirección abierta
después de cerrar la original, o sobrescribía una corrección manual reciente.

- Cada consulta de mapa tiene un controlador y pertenece a una apertura del
  formulario. Se cancela al cerrar, reemplazar la consulta, guardar o desmontar.
  Los callbacks de geolocalización tardíos se descartan. Las correcciones hechas
  durante la búsqueda se conservan; los campos anteriores sin corrección se
  reemplazan, incluyendo vaciar un CP anterior si el nuevo mapa no lo informa,
  para evitar mezclar domicilios. Se validan coordenadas y respuesta del mapa.
- Lectura y escrituras del formulario tienen límite de 20 s; el BFF limita su
  llamada al proveedor/API a 15 s y desactiva caché privada. La lectura distingue
  fallo/carga de una lista realmente vacía y conserva las tarjetas anteriores.
- POST requiere ID confirmado, PUT `ok: true`, DELETE 204 y la lista debe tener
  filas completas sin IDs duplicados. Las respuestas inválidas devuelven 502;
  los fallos de red devuelven 503 sin detalles internos. El contrato de invitado
  para leer sigue siendo una lista vacía; mutar exige sesión verificada.
- Una referencia inmediata impide escrituras concurrentes. Los controles se
  bloquean al guardar/eliminar, y se conservan los campos o tarjeta si no se
  confirma la operación. No hay reenvío automático; un timeout no demuestra que
  el servidor haya cancelado la escritura, por lo que se pide revisar la lista.
- La pantalla de cuenta remonta este componente por ID de comprador al cambiar
  la cuenta renderizada y cancela sus consultas al desmontarlo. El cierre del
  diálogo se amplió a 44 px y se conserva el pie fijo de guardar.

Se corrigió además que desmarcar `isDefaultEnvio` se ignoraba en el API. Ahora
se conserva un `false` explícito, omitir el campo mantiene la preferencia, y al
marcar `true` solo se desmarcan otras direcciones del mismo comprador. La
comprobación de propiedad sigue siendo previa a la actualización.

Validación previa al despliegue:

- Web-tienda **209/209** pruebas; 22 nuevas de contratos de direcciones.
- API: **4/4** unitarias del servicio. Una fallaba con la implementación anterior.
  Configuración aislada `test/direcciones-unit.config.ts`, sin base de datos.
  El intento de usar el runner de integración no se pudo iniciar por falta de
  `DATABASE_URL_MASTER`; no se inyectaron credenciales de staging a ese runner.
- Doce grupos de navegador local con componente real y API/mapa sintéticos:
  respuesta de mapa tras reabrir, edición durante consulta, GPS tardío, éxito
  inválido, timeout de guardado, envío repetido, fallo inicial y reintento,
  timeout de borrado, CP ausente en mapa parcial, coordenadas inválidas, 401
  con campos conservados y alta/edición/borrado confirmados. Las esperas se
  acortan solo en el navegador de QA. No hay llamadas externas en estos grupos.

Regresión local `scripts/staging/check-address-recovery.cjs`. La regresión real
de staging `check-address-footer.cjs` añade selección de dirección en checkout
con envío de pedido bloqueado y persistencia de marcar/desmarcar predeterminada.
