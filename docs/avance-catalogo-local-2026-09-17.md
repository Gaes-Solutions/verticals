# Catálogo local integrado al escritorio — 17-sep-2026

## Resultado

Al entrar a una caja con la app de escritorio, el POS verifica la identidad en
línea, abre SQLite en el ámbito API/negocio/cajero/sucursal/caja y descarga el
catálogo base. Muestra el progreso, la fecha de la versión guardada y un botón
para actualizar. En navegador normal no activa SQLite ni muestra este aviso.

La descarga incluye todos los productos y variantes activos, códigos de barras,
clientes permitidos y promociones automáticas activas/programadas. Usa páginas de
500 filas, sin truncar silenciosamente el conjunto. Listas de precios avanzadas,
existencias por sucursal, cupones y el cálculo comercial offline siguen pendientes.

Cada descarga del servidor pertenece a una cuenta y a sus permisos, conserva una
vista fija de los datos y tiene una ventana de acceso de 15 minutos. Una nueva
preparación reemplaza la descarga anterior de esa cuenta. Preparaciones simultáneas
reciben un error reintentable sin ocupar conexiones esperando el bloqueo.
Los datos caducados se limpian al preparar otra descarga; no se promete borrado
físico exactamente al vencer los 15 minutos.

SQLite prepara las páginas fuera de la versión activa. Solo publica la nueva
referencia cuando tiene todas las páginas consecutivas. Si falla la red o el disco,
la versión anterior sigue activa. El cierre de sesión aborta las peticiones y
cada petición conserva su token original; nunca adopta el token del siguiente cajero.
La identidad guardada no es una autorización para iniciar sesión sin conexión.

## Corrección de seguridad

La descarga antigua de clientes incluía todas las columnas, entre ellas
`passwordHash`. Ahora selecciona campos explícitos y exige permisos de lectura.
La nueva descarga también excluye credenciales y omite clientes sin `clientes.leer`.
Sus páginas no se entregan a otro usuario, con permisos distintos o tras caducar.

El endpoint antiguo `/sync/pull` devuelve un error explícito si superaría 500 filas
por entidad, conservando el cursor del consumidor en lugar de devolver un conjunto
truncado. El escritorio usa `/sync/catalog`; el pull incremental antiguo no es el
contrato de catálogo íntegro del escritorio.

## Evidencia de esta continuación

- 18 pruebas API con PostgreSQL aislado: catálogo de 502 productos, versión fija
  ante cambios de precio, exclusión de credenciales, permisos, otra cuenta y caducidad;
  incluyen las regresiones de ventas/acuse de la continuación anterior.
- 34 pruebas del cliente de sincronización, 14 con SQLite real en disco: corte de
  red, publicación incompleta, reinicio, cambio de cuenta y retirada de registros.
- 150 pruebas POS; incluye 5 de sesión de escritorio/token/cancelación.
- 8 pruebas Playwright: catálogo local más los flujos existentes de venta, devolución,
  promoción y corte. El caso de catálogo usa API y SQLite reales; sustituye únicamente
  el transporte WebView–SQLite, por lo que no certifica la ventana nativa del SO.
- Revisión visual a 360, 768 y 1440 px, sin desbordamiento horizontal. Se ajustó la
  disposición móvil del aviso. Capturas en `/tmp/gaes-catalog-{360,768,1440}.png`.
- Tipos API/POS/sync-client y build web POS aprobados. Comprobación nativa
  `cargo check --locked --offline -j 2` aprobada en el contenedor Linux con la
  migración SQLite 003.

## Entrega y pendientes

Migración nueva de servidor: `20260917010000_sync_catalog_snapshots`, además de
`20260917000000_sync_receipts_identity` de la continuación anterior. Regenerar
Prisma y aplicar ambas antes de desplegar este backend. SQLite aplica 003 al abrir
el escritorio. Estas comprobaciones solo usaron la base aislada de QA; no se
modificó producción, ni se hizo commit, push o despliegue.

Siguen pendientes la autenticación local con vigencia y protección de credenciales,
lectura/búsqueda local conectada a ventas, precios e impuestos completos, persistencia
atómica del cobro y comprobante, reconciliación con caja/cortes, devoluciones y
apartados offline. El aviso dice expresamente que el cobro todavía requiere conexión.
También siguen pendientes instaladores firmados, ejecución/actualización nativa,
proveedores reales y periféricos descritos en las entregas anteriores.
