# Validación de roles y recorridos de tienda — 16 de octubre de 2026

## Ambiente y límites

Se ejecutaron las escrituras de API, permisos, plataforma y POS en bases PostgreSQL
locales desechables con migraciones reales. Las llaves externas se excluyen de esos
procesos. Cada ejecución elimina su base, procesos y sesiones al terminar.

También se ejerció el storefront publicado de **Gaesland en staging** con compradores
QA y pedidos para pagar al recoger, sin cargos con tarjeta ni dinero real. No se
modificaron producción ni las credenciales/MFA de usuarios existentes.

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
