# Dependencias: auditoría y correcciones del 18-oct-2026

## Resultado y alcance

`pnpm audit --prod --json` pasó de **95 avisos únicos (64 altos y uno crítico)** a
**7 avisos (cinco altos y dos moderados), sin críticos ni bajos**. Son avisos
únicos del árbol de dependencias, no 95 fallos demostrados en flujos de la aplicación.
El resumen de pnpm contaba 66 incidencias altas al incluir versiones/rutas repetidas.
No se ocultaron avisos ni se agregaron excepciones de auditoría.

El lockfile y los paquetes se instalaron con Node 24.22.0 y pnpm 10.33.2.
No hubo saltos mayores de Expo, React Native ni Next. La política HTML usa
`sanitize-html` 2.18.1; `web-tienda` declara Node >=22.12.0 por ese paquete.

## Correcciones

- API: Fastify **5.12.7**, con correcciones de autenticación/validación y parches
  compatibles de `fast-jwt`, `fast-uri` y su árbol de validación.
- Telemetría: migración revisada a **Sentry 10.76.2**, sin mezclar versiones mayores
  de OpenTelemetry por overrides. La instalación eliminó los siete avisos de
  OpenTelemetry core/instrumentaciones anteriores de Sentry 8.
- Tienda y POS: Next **15.5.28**. `sharp` **0.35.5** se fija únicamente bajo Next 15;
  se revisaron los cambios de 0.35 y el uso real del optimizador. No usa las APIs
  retiradas; sí cambian las métricas de calidad AVIF. El mínimo Node de sharp se cumple.
- Administrador: SheetJS CE **0.20.3**, desde el
  [tarball oficial](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz), siguiendo la
  [distribución documentada por SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
  El registro npm continúa en 0.18.5 vulnerable; no bastaba cambiar su rango npm.
- Parches por rama, conservando interfaces: `shell-quote`, `postcss`, `form-data`,
  `js-yaml` 3/4, `brace-expansion` 1/2, `nanoid` 3, `browserslist`,
  `baseline-browser-mapping`, `source-map-js`, `compression`, `ajv` 8, `undici` 6,
  `@xmldom/xmldom` 0.8/0.9. UUID 11.1.1 se limita a `xcode`, cuyo consumidor usa `v4()`.
- Móviles: dependencia directa `expo-font` **~13.3.2** en las tres aplicaciones,
  según `bundledNativeModules.json` de Expo 53; faltaba el peer usado por los iconos.
  Los archivos Metro adoptan `getDefaultConfig` de Expo para conservar el soporte
  de monorepo, sin sobrescribir su resolución de módulos.
- Android: backport del decodificador lineal oficial de `decode-uri-component` 0.5
  a **0.2.2 mediante parche pnpm**. Conserva exportación CommonJS callable y la
  conversión histórica `+` a espacio. Un override directo a 0.5 rompería el consumidor
  CommonJS `query-string` 7.1.3. Procedencia e integridad upstream en
  `patches/decode-uri-component-source.json`.

- Herramientas Android: backport de límites de parsers de `image-size` 2.0.3 a
  **1.2.1 mediante parche pnpm**, preservando CommonJS callable y entradas de
  filename/buffer de Metro. El original se bloqueó con ICNS de 24 bytes y JXL de
  32 bytes incluso disfrazados de PNG; filtrar por extensión o tamaño no bastaba.
  Procedencia en `patches/image-size-source.json`. Los Dockerfiles copian
  `patches/` antes de instalar con el lockfile congelado.

Referencias de compatibilidad:
[Fastify 5.12.7](https://github.com/fastify/fastify/releases/tag/v5.12.7),
[Next 15.5.28](https://github.com/vercel/next.js/releases/tag/v15.5.28),
[sharp 0.35](https://sharp.pixelplumbing.com/changelog/v0.35.0/),
[sharp 0.35.5](https://sharp.pixelplumbing.com/changelog/v0.35.5/).

- Telemetría: filtros finales `beforeSendSpan`, `beforeSendTransaction` y `beforeSend`
  eliminan `db.user`, `db.username` y `db.user.name` de spans, etiquetas y contexto
  raíz antes de enviar a Sentry. Mantienen los demás diagnósticos y no mutan la entrada.
  Es una mitigación del atributo de identidad de la base, no una limpieza general de PII.

## Validación dirigida

- `node scripts/testing/check-dependency-runtime.cjs`: 11 casos. Importación y
  exportación XLSX, XLS clásico y CSV, con acentos, precios y cantidades fraccionarias;
  optimizador **real de Next** con PNG/JPEG/WebP/AVIF para tienda y POS, comprobando
  formato y dimensiones. Datos e imágenes completamente sintéticos.
- `node scripts/testing/check-mobile-uri-decode.cjs`: cadena instalada de
  Expo Router → React Navigation → query-string → decoder. 14 cadenas, cinco tipos
  inválidos y cuatro escenarios de consultas/deep links. Cuatro entradas adversariales
  de 60–65 KB se ejecutan en procesos con timeout; completaron en 2–12 ms en esta máquina.
  El decoder original excedió 1,5 segundos con la entrada `%FE` repetida y fue detenido.
- `node scripts/testing/check-mobile-image-size.cjs`: el paquete instalado conserva
  función CommonJS y acepta filename/buffer. Dos fixtures maliciosos se rechazan
  por parser y Metro en procesos con timeout; PNG real, SVG, ICNS y HEIF válidos
  conservan dimensiones, y Metro genera correctamente el asset PNG.
- `sentry-privacy-unit.config.ts`: cinco pruebas sin DB ni transporte real verifican
  padre/hijos, eventos de error, payloads vacíos, inmutabilidad y conexión de los tres
  hooks al SDK simulado. Se agregaron después de iniciar los shards integrales API;
  sin DSN, la inicialización permanece sin efectos.
- `node scripts/testing/check-sentry-runtime.cjs`: SDK **real** 10.76.2 y fuentes
  reales de inicialización/privacidad, con transporte exclusivamente en memoria.
  Ambos órdenes de importación Fastify antes/después de init produjeron cada uno
  dos eventos y dos transacciones, con privacidad correcta y cero intentos de red.
- Instalación Docker filtrada de tienda con lockfile congelado: aprobada offline
  en una copia temporal que solo contenía manifests y `patches/`, sin scripts de ciclo
  de vida. No modificó el árbol instalado del workspace.
- Typecheck final del monorepo con Node 24, fonts, Sentry 10, proxy explícito y
  loader definitivo: **30/30 tareas aprobadas**.
- Builds de tienda (incluido el loader neutral), POS y administrador: aprobados.
  Administrador: 70 pruebas aprobadas tras actualizar SheetJS.
- Este resultado no significa que exista un APK nuevo. Cambiaron dependencias runtime
  Android (`nanoid` y decoder), por lo que hay que reconstruir el APK y validar enlaces
  en dispositivo antes de distribuirlo.

## Avisos pendientes, sin excepciones ni ocultamiento

| Paquete | Avisos | Dónde se usa / límite del arreglo |
|---|---:|---|
| `decode-uri-component` 0.2.2 | 1 moderado | Runtime Android. El código vulnerable está sustituido por el backport lineal probado, pero la auditoría por versión conserva el aviso. No se declara como eliminado del registro. |
| `deepmerge-ts` 7.1.5 | 1 alto | Configuración del CLI Prisma 6, también utilizado durante provisión/migraciones. Prisma 6 fija 7.1.5 y el parche publicado es 8.x. No se demostró entrada de gráficos cíclicos desde el comprador; no se declara inocuo ni resuelto. |
| `image-size` 1.2.1 | 2 altos | Metro, herramienta de compilación/servidor de desarrollo; no el runtime del APK. Los parsers vulnerables están corregidos por backport pnpm y probados con Metro real, pero la auditoría por versión mantiene los dos avisos. No se fuerza 2.0.3 porque rompe su API de export/filename. |
| `node-forge` 1.4.0 | 1 alto | CLI de Expo/certificados; sin parche publicado en el registro al auditar. No se expone como API de compra. |
| `braces` 3.0.3 | 1 alto | Glob del toolchain Metro; sin parche publicado en su rama al auditar. |
| `sprintf-js` 1.0.3 | 1 moderado | Cosmiconfig/js-yaml/argparse del toolchain Metro; sin parche publicado en el registro al auditar. |

Los paquetes de herramientas figuran en `audit --prod` porque Expo/Metro/Prisma están
bajo dependencias de producción de sus workspaces; eso no los convierte automáticamente
en código del navegador o del APK. Aun así permanecen en el inventario y requieren seguimiento.
Las pruebas de compilación/API de la entrega deben corresponder al lockfile final;
una ejecución iniciada antes de las actualizaciones no sirve como evidencia homogénea.

## Investigación previa del aviso de baggage (Sentry 8)

Esta investigación se hizo antes de migrar a Sentry 10.76.2. La migración eliminó
el aviso del árbol instalado; se conserva la evidencia para explicar la decisión
de no añadir un hook Fastify tardío ni mezclar SDKs incompatibles.

El [aviso oficial OTel](https://github.com/advisories/GHSA-8988-4f7v-96qf) identifica
asignación adicional proporcional a cabeceras entrantes sin límites propios del propagador;
explica que el límite HTTP predeterminado de Node reduce el vector externo. En esta API no
se configura HTTP/2 ni se eleva el límite desde código. No se consultaron variables de producción.

Una comprobación sintética local con Node 24 y Fastify aceptó 8 KB de baggage y rechazó
20 KB con HTTP 431 antes del handler (límite total de cabeceras: 16.384 bytes). Además,
el propagador registrado por Sentry 8 sobrescribe `extract` y no llama al extractor
W3C señalado: un espía que lanzaría un error si se invocara confirmó esa ruta local.
Esto documenta alcanzabilidad y mitigación del transporte; **no parchea el paquete**
ni cubre transportes no HTTP o despliegues que eleven el límite mediante opciones externas.
No se añadió un hook Fastify tardío que aparentara proteger una instrumentación anterior.

## Proxy e identidad de cliente tras actualizar Fastify

Fastify 5.12.7 hace fallar de forma cerrada `trustProxy` numérico: no autentica
al peer por contar saltos y por ello ignora los encabezados reenviados. Se
comprobó contra el paquete instalado: cinco `X-Forwarded-For` distintos desde
el mismo socket compartieron presupuesto y la cuarta petición devolvió 429.
No se habilitó `trustProxy: true` para hacer pasar las pruebas. La configuración
acepta ahora `TRUST_PROXY_PEERS` con IPs/CIDRs explícitos; vacío ignora headers
reenviados. El campo histórico numérico ya no se usa para acreditar al peer.
Las pruebas cubren un proxy loopback autorizado y rechazan rotación desde un
peer externo a ese rango.

La prueba de recuperación de contraseña usaba encabezados falsificados para
simular cinco clientes; ahora simula conexiones distintas con `remoteAddress`
y exige 200 antes de buscar cada correo. Conserva la validación de invalidación
del enlace anterior. Una prueba de integración adicional verifica que los
encabezados falsificados no permiten rotar el límite y otro peer sí tiene
presupuesto independiente.

**Límite operativo pendiente antes de producción:** el valor histórico
`TRUST_PROXY_HOPS=1` ya no significa que cada comprador tras Railway tenga una
IP diferenciada: los visitantes anónimos del mismo peer pueden compartir el
límite. Hay que establecer un contrato de ingress verificado antes de habilitar
confianza en headers. Railway documenta `X-Real-IP` en su edge público, pero su
red privada omite ese saneado y no publica un CIDR estable de proxies. No se
adivinan CIDRs ni se trata un header como autenticación. Las identidades JWT
verificadas de comprador/tienda mantienen sus presupuestos separados.

Fuentes: [corrección oficial de Fastify](https://github.com/fastify/fastify/security/advisories/GHSA-3m5p-2c4r-xxw2),
[especificaciones de Railway](https://docs.railway.com/networking/public-networking/specs-and-limits),
[aclaración de soporte de Railway sobre la frontera pública/privada](https://station.railway.com/questions/need-authoritative-client-ip-proxy-tru-090eac86).


## Empaquetado de la API sin parches móviles fuera de su grafo

Railway reveló `ERR_PNPM_UNUSED_PATCH` en el último `pnpm deploy --legacy`:
los parches de Metro/decoder viven en otros workspaces y no están en el bundle
API. El Dockerfile permite entradas sin consumidor **solo en ese comando de
pruning**, con `--config.allow-unused-patches=true`. No se habilitó globalmente,
no se ignoran fallos al aplicar un parche y no se cambiaron versiones por ello.

La misma invocación pnpm 10.33.2 terminó correctamente en `/tmp`; el paquete
resultante era `@gaespos/api`. Su grafo de módulos compilados cargó con tsx desde
ese directorio y sin aliases hacia el workspace, usando URLs de DB bloqueadas
en localhost:1 y sin claves de proveedores. No se ejecutó servidor ni consulta.
Referencia: [configuración oficial de pnpm](https://pnpm.io/cli/patch#allowunusedpatches).
