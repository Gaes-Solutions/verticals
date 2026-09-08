# Tienda: estado de entrega y plan de cierre

Fecha: 8 de septiembre de 2026. Prioridad indicada por Gaby: terminar la tienda del cliente, incluyendo web, caja, móvil y kiosco. Este documento prevalece sobre los estados históricos para organizar la siguiente revisión; no certifica producción ni modifica el alcance comercial sin confirmación.

## Dictamen

**Paquete completo: NO aprobado aún para entrega comercial al100%.** El recorrido de apertura, venta efectiva, recibo y corte ya fue comprobado con API real y PostgreSQL aislado. Persisten bloqueos de devoluciones online, recuperación de reembolsos, proveedores, videos y certificación de dispositivos. No hubo operaciones ni migraciones de producción.

La fuente de trabajo para esta entrega es `gaespos-integracion`, rama `mobile/apps`, revisión `bec494c` (5-sep). Contiene tienda, seguridad integrada y las tres apps móviles. `gaespos-verticales` es una rama anterior: sus ausencias no describen todo el producto actual. La otra tarea de Codex corrigió allí pedidos offline el 8-sep; revisar y trasladar selectivamente ese cambio si aplica, sin copiar la rama completa a ciegas.

## Resumen vigente de la implementación

- **Caja/POS:**117 pruebas y compilación aprobadas. Ensayo integral:fondo500,venta150,recibido200,cambio50,stock20→19,cortesX/Z650con diferencia0. Recarga recupera mismo folio; cierre exige nuevaapertura.
- **Negocio móvil:**107 pruebas y tipos aprobados. Alta/edición básica, permisos, variantes exactas y efectivo con recuperación verificados en visor360/768/1440. Paridad avanzada y equipos reales pendientes.
- **Devoluciones:**corrección de caja/sucursal, salida de efectivo y bloqueo con cierre/cancelación aprobada en109 regresionesAPI. Clave durable para recuperación de devolución parcial en desarrollo. Reembolsos online todavía bloquean entrega completa.
- **Tienda/cliente:**catálogo/carrito/checkout y errores verificados parcialmente en tandas previas; tarjeta/cuentas receptoras y aprobación correcta de devoluciones online pendientes.
- **Kiosco:**lector, errores y configuración comprobados; archivos/cuotas persistentes tienen6 pruebas. No hay todavía carga/inspección/publicación/reproducción de video operativas.
- **Compatibilidad:**pruebas en navegador con tres tamaños no sustituyen Windows/macOS/Android/iOS físicos ni impresoras. Instaladores, hardware y proveedores pendientes.

Las cantidades corresponden a tandas con solapamiento: no deben sumarse como pruebas únicas. Las secciones posteriores conservan el detalle histórico; este resumen y el tablero indican el estado vigente.

## Alcance confirmado por Gaby durante esta revisión

- Producto para varios clientes y sistemas operativos: no limitarlo a Windows. Cubrir Windows/macOS/Linux en computadora y Android/iOS/iPadOS en móvil/tableta, definiendo versiones soportadas y pruebas por plataforma antes de prometer compatibilidad.
- Paridad funcional móvil/web por rol: la app Negocio debe completar las operaciones del panel/POS, y la app Cliente debe permitir catálogo, precios, carrito, compra y seguimiento como la tienda web. No basta con consultar pedidos.
- POS y administración: usar Eleventa como piso funcional, más la tienda online, móvil y kiosco propios de GaesSoft.
- Kiosco: consulta de precios y publicidad forman parte de la entrega. El formato exacto de anuncios personalizados/video y los periféricos todavía requieren especificación; no eliminarlos del plan por conveniencia.

### Matriz de plataformas por acreditar

| Entorno | Vía prevista | Evidencia pendiente |
|---|---|---|
| Windows | Web/POS y aplicación Tauri | Navegador, instalador si contratado, impresión/lector, offline y actualización |
| macOS | Web/POS y aplicación Tauri | Safari/Chrome, paquete firmado si se distribuye nativo, periféricos y offline |
| Linux | Web/POS y aplicación Tauri | Navegador, distribución soportada, paquete y periféricos |
| Android teléfono/tableta | Apps Negocio/Cliente, web adaptable y kiosco | APK firmado, flujo por rol, cámara/lector, rotación y actualización |
| iPhone/iPad | Apps Negocio/Cliente y web; kiosco según dispositivo | Build iOS, instalación/distribución, Safari, cámara, uso desatendido y periféricos compatibles |

La base compartida existe (web, Expo y Tauri). Eso no certifica todos los sistemas ni todas sus versiones. Mantener un catálogo de equipos/periféricos probados; indicar capacidades y restricciones verificadas de cada plataforma. Paridad de operaciones no exige interfaces idénticas ni supone USB universal desde un navegador.

### Piso funcional de referencia: Eleventa

Contrastado el 8-sep contra [funciones oficiales](https://eleventa.com/punto-de-venta) y [manual introductorio](https://eleventa.com/aprender/mas-informacion). Es una lista inicial de aceptación, no una auditoría exhaustiva de equivalencia:

| Familia funcional | Situación GaesSoft / comprobación requerida |
|---|---|
| Venta rápida, tickets, descuentos y mayoreo | Código web presente; probar teclado/escáner, cobros y comprobantes |
| Inventario, catálogo e importación | Implementado en web; validar entradas/salidas y paridad de edición móvil |
| Compras y proveedores | Módulos existentes; recorrer pedido, recepción y actualización de costos/stock |
| Crédito y clientes | Módulos existentes; probar abonos y conciliación |
| Multicaja y empleados | Comprobar permisos, concurrencia y cierre por caja |
| Reportes y avisos por correo | Validar cifras y entrega efectiva de correos |
| Facturación, recargas y servicios | Acreditar proveedores reales y funciones concretas; no equivalencia por nombre de módulo |
| Impresora, cajón, lector y balanza | Certificar conexiones/equipos por OS; empaquetado incompleto actualmente |

Las funciones dependientes de proveedores se mantienen en el alcance de paridad; sus cuentas y pruebas deben gestionarse explícitamente. No copiar catálogos propietarios ni asumir que una pantalla demuestra una operación completa.

## Qué existe y qué no está acreditado

| Componente | Evidencia en esta revisión | Pendiente de entrega |
|---|---|---|
| Tienda web | `apps/web-tienda`; sitio publicado responde 200; revisión de tipos correcta | Repetir catálogo → carrito → pago → pedido → entrega/devolución en el tenant del cliente, incluyendo errores y concurrencia. Confirmar dominio y versión desplegada |
| Panel y caja web | `apps/web-admin`, `apps/web-pos`; tipos y compilación correctos; sitios responden 200 | Caja, tickets, inventario, roles, corte, devoluciones e impresora probados con el equipo real |
| App Negocio | `apps/mobile-negocio`, Expo/React Native; revisión de tipos correcta | Validar acciones completas por rol, no contar pantallas como paridad funcional. Entregar APK/versionado e instalación y actualización probadas |
| App Cliente | `apps/mobile-cliente`: pedidos/timeline, favoritos, direcciones, perfil, avisos | No se encontró catálogo/carrito/checkout en sus rutas y servicios. Gaby confirmó compra completa: ese flujo falta. La cuenta móvil no equivale a una tienda móvil completa |
| Kiosco | `apps/mobile-kiosko`; cámara, precio, reposo con carrusel automático; panel web/móvil y token por sucursal | APK y tablet real; errores de red; configuración segura; pruebas de precio; comprobar migración por tenant. Videos propios, lector HID, caché offline y bloqueo administrado no están implementados en esta primera fase |
| Escritorio | `apps/pos-desktop`: estructura Tauri y configuración para envolver `web-pos` | El README indica scaffold: faltan almacenamiento SQLite conectado, sincronización, iconos, instalador y prueba del sistema operativo. La política de conexiones aún referencia `api.gaessoft.com`, distinta de la API usada por las apps actuales; debe alinearse al destino elegido |
| Producción | API y portales responden; ruta de kiosco exige autenticación | Eso no confirma migraciones, proveedor de pago activo, respaldos, restauración ni versión exacta desplegada |

No se encontraron APK/AAB/MSI/AppImage dentro de los directorios de esas apps. Esto **no demuestra** que no existan builds en EAS, Descargas u otra ubicación. Recuperar el artefacto y asociarlo al commit antes de darlo por entregable.

## Hallazgos concretos que cambian la evaluación

1. **Kiosco oculta fallos operativos.** En `apps/mobile-kiosko/app/verificador.tsx`, cualquier error de consulta se presenta como producto no encontrado. Distinguir 404, falta de conexión, servidor indisponible y dispositivo revocado; mostrar recuperación apropiada.
2. **Configuración de kiosco insuficiente para uso desatendido.** `setup.tsx` guarda el token sin validarlo contra la API. Una pulsación prolongada abre setup sin autorización de encargado. Diseñar recuperación y protección de configuración; no considerar keep-awake como bloqueo del dispositivo.
3. **Precio y anuncios necesitan pruebas conjuntas.** El kiosco sí llama a `previewVenta` con sucursal y canal POS; eso es buena base, pero falta demostrar igualdad con caja para impuestos, promociones, variantes, granel y precio por cantidad/cliente. La comparación de precio anterior usa `precioBase`; verificar misma base fiscal. El carrusel selecciona promociones por estado activa sin filtro de fechas/sucursal en `contenidoIdle`: verificar vigencia y segmentación para no anunciar ofertas inaplicables.
4. **Kiosco es Fase 1.** No hay reproducción de video, captura de escáner USB/Bluetooth HID ni almacenamiento persistente de catálogo/precios. EAS projectId está vacío. No se encontraron pruebas dedicadas de kiosco bajo `apps/api/test`.
5. **Cobro SaaS requiere matiz respecto a la rama vieja.** Aquí existe cobro Stripe real, pero `cobrarSuscripcion` cae a `mockCobrar` si faltan condiciones. El CFDI de suscripción conserva valores simulados. Antes del cobro automático comercial, fallar explícitamente sin proveedor real y verificar cobro/factura/reintentos. Esto es distinto del pago del comprador en ecommerce y no prueba que ese checkout esté roto.
6. **Historial no es validación actual.** El QA de julio reportó siete flujos completos y arreglos importantes; el plan de agosto quedó desactualizado en integración de seguridad y construcción del kiosco. El historial Git local ya contiene el merge de seguridad y los commits del kiosco; resta acreditar despliegue y migraciones, no volver a marcar esos desarrollos como inexistentes.

## Plan de cierre y criterios de aceptación

Cada casilla requiere evidencia, responsable y versión. Pendiente significa no acreditado hoy; no necesariamente código inexistente.

### 1. Fijar la entrega y la versión

- [ ] Confirmar tenant/tienda del cliente, sucursales, catálogo y usuarios; no reutilizar datos de pruebas como inventario inicial.
- [ ] Identificar commit desplegado y migraciones aplicadas, incluyendo `20260831120000_add_kiosko` en los tenants correspondientes; registrar diferencias respecto a `bec494c`.
- [x] Confirmado: paridad móvil/web por rol, incluyendo compra completa del cliente. Falta demostrarla y completar brechas.
- [x] Confirmado: alcance multiplataforma; no limitar a Windows. Falta fijar versiones/equipos y si cada cliente usará web, nativo o ambos. Un acceso directo web no acredita operación offline ni instalador nativo.
- [ ] Confirmar tablet/lector y si publicidad incluye videos personalizados desde la primera entrega. Mantener estas capacidades dentro del alcance por verificar, sin descartarlas automáticamente.

### 2. Dinero, existencias y pedidos: bloqueo del piloto si fallan

- [ ] Publicar producto con variantes, foto, código, precio, impuesto y stock; comprobarlo en web, caja y kiosco de la sucursal.
- [ ] Compra con envío y compra con recogida: pago correcto, confirmación, reserva/descuento de existencias, pedido visible al negocio y seguimiento al comprador.
- [ ] Pago rechazado, cancelado, pendiente y respuesta perdida: no marcar pagado sin confirmación ni duplicar pedido/cobro; procesar webhooks repetidos idempotentemente.
- [ ] Dos compradores/cajas intentan la última unidad: resultado consistente sin sobreventa no autorizada.
- [ ] Apertura de caja → venta efectivo/tarjeta/mixto → ticket → devolución total/parcial → corte: importes e inventario cuadran.
- [ ] Descuentos, cupones, monedero, crédito y precios de mayoreo aplican según las reglas contratadas y permisos del empleado.
- [ ] Timbrado, cancelación y recuperación de CFDI verificados con proveedor configurado y datos correctos. Separar facturación del negocio y facturación de GaesSoft.
- [ ] Conciliar una jornada entre pedidos, cobros, devoluciones, caja y reporte; dejar resultado firmado por el responsable de aceptación del cliente.

### 3. Kiosco en piso de venta

- [ ] Probar token válido/inválido/revocado y aislamiento de negocio/sucursal; confirmar migración y despliegue.
- [ ] Corregir errores de red presentados como producto inexistente y validar token antes de activar.
- [ ] Proteger salida/configuración con mecanismo de encargado; probar reinicio del dispositivo y recuperación.
- [ ] Pruebas de igualdad de precio e impuestos/promociones contra POS; indicar condiciones cuando web o mayoreo tienen precios distintos por diseño.
- [ ] Validar vigencia de anuncios y contenido correcto por sucursal; alternancia reposo → escaneo → precio → reposo.
- [ ] Entregar APK identificado y probar cámara, orientación, legibilidad y uso prolongado en tablet real.
- [ ] Implementar y probar publicidad propia/video, HID y caché offline si forman parte de la entrega acordada. No marcar Fase 1 como cumplimiento de esas funciones.

### 4. Móvil y escritorio

- [ ] Negocio: venta, productos, inventario, usuarios, promociones y facturación completos según rol. Auditar acciones faltantes de `docs/mobile-negocio-paridad.md` contra código actual.
- [ ] Cliente: completar catálogo, carrito, pago y regreso desde el proveedor, además de pedidos y cuenta; alcance confirmado por Gaby.
- [ ] Identificar builds instalables, firma, API de destino y versión; probar instalar, actualizar sin perder sesión/datos y cerrar sesión en dispositivos reales.
- [ ] Si escritorio nativo es requerido: completar Tauri, conexiones a API, iconos, persistencia/sync e instalador; probar impresión y periféricos en el OS del cliente.
- [ ] Si offline está comprometido: venta sin red → reinicio → reconexión sin pérdida/duplicados; aislamiento por negocio/usuario y conflictos visibles. Incorporar corrección de vendedor solo donde corresponda.

### 5. Operación comercial

- [ ] Respaldos automáticos y restauración ensayada; rollback de aplicación/migraciones planificado.
- [ ] Alertas, logs y monitoreo operativos; verificar manejo de permisos y aislamiento tras los merges con pruebas dirigidas.
- [ ] Datos del cliente cargados y conciliados, roles mínimos y capacitación para dueño/cajero/almacén.
- [ ] Canales y horarios de soporte, manual de contingencia, condiciones de servicio y políticas de tienda revisadas por sus responsables.
- [ ] Ensayo integral con cliente y equipo real, registro de incidencias y cero fallos críticos de dinero/datos o flujos esenciales.

## Verificación ejecutada el 8-sep

- Tipos: API, web-tienda, web-admin, web-pos, mobile-negocio, mobile-cliente y mobile-kiosko: **correctos**.
- Compilación de producción: web-pos y web-admin: **correcta**. Panel advierte bundle grande; no bloquea la compilación, medir carga en equipo real.
- Motor de precios: **16 pruebas aprobadas**. No cubren por sí mismas el endpoint de kiosco ni paridad entre canales.
- Consulta pública: `https://app.angaes.com/api/health`, `https://shop.angaes.com`, `https://pos.angaes.com`, `https://app.angaes.com`: **HTTP 200**. `/api/kiosko/config` sin token: **401**.
- No se ejecutaron compras, cargos, cambios de producción, migraciones ni pruebas destructivas. No se probaron APK, tablet, impresora ni restauración. No se ejecutó la suite completa de API, que requiere revisar el entorno de datos de prueba.

## Próxima tanda propuesta

1. Identificar versión/tenant y entorno de pruebas aislado; recuperar APK y alcance de dispositivos.
2. Ejecutar flujo de compra y caja de punta a punta y documentar fallos reproducibles.
3. Cerrar errores y pruebas del kiosco, luego completar móvil/escritorio conforme al contrato.
4. Ensayo del cliente, restauración/contingencia y decisión final de entrega basada en evidencia.

El plan histórico menciona el 25-sep como fecha de piloto. Se conserva como referencia, no como nueva promesa ni prueba de que se alcanzará.


## Seguimiento visual y evidencia nueva — 8 septiembre

Tablero local: http://127.0.0.1:4318/ (solo en esta computadora, durante la sesión de trabajo). Muestra responsable, estado, alcance de seguridad, pantallas, errores y evidencia. Se consulta cada cinco segundos. No contiene datos de clientes ni credenciales.

- Núcleo API: **155/155 pruebas aprobadas** en 7 archivos (ventas, inventario, devoluciones, cortes, ecommerce, crédito y cobro). Se corrigió el uso de consultas para bloqueos transaccionales que causaba errores 500. Base PostgreSQL y Redis exclusivos de pruebas.
- Servidor kiosco: **10/10 pruebas de integración aprobadas**, incluyendo aislamiento, tokens revocados, permisos, sucursales, productos archivados, promociones y creación concurrente de configuración.
- Aplicación kiosco: **10/10 pruebas unitarias aprobadas**, tipos y formato aprobados, según ejecución del agente. Cámara, instalación, rotación física y autenticación fuerte del encargado siguen pendientes.
- Tablero: abierto y comprobado en navegador a 360, 768 y 1440 px sin desbordamiento horizontal; detalle desplegable y actualización de estado comprobados. Esto no certifica las pantallas de la tienda.
- Compra móvil: auditoría confirmó que falta catálogo/carrito/checkout. Requiere fachada autenticada del cliente; no incrustar credenciales de servicio en aplicación.
- Compra web: corrección de errores de envío en desarrollo. Asociación segura de pedido a cliente e idempotencia inicial pendientes.

No se ha publicado ni certificado comercialmente la entrega. Las pruebas aprobadas se refieren exclusivamente a los escenarios enumerados.


### Segunda verificación: identidad, sesión e intentos de compra

- API: ejecución conjunta **101/101 casos aprobados** (checkout idempotente 10, ecommerce y portal de cliente). El caso de fallo al guardar resultado del proveedor se comprueba con un trigger temporal exclusivamente en el schema de pruebas.
- El servidor registra el intento antes de efectos externos, conserva resultado y bloquea repetición cuando hay resultado incierto. El seguimiento solo confirma si el pedido tiene pago y venta asociados. Falta cerrar reconciliación con proveedor y la ventana de caída webhook/venta.
- Portal: la prueba obsoleta que adjudicaba invitados por correo fue sustituida por una comprobación de propiedad: el pedido vinculado es visible, el invitado del mismo correo no aparece ni entrega su detalle.
- Sesión móvil cliente: **17 pruebas con mocks aprobadas**, tipos y formato correctos. Restauración exige identidad y tenant del servidor. No borra credenciales por fallos temporales; limpia cachés al cambiar cuenta. Falta biometría y almacenamiento en dispositivo físico.
- Identidad web: **16 pruebas nuevas aprobadas** (19 junto con envíos); la API aporta tenant verificado y el BFF lo compara con tienda actual. Se vincula clienteId verificado, nunca solo email. API nueva debe desplegarse antes o junto a web/móvil.
- Pago sin configurar: UI de producción informa indisponibilidad y BFF rechaza antes de crear carrito; demo queda limitado a entorno no productivo.
- Integración web del intento persistente y recuperación: en curso, no certificada todavía en esta anotación.

La migración `20260908190000_checkout_attempts` está creada y comprobada en tenants de pruebas; **no aplicada en producción**. No hay publicación ni cambio a datos reales.


### Cierre de evidencia del lote visual

- Web final: **42/42 pruebas aprobadas y tipos correctos**. Incluye cookie de sesión, aislamiento de clave/tenant/cliente, identificador de carrito invitado derivado del servidor y validación de origen.
- QA real detectó falso rechazo de origen por normalización interna localhost/127.0.0.1; corregido. Petición local real supera control de origen y se rechaza posteriormente por falta de sesión (409); origen ajeno recibe403.
- En navegador: inicio ficticio preservado tras recargar; botón de pagar bloqueado, consulta del mismo intento disponible, carrito conservado. Se usó servidor ficticio que rechaza escrituras comerciales; **no hubo cobro**.
- Solo confirmación autorizada permite vaciar carrito. Resultado incierto o404 no crea otra clave automáticamente. Web Locks es requisito de esta implementación; falta incorporarlo a matriz de navegadores y probar equipos reales.
- Tablero abierto en http://127.0.0.1:4318/. Muestra hora de última actualización y evidencia. Estar conectado al tablero no implica trabajo autónomo en ejecución.

Siguen pendientes: compra completa en app cliente, paridad negocio, instaladores escritorio, video/HID/administración del kiosco, proveedor real, reconciliación, ventana de consistencia webhook/venta y dispositivos. El lote local termina verificado; **el proyecto completo no está terminado ni publicado**.


### Continuación: confirmación atómica de pago y venta

Se extrajo persistencia reutilizable en transacción conservando la firma de crearVenta. Checkout bloquea pedido y guarda venta, inventario, estado, evento y conversión del carrito juntos. Fallos revierten los cambios locales; un evento fallido no degrada una confirmación ya completada. Pedidos históricos inconsistentes requieren conciliación y no generan otra venta automáticamente.

Verificación: **137/137 pruebas, 8 suites**, incluyendo 6 pruebas nuevas de atomicidad y regresión de idempotencia, comercio, ventas, crédito, cobro, monedero y promociones. Typecheck API correcto. No cambios en producción ni nuevas migraciones.

Pendientes: respetar snapshot de importes cobrados (T13), conciliación de reembolsos/proveedor y posibles notificaciones repetidas desde postPago. El tablero ahora distingue conexión de actividad; trabajo pausado se señala explícitamente y una actualización de más de90 segundos no se presenta como actividad confirmada.

### Avance: importes, catálogo móvil y configuración

- T13: 156 pruebas de regresión en ocho suites y seis pruebas específicas de snapshot aprobadas en base desechable. Los importes del pedido se congelan antes del cobro, se prorratea el cupón en centavos y se registra el envío como servicio configurado. Cambiar catálogo después no altera la venta confirmada. Cancelar/devolver servicio no crea inventario. Pedidos históricos sin snapshot requieren conciliación.
- API móvil: catálogo, detalle, configuración y carrito aislados por cliente/tienda. Pruebas de fachada incluidas en las 156; no se acepta autoridad de cliente/tenant desde el cuerpo enviado.
- App cliente: catálogo, variantes, carrito, guardado y recuperación implementados; 38 pruebas, tipos y lint aprobados. Checkout y visualización nativa siguen en trabajo.
- Administración: selector del servicio de envío, búsqueda recuperable, permisos y conservación de selección. QA visual con datos ficticios en 360/768/1440 px. Ante fallo de configuración, todos los guardados quedan bloqueados; aviso accesible arriba y reintento comprobado en 360 px. Build del administrador aprobado, con aviso de tamaño de bundle pendiente de optimización.
- T14 en desarrollo: impuestos de factura y bases fiscales. La auditoría detectó IVA fijo y montos de impuesto incorrectos en adaptador; aún no está aprobada la facturación.

No hay despliegue, timbrado ni cobro real. Siguen pendientes integración de proveedor, revisión de dispositivos y cierre comercial completo.

### Avance: caja y facturación

- POS: 12 pruebas unitarias aprobadas y build correcto. Selección verifica sucursal activa/no archivada, caja activa de esa sucursal y apertura correspondiente. El inicio ya no abre caja automáticamente con fondo cero ni continúa sin caja tras fallo. Ante error de restauración conserva sesión bloqueada, permite reintentar o salir y limpia permisos al salir. UI de recuperación comprobada a360/768/1440, botones40px y reintento exitoso sin nueva autenticación en fixture. Pendiente selección explícita de sucursal/caja y apertura con fondo real desde POS.
- Fiscal: 16 pruebas unitarias de cálculo/adaptador y34 integración CFDI/devoluciones aprobadas. Notas de crédito conservan relación, descuentos e impuestos de las líneas originales. Sin timbrado externo. Datos históricos incompletos y objeto fiscal exento/no objeto requieren completar fuente explícita; no se infieren tasas.
- Móvil: 54 pruebas unitarias y11 de integración del checkout aprobadas. Tarjeta/Stripe todavía sin tokenización; OXXO/SPEI muestran referencia y consultan estado. Auditoría adicional detectó y está corrigiendo compras con tienda desactivada/productos retirados.
- Escritorio: la máquina carece de Rust/WebKitGTK. El shell usa un POS con API relativa que no dispone del proxy web dentro de Tauri; no hay instalador certificado. Se revisa empaquetado antes de intentar distribución.

### Actualización: caja explícita, postpago y lector del kiosco

Este bloque actualiza los pendientes descritos en los lotes anteriores.

- Caja: selección explícita de sucursal/caja y apertura con fondo ingresado;35 pruebas POS y20 de servidor aprobadas. Concurrencia de dos cajeros produce una apertura y un rechazo409. QA360/768/1440 con fondo ficticio500. Compilación final POS correcta.
- Postpago: cola durable para guías y avisos,22 pruebas de integración aprobadas. Operaciones ambiguas no se reenvían automáticamente. Panel de administración revisado a360/768/1440 con fallos y reintentos; conciliación operativa aún pendiente. Compilación final administración correcta, con aviso de tamaño de paquete.
- Checkout móvil:16 pruebas de integración; conjunto de API pública/snapshot/idempotencia32 aprobadas. Tienda desactivada y artículos retirados bloqueados antes de cobrar. Cuenta móvil muestra errores en vez de listas vacías; comprobado pedidos con fallo.
- Escritorio:18 pruebas de URL/CSP aprobadas, conexión de API explícita para paquete. Sin instalador ni certificación nativa.
- Kiosco: lector en modo teclado y entrada manual; conserva ceros iniciales, consulta con Enter, producto desconocido y recuperación de503 comprobados. Anchos360/768/1440 sin desbordamiento.23 pruebas unitarias aprobadas, incluidas validación de anuncios y contraste. Se agregó actualización de configuración/anuncios cada30 segundos mientras la aplicación está ejecutándose y retirada de contenido ante error; validación visual de esta última corrección en curso. No equivale a garantía en aplicación suspendida.
- Videos propios aún no implementados. Se detectaron errores ocultos en administración del kiosco; corrección en curso. Siguen pendientes hardware real, video, permisos de encargado, conciliación, pagos con proveedor y liberación comercial.

### Recuperación y sesión del negocio

- Kiosco: anuncio fallido muestra aviso y retira contenido anterior; reintento recupera promoción ficticia. Administración de kioscos distingue error de lista vacía, bloquea acciones hasta cargar, recupera lista y configuración; anchos360/768/1440 comprobados.
- App del negocio: sesión restaurada sólo tras verificar identidad, tenant y permisos en servidor. Errores temporales conservan credenciales con acceso bloqueado y reintento; credenciales inválidas se eliminan. Cachés aisladas y respuestas tardías protegidas.18 pruebas aprobadas; dispositivos/biometría reales pendientes.
- Cobro del negocio está en corrección: selección de caja y apertura válida, total del servidor y bloqueo ante resultado incierto. No se considera operativo mientras este lote no se verifique.
- ADR021 propone medios propios y publicación segura. No existe aún servicio multimedia operativo ni reproducción de video; el contrato preparatorio no equivale a comerciales entregados.

### Venta en efectivo: recuperación por clave

- API:23 pruebas en base aislada (8 intentos+15 ventas). Registro de intento y venta en una sola transacción; consultas aisladas por tenant/usuario y replay sin duplicar inventario. Migración nueva sólo en pruebas.
- Móvil: UUID emitido por servidor y payload persistidos antes del envío; consulta del mismo intento y reenvío explícito de la misma solicitud.33 pruebas focalizadas. DTO ajustado a respuesta real ventaId/folio/total, confirmación posteriorGET exige venta cobrada (estado `cobrada`).
- QA web con proveedor ficticio: POST devuelve503, consultar recupera resultado ficticio y libera carrito sin otroPOST. Cuenta separada de prueba; ningún movimiento comercial. Marca legacy permanece bloqueada; no se elimina automáticamente.
- Cancelación durable de un intento sin venta en implementación; nunca debe cancelar una venta registrada. Confirmación visible y nueva tanda pendientes.
- Cliente API compartido:6 pruebas de errores seguras;5xx no muestra detalles internos y respuesta200noJSON no se considera lista vacía.

### Evidencia más reciente de apps y efectivo

- Negocio61 pruebas, Cliente54 y Kiosco24 aprobadas junto con tipos de las tres apps, después de actualizar manejo de errores compartido.
- API efectivo27 pruebas aprobadas: incluye cancelación durable, POST tardío bloqueado y venta existente preservada. Migración adicional sólo en DB de prueba.
- QA móvil360: confirmación explícita dentro de la pantalla, cancelación de intento sin venta y recotización con carrito conservado. Recuperación de respuesta perdida usaGET y no repitePOST. Confirmación persistente de folio agregada.
- POS web integra ahora la misma recuperación de efectivo; pendiente de cerrar esta tanda.
- Tarjeta móvil/cuentas receptoras: ver `estado-tarjeta-cliente-cuentas-2026-09-08.md`. Definición de cuentas por tienda pendiente del usuario; no bloquea trabajos locales de caja.

### Cierre de verificación local de efectivo y diálogo de caja

- POS:74 pruebas unitarias; compilación final aprobada. Total150, recibido200 y cambio50 conservados en solicitud y recuperación. Servidor:13 pruebas de intentos aprobadas, incluida venta/pago únicos y corte neto150; tanda previa15 ventas aprobada. Los conjuntos se solapan y no deben sumarse como pruebas únicas.
- QA con datos ficticios: respuesta503 recuperada por consulta sin repetir cobro; fallo de recibo conserva venta confirmada. Ticket con controles40px, sin desbordamiento a360. Diálogo nativo con desplazamiento a768×400; Escape cierra y devuelve foco a Cobrar.
- Apps: Negocio61, Cliente54 y Kiosco24 pruebas aprobadas; tipos aprobados. Cancelación de intento sin venta y recotización móvil verificadas en visor web. Hardware real pendiente.
- POS web con manifiesto analizado sin errores; instalación real y operación sin conexión no certificadas.
- En curso: revisión de autorización de recibos. Persisten pendientes de paridad administrativa móvil, videos, medios de pago y equipos reales; no se aprueba aún comercialización del paquete completo.

### Recibos y autorización

- Corregido caso no efectivo: una venta confirmada ya no deja el ticket listo para volver a cobrar si falla GET del recibo. Se conserva folio y se permite reintentar sólo la consulta. QA ficticia aprobada a360/768/1440, sin desbordamiento; compilación aprobada. Esto no añade aún recuperación durable de respuestas POST ambiguas a métodos distintos de efectivo.
- Tickets:9 pruebas de servidor aprobadas en DB aislada; permisos401/403 y acceso entre tiendas404 comprobados. Se selecciona CFDI de ingreso y una venta cancelada no ofrece autofacturación.
- Recibo:2 pruebas unitarias de estado/escape aprobadas; impresión identifica cancelada/borrador/estado no verificado. Impresión física USB sigue pendiente: el puente local actual es un prototipo que no imprime y no debe habilitarse para entrega sin emparejamiento/origen autorizado.
- Se detectó incompatibilidad del DTO del lector de códigos POS con la API real; corrección y selección exacta de variante en curso.

Formato de recibo: nombre largo sin espacios desbordaba442px sobre un ancho219px(58mm). Corregidos salto de línea y variante visible; QA posterior contenido219px, sin desbordamiento. Sin impresión física.

Lector POS:27 pruebas DB(4 variantes+23 catálogo) y12 unitarias aprobadas. Consume DTO real y sólo agrega variante exacta activa; ambigüedad exige código específico. QA con ceros iniciales seleccionó segunda variante175 en lugar de primera150. Búsqueda manual ahora muestra cada presentación con SKU/precio y conserva el nombre elegido en ticket; QA Grande175 aprobada. POS80 pruebas en última tanda(incluye recibo y lector).

### Productos básicos en app negocio

Alta por pieza con una variante y edición de nombre/descripción/precio simple implementadas con permisos de servidor y UI. PATCH transaccional:24 pruebas de catálogo aprobadas, incluido rollback ante conflicto. Negocio77 pruebas y tipos aprobados. QA ficticia: alta125.50, edición503 bloquea guardar, consulta restaura125.50 y edición130 confirmada. Formulario360/768/1440 sin desbordamiento. Variantes avanzadas, imágenes, categorías y dispositivos reales pendientes; alcance no equivale a paridad completa.

### Efectivo recibido y cambio móvil

Negocio95 pruebas y tipos aprobados. Captura explícita de recibido, cálculo en centavos y validación de importes al recuperar intento. QA ficticia: total150, recibido100 bloquea;200 muestra cambio50. POST503 seguido de consulta recupera total150/recibido200/cambio50 y limpia carrito sin repetir venta. Tres anchos360/768/1440 sin desbordamiento. Reenvío conserva payload y resultado inconsistente mantiene bloqueo según pruebas unitarias. No hubo movimiento real.

Variantes móviles:107 pruebas y tipos aprobados. Cada presentación activa tiene opción propia con SKU/precio; QA Grande175 confirmó variante exacta y cotización175. Se oculta aviso del cobro anterior al agregar un artículo a nueva venta.

Permisos móviles:QA con usuario sólo productos.leer muestra catálogo/detalle sin alta/guardado. Inicio ya no ofrece Cobrar ni solicita reportes sin permisos; detalle informa consulta. Ajuste de contraste en acceso a caja. Validación visual con identidad ficticia; autorización del servidor permanece requerida.

### Fundación de archivos para anuncios propios

Assets y sesiones persistentes con cuota atómica, clave idempotente, finalización a validating y expiración implementados.6 pruebas DB aprobadas: concurrencia, propietario/tenant, finalización repetida, expiración/borrado fallido y reserva retenida hasta eliminación confirmada. Tipos API correctos. Migración20260909000000 únicamente en DB aislada. No endpoints, publicación ni reproducción de video: faltan almacenamiento conectado, inspección aislada y copia a objeto inmutable. El staging mutable nunca debe publicarse.

### Recorrido integral con API y PostgreSQL aislados

Nueva tienda test-ui-retail de prueba, login real, sucursal/caja, apertura500, código0012345678901, cotización150 y venta efectiva en DB exclusivamente de pruebas. Evidencia DB:1 venta,1pago,1línea,total150,recibido200,cambio50,stock20→19. Recargar POS conserva intento; consultar recupera mismo folio y recibo. Recibo58mm muestra IVA incluido20.69,efectivo200,cambio50. Ningún movimiento de producción ni dinero real. Corte de caja en revisión antes de cerrar esta prueba.

Regresión conjunta anterior:76 pruebas en6 archivos de catálogo,lector,tickets,intentos,cortes yfundaciónmedia aprobadas.

### Apertura, venta y corte integral completados en aislamiento

Corrección de concurrencia:105 pruebas API en8 suites aprobadas. Cortes X/Z, ventas y movimientos comparten bloqueo; dos cierresZ dejan uno y409; venta preparada no cruza a apertura nueva tras cierre. DTO apertura incluye estadoabierta.

CorteModal:37 pruebas focalizadas, tipos y formato correctos. Distingue404/red, consulta recuperable, conteos válidos, mutex, recuperaciónZ sóloGET, importes estrictos y pendientes aislados por sesión. Estado local no persiste reinicio del navegador; cierre backend impide repetirZ de apertura cerrada. Política de cancelaciones/devoluciones posteriores a corte histórico aún pendiente de revisar.

QA integral con API real y PostgreSQL aislado: fondo500, venta150, recibido200, cambio50,stock20→19. CorteX número1 yZ número2:1 venta,ventasTotal150,esperado650,contado650,diferencia0. Apertura queda cerrada. Nuevo login exige nueva apertura y fondo. Revisión visual de corte360/768/1440, controles40px, Escape y error503/reintento. Sin dinero real ni datos de producción.

### Hallazgo prioritario: reembolsos y cancelaciones tras corte

POS omitía cajaId en devolución efectiva y API permitía confirmarla sin salida de caja. Además, devolución con caja no compartía bloqueo conZ ni validaba sucursal; cancelación tras cierre no registra devolución en apertura vigente. Cancelación y devolución podían competir con bloqueos diferentes y reponer inventario dos veces. CorrecciónAPI/UI en curso; T01 vuelve a revisión pese a conservar sus155 pruebas iniciales. Se evalúa recuperación durable para POST de devolución parcial incierto; no atribuir resultado por similitud de montos.
