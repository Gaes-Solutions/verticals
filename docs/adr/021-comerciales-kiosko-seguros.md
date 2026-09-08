# ADR 021 — Comerciales propios del kiosco con publicación y medios validados

Fecha: 2026-09-08. Estado: propuesta; no implementada. Alcance: imágenes y videos del cliente durante reposo, conservando prioridad del verificador de precios.

## Evidencia del repositorio

- `apps/api/src/modules/tenant/kiosko/service.ts`, `contenidoIdle`: devuelve hasta diez promociones públicas vigentes y diez productos publicados; no existe entidad de comercial, playlist o video. Las fotos son cadenas de URL existentes.
- `apps/api/src/modules/tenant/kiosko/routes.ts`: `/kiosko/idle` autentica dispositivo y deriva tenant/sucursal desde token. Este mecanismo debe reutilizarse; el dispositivo no debe seleccionar otra sucursal en query/body.
- `packages/db/prisma/tenant/schema.prisma`, `KioskoConfig`: sólo controla tiempos, reposo, texto, colores e idioma. `KioskoDevice` ya vincula sucursal y revocación.
- `apps/mobile-kiosko/app/verificador.tsx`, `Reposo`: carrusel con `Image` e intervalo. No reproduce videos ni administra descargas de comerciales.
- `apps/mobile-kiosko/package.json`: Expo SDK53; no dependencia de reproducción de video ni descarga persistente dedicada.
- Búsqueda en código/configuración de API y paquetes no encontró adapter de object storage, carga multipart, firma de cargas ni procesamiento multimedia. El endpoint `cfdis-recibidos/upload` recibe XML como texto JSON; no constituye una plataforma de carga multimedia.
- `docker-compose.yml` declara Postgres/Redis. El stack productivo de referencia no demuestra un servicio de carga de medios conectado. ADR006 decide Backblaze B2 compatible con S3 y Cloudflare; es una decisión arquitectónica previa, **no evidencia de bucket, credenciales o CDN operativos**. No se inspeccionaron cuentas de infraestructura externas.

## Decisión propuesta

Implementar un módulo de medios reutilizable con adapter de almacenamiento compatible con S3, respetando ADR006. Primera implementación con fake local sólo para pruebas y adapter real configurable; no contratar ni provisionar servicios desde esta tarea. No guardar binarios/base64 en Postgres ni aceptar enlaces arbitrarios pegados por un administrador como sustituto de validación.

Separar archivo validado, anuncio y publicación. El cliente sube su archivo; la aplicación valida y genera una representación inmutable que se puede publicar. Editar una campaña no modifica bytes ya distribuidos.

### Modelo propuesto en schema de cada tenant

| Entidad | Datos y reglas principales |
| --- | --- |
| `MediaAsset` | id, tipo image/video, estado uploading/validating/ready/rejected/archived, clave de objeto generada por servidor, MIME verificado, bytes, SHA256, ancho/alto, duración verificada, codec, poster, errorCode controlado, creadoPor y timestamps. No URL arbitraria. |
| `KioskoAnuncio` | id, assetId, título interno, texto alternativo, duración de imagen, borrador, timestamps. FK dentro del tenant. No HTML ni scripts. |
| `KioskoPublicacion` | id, revision, estado draft/published/withdrawn, inicio UTC inclusive, fin UTC exclusive obligatorio, prioridad/orden, anuncioId. Publicar incrementa revisión con compare-and-swap; conflicto devuelve409. |
| `KioskoPublicacionSucursal` | publicación+sucursal únicas. Lista explícita y no vacía de sucursales activas al publicar; nuevas sucursales no heredan campañas accidentalmente. |
| `MediaUploadSession` | assetId, clave objeto staging exclusiva, dueño, límite bytes, expiración, estado, reserva cuota. Claim/finalización idempotentes; no confiar en metadata enviada al finalizar. |

Todas las claves de almacenamiento incluyen identificador estable de tenant resuelto por backend más UUID de asset/revisión. No usar nombre de archivo, slug ni ruta del cliente como clave. Usar relaciones locales y autorización por tenant también al crear URL de lectura; conocer un UUID no autoriza descargarlo.

Primera versión usa ventanas absolutas UTC; admin muestra/convierta zona de la sucursal. No introducir recurrencias/días de semana hasta definir zona por sucursal y probar transiciones de horario. La publicación sólo incluye activos `ready`; archivar/retirar quita de manifiestos siguientes. Nunca eliminar bytes referenciados por publicación vigente.

### Flujo/API concretos

1. Admin con permiso existente `CONFIGURACION_ACTUALIZAR`, que usa hoy el admin de kioscos inicia `POST /t/kioskos/media/uploads`. Reserva cuota de manera transaccional y recibe assetId más autorización temporal limitada a una clave staging y tamaño declarado. Si el proveedor no puede imponer ese límite, carga streaming acotada a través de endpoint autenticado; no habilitar carga ilimitada.
2. `POST /t/kioskos/media/:id/finalizar` verifica dueño/tenant y encola validación. Respuesta202; reintento devuelve mismo estado. Worker toma job durable con lease; fallos se conservan, no se publica automáticamente.
3. Worker aislado sin red decodifica bytes, verifica contenedor/codec/firma/tamaño y normaliza imagen/poster. Para videos primera entrega sólo aceptar formato soportado sin transcodificación pesada; rechazar archivo incompatible indicando cómo exportarlo. No asumir MIME/extensión correctos. Archivo rechazado queda privado y se limpia por retención.
4. `GET /t/kioskos/media` muestra validación/cupo; creación/edición de anuncios y publicaciones separada. Publicar valida revisión, sucursales, fechas y medios listos dentro TX. Revocar publicación es reversible; eliminación física diferida.
5. Nuevo `GET /kiosko/playlist` conserva `/idle` compatible. Token de dispositivo determina tenant/sucursal. DTO: `{revision, serverTime, expiresAt, items:[{id, assetId, type, url, posterUrl?, sha256, bytes, durationMs, width, height, validUntil}]}`. Orden estable prioridad/id; máximo20 piezas y manifiesto pequeño. No expone claves de gestión, borradores, firmas de escritura ni otra sucursal.
6. Lectura usa HTTPS del host de medios controlado; firmas breves para el asset autorizado. Dispositivo no propaga token de kiosco al CDN, no acepta redirecciones a otro host y no interpreta URLs como navegación. Servicio de medios nunca descarga URLs arbitrarias ni direcciones LAN proporcionadas por el cliente.

### Validación y límites iniciales propuestos

Límites son decisiones operativas iniciales, no capacidades ya verificadas: imagen JPEG/PNG hasta8MiB y4096x4096/16MP; video MP4 H.264 hasta50MiB,60s,1920x1080 y30fps, sin audio o AAC; duración de imagen3–30s. Rechazar SVG/HTML/GIF animado, archivos comprimidos, HLS remoto, YouTube/iframes y formatos ajenos al contrato. Mostrar mensaje específico, sin detalles internos.

Validar duración/dimensiones tras decodificación con límite de memoria/CPU/tiempo. Procesador multimedia actualizado, sin shell con parámetros del usuario, directorio efímero aislado y sin acceso a secretos/red. Antivirus si se adopta no sustituye decodificación ni límites. Escapar nombre/título al mostrar. Respuesta de assets con Content-Type fijo, nosniff y dominio sin cookies de sesión. Limitar cargas simultáneas2 por tenant, reserva total1GiB por tenant y20 piezas publicadas por sucursal; reserva se libera al expirar staging24h. Monitorear almacenamiento/egress antes de aumentar cuota. No se estimaron costos actuales de proveedor.

### Reproducción y fallos

Validar integración de `expo-video` compatible con SDK53 en build independiente antes de agregar dependencia; no actualizar Expo completo sólo por esta función. Android/iOS y navegador requieren pruebas separadas. Inicio sin audio y reproducción inline; si autoplay es rechazado, mostrar poster y conservar escaneo. Salir de reposo, escanear o tocar pausa/libera reproductor inmediatamente. Sólo un video activo; timeout de carga5s salta al siguiente, sin bucle rápido de error.

No prometer contenido offline permanente. Primera entrega puede usar caché temporal: manifiesto refrescado60s, expiración máxima15min, pieza nunca se reproduce después de `min(finCampaña,expiresAt)`. Ante401/revocación se purga estado y se muestra vinculación. Desconexión más larga usa mensaje neutral; nunca continúa una promoción vencida. La revocación no borra mágicamente bytes descargados, por lo que contenido es material publicitario destinado a exhibirse, no documentos confidenciales. La validación online determina nueva lectura; firmas expiran brevemente.

## Fases con criterios de salida

1. **Fundación:** contrato storage, cuotas/upload, validación aislada, modelo y permisos; fake/DB aislada prueba tenant A/B, tamaño real mayor al declarado, archivo corrupto, carga concurrente, expiración y finalización repetida. Sin marcar videos disponibles.
2. **Publicación de imágenes propias:** admin responsive y playlist con ventanas/sucursal/revisión. Pruebas401, revocación, sucursal inactiva, límites de fecha, publicación concurrente, borrador invisible, retirada y error de imagen. Piloto imágenes sólo se anuncia como tal.
3. **Video propio:** MP4 validado, poster, player y límites. QA Android/iOS físicos y navegador Windows/macOS/Linux según matriz disponible; horizontal/vertical, escaneo durante video, cambio de red, URL vencida, disco lleno, codec rechazado y reproducción continua2h midiendo memoria. No asumir que una vista web prueba decodificación nativa.
4. **Piloto operable:** bucket/credenciales configurados mediante despliegue autorizado, dominio TLS, prueba de carga real controlada, restauración/limpieza, monitoreo de cuota/egress, evidencia de publicación y retirada. Sólo entonces declarar comerciales propios entregados.

Dependencias externas pendientes: almacenamiento/CDN accesibles, procesador aislado y dispositivos de prueba. No se instalaron servicios, dependencias, esquemas ni reproductores en esta tarea.

## Fuentes de diseño

Validación combinada de firma, tipo, límites y almacenamiento aislado: [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Para reproducción y diferencias de caché entre plataformas consultar [Expo Video](https://docs.expo.dev/versions/latest/sdk/video/); esa página describe versión actual, por lo que la implementación deberá verificar compatibilidad exacta con SDK53 antes de fijar versión. Las decisiones de límites, ventanas y fases de este ADR son propuestas propias derivadas de las necesidades del proyecto.


## Avance preparatorio de fase 1

`media-contract.ts` contiene puertos storage/inspector y validaciones puras de tamaño/firma preliminar, metadatos inspeccionados, cuota propuesta, aislamiento de tenant, ventanas de publicación, límite de playlist y origen de lectura. Son contratos preparatorios probados, **no una carga/publicación operativa**. No están conectados a endpoints existentes: conectarlos a las URL de fotos actuales simularía una verificación de bytes que no existe. La reserva de cuota es un cálculo; requiere persistencia atómica posterior, no autoriza concurrencia por sí sola. La firma sólo rechaza algunos archivos inválidos y siempre devuelve `inspectionRequired`; nunca convierte un archivo en ready.

Impedimento concreto para integración operable: falta adapter de almacenamiento conectado, persistencia de assets/sesiones, y decoder aislado que produzca metadatos confiables. Siguiente alternativa segura: implementar esos tres componentes y pruebas con archivos reales en aislamiento, luego endpoint de carga que siempre espere el resultado de inspección. No ofrecer carga directa pública ni pedir al cliente que marque un archivo como verificado.


## Persistencia de fundación (avance, aún sin publicación)

Se incorporan `KioskoMediaAsset` y `KioskoMediaUpload`, y servicio interno `media-upload-service.ts`. Reserva + asset + sesión se confirman bajo lock transaccional del tenant. Una clave repetida devuelve la misma sesión; cambiar tipo/tamaño con esa clave se rechaza. La finalización sólo pasa a validating y conserva fecha única de solicitud; no confía en metadatos del cliente ni marca ready.

La expiración libera slots activos pero conserva bytes reservados hasta que almacenamiento confirma borrado. Esto corrige el límite inicial de liberar cuota al mero vencimiento: si falla borrado, hacerlo permitiría acumular objetos sin cuota. El adapter debe impedir que una carga iniciada antes de caducar recree el objeto después de confirmar borrado; si una URL directa no garantiza ese contrato, se necesita gateway acotado y cierre de escritores antes de liberar cuota.

Los puertos no tienen adapter productivo ni endpoints públicos conectados. Sesiones validating son trabajo durable pendiente del decoder real, no medios publicables. Antes de marcar ready, el futuro worker debe inspeccionar bytes y copiarlos/verificarlos en clave inmutable de publicación; una URL firmada de staging todavía vigente no puede considerarse objeto inmutable. No se almacena contenido binario ni se exponen archivos. No se implementó scheduler de limpieza productivo: función de limpieza es invocable por el futuro worker con storage real verificado.
