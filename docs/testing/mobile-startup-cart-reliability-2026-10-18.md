# Tienda móvil y kiosko: arranque, carrito y errores

## Alcance de esta revisión

Revisión de código y pruebas locales de `mobile-cliente` y `mobile-kiosko`:
restauración de tienda/cuenta, aislamiento por propietario, lectura y sincronización
del carrito, cantidades, checkout e idempotencia, errores de cuenta, navegación,
direcciones, favoritos, avisos, perfil, pedidos y recuperación del kiosko ante
fallos de permisos/conexión/configuración. No equivale a una prueba física de cada
pantalla ni a una validación de pagos reales.

## Hallazgos corregidos

1. **Carga inicial sin salida si fallaba SecureStore al recuperar la tienda.**
   La lectura se ejecutaba antes de `restore` y sin capturar el rechazo. El estado
   de autenticación permanecía en `loading`. Ahora la lectura forma parte de la
   restauración protegida: distingue una lectura fallida de una sesión ausente,
   conserva las credenciales y muestra un mensaje con `Reintentar` en el arranque.
   La regresión simula rechazo de almacenamiento y recuperación posterior.
2. **Existencias verificadas con un carrito anterior al último toque.** La ficha
   y el catálogo podían aceptar dos adiciones consecutivas antes del siguiente
   render, excediendo el stock publicado. Ahora ambas acciones releen el carrito
   vivo antes de modificarlo y rechazan acciones de otro propietario. El cálculo
   también respeta el máximo acumulado de 100000 aunque el stock sea privado.
   Hay regresiones para adiciones consecutivas, cuenta anterior y límites.
3. **Enlace de producto malformado con carga permanente.** Un parámetro `slug`
   repetido podía convertirse en un arreglo: deshabilitaba la consulta pero
   mostraba `Loading`. Ahora se muestra la invitación a seleccionar un artículo.
4. **Importes inválidos presentados como gratis o truncados.** `parseFloat`
   aceptaba prefijos como `100oops`; otros valores se convertían en cero. Las dos
   apps muestran `Precio no disponible` para valores inválidos, nulos o no
   finitos. Los ceros reales y ajustes negativos siguen formateándose. Diez
   casos por app cubren esta regla.
5. **Cuenta y login sin límite de espera de red.** Carrito y checkout tenían
   plazo, pero algunas pantallas de cuenta y autenticación no. El transporte del
   cliente aplica un plazo de 12 segundos, conserva cancelaciones del llamador y
   retira el temporizador/listener al terminar. Fallar por conexión no cierra la
   sesión. Tres regresiones verifican login, cuenta y cancelación explícita.

## Validación

- `pnpm --filter @gaespos/mobile-cliente test`: **119/119**, 14 archivos.
- `pnpm --filter @gaespos/mobile-kiosko test`: **39/39**, 6 archivos.
- Typecheck local de ambas apps: **aprobado**.
- Export Metro Android de ambas apps: **aprobado**; salida local ignorada por Git
  en `apps/mobile-cliente/dist/audit-20261018` y
  `apps/mobile-kiosko/dist/audit-20261018`.
- Biome en archivos modificados: sin errores; advierte complejidad en funciones
  de pantalla/autenticación existentes.

## Límites y comprobaciones de dispositivo

No se enviaron pedidos, cobros, correos ni cambios de carritos de clientes reales.
No se creó un APK ni se publicó una actualización móvil en esta revisión. Los
rechazos de almacenamiento y red se inyectaron en pruebas; el error original de
la pantalla del usuario no se reprodujo en su teléfono. Deben comprobarse en un
APK actualizado: arranque con almacenamiento bloqueado/reintento, fuentes y
gestos, huella/Face ID, permisos de ubicación/cámara, lector físico, beep/vibración
y retorno de la pasarela en Android. Un bundle Metro válido no certifica esos
comportamientos físicos.

## Cierre de compilación: fuentes y Metro

La revisión posterior de Expo Doctor detectó que `@expo/vector-icons` requería
`expo-font` como dependencia directa. Se añadió `~13.3.2` a `mobile-cliente`,
`mobile-kiosko` y `mobile-negocio`, según `expo/bundledNativeModules.json` de
Expo SDK 53 instalado. Que el asset TTF aparezca en un bundle no garantiza por sí
solo que el módulo nativo esté enlazado en un APK anterior.
La inspección posterior del APK cliente baseline v14 sí encontró el asset
`Ionicons.ttf` con SHA coincidente y `FontLoaderModule` en Dex. Por tanto, la
dependencia directa corrige el contrato de instalación y Doctor; no demuestra
que a ese APK baseline le faltaran la fuente o el módulo nativo.

Los tres `metro.config.js` ahora conservan íntegro `getDefaultConfig(__dirname)`.
Se retiraron los reemplazos manuales de `watchFolders`, `nodeModulesPaths` y
`disableHierarchicalLookup`, conforme a la [configuración automática de monorepos
de Expo SDK 52+](https://docs.expo.dev/guides/monorepos/). Los defaults detectan el workspace pnpm y sus módulos; no se
modificó el modo de instalación compartido del repositorio.

Se ejecutó realmente `expo export --platform android --clear --max-workers 2`
para las tres apps después de instalar las fuentes: **los tres exports aprobaron**.
Cliente y kiosko apuntaron a la API de staging; cliente también fijó Gaesland.
Las tres salidas `dist/native-defaults-final` incluyen `Ionicons.ttf`.

Registros locales:

- `/tmp/gaes-metro-defaults-cliente.log`
- `/tmp/gaes-metro-defaults-kiosko.log`
- `/tmp/gaes-metro-defaults-negocio.log`

### Expo Doctor: resultado pendiente explícito

Se repitió Doctor en las tres apps con **Node 24.22.0** en `PATH`, sin opciones
para omitir verificaciones ni `expo.install.exclude`. Resultado: **17/18** en
cada app, con código de salida 1. Ya no señala fuentes faltantes ni configuración
incorrecta de Metro. El único chequeo pendiente es compatibilidad de tooling:

| App | Instalado | Recomendado por Expo SDK 53 |
| --- | --- | --- |
| Cliente y kiosko | `@types/react 19.2.15`, TypeScript `5.9.3` | `~19.0.10`, `~5.8.3` |
| Negocio | `@types/react 19.2.15` | `~19.0.10` |

No se bajaron los tipos ni TypeScript compartidos para silenciar el chequeo.
Los exports aprobados son evidencia de compilación; no convierten ese 17/18 en
un resultado sin advertencias ni certifican comportamiento físico. Los registros
son `/tmp/gaes-doctor-node24-{cliente,kiosko,negocio}.log`.

## Permisos del APK de kiosko

Se descargó e inspeccionó el **APK staging versión 2** ya compilado. Package
`com.gaessoft.kiosko.staging`, firma APK v2 válida y sin marca `debuggable`.
SHA-256: `750ae5e0f5baad4c9b8e3c2071a3f8ee6f5695ad0de35e3b57a52f18ff5b3a07`.
Ese APK contiene cuatro permisos innecesarios: `READ_EXTERNAL_STORAGE`,
`WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` y `RECORD_AUDIO`.

La fuente de `mobile-kiosko/app.config.ts` ahora bloquea esos cuatro permisos y
desactiva `microphonePermission` en audio/cámara y `recordAudioAndroid` en cámara.
El verificador reproduce beep y videos; no graba audio ni necesita superponer
ventanas o leer archivos personales. Se preservan `CAMERA`, `VIBRATE`,
`MODIFY_AUDIO_SETTINGS`, red y las capacidades de reproducción existentes.

La introspección real de Expo confirma los cuatro `tools:node="remove"` en el
manifest generado y conserva cámara/audio/vibración/red. No genera descripción
de uso de micrófono en iOS. El typecheck de kiosko aprobó después del cambio.
Esto todavía no verifica el resultado del merge de manifests del nuevo APK.

Checker reutilizable:

```bash
ANDROID_HOME=/ruta/al/Android/Sdk node scripts/testing/check-kiosko-apk.cjs /ruta/al/kiosko.apk
```

Comprueba package, firma, ausencia de modo debug, permisos requeridos y los cuatro
permisos prohibidos. **Falló correctamente contra el APK v2 anterior** por esos
cuatro permisos; no faltaban permisos requeridos. Debe aprobar contra el APK
reconstruido. Evidencia local:
`/tmp/gaes-kiosko-staging-v2-permission-review.log` y
`/tmp/gaes-kiosko-permissions-introspect-node24.json`.

Los APK anteriores no incorporan estos cambios automáticamente. Queda pendiente
generar los APK finales desde la fuente congelada, ejecutar el checker sobre el
kiosko nuevo y probar instalación, iconos, cámara, audio y vibración en dispositivo.

## Intento autónomo de emulador desechable

Se intentó arrancar una imagen SDK Android 36.1 x86_64 ya instalada en un AVD
nuevo de `/tmp`, con userdata ext4 vacía de 512 MiB, 2 CPU, 2048 MiB de RAM,
`-accel off`, `-no-window`, `-gpu swiftshader_indirect` y sin snapshots/cache.
Se aislaron las rutas Android/AVD y el servidor ADB en el puerto 5038. No se
leyó ni inició ningún AVD personal; no hubo cuenta Google, instalación de APK,
pedidos ni pagos.

El proceso QEMU se mantuvo activo, pero ADB permaneció `offline` y no se obtuvo
`sys.boot_completed=1` durante el plazo máximo de **300 segundos**. El chequeo
de aceleración indicaba `/dev/kvm` ausente; TCG también informó AVX/F16C no
soportados. Esto documenta el bloqueo del entorno observado, sin atribuirlo a
un fallo de la app ni afirmar que esos mensajes prueben por sí solos la causa.

El watchdog terminó el proceso al vencer el plazo, cerró solamente el servidor
ADB de pruebas y eliminó el directorio desechable. Duración total con limpieza:
303 segundos; quedaron 7.21 GiB libres. No se realizaron más intentos, descargas
SDK o cambios de virtualización. Evidencia local:

- `/tmp/gaes-native-avd-probe-result.json`
- `/tmp/gaes-native-avd-probe.log`

La validación visual nativa sigue pendiente de un dispositivo o un entorno de
emulación que complete el arranque. Este intento no constituye una prueba de
ejecución del APK.

## Entrega final Android y alcance comprobado

Los APK finales disponibles son **cliente v15** y **kiosco v4**, publicados en
[la prerelease de pruebas](https://github.com/Gaes-Solutions/verticals/releases/tag/qa-android-gaesland-20261018-b12b7da).
No se recomienda usar las instantáneas anteriores v12/v2 para comprobar esta ronda.
Los dos binarios apuntan a staging y tienen applicationId separado de producción.

La ejecución Android 39204599746 aprobó tres JUnit con un testcase por flujo,
cero fallos/errores/skipped: invitado (catálogo, galería, login/recuperación),
cuenta sintética (registro, carrito persistido, checkout sin generar pago,
alta/edición/CP 06060, logout/login y eliminación de dirección) y setup de kiosco
sin token/activación. Su step Android fue success; la publicación posterior falló.
La cuenta exacta de staging y su carrito se eliminaron con guardas; cero pedidos.

La corrida 39205813365 terminó **success**: verificó la identidad de la ejecución
previa, sus ocho pasos aprobados y el mismo manifiesto de binarios, sin repetir
Android. Inspeccionó de nuevo los APK y publicó solo después de cargar, descargar
y verificar los cuatro assets. La API pública confirmó prerelease publicada,
ambos digests y tamaños, y el tag fuente `b12b7dab48c5a3e5fa78ef450f4c5ad1c9e62447`.
El transporte Git temporal de APK se eliminó después; el tag apunta al código.

- [Cliente v15](https://github.com/Gaes-Solutions/verticals/releases/download/qa-android-gaesland-20261018-b12b7da/gaesland-pruebas-cliente-v15.apk): 85,516,422 bytes; SHA256 `84335d136755b2d40b7dd590eb5ddd7af3aa6b16525cbd5fb9837677ab2dad2d`.
- [Kiosco v4](https://github.com/Gaes-Solutions/verticals/releases/download/qa-android-gaesland-20261018-b12b7da/gaesland-pruebas-kiosko-v4.apk): 96,056,403 bytes; SHA256 `25c8aad70c6502aa054f80ce416a645514eeed7581fa9ddcd97e255b30fad37a`.

Esto prueba ejecución nativa en emulador para esos flujos. No certifica cámara
física, sonido audible, vibración, biometría ni pago con proveedor real. El ensayo
local sin KVM que falló al arrancar permanece documentado y no se cuenta como
prueba aprobada. El primer fallo de publicación no tiene causa demostrada:
los logs remotos fueron inaccesibles para la credencial local. Se añadió
`publication.json` acotado (operación/status, sin stderr privado), se verificó el
reintento y no se inventó una causa.

## Cliente 16: filtros probados, publicación no confirmada

La corrida Android **39208697447**, QA `fc40c8a6d64d`, aprobó los tres JUnit:
invitado con filtros/aplicar/cancelar/limpiar, cuenta con carrito/dirección y
setup del kiosco. Cada archivo contiene un testcase, cero fallos, cero errores
y cero skipped. El job terminó rojo exclusivamente en publicación. Su diagnóstico
registró un fallo de verificación/preparación sin detalle suficiente; no se
atribuye a firma, GitHub ni proveedor sin evidencia adicional. La cuenta exacta
sintética se eliminó: cero pedidos, carrito restante de cantidad dos, sin
direcciones y `deleted: true`.

El chequeo de configuración del runner recibió únicamente booleanos, nunca
credenciales: `enabled=false`, `auto_merge=false`, claves Kimi/OpenAI/Brevo
ausentes, clave Resend presente y remitente configurado. Esto confirma que no
hay una ejecución autónoma activa lista para usar ambos modelos en GitHub.
La presencia de una clave tampoco demuestra por sí misma que sea válida o que
un correo haya sido enviado.

## Cliente 17: recuperación de catálogo cambiante

Una revisión adicional encontró el pie de paginación oculto cuando disminuye el
catálogo y deja inválida la página actual. `4798c6a` lo corrige con regreso
explícito a la primera página preservando búsqueda y filtros. Conserva visible
la categoría seleccionada que desaparece, distinguiendo respuesta correcta de
fallo de red. Suite cliente **153/153**, tipos globales **30/30**.

Se construyó el APK 17 y pasó el chequeo estático con firma compatible con 16,
cuatro arquitecturas, permisos mínimos comprobados, font/module y API de staging.
Los 92 archivos de runtime se compararon byte a byte con el archivo del build.
SHA-256: `1e0054c85731d64b12f7854e838fa3c53bfbdbf8abf1607e6cc4ef91a0a67557`.
La carpeta temporal de compilación se eliminó después de verificar el APK y su
procedencia. Su prueba Android y publicación siguen pendientes de su corrida
específica; no se atribuye el smoke de 16 a este binario.

### Cliente 17 confirmado: versión recomendada de pruebas

La corrida **39210310553** terminó `success` sobre QA `1fbc52a66dbf`.
Se leyeron los tres JUnit publicados en la rama QA separada: cada flujo tiene un
testcase, cero fallos, errores y skipped. Esta corrida ejecutó el emulador; no
reutilizó una prueba de otro APK. El publisher descargó y verificó los cuatro
assets antes de promover la release. La API pública confirmó el tag en
`4798c6a17a7ec7d17ddf824acc1e6b29f05e8234`, release visible/prerelease y digests
exactos de ambos APK.

- Cliente 17: https://github.com/Gaes-Solutions/verticals/releases/download/qa-android-gaesland-20261019-4798c6a/gaesland-pruebas-cliente-v17.apk
- Kiosco 4: https://github.com/Gaes-Solutions/verticals/releases/download/qa-android-gaesland-20261019-4798c6a/gaesland-pruebas-kiosko-v4.apk
- Notas y sumas: https://github.com/Gaes-Solutions/verticals/releases/tag/qa-android-gaesland-20261019-4798c6a

Los clientes 15/16 son evidencia histórica, no la recomendación actual. La
publicación correcta del 17 no demuestra por sí sola la causa del fallo anterior
del 16. Los diagnósticos de verificación ahora tienen códigos seguros y se
permiten lecturas acotadas tras crear/subir/promover; no se reiteran mutaciones
ni se aceptan conflictos de identidad, tag o integridad. Publisher: **20/20**
pruebas aisladas. Los límites físicos y de proveedores descritos arriba siguen
vigentes.

La limpieza final de 39210310553 eliminó únicamente su cuenta sintética:
cero pedidos, carrito restante de cantidad dos y cero direcciones. Tras verificar
la release 17 se eliminaron las dos ramas temporales de transporte de APK 16/17,
comprobando antes sus SHA exactos. Las descargas públicas verificadas se conservan.
