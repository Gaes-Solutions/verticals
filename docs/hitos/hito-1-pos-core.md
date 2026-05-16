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
**Schema tenant:**
- [ ] `productos` (id, sku unique, codigo_barras, nombre, descripcion, marca, categoria_id, unidad_medida, peso, granel bool, requiere_serie bool, requiere_lote bool, activo, created_at, updated_at, deleted_at)
- [ ] `categorias` (id, parent_id, nombre, slug, orden, activa)
- [ ] `producto_variantes` (id, producto_id, sku unique, nombre, atributos jsonb, precio_base, costo_promedio, activo) — Shopify-style
- [ ] `producto_atributos` (id, producto_id, nombre, valores jsonb) — color/talla/sabor
- [ ] `inventario_sucursal` (producto_id, variante_id, sucursal_id, stock, stock_minimo, stock_maximo, ubicacion, updated_at) PK compuesta
- [ ] `inventario_movimientos` (id, producto_id, variante_id, sucursal_id, tipo enum, cantidad, costo_unitario, referencia_tipo, referencia_id, usuario_id, fecha, notas) — audit completo
- [ ] `lotes` (id, producto_id, variante_id, codigo_lote, fecha_vencimiento, cantidad_inicial, cantidad_actual, sucursal_id, created_at)
- [ ] `series` (id, producto_id, variante_id, numero_serie unique, sucursal_id, estado enum, created_at) — para electrónica/imei
- [ ] `precios_lista` (id, nombre, codigo unique, es_default, vigente_desde, vigente_hasta) — listas de precios
- [ ] `precios_producto` (producto_id, variante_id, lista_id, precio, precio_minimo, margen_minimo_pct) PK compuesta
- [ ] `precios_reglas` (id, nombre, tipo enum, condiciones jsonb, accion jsonb, prioridad, vigente_desde, vigente_hasta, activa) — descuentos por volumen, cliente, sucursal, etc.

**Migrations + seed demo:**
- [ ] Migration `tenant/migrations/NNN_add_products_inventory_pricing`
- [ ] Seed catálogo demo (10 productos retail variados con variantes para testing)
- [ ] Seed lista de precios `default`

**Package `packages/pricing/`:**
- [ ] Motor cascada **6 pasos**: (1) precio base lista → (2) lista cliente especial → (3) regla descuento volumen → (4) regla promoción vigente → (5) descuento manual cajero (con permiso) → (6) precio mínimo guard
- [ ] `calculatePrice(producto, contexto)` retorna `{precio_final, precio_original, descuentos: [...], aplicada_regla_id?}`
- [ ] Tests unit cobertura 100% del motor con casos del análisis 4.7

**API endpoints:**
- [ ] `productos/` — CRUD, búsqueda por SKU/código de barras/nombre (índices full-text), bulk import CSV (Eleventa)
- [ ] `productos/:id/inventario` — stock por sucursal, ajuste manual con motivo
- [ ] `productos/:id/precios` — precios por lista
- [ ] `categorias/` — CRUD árbol
- [ ] `precios-listas/` — CRUD
- [ ] `precios-reglas/` — CRUD
- [ ] `precios/preview` POST — calcula precio dado producto + contexto (cliente, sucursal, cantidad) para POS

**Tests integración:**
- [ ] Búsqueda producto P95 <100ms con 10k productos seed
- [ ] Motor de precios aplica cascada correctamente en casos retail
- [ ] Movimiento de inventario actualiza stock atómicamente
- [ ] Import CSV Eleventa de 1k productos en <10s

### 1.3 Modelo 4.9 — Ventas básicas + multi-pago + tickets
**Schema tenant (subset retail V1, sin apartados/CxC/devoluciones aún):**
- [ ] `ventas` (id, folio unique, sucursal_id, caja_id, usuario_id, cliente_id nullable, estado enum [borrador|cobrada|cancelada], subtotal, descuento_total, iva_total, ieps_total, total, moneda, canal enum [pos|ecommerce|mayoreo], created_at, cobrada_at, cancelada_at, cancelacion_motivo, cfdi_id nullable)
- [ ] `venta_items` (id, venta_id, producto_id, variante_id, lote_id nullable, serie_id nullable, cantidad, precio_unitario, precio_original, descuento_unitario, iva_unitario, ieps_unitario, subtotal_linea, total_linea, descuento_aplicado_regla jsonb, snapshot_producto jsonb) — snapshot inmutable
- [ ] `venta_pagos` (id, venta_id, metodo enum [efectivo|tarjeta_debito|tarjeta_credito|transferencia|vale|otro], monto, referencia, cambio_dado, terminal_referencia, autorizacion, created_at)
- [ ] `tickets_html` (id, venta_id, html, css, version_plantilla, generado_at) — template renderizado

**Migrations:**
- [ ] Migration `tenant/migrations/NNN_add_sales_payments_tickets`
- [ ] Migration default ticket template (HTML+CSS) en `configuracion_tenant` (anticipa modelo 4.20)

**Lógica state machine venta:**
- [ ] `package fiscal` (esqueleto solo Hito 1): cálculo IVA 16% / IVA frontera 8% según sucursal, IEPS por categoría
- [ ] Validación: suma `venta_pagos.monto` >= total (con cambio)
- [ ] Transacción atómica: decrementa inventario + crea movimientos + marca cobrada

**API endpoints:**
- [ ] `POST /ventas` (crear borrador con items)
- [ ] `PATCH /ventas/:id/items` (modificar líneas mientras borrador)
- [ ] `POST /ventas/:id/cobrar` (multi-pago, valida total, decrementa inventario en trx)
- [ ] `POST /ventas/:id/cancelar` (motivo obligatorio, reversa inventario)
- [ ] `GET /ventas/:id/ticket-html` (render con template)
- [ ] `GET /ventas` (lista con filtros: sucursal, caja, usuario, rango fechas, estado)

**Tests integración:**
- [ ] Venta completa decrementa stock atómicamente
- [ ] Multi-pago efectivo + tarjeta valida totales y calcula cambio
- [ ] Cancelación reversa inventario
- [ ] Checkout completo (sin CFDI) <500ms P95

### 1.4 Modelo 4.11 — Cortes X/Z con denominaciones MX
**Schema tenant:**
- [ ] `cortes_caja` (id, folio, sucursal_id, caja_id, usuario_id, tipo enum [x|z], apertura_at, cierre_at, fondo_inicial, ventas_efectivo_esperado, ventas_tarjeta_esperado, ventas_otros_esperado, contado_efectivo, contado_tarjeta, contado_otros, diferencia_efectivo, diferencia_tarjeta, observaciones, cerrado_por, created_at)
- [ ] `corte_denominaciones` (id, corte_id, denominacion, cantidad, subtotal) — 1000/500/200/100/50/20 billetes; 10/5/2/1/0.5 monedas
- [ ] `movimientos_caja` (id, caja_id, sucursal_id, usuario_id, tipo enum [apertura|venta|retiro|deposito|gasto|cierre], monto, metodo enum, referencia_tipo, referencia_id, notas, created_at)

**Migrations + lógica:**
- [ ] Migration `tenant/migrations/NNN_add_cash_register_closures`
- [ ] Corte X = consulta sin cerrar (puede haber N por turno)
- [ ] Corte Z = cierre obligatorio fin de turno, no editable después
- [ ] Plantilla impresa: ventas por método, retiros, depósitos, diferencias por denominación

**API endpoints:**
- [ ] `POST /cortes/apertura` (fondo inicial denominaciones)
- [ ] `GET /cortes/x` (corte consulta tiempo real)
- [ ] `POST /cortes/z` (cierre con denominaciones contadas + observaciones)
- [ ] `POST /cortes/movimientos` (retiro/depósito/gasto manual)
- [ ] `GET /cortes/:id/ticket-html` (template impresión corte)

**Tests integración:**
- [ ] Apertura caja registra fondo inicial
- [ ] Corte X muestra ventas del turno en curso sin cerrar
- [ ] Corte Z cierra turno, no permite modificación posterior
- [ ] Diferencias entre esperado y contado se calculan correctamente

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
