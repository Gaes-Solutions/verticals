# App móvil Negocio — Paridad con el panel web (web-admin)

## Criterio vigente — 8-sep-2026

Gaby confirma **paridad funcional completa con la web por rol**, para Android y iOS/tabletas. Las casillas históricas no certifican paridad: validar crear/editar/cobrar/imprimir, no solo visualizar el módulo. App Cliente también debe permitir comprar como la tienda web. Ver [matriz de entrega](estado-entrega-tienda-2026-09-08.md). Revisión de tipos aprobada en las tres apps; falta certificación funcional y de dispositivos.

Objetivo: la app móvil Negocio debe tener las MISMAS funciones que `web-admin`.
Se construye por tandas nativas. Estado por módulo (31 páginas del panel web):

## ✅ Hechas
- [x] Dashboard / Inicio (KPIs, top productos, accesos)
- [x] Ventas (lista + estado)
- [x] Cobros / POS (buscar, carrito, cobrar efectivo) — falta: multipago, cliente, descuentos
- [x] Productos básicos: lista paginada/búsqueda, alta por pieza de una variante, editar nombre/descripción y precio base simple — falta: variantes avanzadas, imágenes, categorías/marcas y edición fiscal completa
- [x] Inventario (ver + ajuste stock)
- [x] Reportes (KPIs + gráfica por día/canal/top)

## ⏳ Pendientes (paridad web)
- [x] Pedidos (ecommerce)
- [ ] Clientes B2C/B2B (lista, alta, detalle)
- [x] CxC (cuentas por cobrar: resumen, abonos, condonar/incobrable) — cuentas por cobrar / fiados (saldos, abonos)
- [x] Devoluciones (lista, aprobar con metodo reembolso, rechazar)
- [x] Compras (OC: lista, detalle, autorizar, recibir, cancelar)
- [ ] Cobros avanzados (link de pago, multipago)
- [x] Precios (listas: ver, detalle, crear)
- [x] Inventario Insights (reordenar/estancados/top margen)
- [x] Promociones (lista + activar/pausar/archivar)
- [x] Monedero (gift cards: emitir, cancelar)
- [x] CFDI/Facturacion (emitidos: lista, cancelar SAT)
- [x] Contabilidad (CFDIs recibidos, categorizar, auto, DIOT)
- [x] Comisiones (reglas: ver, eliminar)
- [x] Reseñas (moderar aprobar/rechazar, responder)
- [x] Preguntas (responder, rechazar)
- [x] Envios (tarifas, zonas, pickup: vista)
- [ ] Etiquetas (impresión)
- [x] Tienda (config: activa, subdominio, publicados)
- [x] Dominio B2B (dominios + verificación)
- [x] Usuarios y Roles (usuarios: activar/roles; roles: ver)
- [x] Seguridad (2FA: activar/desactivar/regenerar respaldo)
- [x] Configuracion (tope de descuento)
- [x] Suscripcion (plan + facturas)
- [x] Automatizaciones (flows: activar/pausar/ejecutar)
- [x] Importador (guia de capacidades)
- [x] Guia de inicio (checklist onboarding)

## Notas
- Cada módulo reusa el kit UI en `apps/mobile-negocio/src/ui` + `theme.ts`.
- Gating por permisos en cada tab/acción (helper `puede`).
- Se rebuildeará el APK por tandas. Ver [[project_gaes_pos_movil_eas_builds]].

## Auditoría operativa — 8-sep-2026

No hay paridad acreditada. Bloqueos prioritarios constatados en código:

1. **Caja/cobro — avance local:** incorpora selección de sucursal/caja, verificación de apertura existente, cotización autoritativa y recuperación durable por identidad. Captura efectivo recibido y cambio; persiste el recibido real antes de enviar y reutiliza exactamente el mismo intento tras fallo ambiguo. No hay paridad total: apertura desde móvil, multipago y matriz nativa siguen pendientes.
2. **Restauración de identidad — corregida localmente:** La auditoría inicial encontró que `src/lib/auth-store.ts:restore` iniciaba sesión sin consultar `/auth/tenant/me`, dejando permisos nulos. La corrección ahora consulta `/auth/tenant/me`, valida tenant e identidad y recupera permisos, conserva credenciales con estado bloqueado/reintento ante fallo transitorio y limpia sesiones inválidas. Protege también logout frente a respuestas tardías y 401 de otra sesión. Pendiente prueba nativa de la pantalla de reintento. Se corrigió por separado la caché global de consultas que podía mostrar datos de la cuenta anterior: proveedor por sesión/tenant/usuario, cancelación y limpieza, incluidas respuestas tardías.
3. **Administración de productos — avance básico local:** La auditoría inicial encontró sólo lista/búsqueda en `app/(app)/productos.tsx`, sin alta/edición, y errores convertidos en lista vacía. Ahora incorpora alta unitaria y edición básica con permisos diferenciados, errores visibles/reintento y consulta tras fallo de escritura. La marca “Productos hecha” aún no representa paridad total.

Evidencia de la corrección de caché: `test/query-session.test.ts` prueba tenant A/B, empleados distintos, limpieza al terminar y respuesta tardía. No sustituye QA nativo ni valida cobro real; no hubo escrituras en producción.

Restauración validada con mocks: identidad/permisos, tenant ajeno, formato inválido, 401/403, red/503 y reintento, biometría cancelada/no disponible, token incompleto y respuesta tardía tras logout. ADR022.


## Alta/edición básica de productos — implementación local

- Crear: SKU, nombre, descripción corta, precio base, código de barras opcional e IVA (no aplica, tasa0,8,16), producto por pieza de una variante. No crea stock ni publicación ecommerce.
- Editar: nombre/descripción y precio base sólo de producto simple; conserva SKU, impuestos y configuración avanzada. Productos con variantes admiten información básica, sin cambiar un precio arbitrario. Consultar no exige permiso de editar; crear/actualizar tienen botones y guardias diferenciados.
- Catálogo paginado30, errores visibles y reintento; consulta detalle antes de editar. DTO móvil elimina costos/campos ajenos. Guardias evitan doble envío; error de escritura exige consulta antes de repetir y no presenta falso éxito.
- PATCH backend guarda producto y variante dentro de una TX; conflicto de SKU revierte todo. Variantes activas excluyen archivadas, sin ocultar productos inactivos del panel de gestión.
- Verificación: pruebas de DTO contra schemas reales, validación de precios/nombre/SKU, permisos, campos excluidos, no reintento automático, atomicidad API. QA nativo y dispositivos pendiente; no se afirma paridad completa ni producción.
- Pendientes: variantes, imágenes, categorías/marcas, edición de impuestos/SAT, costos/listas avanzadas, etiquetas, alta de productos por peso/lote/serie y publicación online. ADR024.


## Efectivo recibido y cambio — implementación local

- Recibido obligatorio, validado en centavos: sin formatos ambiguos, más de dos decimales ni importe inferior al total autorizado. Cambio calculado contra cotización vigente; se revalida antes del envío.
- Payload durable conserva `pagos[0].monto` real y `expectedTotal` del servidor. Timeout/reinicio/reenvío mantienen UUID y payload; resultado inconsistente en total, recibido o cambio conserva el bloqueo.
- Confirmación y recuperación muestran recibido/cambio del servidor. Al confirmar, cancelar intento o cambiar sucursal/caja se limpia la captura de efectivo.
- Verificación con mocks: recibido200/total150/cambio50, centavos, formatos inválidos, persistencia antes dePOST, reintento idéntico y conciliación de respuesta. Suite móvil95pruebas; tipos verificados. API200→50 ya cuenta con regresión aislada. QA visual y matriz nativa se acreditan por separado.


## Variantes en caja móvil

- Búsqueda muestra una opción por variante activa y no archivada, con nombre de presentación (o SKU), SKU y precio base informativo. Elegir una presentación agrega exactamente su `varianteId`; repetir sólo incrementa esa línea.
- Se excluyen productos inactivos/archivados, variantes inválidas y productos sin variantes. El total sigue calculado por la API de cotización; no se cobra con el precio mostrado en búsqueda.
- Pruebas de contrato y selección cubren dos variantes, predeterminada distinta a elegida, filtros, nombre alternativo y errores de precio. Sin cambios al DTO global backend. QA visual por separado.


## Bandeja de devoluciones online — revisión local

Móvil y admin exigen permiso de lectura para consultar y de devolución para mostrar/ejecutar acciones. Fallo de consulta muestra error y reintento, no lista vacía; admin descarta respuestas de filtros anteriores. Fallo comercial bloquea repetir en esa pantalla y muestra conciliación también en web, sin depender de Alert nativo. Este bloqueo no sustituye una clave durable entre reinicios.

Aprobación comercial sigue pendiente del contrato core: caja/apertura para efectivo, resolución atómica, recuperación durable y distinción entre reembolso registrado y ejecutado. No se cambiaron métodos ni DTO de aprobación; no se acredita operación de reembolso.
