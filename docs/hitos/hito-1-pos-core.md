# Hito 1 — POS Core retail

**Duración estimada:** 4 semanas (semanas 3-6 del roadmap)
**Demo objetivo:** Cajero retail end-to-end (login → POS → cobro multi-pago → ticket → CFDI → corte Z) en staging Coolify
**Dependencias:** Hito 0 completo (infra base + api + auth + CI). Las 3 tareas externas (0.10/0.11/0.12) pueden completarse en paralelo a 1.1-1.4.

## Scope cerrado

Construir el **núcleo POS retail vendible** que reemplaza Eleventa para 1-2 clientes piloto retail. Cubre lo mínimo para operar un día completo en una tienda: usuarios + sucursales + cajas, catálogo de productos con inventario y precios, ventas con multi-pago, cortes X/Z con denominaciones MXN, emisión CFDI 4.0 vía Facturama, y bridge de impresión Tauri para tickets.

**Fuera de scope (van en hitos posteriores):**
- Clientes B2C/B2B, fiados, apartados, CxC formal, cotizaciones → Hito 2
- Promociones automáticas, lealtad, RFM → Hito 2
- Recargas, balanza, servicios → Hito 3
- Salud (consultas, hospitalización) → Hito 3
- Ecommerce, marketing campañas, Doctoralia → Hito 4
- Tauri desktop empaquetado firmado, sync offline completo → Hito 5
- Billing Stripe, partners, superadmin → Hito 6

## Verticales cubiertos al cierre del hito

- ✅ **Retail puro** (1 cliente piloto puede empezar)
- ⚠️ **Abarrotes** parcial (sin recargas/servicios todavía — Hito 3)
- ❌ Mayoreo, Vet, Humana, Contador → hitos siguientes

## Checklist

### 1.0 Doc del hito + STATUS + CHANGELOG
- [x] `docs/hitos/hito-1-pos-core.md` (este archivo)
- [x] STATUS.md actualizado: fase Hito 1, próximo paso 1.1
- [x] CHANGELOG.md entrada arranque Hito 1
- [x] Commit `chore(docs): arranca Hito 1 POS Core retail`

### 1.1 Modelo 4.6 — Usuarios + sucursales + cajas + RBAC
**Schema tenant** (`packages/db/prisma/tenant/schema.prisma`):
- [x] `usuarios` (id, email, password_hash argon2, nombre, apellidos, telefono, tipo_usuario, pin_hash, codigo_escaneo, is_active, terminated_at, last_login_at, created_at, updated_at) — MFA diferido a V1.5
- [x] `roles` (id, codigo unique, nombre, descripcion, is_preset, permisos jsonb default `[]`, is_active, created_at, updated_at) — permisos en jsonb (no tabla rol_permisos separada)
- [x] `usuario_roles` (usuario_id, rol_id, asignado_por, asignado_at) — scope por sucursal diferido (no necesario V1)
- [x] `sucursales` (id, codigo unique, nombre, tipo enum, direccion jsonb, telefono, email, timezone, is_default, is_active, created_at, updated_at)
- [x] `cajas` (id, sucursal_id, codigo unique, nombre, tipo enum, impresora_default, is_active, created_at, updated_at)
- [x] `usuario_vistas_guardadas` (id, usuario_id, modulo, nombre, filtros jsonb, is_default, created_at) — atajos personalizables
- [x] `usuario_sucursales` (usuario_id, sucursal_id, is_primary, created_at) — multi-sucursal por usuario

**Migrations + seed:**
- [x] Migration `tenant/migrations/20260515232059_add_users_branches_cashiers` aplicada cross-tenant
- [x] Seed preset roles: `dueno` (wildcard `*`), `gerente`, `cajero`, `vendedor`, `almacen`, `contador_interno` (permisos jsonb default)
- [x] Seed 1 sucursal `SUC-PRINCIPAL` + 1 caja `CAJA-1` al crear tenant nuevo (`seedTenantDefaults` idempotente, llamado en `createTenant`)
- [x] CLI: `gaes-migrate tenant seed <slug>` y `tenant seed-all` para tenants pre-existentes

**Package `packages/permissions/`:**
- [x] Catálogo tipado de 56 permisos (`PERMISSIONS` const, `PermissionCode` type, `listPermissionsByCategory`, `isKnownPermission`)
- [x] `hasPermission(perms, code)`, `hasAnyPermission`, `requirePermission` con `PermissionDeniedError` (statusCode=403, missing[])
- [x] `mergeRolePermissions` colapsa a `["*"]` si algún rol tiene wildcard
- [x] `PRESET_ROLES_RETAIL` con 6 roles seed
- [x] Tests cubiertos en suite integración (gates por rol)

**API endpoints (`apps/api/src/modules/tenant/`):**
- [x] `usuarios/` — CRUD + asignar/quitar rol + asignar sucursal + reset-password
- [x] `roles/` — CRUD roles custom; preset roles read-only (PATCH/DELETE → 403); permisos validados contra catálogo (400 si desconocido)
- [x] `sucursales/` — CRUD con permisos `sucursales.{leer,crear,actualizar,archivar}`
- [x] `cajas/` — CRUD con validación sucursal existe (404)
- [x] Todos montados bajo `/t` prefix; tenant slug derivado del JWT claim `tenantSlug` + `kind:"tenant"` (no header)
- [ ] `vistas-guardadas/` — diferido a 1.7 (cuando POS UI las consuma)

**Auth tenant + plugin contexto:**
- [x] JWT discriminado `kind:"admin"|"tenant"`; decoradores `authenticateAdmin`/`authenticateTenant` validan kind
- [x] `POST /auth/tenant/login` valida `{tenantSlug,email,password}`, carga roles+permisos efectivos, firma JWT con principal
- [x] `GET /auth/tenant/me` retorna `{userId,email,tenantSlug,isOwner,permissions}`
- [x] Plugin `tenantContextPlugin` decora `req.tenantPrisma/tenantSlug/principal/requirePerm()/requireAnyPerm()`
- [x] Tenant client cache LRU 50 default (`@gaespos/db`: `getTenantClient/disconnectAllTenantClients`)
- [x] Error handler: `PermissionDeniedError → 403` con `missing`; Prisma errors detectados por duck-typing (cross-generator)

**Tests integración:**
- [x] 21 tests nuevos en `tenant-rbac.test.ts`: auth tenant (4) + sucursales CRUD con gates (5) + cajas CRUD (3) + roles CRUD bloqueando preset (4) + usuarios CRUD con duplicate-email/validation (5)
- [x] Cajero sin permiso recibe 403 con `missing` correcto; dueno wildcard accede a todo
- [x] Total suite: **41 tests verdes en 6.61s** (38 anteriores + 21 nuevos − 18 unit packages/db ya contados)

### 1.2 Modelo 4.7 — Productos + variantes + inventario + motor precios
**Schema tenant** (`packages/db/prisma/tenant/schema.prisma`):
- [x] `productos` con flags fiscales completos MX (claveSat, aplicaIva/tasaIva, aplicaIeps/tasaIeps jsonb, permite*, requires_lote/serie/balanza, archivedAt soft-delete)
- [x] `categorias` (árbol auto-ref via parentId, slug único, isVisiblePos/Publico)
- [x] `producto_variantes` (Shopify-style, opciones jsonb, isDefault, precioBase/costoPromedio/costoUltimo)
- [x] `producto_codigos_barras` (multi-barcode por variante con tipo ean13/upc/corto_interno/qr)
- [x] `producto_imagenes`, `producto_atributos` (custom JSONB), `producto_tags`
- [x] `inventario_sucursal` (PK compuesta varianteId+sucursalId, DECIMAL 18,3 stockActual+Reservado+Min+Max para granel)
- [x] `inventario_movimientos` (append-only, enum tipo completo, referencia polimórfica, usuarioId actor)
- [x] `producto_lotes` (fechaCaducidad, cantidadInicial/Actual por sucursal)
- [x] `producto_series` (numeroSerie único, estado enum, garantiaHasta)
- [x] `niveles_precio_mayoreo`, `listas_precios` (tipo enum publico/mayoreo_nivel/cliente_individual)
- [x] `lista_precio_items` (PK compuesta, **precioMinimoNegociacion** opcional)
- [x] `producto_precios_escalonados` RF-02 (hasta 5 niveles, unique varianteId+nivel)
- [x] `reglas_precio` motor de promos (condicion/accion jsonb, prioridad, stackable, excluyeProductosConEscalonado, vigencia, dias_semana/horarios)
- [x] `regla_precio_productos` + `regla_precio_categorias` join tables
- [x] `cupones_tenant` (jsonb productos/categorias/clientes aplicables, usos, vigencia)
- Diferidos a V1.5: pgvector búsqueda semántica, particionamiento mensual movimientos, triggers postgres `stock_disponible`/`costo_promedio` (se computan en código)

**Migrations + seed defaults:**
- [x] Migration `20260516025507_add_products_inventory_pricing` generada via shadow schema postgres temporal (`prisma migrate diff --from-url`) y aplicada cross-tenant
- [x] Seed extendido: `seedTenantDefaults` crea lista `PUBLICO` default por tenant (idempotente)
- Diferido a 1.7 demo: catálogo demo de 10 productos retail (cuando empiece UI POS)

**Package `packages/pricing/`** (nuevo workspace):
- [x] Motor cascada **6 pasos puro** con Decimal.js:
  - `calcularLinea` → pasos 1 escalonado RF-02 / 2 lista cliente con `precioMinimoViolado` flag / 3 reglas línea (descuento_producto/categoria/cliente/precio_temporada) con stackable + excluyeProductosConEscalonado
  - `calcularTicket` → pasos 4 mayoreo_por_total_ticket / 5 cupón / 6 descuento manual del cajero
- [x] Tipos exportados (`LineaPrecioInput`, `CalcularTicketInput`, `ReglaPrecioInput`, `CuponInput`, `DescuentoAplicado` con paso 1-6, `TicketCalculado`)
- [x] **16 tests unit** cubriendo cada paso + cascada completa + edge cases

**API endpoints `/t/*`:**
- [x] `/t/categorias` CRUD árbol, valida parentId, bloquea self-parent (400), bloquea archivar si tiene productos (409)
- [x] `/t/marcas` CRUD con misma protección
- [x] `/t/productos` POST crea producto + variante default + barcode autocreados; GET lista paginada con búsqueda multi-criterio (nombre/sku/barcode); **GET `/buscar/:codigo`** lookup rápido barcode → SKU variante → SKU padre; PATCH/DELETE
- [x] `/t/variantes` POST/PATCH con swap isDefault automático + auto-promote `tieneVariantes`; bloquea archivar default (409); sub-endpoints `:id/codigos-barras`
- [x] `/t/inventario` GET lista paginada con `stockBajoMinimo`; GET detalle por varianteId/sucursalId; PATCH stockMin/Max
- [x] `/t/inventario/ajustes` POST atómico transaction `aplicarAjuste` con motivo audit
- [x] `/t/inventario/transferencias` POST atómico cross-sucursal con 2 movimientos vinculados
- [x] `/t/inventario/movimientos` GET audit DESC con filtros
- [x] `/t/lotes` CRUD con filtro `caducaAntes`
- [x] `/t/series` CRUD con filtro `estado`
- [x] `/t/precios/listas` + `/listas/:id/items` PUT upsert / DELETE
- [x] `/t/precios/escalonados` POST/DELETE
- [x] `/t/precios/reglas` CRUD con productos/categorias many-to-many, soft-archive
- [x] `/t/precios/cupones` CRUD
- [x] **POST `/t/precios/preview`** ⭐ recibe `{lineas, clienteId?, listaPrecioCodigo?, cuponCodigo?, descuentoGlobalPct?}` → carga datos tenant → `calcularTicket` → devuelve `TicketCalculado` con descuentos paso-a-paso. `PreviewError` mapeado a 404/409.
- Diferido a 1.2.e (cuando UI lo necesite): imágenes (S3+thumbnails), atributos custom JSONB, tags, bulk import CSV Eleventa

**Tests integración:**
- [x] `tenant-catalogo.test.ts`: 23 tests (categorías árbol con padre+hijo+inexistente+slug dup+self-parent, marcas owner/cajero, productos con variante+barcode auto, sku dup, categoriaId inexistente, búsqueda barcode/SKU/inexistente, paginación, búsqueda q full-text, cajero puede listar pero no crear, agregar variante, archivar default → 409, segundo barcode lookup, PATCH flags fiscales)
- [x] `tenant-inventario.test.ts`: 14 tests (ajuste+/-, merma, excede stock → 409, cajero forbidden, PATCH min/max upsert, transferencia atómica + 2 mov, origen=destino → 400, stock insuficiente sin mutar, audit DESC, lotes filtrar+ordenar caducidad, series numeroSerie dup → 409)
- [x] `tenant-precios.test.ts`: 15 tests incluyendo **preview end-to-end** (base 20, lista 18.5, escalonado 17 override lista, cupón 10%, descuento manual 5%, variante 404, cupón 404, regla activar/desactivar/dup)
- Diferido a 1.7 demo: P95 búsqueda <100ms con 10k productos seed (después de catálogo demo)
- Diferido a V1.5: import CSV Eleventa 1k en <10s

**Total cierre 1.2: 93 tests API + 22 permissions + 16 pricing + 18 db = 149 verdes en ~12s**

### 1.3 Modelo 4.9 — Ventas básicas + multi-pago + tickets
**Schema tenant (subset retail V1, sin apartados/CxC/devoluciones aún):**
- [x] `ventas` (folio único per-sucursal, sucursal/caja/usuario/cliente, estado, canal, todos los totales desglosados, listaPrecioCodigo+cuponCodigo persisted, cfdiId nullable, canceladaMotivo/Por/At)
- [x] `venta_lineas` (numero per-venta, productoId+varianteId+lote/serie, cantidad+precioUnit+precioOriginal+descuentoUnit+iva/ieps desglosado, `descuentosAplicados jsonb` paso-a-paso, `snapshotProducto jsonb` inmutable)
- [x] `venta_pagos` (metodo enum efectivo/tarjeta_debito/tarjeta_credito/transferencia/vale/monedero/otro, referencia/autorizacion/terminalReferencia/ultimosCuatro)
- [x] `venta_folio_counters` (PK sucursalId, counter atómico via upsert+increment) — alternativa elegida sobre tickets_html porque el template HTML/CSS se difiere a 1.6 Print Bridge (los datos del ticket están todos en GET `/:id`)

**Migrations:**
- [x] Migration `tenant/migrations/20260516040000_add_sales_payments_tickets` generada via shadow schema + aplicada cross-tenant
- Diferido a 1.6: template HTML/CSS configurable (cuando Print Bridge Tauri esté listo)

**Lógica state machine venta** (`apps/api/src/modules/tenant/ventas/service.ts`):
- [x] `calcularImpuestosLinea`: asume precios CON IVA (default MX retail), desglosa `iva = total - total/(1+tasa/100)`. IEPS retorna 0 (V1 diferido)
- [x] `validarPagos`: suma pagos ≥ total + cambio requiere al menos un pago efectivo
- [x] **Transacción atómica `persistirVenta`**: nextFolio counter → `descontarStockLineas` reusando `aplicarAjuste` con tipo `ajuste_negativo` → insertar Venta + Lineas + Pagos
- [x] `cancelarVenta`: en transaction reinserta stock con `ajuste_positivo` por cada línea, valida estado=cobrada (409 si ya cancelada o borrador)
- Diferido a Hito 1.7+: paquete `fiscal` con IVA frontera 8% (V1 toma tasaIva del producto directamente)

**API endpoints:**
- [x] `POST /t/ventas` cobro atómico (sin estado borrador V1 — el POS calcula con `/t/precios/preview` y luego cobra en un solo POST)
- [x] `POST /t/ventas/:id/cancelar` con motivo obligatorio (permisos VENTAS_CANCELAR)
- [x] `GET /t/ventas` lista paginada con filtros sucursal/caja/usuario/cliente/estado/canal/folio/desde/hasta
- [x] `GET /t/ventas/:id` detalle full con líneas+pagos+canceladaPor
- Diferido a 1.6: `GET /ventas/:id/ticket-html` (Print Bridge render)
- Diferido a Hito 2: `PATCH /:id/items` borrador editable (V1 no hay carrito persistido server-side, el POS lo mantiene en cliente hasta cobrar)

**Tests integración:**
- [x] 15 tests `tenant-ventas.test.ts`: cobro simple folio formato `SUC-PRINCIPAL-{000001}`, folio incrementa correlativo, stock descontado atómicamente, IVA desglosado 16% correcto, multi-pago tarjeta+efectivo con cambio, pagos insuficientes→400, cambio sin efectivo→400, stock insuficiente→409 sin mutar, snapshot preserva nombre tras modificar producto, cajaId fuera de sucursal→400, listado filtrado, cancelación devuelve stock, doble cancelación→409, cajero sin VENTAS_CANCELAR→403
- Diferido a 1.7: P95 checkout <500ms con benchmark (necesita catálogo demo + load test)

**Total cierre 1.3: 108 tests API + 22 permissions + 16 pricing + 18 db = 164 verdes en ~12s**

### 1.4 Modelo 4.11 — Cortes X/Z con denominaciones MX
**Schema tenant:**
- [x] `caja_aperturas` (cajaId+sucursalId+usuarioId, montoInicial, estado [abierta|cerrada], cerradaAt/Por/Forzosa, observaciones)
- [x] `caja_movimientos` (8 tipos: entrada_fondo/prestamo/devolucion/otro, salida_retiro/gasto/deposito/otro)
- [x] `cortes` (tipo X|Z + numero per-apertura unique, desdeAt/hastaAt, ventasCount/Canceladas/Total, efectivoEsperado/Contado/Diferencia, desglosePorMetodo jsonb, desgloseMovimientos jsonb, **denominaciones jsonb** estructura billetes 1000/500/200/100/50/20 + monedas 20/10/5/2/1/0.50)

**Migrations + lógica:**
- [x] Migration `20260517010000_add_caja_aperturas_cortes` aplicada cross-tenant
- [x] Corte X = consulta sin cerrar (puede haber N por turno; acumulado desde apertura, no diferencial)
- [x] Corte Z = cierre obligatorio fin de turno; setea apertura.estado=cerrada; bloquea ventas hasta nueva apertura
- [x] Arqueo automático: ventas efectivo + entradas - salidas - cambios = efectivoEsperado; diferencia=contado−esperado (positivo=sobrante, negativo=faltante)
- Diferido a 1.6: plantilla impresa Print Bridge

**API endpoints:**
- [x] `POST /t/cajas/:cajaId/aperturar` (CAJA_ABRIR; rechaza segunda apertura activa con 409)
- [x] `GET /t/cajas/:cajaId/apertura-actual` (CORTE_CONSULTAR; 404 si no hay)
- [x] `POST /t/caja-movimientos` (CAJA_MOVIMIENTO_CREAR; bloquea sobre apertura cerrada)
- [x] `POST /t/cortes` con tipo X|Z + denominaciones contadas + observaciones (CAJA_CERRAR para Z, CAJA_CERRAR_FORZOSO para forzar)
- [x] `GET /t/cortes` + `GET /t/cortes/:id` con filtros sucursal/caja/usuario/tipo/desde/hasta
- [x] **Integración cross-módulo**: `crearVenta` ahora invoca `requireAperturaAbierta` si la venta lleva `cajaId` (devuelve 409 si caja sin apertura)
- Diferido a 1.6: `GET /cortes/:id/ticket-html`

**Tests integración:**
- [x] 17 tests en `tenant-cortes.test.ts`: apertura (5) + movimientos (2) + corte X (3) + corte Z (6) + permisos (1) cubriendo flujo completo:
  - apertura → ventas → préstamo + gasto → corte X arqueo 0 → más ventas → corte Z faltante → bloqueo ventas → nueva apertura → ventas OK
  - Bug fix descubierto: `nextCorteNumero` filtraba por tipo pero unique es global (aperturaId, numero); fix global

**Total cierre 1.4: 125 tests API + 22 permissions + 16 pricing + 18 db = 181 verdes en ~14s**

### 1.5 Modelo 4.19 — CFDI 4.0 + Facturama + autofacturación QR
**Schema tenant + master SAT:**
- [ ] `cfdis` (id, venta_id nullable, tipo enum [ingreso|egreso|nomina|pago|traslado], folio_interno, uuid_sat, fecha_emision, fecha_timbrado, emisor_rfc, receptor_rfc, receptor_nombre, uso_cfdi, regimen_fiscal, forma_pago, metodo_pago, moneda, tipo_cambio, subtotal, descuento, total, xml_path, pdf_path, estado enum [borrador|emitido|cancelado|error], cancelacion_motivo, cancelado_at, created_at)
- [ ] `cfdi_relacionados` (cfdi_id, cfdi_relacionado_uuid, tipo_relacion)
- [ ] `cfdi_conceptos` (id, cfdi_id, clave_prod_serv, no_identificacion, descripcion, cantidad, unidad, valor_unitario, importe, descuento, impuestos jsonb)
- [ ] Tablas master SAT (`packages/sat-catalogos`): `sat_uso_cfdi`, `sat_regimen_fiscal`, `sat_forma_pago`, `sat_metodo_pago`, `sat_clave_prod_serv`, `sat_clave_unidad`, `sat_pais` — seed con catálogos oficiales SAT
- [ ] `autofactura_tokens` (id, venta_id, token unique, expira_at, usado_at, ip_uso) — para QR ticket

**Package `packages/fiscal/`:**
- [ ] Wrapper Facturama V4 API (REST): `emitirCfdi(params)`, `cancelarCfdi(uuid, motivo)`, `descargarPdf(uuid)`, `descargarXml(uuid)`
- [ ] Validaciones pre-timbrado: RFC válido, datos receptor completos, conceptos con clave SAT
- [ ] Lógica selección IVA: 8% si sucursal es zona frontera, 16% resto
- [ ] Tests con MSW mock Facturama (no llamar API real en CI)

**API endpoints:**
- [ ] `POST /ventas/:id/cfdi` (emite CFDI desde venta, requiere datos receptor)
- [ ] `POST /cfdis/:id/cancelar` (motivo SAT obligatorio)
- [ ] `GET /cfdis/:id/pdf` y `/xml`
- [ ] `GET /cfdis` (lista con filtros)
- [ ] **Endpoint público** `POST /autofactura/:token` (cliente captura RFC desde QR del ticket, emite CFDI sin requerir cuenta)
- [ ] `GET /autofactura/:token` (ver datos venta para previsualizar)

**Tests integración:**
- [ ] Emisión CFDI desde venta cobrada genera UUID válido (mock Facturama)
- [ ] Token autofactura expira en 72h por defecto
- [ ] Cancelación CFDI <72h sin motivo aprobación; >72h requiere motivo + aceptación
- [ ] Timbrado CFDI P95 <3s (con mock)

### 1.6 Print Bridge Tauri V1
**Servicio `apps/print-bridge/`:**
- [ ] Proyecto Tauri Rust + sidecar HTTP local 127.0.0.1:9100
- [ ] Endpoint `POST /print/ticket` recibe `{html, css, impresora?, ancho_mm?}` → renderiza a ESC/POS → manda a impresora
- [ ] Endpoint `GET /print/impresoras` lista impresoras disponibles (USB + red)
- [ ] Driver Epson TM-T20III (USB) y TM-T88VI (red) certificados
- [ ] Auto-detect impresora default por config local
- [ ] Healthcheck `GET /health`

**Integración API → Bridge:**
- [ ] Web POS hace `fetch('http://127.0.0.1:9100/print/ticket', {body: html})` al cobrar
- [ ] Fallback PDF descarga si bridge no responde
- [ ] Endpoint `apps/api` `GET /tickets/:venta_id/render` retorna `{html, css}` para envío al bridge

**Tests:**
- [ ] Unit test renderer ESC/POS
- [ ] Manual test con impresora real (Epson TM-T20III en escritorio Gaby)

**Nota:** El empaquetado firmado/notarizado del Tauri shell completo va en Hito 5. En Hito 1 basta con que corra local con `cargo tauri dev` para demo.

### 1.7 Demo cajero retail end-to-end
- [ ] Flujo completo grabado (GIF/MP4 <2min):
  1. Login cajero (`cajero@demo.gaessoft.local`)
  2. Apertura de caja con fondo inicial
  3. Búsqueda y captura de 3-5 productos (incluir 1 variante)
  4. Aplicación de descuento manual (con permiso)
  5. Cobro multi-pago efectivo + tarjeta
  6. Impresión ticket por print bridge
  7. Cliente escanea QR del ticket → autofacturación → CFDI emitido
  8. Corte Z con denominaciones
- [ ] Video subido a `docs/demos/hito-1-cajero-retail.mp4`
- [ ] Actualizar STATUS.md, CHANGELOG.md, memorias
- [ ] Tag git `hito-1-pos-core-v1`
- [ ] **Hito vendible:** invitar a 1-2 clientes piloto retail a probar staging

## Decisiones tomadas en este hito (candidatas a ADR)

- Pendientes hasta que surjan. Si aparece algo arquitectónico relevante, abrir ADR `013+`.

## Bloqueos esperados / riesgos

1. **Facturama PAC requiere cuenta de pruebas** — Gaby debe gestionar credenciales sandbox antes de 1.5
2. **Impresora física para test del bridge** — si Gaby no tiene una Epson en mano, mockear con printer-emulator
3. **Catálogos SAT pesados** (claves prod-serv ~52k) — decidir si embeber en seed o cargar bajo demanda
4. **Decisión multi-RFC**: V1 soporta un RFC por tenant; multi-RFC viene en 4.19 pero puede diferirse a Hito 2 si complica

## Performance targets a verificar en cierre del hito

- [ ] Búsqueda producto P95 <100ms (con 10k productos seed)
- [ ] Agregar línea a venta P95 <50ms
- [ ] Checkout completo sin CFDI P95 <500ms
- [ ] Timbrado CFDI P95 <3s (con Facturama sandbox)
- [ ] Corte Z con denominaciones <1s

## Cómo retomar este hito

1. Releer `STATUS.md` — tarea actual y próximo paso
2. Releer este archivo — checklist de la tarea actual
3. Si dudas de modelo: `docs/analisis/04-modelo-datos/4.X-*.md`
4. Si dudas de stack/arquitectura: `docs/analisis/09-arquitectura.md`
5. Si dudas de regla MX: `docs/analisis/05-reglas-mx.md`
