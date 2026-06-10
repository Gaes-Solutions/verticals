# 🔖 STATUS — Checkpoint vivo

> **Cómo usar:** Claude actualiza este archivo al final de cada sesión productiva. Si una sesión se trunca o hay que retomar después, este archivo dice exactamente dónde quedamos.

**Última actualización:** 2026-06-10

## 🎯 Estado actual

- **🛍️ Tienda online "100%" (2026-06-10)**: 3 features que cierran el ciclo post-compra estilo Mercado Libre. (1) **Devoluciones desde la tienda con aprobación** — modelo `SolicitudDevolucion` (flujo `solicitada→aprobada|rechazada`); el cliente la pide en `/cuenta/pedidos/[folio]` (motivo + qué artículos), el negocio la atiende en web-admin → **Devoluciones** (bandeja, aprobar/rechazar, perm `ventas.devolver`); al aprobar **reusa `procesarDevolucion` del POS** contra la venta ligada (`ventaIdGenerada`): repone stock + reembolso + CFDI Egreso opcional, y marca el pedido `reembolsado`. (2) **Mensajería pedido↔cliente** — modelo `MensajePedido`, hilo en el detalle del pedido (cliente) y en el modal admin; cada mensaje notifica a la otra parte (al responsable si está asignado). (3) **Real-time SSE** — bus in-process (`src/realtime/bus.ts`, canales `u:<id>`/`c:<id>`), endpoints `GET /t/notificaciones/realtime` y `/cliente-portal/realtime`; las campanas (admin fetch-stream con Bearer, tienda EventSource vía proxy Next) reciben push al instante, polling queda de respaldo. Migración `add_devoluciones_online_mensajes`. **Suite apps/api verde (+10: devolución solicitud→aprobación+stock, mensajería ida/vuelta, bus SSE).**
- **📬 Pulido flujo pedidos online estilo Mercado Libre (2026-06-09)**: sobre el ecommerce existente. (a) **Estados con vocabulario configurable por tenant** — los estados internos canónicos se mantienen; el dueño renombra sus etiquetas (ej. `preparando`→"Surtido", `en_camino`→"En proceso") desde web-admin → "⚙ Personalizar estados" (perm `ecommerce.configurar`). Fuente única: la API sirve las etiquetas (`config_ecommerce` singleton), ningún front las hardcodea. (b) **Asignar pedido a empleado que lo surte** — campo `asignadoA` + `PATCH /t/pedidos-ecommerce/:id/asignar` + selector "Asignarme" en el modal (perm `ecommerce.pedidos_gestionar`), con evento interno. (c) **Timeline visual ML-style para el cliente** — nueva página `/cuenta/pedidos/[folio]` con stepper de hitos (completados+fechas) según método de entrega + guía; `GET /cliente-portal/pedidos/:folio`. (d) **Notificaciones in-app (campana)** — modelo `Notificacion` polimórfico (usuario|cliente) + endpoints tenant (`/t/notificaciones`) y cliente (`/cliente-portal/notificaciones`); campana con polling en web-admin (nuevo pedido pagado + pedido asignado) y en web-tienda /cuenta (cambios de estado). Emails se mantienen. Migración `add_pedidos_online_pulido`. **Suite apps/api 586 verde (+15).**
- **Fase**: 🎉 Hitos 1-6 · 🏷️ tag `retail-v1` · 🏢 vertical B2B mayoreo (web-b2b) · 🎨 **estándar visual compartido** (packages/ui + docs/design-system.md) + responsive en las 4 apps · ⬆️ **CARGA MASIVA (2026-06-06)**: import Excel/CSV de productos + precios + conteo físico de inventario, con plantilla descargable, preview y reporte fila-por-fila. Suite 562 verde.
- **👤 cuenta cliente B2C (2026-05-28, wishlist 2026-06-05)**: passwordHash en Cliente + auth `/auth/cliente/{registro,login}` (JWT kind `cliente`, resuelve tenant del token) + `/cliente-portal/{me,pedidos,wishlist}` (pedidos por clienteId O email guest). Frontend web-tienda: cookie httpOnly + páginas /cuenta/{login,registro} + /cuenta (mis pedidos + **mi lista de deseos** con quitar) + botón **♡ Guardar** en producto (401→login) + **prefill email/nombre en checkout** si hay sesión. 13 tests backend + smoke E2E verde. Ya NO hay diferidos de la cuenta cliente.
- **🖥️ web-admin (2026-05-28)**: back-office del negocio (SPA Vite+React+Tailwind, login dueño/gerente). 6 secciones: **Resumen** (ventas hoy + alertas bajo stock), **Reportes** (periodo 7/30/90d: gráfica barras por día SVG, ticket promedio, IVA, top productos, por canal), **Productos** (CRUD), **Inventario** (ver + ajustar), **Ventas** (filtros + detalle), **Tienda online** (config + publicar). Backend: módulo `tenant/reportes` (GET /t/reportes/resumen?dias=N, agregación Prisma, 5 tests). Conecta a la API real. Build verde (web-admin 224kB). **PROBAR**: `pnpm --filter @gaespos/web-admin dev` → http://localhost:5174 (guía en `apps/web-admin/README.md`).
- **🖥️ web-pos (2026-05-28)**: SPA Vite+React+Tailwind, **primer frontend del producto que vende de verdad**. Login cajero → buscar producto (texto/barcode) → ticket → **cliente (buscar/alta)** → **descuento global** → cobro multi-pago → comprobante con **imprimir ticket 58mm + facturar CFDI best-effort**; **corte de caja X/Z** + **devoluciones** (busca folio → devuelve parcial/total, repone stock) desde el header. Conecta a la API real. Verificado con smoke tests curl (venta+descuento, devolución parcial+stock, corte X/Z diferencia, cliente). Build verde (225kB). **PARA PROBAR YA**: API mock → setup `apps/web-pos/README.md` → `pnpm --filter @gaespos/web-pos dev` → http://localhost:5173.
- **Progreso Hito 5 packaging (2026-05-28)**: 🎉 **`@gaespos/sync-client` ✅** (cerebro offline: SyncClient push/pull/network workers + InMemoryStorage + OperationBuilder, 15 tests) + `GET /t/sync/heartbeat` + scaffolds `apps/pos-desktop` (Tauri conf/Cargo/main.rs/migrations) y `apps/pos-pwa` (Next.js PWA + ZXing scanner, build verde). Build nativo firmado + SqliteStorage/IndexedDbStorage diferidos a máquina con Rust/certs.
- **Progreso Hito 6**: 🎉 **Billing core (núcleo) ✅** — schema billing master (Subscription/Invoice/Coupon/PlanFeature/PlanPrice/TenantUserAdmin/etc.) + 5 planes seed MXN+USD + paquete `@gaespos/billing` (prorrateo Stripe-style + cupones + dunning 1/3/7d, 14 tests) + `/auth/signup` público + `/billing/*` endpoints + workers trial-conversion + dunning + CFDI uuid stub + 12 tests integración + demo `demo:saas-onboarding` verde. **Suite apps/api 498 tests verde.**
- **Tarea actual**: commitear núcleo billing (rama→main ff). Hito 6 fase 2 diferida: admin panel `apps/admin-gaessoft`, CFDI timbrado real Facturama, IA superadmin (health score, onboarding asistido, sentiment).
- **Decisión Hito 6 (2026-05-28)**: núcleo = billing core self-serve (100% testeable: signup→trial→cobro→upgrade→dunning→CFDI mock); admin panel separado + CFDI real + IA superadmin + tenants padre-hijo despacho activos diferidos.
- **Cómo probar el billing**: 1) `FISCAL_PROVIDER=mock RECARGA_PROVIDER=mock pnpm dev:api` · 2) `pnpm --filter @gaespos/api demo:saas-onboarding` → cupón→signup→tarjeta→upgrade prorrateado→trial vence→cobra+CFDI→webhook→dunning 3 fallos→SUSPENDED, en verde.
- **Diferido de 4.4 a fase 2/V1.5**: booking cross-tenant + anti-no-show + telemedicina Daily.co + fee 5%, pet PHR (pet_master/pet_records), wearables Apple/Google Health, cifrado pgcrypto AES-256+KMS, embeddings pgvector + IA al paciente (anonimización pre-LLM), export HL7 FHIR real, storage 10GB, frontend `apps/salud-paciente`.
- **Cómo probar la tienda (PRIMER FRONTEND)**: 1) `RECARGA_PROVIDER=mock FISCAL_PROVIDER=mock pnpm dev:api` · 2) sembrar tienda demo (ver abajo) · 3) `cd apps/web-tienda && cp .env.example .env.local && pnpm dev` → abrir http://localhost:3001 → catálogo → producto → carrito → checkout (pago mock) → seguimiento. Backend probado con 413 tests; frontend compila (build verde) y arranca.
- **Tenant tienda demo**: slug `tienda-demo`, dueño `tienda@demo.mx`/`Tienda!2026`, 3 productos publicados con stock (creados via curl en sesión 2026-05-26; re-sembrar si se limpió la DB).
- **Decisiones Hito 4 (2026-05-26)**: orden Ecommerce→Marketing→Doctoralia→Portal paciente; tienda Next.js real; integraciones mock adapters V1; email Resend. Ver [`docs/hitos/hito-4-digital.md`](docs/hitos/hito-4-digital.md).
- **Bloqueos**: Ninguno mid-código. Externos pendientes: Hetzner/dominio/GitHub (no bloquean código local).

## 📋 Hito 1 — POS Core retail · Progreso

Ver checklist completo en [`docs/hitos/hito-1-pos-core.md`](docs/hitos/hito-1-pos-core.md).

- [x] **1.0 Doc del hito + STATUS + CHANGELOG**
- [x] **1.1 Modelo 4.6 Usuarios + sucursales + cajas + RBAC**
- [x] **1.2 Modelo 4.7 Productos + variantes + inventario + motor precios**
- [x] **1.3 Modelo 4.9 Ventas básicas + multi-pago + tickets**
- [x] **1.4 Modelo 4.11 Cortes X/Z con denominaciones MX**
- [x] **1.5 Modelo 4.19 CFDI 4.0 + Facturama + autofacturación QR** (autofactura pública diferida a 1.5.c — endpoints tenant cerrados)
- [x] **1.6 Print Bridge Tauri V1 (Epson TM-T20III/T88VI)** (1.6.a contrato JSON + endpoints backend; 1.6.b ESC/POS Rust real cuando Gaby tenga TM-T20III)
- [x] **1.7 Demo cajero retail end-to-end** — CLI script verificado que ejecuta los 16 pasos del flujo completo: login admin→tenant→cajero→config CFDI→catálogo+stock→apertura caja→búsqueda barcode→preview→cobro multi-pago→CFDI Mock→ticket JSON→movimientos→corte X→venta extra→corte Z→bloqueo post-Z

## 📋 Hito 0 — Infra base · Progreso

Ver checklist completo en [`docs/hitos/hito-0-infra.md`](docs/hitos/hito-0-infra.md).

- [x] **0.1 Estructura de continuidad** (CLAUDE.md, STATUS.md, docs/)
- [x] **0.2 Migrar 10 análisis al repo** (37 archivos en `docs/analisis/`: 2 raíz + 10 flujos + 18 sub-modelos + 6 técnicos + INDEX)
- [x] **0.3 Migrar 12 ADRs** desde Análisis 9 (`docs/adr/001-012`)
- [x] **0.4 Setup monorepo Turborepo + pnpm workspaces** (turbo 2.9.6, typescript 5.9.3, pnpm 10.33.2, Node 22 target, git init main)
- [x] **0.5 Biome + commitlint + Husky + lint-staged + tsconfig.json** (Biome 1.9.4, husky 9.1.7, commitlint 19.8.1, lint-staged 15.5.2)
- [x] **0.6 Package `db/` con Prisma + schema master** (Prisma 6.19.3, Postgres 16-alpine, Redis 7-alpine en docker-compose, schema master con plans/tenants/audit_log, seed con 4 planes, tenant.template.prisma vacío)
- [x] **0.7 CLI `gaes-migrate`** (commander 13 + pg 8 + execa 9; comandos master/tenant create/migrate/migrate-all/list; reorganización prisma/master + prisma/tenant para historial separado)
- [x] **0.8 App `api/` con Fastify + JWT auth** (Fastify 5 + helmet + cors + rate-limit + jwt + cookie + sensible; AdminUser/RefreshToken en master; argon2 password hashing; modules health/auth/tenants; E2E verificado)
- [x] **0.9 CI GitHub Actions + tests integración** (Vitest 2.1.9; 38 tests verdes: 18 unit utils + 20 integración auth/tenants/health con Postgres real; workflows pr.yml con services postgres+redis y main.yml placeholder deploy)
- [ ] 0.10 Hetzner CPX31 + Coolify install + dominio staging
- [ ] 0.11 Primer commit + PR + merge + deploy verde
- [ ] 0.12 Demo Hito 0: login admin + crear tenant + listar tenants

## 📁 Archivos en el repo (snapshot)

```
gaespos/                                # git repo (rama main, sin remote aún)
├── CLAUDE.md                           # Reglas + stack + roadmap
├── STATUS.md                           # Este archivo
├── CHANGELOG.md
├── README.md                           # Apunta a CLAUDE.md/STATUS.md
├── package.json                        # Workspace root, pnpm@9.15.0, Node>=20.18
├── pnpm-workspace.yaml                 # apps/* packages/* services/*
├── turbo.json                          # Pipelines: build/dev/lint/typecheck/test/clean
├── tsconfig.base.json                  # TS strict (noUncheckedIndexedAccess, etc.)
├── .nvmrc                              # 22
├── .npmrc
├── .editorconfig
├── .gitignore
├── apps/                               # Vacío (Hito 0.8+)
├── packages/                           # Vacío (Hito 0.6+)
├── services/                           # Vacío (Hito 1+)
├── node_modules/                       # gitignore — turbo + tsc + @types/node
└── docs/
    ├── hitos/hito-0-infra.md
    ├── decisiones-pendientes.md
    ├── adr/                            # 000-template + 001-012
    └── analisis/                       # 37 archivos (INDEX + 10 análisis)
```

## 🤔 Decisiones pendientes (no bloqueantes)

Ver [`docs/decisiones-pendientes.md`](docs/decisiones-pendientes.md) para detalle.

- Ninguna mid-código aún

## 📚 Referencias rápidas

- **Repo es ahora fuente de verdad versionada** ✅
- **Memorias de Claude (redundancia)**: `/home/gaby-pc-ubuntu/.claude/projects/-home-gaby-pc-ubuntu/memory/MEMORY.md`
- **Proyecto viejo a canibalizar**: `/home/gaby-pc-ubuntu/GAES_POS_COMPLETO/` (cherry-pick en 0.6-0.8)

## 🚦 Cómo retomar (otro Claude o yo después de compactación)

1. Leer [`CLAUDE.md`](CLAUDE.md) (reglas + stack)
2. Leer este `STATUS.md` (dónde quedamos)
3. Leer [`docs/hitos/hito-0-infra.md`](docs/hitos/hito-0-infra.md) (qué falta)
4. Continuar desde "Próximo paso concreto" arriba
5. Si dudo de algo: leer [`docs/analisis/`](docs/analisis/) (especialmente 04-modelo-datos para schema, 09-arquitectura para stack) o preguntar a Gaby

## 📜 Bitácora de sesiones

### 2026-06-09 — 🧰 Admin power features + Claude in Chrome + gating de permisos
Sesión larga con `claude --chrome` conectado (verificación visual real en el navegador). Commits:
- **👥 Usuarios y roles** (`edde347`): pantalla web-admin (alta de cajeros, asignar roles, reset password, activar/desactivar; editor de roles con permisos granulares por categoría). Endpoint `/t/roles/catalogo-permisos` **filtrado por vertical** del tenant (retail no ve clínica/Doctoralia). Paridad Eleventa.
- **⬆️ Carga masiva ampliada** (`7e7943d`): + Costo + Stock inicial; **columnas configurables/obligatorias por el dueño** (singleton ConfigImportacionProductos, GET/PUT import-config, validación server-side).
- **🔑 Login UX en las 4 apps** (`00b531d`,`5696869`): slug por subdominio en prod (oculto), recuerda negocio en localhost, auto-logout al 401 (antes se quedaba en blanco).
- **🧾 Órdenes de compra** (`88a0412`): UI web-admin (alta proveedor inline + líneas, autorizar/recibir parcial-total/cancelar). **FIX backend**: recibir ahora SÍ entra stock al inventario (movimiento `compra`) y actualiza costo (último + promedio ponderado). 6 tests.
- **🔒 Gating por permisos en POS** (`5b291e2`): la UI oculta lo que el rol no puede (crear cliente / devolución / corte) — antes mostraba botones que reventaban con 403. Regla agregada a CLAUDE.md. (Detectado por Gaby probando como cajero.)
- También: fix permisos cajero preset (sucursales.leer/cajas.leer para el POS). Suite **571 verde**.

### 2026-06-06 — ⬆️ Carga masiva (Excel/CSV) de productos, precios e inventario
Hueco grande para reemplazar Eleventa: antes todo era uno-por-uno. Patrón Shopify
(subir → preview validado → confirmar → reporte fila-por-fila):
- **Backend** (8 tests): `POST /t/productos/bulk` (upsert por skuPadre, auto-crea
  categoría por nombre con cache, precio a variante default), `/t/productos/bulk-precios`
  (precio base por SKU), `/t/inventario/bulk-conteo` (conteo físico: stock ABSOLUTO,
  calcula delta y registra movimiento ajuste_positivo/negativo). Cada fila reporta
  creado/actualizado/error sin tumbar el resto. Perm `productos.bulk_import` (ya
  existía en catálogo) + `inventario.ajustar`.
- **Frontend** web-admin: nueva sección "Carga masiva" (⬆️) con SheetJS (`xlsx`):
  parsea .xlsx/.csv en el navegador, mapea encabezados→campos, **plantilla
  descargable** por tipo, preview con validación de requeridos resaltada, y reporte
  de resultados con errores por fila. Usa los componentes `gx-*` del design system.
- Smoke E2E verde: productos (2 creados + auto-categoría), precios (1 ok + 1 error),
  conteo (stock 0→75). Suite 562.

### 2026-06-06 — 🎨 Estándar visual + responsive (ver design-system.md)
- `packages/ui`: preset Tailwind (tokens) + `components.css` (clases `gx-*`). Las 4
  apps lo extienden; cada una solo cambia su acento (teal / azul mayoreo). Tienda
  necesitó postcss-import. `docs/design-system.md` + reglas en CLAUDE.md.
- Responsive en las 4 apps: sidebars→drawer hamburguesa en móvil, tablas con scroll,
  POS apilado, headers que envuelven. Fix: rol cajero/vendedor preset sin
  sucursales.leer/cajas.leer (corregido en código + demo).

### 2026-06-06 — 🏢 Portal B2B Mayorista (web-b2b) punta a punta
Vertical mayoreo completada: el backend B2B ya existía (clientes-b2b CRUD,
cotizaciones quote→pedido→venta, CxC + línea de crédito, listas de precios +
motor cascada, 56 tests). Faltaba el portal del cliente. Un commit por bloque:
- **B1 Usuarios + auth** (`69d1c20`): modelo `ClienteB2bUsuario` (rol admin|comprador,
  migración `add_cliente_b2b_usuarios`), alta por el tenant en
  `POST /t/clientes-b2b/:id/usuarios` (sin self-signup), JWT kind `cliente_b2b`
  + `authenticateClienteB2b` + `POST /auth/cliente-b2b/login`.
- **B2 Backend portal** (mismo commit): módulo `b2b-portal` (fuera de /t, resuelve
  tenant del token): `/me` (empresa+crédito), `/catalogo` con precios del cliente
  (lista por prioridad→principal→base), cotizaciones ver+aceptar/rechazar (firma
  real con ownership), pedidos lista/detalle/crear autoservicio (lista resuelta,
  vendedor principal asignado, gate de aprobación interna, OC obligatoria si
  aplica), `/estado-cuenta` y `/direcciones`. 16 tests.
- **B3 web-b2b SPA** (azul, puerto 5175): Login → Dashboard (crédito + pendientes)
  → Catálogo "mis precios" + carrito local → Mi pedido (OC/dirección/notas) →
  Mis pedidos (estado + rastreo) → Cotizaciones (aceptar/rechazar) → Estado de
  cuenta. typecheck + build verde.
- Smoke E2E vs API viva (`tienda-demo`): alta usuario → login portal → /me con
  crédito $30k → catálogo → pedido PD-… → estado de cuenta. **Pendiente NO-código**:
  el tenant da de alta a los usuarios del portal (no hay self-signup B2B por diseño).

### 2026-06-05 — 🛒 Tienda online completa: los 8 bloques que faltaban para producción
Sesión "haz todo lo que falta" (E1–E8), un commit ff por bloque:
- **E1–E3 Envíos** (`5d2bfac`): módulo `tenant/envios` (zonas/tarifas fija+por_monto+por_peso con escalones, envío gratis por umbral, pickup por sucursal, cotizador con especificidad CP>estado>catch-all). Checkout valida tarifa server-side (422 anti-manipulación). Checkout tienda con selector 🚚/🏬 y cotización por CP. web-admin: secciones **Pedidos online** (transicionar estados con guía/paquetería, cancelar) y **Envíos**.
- **E4 Emails** (`6921da7`): ResendClient real (REST, sin SDK), hooks best-effort: pago confirmado / enviado con guía / listo pickup. EMAIL mock en dev.
- **E5 Recovery** (`8a110c4`): ciclo carritos abandonados (marca + 2 recordatorios 24h/72h configurables + recoveryCodigo), página /recovery/[codigo] restaura el carrito. BFF guarda emailAnonimo.
- **E6 Pagos** (`a8485cc`): StripeClient (PaymentIntents + webhook HMAC t/v1 + refunds; tarjeta y OXXO) y ConektaClient (orders cash/spei con referencia/CLABE + webhook HMAC) vía REST. Checkout responde 503 claro sin keys. Con `STRIPE_API_KEY`/`CONEKTA_API_KEY` reales en env, queda enchufado.
- **E7 Reseñas** (`8c94279`): cliente-portal /resenables + POST /resenas (verificada por compra, comentario→moderación), sección "Califica tus compras" en /cuenta, sección **Reseñas** en web-admin (aprobar/rechazar/responder).
- **E8 SEO**: generateMetadata por producto (metaTitulo/OG), JSON-LD Product con precio y rating, sitemap.xml dinámico, robots.txt (disallow cuenta/checkout/carrito/recovery). Smoke en vivo verde.
- Suite final: ver línea de abajo. **Pendiente real para vender**: contratar cuentas (Stripe/Conekta/Resend) y poner keys en env — el código ya está.

### 2026-06-05 — ♡ Wishlist del cliente + prefill checkout (cierra diferidos de la cuenta B2C)
- **Backend cliente-portal**: `GET /cliente-portal/wishlist` (resuelve título/slug/precio/foto desde ProductoPublicado), `POST /wishlist/items` (get-or-create wishlist del cliente, dedup idempotente), `DELETE /wishlist/items/:itemId` (ownership check 404). 5 tests nuevos → **13 en cliente-portal, suite completa 517/517 verde**.
- **Frontend web-tienda**: route handlers `/api/cuenta/wishlist` (POST) + `/[itemId]` (DELETE) + `/api/cuenta/me` (GET). Botón `GuardarWishlist` (♡/♥) en /producto junto a agregar al carrito (401 → redirige a login). Sección "Mi lista de deseos" en /cuenta (`WishlistCuenta`: grid con quitar interactivo). Checkout prefillea email+nombre del cliente logueado sin pisar lo tecleado.
- Smoke E2E vs API viva (tenant `tienda-demo`): registro → lista vacía → POST 201 → item con precio resuelto → DELETE 204 → vacía → /me 200. typecheck + build verde.

### 2026-05-28 — 👤 Cuenta de cliente B2C (cierra la tienda al 100%)
- **Backend**: migración `add_cliente_auth` (passwordHash en Cliente). auth plugin kind `cliente` + `authenticateCliente`. Módulo `cliente-portal`: `/auth/cliente/registro` + `/login` (JWT con sub=clienteId + tenantSlug; resuelve tenant schema con getTenantClient), `/cliente-portal/me` + `/pedidos` (where clienteId OR emailComprador=email → incluye compras guest previas). 8 tests.
- **Frontend web-tienda**: route handlers Next con **cookie httpOnly** (`/api/cuenta/[accion]` registro/login, `/api/cuenta/logout`). Páginas /cuenta/login, /cuenta/registro (AuthForm client), /cuenta (server: redirect si no hay sesión, mis pedidos + logout). Link "Mi cuenta" en header.
- Smoke E2E verde: registro→login→/me→/pedidos, 401 sin token, 401 password mala. typecheck + build verde.
- Decisión: el cliente B2C vive en el tenant schema; login requiere tenantSlug (la tienda es de un tenant). Pedidos guest aparecen al registrarse con el mismo correo.

### 2026-05-28 — 🛒 web-tienda: catálogo navegable (búsqueda + filtros)
- **Búsqueda** (`Buscador` client → searchParam `q`), **filtros por categoría** (chips, GET /ecommerce/categorias vía BFF), **sección Destacados** en home (?destacado=true sin filtros).
- Home reescrita server component con `searchParams` (q, cat); grid extraído a `ProductoCard`/`Grid`. Estado vacío claro.
- Backend ya soportaba q/categoriaPublicaId/destacado — solo faltaba UI. Smoke verde: todo (2), q=cola (1), categoría (1), destacado (1).
- typecheck + build verde. **Diferido** (requiere auth cliente B2C nuevo): login/registro + Mi cuenta (pedidos+wishlist). Checkout sigue guest.

### 2026-05-28 — 📈 web-admin: reportes con gráficas
- **Backend**: nuevo módulo `tenant/reportes` (no existía). `GET /t/reportes/resumen?dias=N` (REPORTES_VENTAS): totales periodo (ventas/#tickets/ticket promedio/IVA), serie por día sembrada sin huecos (agrupación en JS hora local), por canal, top 10 productos (VentaLinea groupBy productoId + resolver nombres). 5 tests integración verde.
- **Frontend**: `ReportesPage` en web-admin — selector 7/30/90 días, tarjetas de totales, **gráfica de barras por día en SVG nativo (cero dependencias)** con tooltip, tabla top productos, barras por canal. Nav "📈 Reportes".
- Fix: fechaYmd en hora local (consistente con rango sembrado) para evitar desajuste UTC en la serie.
- typecheck + build verde (web-admin 224kB).

### 2026-05-28 — 🎉 web-admin: back-office del negocio (cierra vertical retail)
- **apps/web-admin** SPA Vite 6 + React 19 + Tailwind. Login dueño/gerente (`/auth/tenant/login`), layout con sidebar de navegación.
- **5 páginas**: DashboardPage (ventas hoy sumando /t/ventas?estado=cobrada&desde=hoy + bajo stock /t/inventario?stockBajoMinimo), ProductosPage (CRUD: GET q / POST / PATCH / DELETE + modal con categorías), InventarioPage (lista + modal ajuste positivo/negativo), VentasPage (filtros canal/estado + modal detalle), TiendaPage (PUT config + POST productos-publicados).
- Reúsa patrón web-pos (cliente API token navegador, proxy /api). Puerto 5174.
- **Smoke test verde**: login dueño → alta producto → editar → ajuste inventario 30 → config tienda → publicar → dashboard. typecheck + build verde (220kB).
- **Vertical RETAIL completo**: dueño gestiona (web-admin) → cajero vende (web-pos) → cliente compra (web-tienda). Mismo tenant, mismo backend.
- Pendiente: reportes con gráficas, usuarios/roles, editor producto avanzado.

### 2026-05-28 — 🛠️ web-pos: descuento global + devoluciones
- **Descuento global** en el ticket (% + motivo) → recalcula total y manda `descuentoGlobalPct`/`descuentoGlobalMotivo` en POST /t/ventas.
- **Devoluciones** (`DevolucionModal`, botón header): busca venta por folio → GET detalle líneas → cantidad a devolver por línea + motivo + método reembolso → POST /t/ventas/:id/devolver (repone stock). Parcial o total.
- `VentaDetalle.lineas` ampliado con `id`.
- Smoke verde: venta descuento 10% (200→180), búsqueda folio, devolución parcial (folio DV-…), stock 20−2+1=19. Build verde (225kB).

### 2026-05-28 — 🛠️ web-pos pulido: corte X/Z + impresión + cliente + CFDI
- **Corte de caja X/Z** (`CorteModal`): GET apertura-actual → conteo denominaciones (billetes+monedas) → POST /t/cortes → muestra efectivo contado + diferencia vs esperado. X lectura, Z cierre (logout). Verificado curl: corte X y Z con diferencia calculada.
- **Impresión de ticket** (`Recibo` + CSS @media print): recibo 58mm imprimible (negocio, folio, líneas, subtotal/IVA/total, pagos, cambio) vía window.print() — listo para térmica o PDF.
- **Cliente en la venta** (`ClienteModal`): busca (`/t/clientes?q=`) o alta rápida (nombre+RFC+tel), o público en general; adjunta clienteId a la venta.
- **Facturar CFDI best-effort**: botón en comprobante → POST /t/ventas/:id/cfdi/emitir (uso G03/forma 01); si 409 sin config muestra aviso claro sin romper.
- typecheck + build verde (218kB). Smoke test de las piezas nuevas verde.
- Pendiente: descuentos/devoluciones POS, receptor CFDI completo, búsqueda cliente sin acentos, empaquetar en pos-desktop.

### 2026-05-28 — 🎉 web-pos: POS de cajero tocable (primer frontend del producto)
- **apps/web-pos** SPA Vite 6 + React 19 + Tailwind. Login cajero (`/auth/tenant/login`), `resolverSession` (sucursal default + auto-apertura caja monto 0, fallback sin caja), búsqueda producto debounce (`/t/productos?q=`) + Enter barcode (`/t/productos/buscar/:codigo`), ticket en vivo (+/− cantidad), `CobroModal` multi-pago con cambio, `POST /t/ventas` canal pos, comprobante folio+total.
- **Verificación**: smoke test curl del flujo completo (admin→tenant→cajero login→sucursales/cajas→producto+stock→buscar→vender→folio SUC-PRINCIPAL-000001); proxy Vite `/api`→:3000 OK; index sirve #root; typecheck + build verde (207kB).
- Descubierto en smoke: `categorias` usa `slug` (no `codigo`); cobro con cajaId requiere apertura (resuelto con auto-apertura); vender sin cajaId cae a nivel sucursal.
- Guía paso-a-paso en `apps/web-pos/README.md` (4 pasos: API mock → setup curl → dev → vender en navegador).
- Pendiente: corte X/Z UI, cliente+CFDI en ticket, impresión, empaquetar en pos-desktop.

### 2026-05-28 — 🚧 Hito 5 fase packaging (cerebro cliente offline + scaffolds)
- **`@gaespos/sync-client`** (15 tests): `SyncClient` con tickPush (FIFO + backoff exponencial cap+jitter), tickPull (upserts+tombstones→cache, lastSyncAt), tickNetwork (3 pings→offline), forceSync, resolveConflict (retry/abandon), getState, start/stop timers. `LocalStorage`/`SyncApiClient`/`NetworkProbe` interfaces + `InMemoryStorage` + `OperationBuilder`.
- **Backend**: `GET /t/sync/heartbeat` (ping NetworkMonitor) — 11 tests sync.
- **Scaffold `apps/pos-desktop`** (Tauri 2): tauri.conf.json (bundle msi/nsis/dmg/deb/appimage + plugin-sql), Cargo.toml, main.rs, migrations/001_sync_local.sql (espejo del LocalStorage), README build+firma por OS. NO compilable aquí (Rust/WebView/certs).
- **Scaffold `apps/pos-pwa`** (Next.js 15): manifest instalable + sw.js (app shell cache-first, API no cacheada) + BarcodeScanner @zxing/browser (cámara trasera, debounce) + /scan. Build verde (5 páginas). Cámara real no verificable headless.
- Diferido a V1.5: build nativo firmado en CI (tauri-action 3 OS), SqliteStorage/IndexedDbStorage reales, UI banner offline + panel conflictos, multi-caja sucursal.

### 2026-05-28 — 🎉 Hito 6 Negocio SaaS (núcleo billing self-serve)
- **Schema billing master** (migration `add_billing`): `Tenant` expandido (rfc, vertical enum, currencyDefault, trialEndsAt, parentTenantId, partnerId, etc.) + `TenantStatus` extendido (past_due/unpaid/archived); nuevos `Subscription`, `SubscriptionItem`, `Invoice`, `InvoiceItem`, `InvoicePayment`, `PaymentMethod`, `Coupon`, `CouponRedemption`, `PlanFeature`, `PlanPrice` (multi-currency × intervalo), `TenantUserAdmin` separado, `TenantSettingsMaster`.
- **Seed 5 planes** (free + starter/pro/business/enterprise públicos) con `PlanPrice` MXN+USD monthly+yearly + `PlanFeature` (gating: pos_basico, mayoreo_b2b, cfdi, ecommerce_*, whatsapp_*, salud_*, límites usuarios/sucursales/productos/ventas_mes).
- **Paquete `@gaespos/billing`** puro (14 tests): `calcularProrrateo` Stripe-style, `aplicarCupon` percent/fixed, `siguienteDunning` calendario 1/3/7d → suspend, `siguientePeriodo`, `formatInvoiceNumber`.
- **Auth admin_tenant**: JWT kind `admin_tenant` + `authenticateAdminTenant` + `AdminTenantPrincipal` (roleAdmin owner|billing_only|viewer).
- **Endpoints**: `POST /auth/signup` (público, crea tenant+admin+trial 14d+subscription) + `POST /auth/admin-tenant/login`; `GET /billing/me`, `GET /billing/invoices`, `POST /billing/payment-methods`, `POST /billing/subscription/coupon`, `POST /billing/subscription/change-plan` (upgrade prorrateado, downgrade 400 V1); `POST /billing/webhook` (mock confirma); `POST /admin/billing/run-trial-conversions` + `run-dunning` + `mock-set-failures` (admin GaesSoft).
- **Workers in-process**: `correrTrialConversions` (vencidos→cobra default PM→active/past_due), `correrDunningCiclo` (open vencidas→intento→success/retry/suspend tras 3 fallos).
- **CFDI uuid stub**: `cfdi-mock-{uuid}` al pagar invoice; timbrado real Facturama diferido a hardening.
- **12 tests** integración + demo `demo:saas-onboarding` (8 pasos verde end-to-end: cupón→signup→tarjeta→upgrade $400→trial vence→cobro+CFDI→webhook $700→dunning 3 fallos→SUSPENDED).
- **Suite apps/api: 498 tests verde** (486 → +12).
- **Diferido a Hito 6 fase 2/V1.5**: admin panel `apps/admin-gaessoft` con IA superadmin (health score, onboarding asistido, sentiment tickets), CFDI Facturama real, tenants padre-hijo despacho activos, USD cobro real, dominios custom + SSL.

### 2026-05-28 — 🚧 Hito 5 Motor de sync offline (núcleo)
- **Paquete `@gaespos/sync`** (lógica pura, 12 tests): `resolveLww`, `detectFieldConflicts`, `decideUpdate` (apply/skip/conflict merge_required). Sin CRDTs (Análisis 8).
- **Backend**: modelos tenant `SyncProcessedOp` (idempotency) + `SyncTombstone` (migration `add_sync`) · permiso `SYNC_USAR` · `POST /t/sync/push` (batch idempotente: venta immutable reusa crearVenta + dedup, cliente lww create/update con merge_required) · `GET /t/sync/pull?since=` (diffs productos/variantes/clientes/promos + tombstones).
- **10 tests** integración `tenant-sync.test.ts` (RBAC, idempotencia sin duplicar, conflicto merge_required no sobrescribe servidor, pull since, tombstones) + demo `demo:offline-sync` verde.
- Decisión: empaquetado Tauri firmado + PWA scanner diferidos (no verificables en este entorno). Núcleo = motor de sync, 100% testeable.

### 2026-05-27 — 🎉 Hito 4.5 Demo + **HITO 4 COMPLETO**
- `apps/api/scripts/demo-digital.ts` (`pnpm --filter @gaespos/api demo:digital`): demo end-to-end de los 4 sub-hitos contra API live con mocks. Verificado en verde.
  - Acto 1 Tienda: tenant retail → config tienda → publicar producto → carrito $598 → checkout pago mock → pedido GP-00000001 → venta + stock 100→98.
  - Acto 2 Marketing: promo 20% en venta POS ($299→$239.20) · lealtad 500 pts acumular/200 canjear → $20 · campaña WhatsApp segmento→worker mock.
  - Acto 3 Doctoralia: perfil → admin valida SSa → búsqueda pública → reseña 5★ auto-publicada.
  - Acto 4 PHR: OTP login → clínica consent+publica Encounter → expediente unificado cross-tenant → QR emergencia opt-in → export ARCO + audit.
- Endpoint demo `/t/checkout/confirmar-mock` reutilizado (no requiere reproducir firma webhook).
- **Hito 4 completo**: 4.1 Ecommerce + primer frontend · 4.2 Marketing · 4.3 Doctoralia · 4.4 PHR · 4.5 Demo. Suite apps/api 476 tests verde. Próximo: Hito 5 (Tauri desktop + offline/sync).

### 2026-05-27 — 🎉 Hito 4.4 Portal paciente PHR (núcleo) CERRADO
- **Master DB**: `PacienteMaster` expandido a PHR (phone_e164 identidad, email opcional, birthDate/sexAtBirth/bloodType/address/metadata, deletedAt ARCO). Nuevos: `PatientLogin`, `PatientAuthChallenge`, `PatientFamily`, `PatientConsent` (polimórfico patient|pet), `PatientRecord` (FHIR R4 JSONB), `PatientEmergencyQr`, `PatientAuditLog` append-only. Migration `add_phr`.
- **Auth paciente**: token kind `patient` + `authenticatePatient`. `/auth/patient/request-otp` + `/verify-otp` (OTP 6 dígitos hash sha256, TTL 5min, vía mensajeria mock WhatsApp, device trust 30d). Identidad = phone_e164 sin contraseña.
- **Portal `/patient-portal/*`**: me/perfil, expediente unificado cross-tenant (audit en cada lectura), datos críticos, consents (otorgar/revocar), familia (menor tutor-legal auto-aceptado / adulto por phone con consent pending), emergency-qr, audit, export ARCO.
- **Puente clínica `/t/phr/*`**: registrar consentimiento, publicar registro (gated por consent.scope que cubre resourceType), leer expediente consentido (filtra por scope + audit). 3 permisos PHR_* en rol medico.
- **Capa consent + audit**: paciente/tutor accede directo; tenant solo con consent activo; scope mapea a resourceTypes (full_phr=*, prescriptions_only=MedicationRequest, etc.). Revocar consent bloquea tenant pero NO borra registros.
- **24 tests** `patient-portal.test.ts` (OTP, expediente cross-tenant 2 clínicas = el moat, consent gating bidireccional, scope parcial, familia menor/adulto, QR público opt-in, audit, export ARCO, revocación). Suite apps/api verde.
- **REGLA respetada**: NO auto-diagnóstico/síntomas/triage. El portal solo muestra registros, no interpreta.
- Diferido a 4.4 fase 2: booking + anti-no-show + telemedicina Daily.co + fee 5%, pet PHR, wearables, pgcrypto, IA paciente.

### 2026-05-27 — 🎉 Hito 4.3 Portal Doctoralia (núcleo) CERRADO
- **Master DB**: `PacienteMaster` (cimiento PHR), `PublicProfessional` (+ `medicoIdLocal` link al Medico del tenant, `@@unique`), `PublicProfessionalLocation`, `PublicReview` (portable al médico), `PublicProfessionalSearchIndex`. Migrations `add_doctoralia` + `add_doctoralia_medico_link`.
- **6 permisos** DOCTORALIA_* (rol `medico` preset hereda perfil+reseñas; ADMIN_VALIDAR para superadmin).
- **Módulo `doctoralia/`** 3 plugins: tenant (médico gestiona su perfil/ubicaciones/reseñas), admin (`authenticateAdmin`: cola, validar cédula+publicar, suspender, moderar), público sin auth (búsqueda FTS+filtros, perfil por slug, registro/confirmación paciente, alta reseña).
- **Moderación heurística determinística** (spam/ofensivo/contacto→revision_humana, limpio→publicado); reemplazable por IA sin tocar callers. Línea roja respetada: modera texto público, NO contenido clínico.
- **Score** scorePromedio+totalReseñas recalculado desde reseñas publicadas; searchIndex refrescado al publicar/recalcular (se borra si no publicado).
- **28 tests** `doctoralia.test.ts` (puras + perfil lifecycle + búsqueda + reseñas + RBAC + admin). **Suite apps/api: 452 tests verde** (424→+28).
- Decisión clave de diseño: review `moderacionStatus` vivo = `publicado` cuando auto-aprueba (la decisión `auto_aprobado_ia` se guarda en `moderacionIaScore.decision`).
- **Diferido a 4.4/V1.5**: booking portal→tenant, fees por reserva, telemedicina Daily.co, OTP real, ARCO anonimize endpoint, PostGIS geoespacial, frontend `apps/web-doctoralia`.

### 2026-04-27 — Sesión inicial setup
- Cerré Análisis 9 (Arquitectura) y Análisis 10 (Roadmap) en memory de Claude
- Creé estructura de continuidad raíz (CLAUDE.md, STATUS.md, CHANGELOG.md, docs/)
- Migré 10 análisis (37 archivos) desde memory al repo
- Escribí 12 ADRs basados en Análisis 9
- **Resultado**: 55 archivos, repo autocontenido y versionable, listo para arrancar setup técnico

### 2026-04-28 — Hito 0.4 Setup monorepo
- Activé pnpm 10.33.2 via Corepack (subido desde 9.15.0 inicial; lockfile regenerado a v10)
- `git init -b main` (sin remote aún, lo configura Gaby cuando quiera)
- Creé manualmente (sin `create-turbo` por archivos previos): `package.json` root con workspaces + scripts; `pnpm-workspace.yaml`; `turbo.json` con tasks build/dev/lint/typecheck/test/clean; `tsconfig.base.json` strict total; `.nvmrc` (22), `.npmrc`, `.editorconfig`, `.gitignore`, `README.md` mínimo
- `pnpm install` OK → turbo 2.9.6, typescript 5.9.3, @types/node 22.19.17
- Verificado `pnpm turbo run typecheck --dry-run` (lee `engines` correctamente)
- Commit `e1a51d4`: chore: initial scaffold

### 2026-04-28 — Hito 0.5 Lint + hooks
- Instalé Biome 1.9.4, husky 9.1.7, commitlint 19.8.1 + config-conventional, lint-staged 15.5.2
- `pnpm.onlyBuiltDependencies: ["@biomejs/biome"]` (pnpm 10 bloquea build scripts por seguridad)
- `biome.json`: linter recommended + reglas TS strict (noExplicitAny, useImportType, useConst, noNonNullAssertion warn), formatter (double quotes, semicolons, trailingCommas all, lineWidth 100), VCS git integrado, ignore docs/**.md (markdown sin format), overrides para tests/scripts
- `commitlint.config.cjs` extiende config-conventional, scope kebab-case, header max 100, body/footer libres
- Husky: `.husky/pre-commit` (lint-staged + turbo run typecheck) y `.husky/commit-msg` (commitlint --edit)
- `lint-staged`: biome check --write en {ts,tsx,js,jsx,mjs,cjs,json,jsonc} staged
- `tsconfig.json` raíz extiende base, noEmit, includes vacío (project references se llenan al crear packages)
- Verificación: `pnpm biome check .` 6 archivos clean; commitlint rechaza mensajes sin convention y acepta válidos
- Commit `3e4f29f`: chore(tooling)

### 2026-04-28 — Hito 0.6 Package db/ + Docker
- `docker-compose.yml`: Postgres 16-alpine (5432:5432) + Redis 7-alpine (6380:6379, host port distinto porque 6379 ocupado por otro container) con healthchecks y volúmenes persistentes
- `.env.example` + `.env` (gitignored) con `DATABASE_URL_MASTER`, `DATABASE_URL_TENANT`, `REDIS_URL`
- `packages/db/`: package privado `@gaespos/db`, scripts prisma (generate/migrate/migrate:deploy/studio/reset/seed:master), Prisma 6.19.3 + tsx 4.19.2
- `prisma/master.prisma`: modelos `Plan` (id, code, name, priceCents, currency, description, active), `Tenant` (id, slug, name, schemaName, status, planId), enum `TenantStatus` (trial/active/suspended/cancelled), `AuditLog` (actor, action, resource, metadata, ipAddress); generator output a `src/generated/master`
- `prisma/tenant.template.prisma`: stub Hito 0 (solo datasource + generator, modelos llegan Hito 1+)
- `src/client.ts`: factory `createMasterClient(databaseUrl?)` + singleton `masterPrisma` (HMR-safe via global), log levels según NODE_ENV
- `src/seed-master.ts`: upsert 4 planes (Free $0, Starter $499, Growth $999, Scale $1999 MXN)
- `src/index.ts`: re-exports tipados (Prisma, Plan, Tenant, TenantStatus, AuditLog)
- Scripts en root: `dev:db`, `dev:db:down`, `dev:db:reset`, `db:generate`, `db:migrate`, `db:seed`, `db:studio` (todos via dotenv-cli leyendo `.env`)
- `pnpm.onlyBuiltDependencies`: agregados `@prisma/client`, `@prisma/engines`, `prisma`, `esbuild` (pnpm 10 los bloquea)
- `tsconfig.json` raíz con `references: [{ path: "./packages/db" }]`
- Verificación end-to-end: docker compose up → Postgres healthy → migration `20260429025709_init` aplicada (4 tablas: plans, tenants, audit_log, _prisma_migrations) → seed insertó 4 plans → typecheck + biome OK
- Commit `ef9b9c2`: feat(db)

### 2026-04-28 — Hito 0.7 CLI gaes-migrate
- Reorganización `prisma/`: `prisma/master/{schema.prisma, migrations/}` y `prisma/tenant/{schema.prisma, migrations/}` (cada schema con su historial separado, evita colisión `_prisma_migrations` shared)
- Deps nuevas en `@gaespos/db`: `commander@13.1.0`, `pg@8.20.0`, `execa@9.6.1`, `@types/pg@8.20.0`
- `src/cli/migrate.ts` entry point con Commander, sub-comandos: `master`, `tenant create <slug> --name <n> --plan <code>`, `tenant migrate <slug>`, `tenant migrate-all`, `tenant list`
- `src/cli/master.ts`: invoca `prisma migrate deploy` sobre master schema
- `src/cli/tenant.ts`: crea row en master.tenants + `CREATE SCHEMA` postgres + invoca `prisma migrate deploy` sobre tenant schema con `DATABASE_URL_TENANT?schema=tenant_<slug>` injectado
- `src/cli/utils.ts`: validateSlug (regex), tenantSchemaName, tenantDatabaseUrl, requireEnv, withPgClient
- Script root `gaes-migrate` via dotenv-cli + pnpm filter
- Verificación E2E: `gaes-migrate tenant create demo --name "Demo Tenant" --plan free` y `acme --plan starter` → master.tenants tiene 2 rows trial, postgres tiene schemas tenant_demo y tenant_acme; `tenant list` los muestra; `tenant migrate-all` idempotente
- TODO diferido a 0.9: tests unitarios CLI (cuando Vitest workspace esté configurado)
- Commit `d49d966`: feat(db) CLI gaes-migrate

### 2026-04-29 — Hito 0.8 App api/ con Fastify + JWT
- Schema master extendido: `AdminUser` (email, passwordHash argon2, role enum superadmin/support/billing, mfaSecret opcional, lastLoginAt) + `RefreshToken` (tokenHash SHA-256, adminUserId FK cascade, expiresAt, revokedAt, userAgent, ipAddress). Migration `add_admin_users` aplicada
- `@node-rs/argon2` 2.0 para hash + verify password (Rust prebuilt, sin native build); seed con admin default `admin@gaessoft.local` / `ChangeMe!2026` (override via env `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`)
- `@gaespos/db` re-exporta funciones `createTenant`/`migrateTenant`/`listTenants`/`migrateAllTenants` para uso desde apps (no solo CLI)
- `apps/api`: Fastify 5.2 + @fastify/{cors,helmet,jwt,cookie,rate-limit,sensible} + fastify-plugin + Zod 3.23 + Pino 9.5 (pino-pretty dev)
- `src/config.ts` Zod schema valida env vars (JWT/REFRESH/COOKIE secrets ≥32 chars, TTLs configurables, CORS origin, rate limit)
- `src/plugins/`: db (decora masterPrisma + onClose disconnect), auth (JWT 15min + cookie con COOKIE_SECRET, decorator `authenticate`), security (helmet+cors+rate-limit+sensible), error-handler (ZodError→400, Prisma P2002→409, P2025→404, fallback 500)
- `src/modules/health`: `/health` (liveness) + `/ready` (Postgres `SELECT 1`)
- `src/modules/auth`: POST `/login` (rate-limited 10/min, valida con Zod, verify argon2, emite access JWT + refresh cookie HttpOnly Path=/auth Max-Age=30d signed con COOKIE_SECRET, actualiza lastLoginAt), POST `/refresh` (consume cookie, revoca anterior, emite nuevo par, rotación), POST `/logout` (revoca + clearCookie), GET `/me` (preHandler authenticate)
- `src/modules/tenants`: hook preHandler authenticate global, GET `/` lista, GET `/:slug` detalle, POST `/` invoca `createTenant` (reusa lógica del CLI: master row + CREATE SCHEMA + migrate)
- Verificación E2E: login admin → me → list (2 tenants existentes) → POST tenant `bodega-norte` plan growth (creó schema postgres tenant_bodega_norte) → list (3 tenants) → /me sin token rechaza 401 → /refresh con cookie rota OK → password mala rechaza 401
- Pendiente: tests integración (en 0.9 con Vitest), módulo /auth refresh cookie SameSite=Strict en prod (actualmente Lax)
- Commit `9f66e50`: feat(api)

### 2026-04-29 — Hito 0.9 CI + tests integración
- Vitest 2.1.9 + @vitest/coverage-v8 a nivel root devDeps
- `apps/api/test/` (4 archivos): helpers (buildTestApp con NODE_ENV=test + RATE_LIMIT_MAX=100k; loginAdmin; cleanupTestTenants con DROP SCHEMA CASCADE para slugs `test-*`; cleanupTestRefreshTokens), setup (beforeAll/afterAll cleanup + masterPrisma.$disconnect), health.test.ts (2 tests: /health + /ready), auth.test.ts (11 tests: login OK/wrong password/wrong email/body inválido, /me sin token/inválido/válido, /refresh sin cookie/con cookie/rotación, /logout), tenants.test.ts (7 tests: list sin auth/con auth, get not-found, POST inválido/sin plan/crea+detail/duplicado 409)
- `packages/db/src/cli/utils.test.ts` (18 tests): validateSlug (6 válidos + 7 inválidos), tenantSchemaName (con/sin guión), tenantDatabaseUrl (agrega/sobrescribe schema, preserva otros params)
- Total: **38 tests verdes** corriendo en Postgres real (sin mocks)
- Tsconfig: `tsconfig.json` (typecheck/IDE, sin rootDir, incluye test/) y `tsconfig.build.json` (build con rootDir=src, excluye test/) para que test files no rompan rootDir validation
- Vitest configs inline por package (no shared root, evita issue rootDir cross-package)
- `.github/workflows/pr.yml`: services postgres:16-alpine + redis:7-alpine con healthchecks, env vars dummy (JWT/REFRESH/COOKIE secrets ≥32 chars), pasos checkout → pnpm 10.33.2 + Node 22 cache pnpm → install --frozen-lockfile → prisma generate/migrate:deploy/seed → biome ci → typecheck → test → build
- `.github/workflows/main.yml`: trigger push a main, placeholder deploy staging (real en 0.10/0.11)
- `turbo.json` con `globalEnv` (NODE_ENV, LOG_LEVEL) y `test.env` con todas las vars que afectan tests para invalidación correcta de cache
- Script root `test:dev` (con dotenv) para local; `test` puro para CI
- TODO 0.7 cerrado: tests unitarios CLI gaes-migrate utils (validateSlug, tenantSchemaName, tenantDatabaseUrl)
- **Próxima sesión empieza en**: 0.10 Hetzner CPX31 + Coolify install + dominio staging

### 2026-05-26 — 🎉 Hito 3.6 Demo Hito 3 CERRADO · **HITO 3 COMPLETO**
- **3 demos CLI nuevos** (`apps/api/scripts/`) que ejecutan los verticales contra la API LIVE con salida colorizada paso a paso + asserts (mismo patrón que `demo:retail`/`demo:comercial`):
  - `demo-clinica-vet.ts` (`pnpm --filter @gaespos/api demo:clinica-vet`) — **15 pasos verde**: tenant salud plan growth → equipo (médico/enfermera/recepción) → verifica 55 CIE-10 (25 vet) + 12 vacunas → paciente humano EXP-* → consulta SOAP firmada inmutable → receta RX-* con QR validado → mascota MAS-* → vacuna antirrábica con lote + cartilla próxima dosis +365d → camas GEN/UCI → hospitalización HOSP-* (cama→ocupada + cargo estancia auto $2500) → medicación c/8h×5d expande 15 kardex → enfermera aplica dosis → signos vitales T°39.5+SatO2 89% dispara alertas `fiebreAlta, hipoxemia` → alta genera venta borrador $2,500
  - `demo-abarrotes.ts` (`demo:abarrotes`, requiere API con `RECARGA_PROVIDER=mock`) — **8 pasos verde**: tenant + cajero → caja → config proveedor mock saldo $5000 → recarga Telcel $100 cobra $102 (margen $2) → Bait pospago $200 con referencia → saldo tras 2 ops $4,700 → producto cigarros IEPS 160% → venta desglosa IEPS $37.14 + IVA $9.66 aparte (regla SAT)
  - `demo-despacho.ts` (`demo:despacho`, usa dotenv para masterPrisma) — **9 pasos verde**: tenant despacho + contador (30 categorías contables seed) → upload CFDI XML combustible $1,160 (parser extrae UUID+IVA) → **auto-categorización IA mock confianza 0.95 → G-606 Combustibles** → OC OC-* → recepción vincula CFDI → DIOT TXT `04|03|GAS800101AAA|...|320.00|...` formato SAT + partner contador → link → click cookie 90d → referral paying (plan starter $499) → comisión 25% = $124.75 → aprobar → payout SPEI $124.75
- **Soporte `RECARGA_PROVIDER=mock` en `server.ts`** (mismo patrón que `FISCAL_PROVIDER=mock`): inyecta MockRecargaProvider para demos/dev sin cuenta RecargaKi real. AI usa MockAiProvider automático si no hay `ANTHROPIC_API_KEY`.
- Bugs menores corregidos durante construcción: login tenant usa `tenantSlug` en body (no header); endpoint validar receta requiere token tenant (validación pública por subdominio es hito posterior); venta expone desglose IEPS en GET detalle (no en POST); DIOT export es texto plano (fetch directo, no JSON.parse); `export {}` en cada script para aislar scope global TS.
- Typecheck verde · lint 0 errores (61 warnings pre-existentes) · **suite 481 tests sigue verde**.
- **HITO 3 COMPLETO**: 3.1 Abarrotes ✅ + 3.2 Salud Humana ✅ + 3.3 Salud Vet ✅ + 3.4 Salud N3 ✅ + 3.5 Partners+Despacho ✅ + 3.6 Demos ✅. Los 5 clientes piloto tienen su vertical operativo en backend.
- **Pendiente cierre**: commit checkpoint + tag `hito-3-verticales-v1` (espera visto bueno Gaby — git requiere aprobación).

### 2026-05-26 — 🎉 Hito 3.5 Partners + Despacho contable CERRADO al 100%
- **Schema master 4.2 Partners** (7 modelos + 7 enums, migration `add_partners` 276 SQL): `Partner` (codigo+RFC unique+nivel bronze/silver/gold/diamond+comisionPctOverride+estado), `PartnerBranding` (slug público white-label V1.5), `PartnerLink` (slug+UTM+contadores clicks/signups/paidConversions), `Referral` (cookie attribution 90d+estado click→signup→trial→paying→churned+tenantId@unique), `Commission` (periodoYYYYMM+montoBase+pct+monto+estado, unique referral+periodo), `Payout` (agrupa commissions+retenciones ISR/IVA+metodoPago SPEI/PayPal/Stripe), `PartnerInvitacion` (token+expira).
- **Schema tenant 4.12 Despacho** (6 modelos + 7 enums, migration `add_despacho_contable` 232 SQL): `CfdiRecibido` (uuidSat unique+tipo I/E/N/P/T+emisor/receptor+impuestos desglosados+xmlRaw+origen upload/facturama/webhook), `CategoriaContable` (cuenta SAT+tipo+esDeducibleSat+ivaAcreditable+claveProdServSatRegex para heurística+jerarquía padre/hijo), `CfdiRecibidoCategorizacion` (categorizadoPor ia/regla/manual+iaModelo+iaConfianza+override), `OrdenCompra` (folio OC-*+state machine borrador→enviada→recibida_parcial/total+vincula CFDI), `OrdenCompraLinea`+`OrdenCompraFolioCounter`. **30 categorías contables MX seed** con regex SAT.
- **9 permisos nuevos**: CFDIS_RECIBIDOS_LEER/UPLOAD/CATEGORIZAR/CANCELAR + COMPRAS_OC_LEER/CREAR/AUTORIZAR/RECIBIR + DIOT_GENERAR (contador_interno + dueño todos; almacen LEER/CREAR/RECIBIR OC).
- **Paquete nuevo `@gaespos/ai`**: `AiProvider` interface + `AnthropicClient` (Claude Haiku 4.5 + **prompt caching** system ephemeral, crítico costos) + `MockAiProvider` determinista + `categorizeByHeuristic` (regex claveProdServ→categoría, fallback sin créditos/IA falla) + 6 unit tests. Plugin Fastify `aiProviderFactory` (cae a Mock sin ANTHROPIC_API_KEY).
- **Módulos**: `cfdis-recibidos/` (parser CFDI 4.0 puro sin deps + upload idempotente por UUID + auto-categorize IA con fallback + override manual + cancelar); `ordenes-compra/` (CRUD + state machine + recepción parcial/total con validación cantidad excedida 409 + vincula CFDI); `diot/` (genera reporte agrupado por RFC de CFDIs categorizados deducibles + export TXT formato SAT separador `|`); `partners/` master (invitación→aceptar→link→click cookie 90d→onTenantCreated→transición estados→recalcular nivel umbral→comisión periodo idempotente→aprobar/rechazar→payout agrupa→marcar pagado cascada).
- **82 tests integración nuevos** (18 partners + 25 despacho/CFDIs/OC/DIOT + 6 unit AI + otros): flujo partner completo invitación→payout, CFDI upload+IA+fallback+override+cancelar, OC recepción parcial→total+excede 409, DIOT TXT formato, RBAC. **Suite total 481 verde.**
- **Diferidos V1.5+**: portal partner frontend (→Hito 6), conciliación bancaria, white-label dominio custom, ISR/IVA auto-retención payouts, BullMQ cron auto-recalcular comisiones (V1 manual via endpoint), Facturama webhook real-time (V1 cron + upload manual).

### 2026-05-25 — 🎉 Hito 3.4 Salud N3 hospitalización CERRADO al 100%
- **Schema tenant 4.16 hospitalización** (6 modelos nuevos + 6 enums + polimorfismo XOR paciente/mascota en `Hospitalizacion` y `SignoVitalHospital`):
  - `Cama` — codigo único per-sucursal, tipo [general/cuidados_intensivos/aislamiento/cirugia_recuperacion/pediatria], estado [libre/ocupada/limpieza/mantenimiento/fuera_de_servicio], tarifaPorNoche default
  - `Hospitalizacion` — folio HOSP-{CODIGO}-NNNNNN, paciente XOR mascota, medicoResponsable, diagnosticoIngreso (CIE-10) + diagnosticoIngresoTexto fallback, motivoIngreso, notasIngreso, fechaIngreso/Egreso, motivoEgreso, altaPorId, observacionesAlta, **ventaAlAltaId @unique** (1:1 con Venta de alta), estado [activa/alta/fallecimiento/fuga/traslado_externo], tarifaEstanciaDiaria snapshot
  - `HospitalizacionFolioCounter` atómico per-sucursal
  - `MedicacionProgramada` — hospitalización + medicamentoCatalogoId + snapshot nombre + dosis (capturada por médico, **NO IA decide**) + via + frecuenciaHoras + horaInicio + duracionDias + indicacionMedica + recetaId? opcional + estado [activa/suspendida/completada] + suspendidaAt + motivoSuspension + prescritaPorId
  - `KardexAplicacion` append-only — medicacionProgramadaId + horaProgramada + horaAplicada? + enfermeraAplicadorId? + estado [pendiente/aplicada/omitida/reprogramada] + motivoOmision + notas + reaccionAdversaObservada + **alertaEnviadaAt** (anti-spam worker)
  - `SignoVitalHospital` granular — hospitalización + paciente XOR mascota + capturadoPor + hora + T°/FC/FR/SatO2/PA sist+diast/glucosa/dolor escala/llenadoCapilar/mucosasColor + observaciones + **alertasMarcadas JSONB** (rule-based)
  - `CargoHospital` append-only — hospitalizacionId + tipo [estancia_diaria/medicamento/procedimiento/laboratorio/imagenologia/consumible/honorarios_medicos/otro] + descripcion + cantidad + precioUnitario + monto + productoId? + **facturadoEnVentaId @nullable + facturadoAt** (marcado al darAlta)
- **8 permisos nuevos**: CAMAS_LEER/GESTIONAR + HOSPITALIZACION_LEER/CREAR/ALTA + MEDICACION_PROGRAMAR + KARDEX_LEER/APLICAR/REPROGRAMAR. Distribuidos: dueño/gerente todos, médico (LEER/CREAR/PROGRAMAR/KARDEX_LEER+APLICAR+REPROGRAMAR), enfermera (LEER + KARDEX_LEER+APLICAR), recepción (LEER + ALTA + CAMAS_GESTIONAR para cambio limpieza→libre + KARDEX_LEER).
- **Migration `add_salud_hospitalizacion`** (278 SQL) vía CLI shadow-database cross-tenant.
- **Módulos `apps/api/.../`**:
  - `camas/` CRUD + filtro sucursal/tipo/estado + endpoint `POST /:id/cambiar-estado` (bloquea cambio si tiene hospitalización activa, 409)
  - `hospitalizaciones/` con service complejo:
    - `ingresarPaciente` (atómico: valida cama libre+isActive+misma sucursal → cama→ocupada → crea Hospitalización folio HOSP-* → crea cargo estancia_diaria automático con tarifa de cama)
    - `programarMedicacion` (médico captura dosis/frecuencia/duración + firma → service **expande N entradas KardexAplicacion** según frecuenciaHoras×duracionDias)
    - `aplicarKardex` (enfermera; estado=aplicada graba horaAplicada+enfermeraAplicadorId; omitida requiere motivoOmision 400; reprogramada requiere nuevaHoraProgramada 400; re-aplicar 409 append-only)
    - `capturarSignoVital` con `evaluarAlertasSignoVital` rule-based: fiebreAlta T≥39, hipotermia T≤35, taquicardia FC>180, bradicardia FC<40, hipoxemia SatO2<90, hipertensión PAsist>180, hipoglucemia<60, hiperglucemia>250. **NO IA decisional**.
    - `agregarCargo` (Decimal cantidad×precioUnitario → monto preciso 4 decimales)
    - `darAlta` (atómico: suspende todas medicaciones activas con motivo "Alta: ..." → cama→limpieza → si `generarVenta!==false` && cargos no facturados crea **Venta borrador** folio normal con total=suma cargos + `ventaAlAltaId` poblado + CargosHospital marcados `facturadoEnVentaId+facturadoAt`)
  - `suspenderMedicacion` independiente con motivoSuspension obligatorio
- **Worker `apps/api/src/workers/medicacion-alarmas.ts`**:
  - `AlarmChannel` interface (testeable sin BullMQ): método `enviar(payload)` con kardexId+medicacionProgramadaId+hospitalizacionId+medicamentoNombre+dosis+via+horaProgramada+pacienteNombre|mascotaNombre+sucursalId
  - `InMemoryAlarmChannel` para tests (acumula en array)
  - `escanearKardexParaAlarmar(client, channel, opts)`: query kardex estado=pendiente + alertaEnviadaAt IS NULL + horaProgramada en ventana próxima [ahora, ahora+15min default]; valida med+hosp activos; envía via channel; marca `alertaEnviadaAt=ahora` (anti-spam: 2do escaneo no re-envía)
  - V1: in-process worker. V1.5: agregar BullMQ + Redis cron job + push notifications a app móvil enfermería
- **Endpoints `/t/camas/*` y `/t/hospitalizaciones/*`**: 4 camas + 12 hospitalización (POST `/`, POST `/:id/medicaciones`, POST `/medicaciones/:id/suspender`, GET `/kardex`, POST `/kardex/:id/aplicar`, POST `/:id/signos-vitales`, POST `/:id/cargos`, POST `/:id/alta`, GET listado paginado, GET detalle con include cama+paciente+mascota+medico+meds+kardex+signos+cargos+ventaAlAlta)
- **30 tests integración** (`tenant-salud-hospitalizacion.test.ts`):
  - CRUD camas (general+UCI con tarifa, filtro estado=libre, RBAC enfermera sin GESTIONAR 403)
  - Ingreso paciente humano + cama→ocupada + cargo estancia_diaria auto (monto=tarifaPorNoche)
  - Cama ya ocupada 409 con extra={estadoActual: "ocupada"}
  - **XOR completo**: paciente+mascota juntos 400, ninguno 400
  - Ingreso mascota vet en UCI (verifica polimorfismo)
  - Cambio estado cama ocupada bloqueado 409 con mensaje "dar alta antes"
  - Listado filtra mascotaId; detalle muestra paciente humano + mascota null
  - **Medicación**: RBAC enfermera sin MEDICACION_PROGRAMAR 403; médico programa Amoxicilina 500mg c/8h×5d → **15 kardex generados con horas correlativas c/8h verificadas**
  - Enfermera aplica primer kardex (estado→aplicada + enfermeraAplicador poblado)
  - Re-aplicar kardex aplicada 409 (append-only)
  - Omitir sin motivoOmision 400; con motivoOmision 204
  - Suspender medicación: query directo a Prisma verifica estado=suspendida + motivoSuspension
  - **Signos vitales con alertas**: normales sin alertas, fiebreAlta T=39.5, hipoxemia+taquicardia múltiples
  - **Worker alarmas**: escaneo con ventana 10min detecta y envía; segundo escaneo enviadas=0 (anti-spam via alertaEnviadaAt)
  - Cargos manuales: procedimiento 1×450, medicamento 3×50=150 (Decimal preciso)
  - **Dar alta**: recepción → ventaBorradorId no null, montoTotal=suma cargos, cama→limpieza, hospitalizacion.estado=alta + fechaEgreso + ventaAlAlta vinculada + todos los cargos con facturadoEnVentaId
  - Alta duplicada 409
  - Recepción cambia cama limpieza→libre (CAMAS_GESTIONAR ya tiene)
- **Decisión Venta sin VentaLinea**: para evitar migration adicional a VentaLinea (que requiere productoId+varianteId NOT NULL), la Venta de alta se crea sin líneas con total=suma cargos; el frontend consume desglose via relación `cargosHospitalFacturados` que ya existe. Limpio + sin migration extra.
- Suite total: **358 tests verde** en 116s. Lint sin errores nuevos.
- **Diferidos a V1.5+**: Laboratorio (EstudioLaboratorio + integración IDEXX vet / referencia humano), Imagenología (DICOM viewer + JPG; IA hallazgos NO por regla línea roja), Expo-push notifications app móvil enfermería (→ Hito 5 multi-plataforma), Hoja de evolución diaria firmada NOM-024 N3, Triaje IA (línea roja — NO).

### 2026-05-22 — 🎉 Hito 3.3 Salud Vet CERRADO al 100%
- **Schema tenant 4.15 vet** (3 modelos nuevos + 3 enums + polimorfismo Consulta/Receta/Cita/SignoVital):
  - `Mascota` (numeroExpediente MAS-NNNNNN + especie [perro/gato/ave/conejo/huron/reptil/pez/roedor/otro] + raza + sexo + esEsterilizado + fechaNacimiento [aproximada flag] + color + **microchip** + pesoActualKg + tutorClienteId opcional FK Cliente + medicoAsignadoId + alergias/antecedentes/medicamentos crónicos JSONB + fechaDefuncion + causaDefuncion)
  - `VacunaCatalogo` (nombre comercial + principio activo + tipo + aplicaHumano/Vet + especiesAplicables JSONB + esquemaDefault Humano/Vet JSONB + viaAplicacion + intervaloRefuerzosDias + isObligatoriaCartillaNacional flag SSa MX)
  - `Vacunacion` (paciente XOR mascota + vacunaCatalogoId + medicoAplicador + **numeroLote + caducidadLote obligatorios para rastreabilidad ante retiros del mercado** + marcaSnapshot + viaAdministracion + dosisAplicada + reaccionAdversaObservada + proximaAplicacionFecha calculada determinista)
- **Polimorfismo XOR validado en aplicación**: Cita, Consulta, Receta, ConsultaSignoVital ahora aceptan `pacienteId?` XOR `mascotaId?` (uno y solo uno). ALTER TABLE hace pacienteId nullable y agrega mascotaId + relación inversa.
- **2 enums nuevos**: MascotaEspecie (9 valores), MascotaSexo (macho|hembra|desconocido), CartillaTipo (humano_basico_ssa|complementario|vet_perro|vet_gato|vet_otro — preparado para Cartilla model en 3.4).
- **7 permisos nuevos**: MASCOTAS_LEER/CREAR/ACTUALIZAR/ARCHIVAR, VACUNAS_LEER/APLICAR/GESTIONAR_CARTILLA. Distribuidos: dueño/gerente todos, médico todos excepto archivar/gestionar, enfermera lectura+aplicar, recepción CRUD básico + aplicar vacuna.
- **Migration `add_salud_vet`** (189 SQL) vía CLI shadow-database cross-tenant.
- **Seed catálogos vet** integrado a `seedClinicalCatalogs`:
  - **25 CIE-10 vet** (V-001 a V-025: parvovirosis canina, moquillo, calicivirus felino, rinotraqueítis, dermatitis atópica, sarna sarcóptica, otitis, IRC, diabetes felina, hipertiroidismo felino, atropello, cuerpo extraño GI, etc.)
  - **12 medicamentos vet PLM** (Drontal Plus, Bravecto, NexGard, Synulox, Marbofloxacina, Meloxicam Vet, Rimadyl, Cerenia, Frontline Plus, Caninsulin, Apoquel, Acepromacina) con `dosisRecomendadaVet` JSONB por especie con mg/kg + frecuencia de referencia. **NO IA calcula** — médico lee y decide.
  - **12 vacunas catálogo** (humanas SSa: BCG, HepB, Pentavalente, SRP, Influenza, Td, VPH + vet: Vanguard Plus 5/CV-L, Antirrábica canina, Bordetella, Triple felina FVRCP, Leucemia felina FeLV) con esquemasDefaultHumano/Vet JSONB y intervaloRefuerzosDias.
- **Módulos `apps/api/.../`**:
  - `mascotas/` CRUD con búsqueda multi-criterio (nombre/expediente/microchip/raza), filtro por especie/tutor/médico, archivar, generador MAS-NNNNNN. Marcar defunción via PATCH.
  - `vacunaciones/` con `procesarAplicacion` validando XOR paciente/mascota + vacunaCatalogoId existente, próxima fecha calculada automáticamente de `intervaloRefuerzosDias`. GET `/cartilla?pacienteId=` o `?mascotaId=` retorna sujeto + vacunaciones aplicadas con estado [vigente|proxima|vencida] (próxima ≤ 30 días) + lista proximasDosis ordenada con diasFaltantes.
  - `consultas/diagnosticos/catalogo` ahora soporta query `?vertical=humano|vet|todos` (default todos).
  - Citas/Consultas/Recetas routes con validación XOR explícita (400 si ambos o ninguno).
- **19 tests integración** (`tenant-salud-vet.test.ts`):
  - Catálogos vet sembrados (CIE V-007 parvovirosis, Bravecto/Drontal G vet, Antirrábica canina + Triple felina con `aplicaVet=true`)
  - CRUD mascota con búsqueda por microchip + filtro por especie + PATCH peso
  - Flujo full: cita mascota (sin pacienteId) → checkin → consulta SOAP vet con dx parvovirosis firmada → receta vet con Meloxicam (QR muestra "Firulais (perro)" sin paciente) → vacuna Antirrábica con lote/caducidad + próxima dosis +365 días calculada determinista
  - **Cobertura XOR**: cita 400 si paciente+mascota juntos, 400 si ninguno; consulta 400 mismo; vacunación 400 mismo
  - Cartilla muestra vacunaciones aplicadas con estado + próximas dosis ordenadas
  - Permisos: recepción aplica vacuna OK (tiene VACUNAS_APLICAR) pero NO puede DELETE registro cartilla (sin VACUNAS_GESTIONAR_CARTILLA, 403)
- Suite total: **328 tests verde** en 102s. Lint sin errores.
- **Diferidos a 3.4 / V1.5+**: hospitalización N3 (Cama + AsignacionHospital + KardexAplicacion + MedicacionProgramada + alarmas push BullMQ + SignosHospital + CargosHospital), laboratorio (EstudioLaboratorio + integración IDEXX), imagenología (DICOM + JPG viewer + IA hallazgos), pediatría vet (curvas crecimiento por raza), CartillaPaciente model cached (V1 computed en query), resumen IA visitas al abrir expediente (Hito 4 IA features), Doctoralia perfil vet público (Hito 4).

### 2026-05-22 — 🎉 Hito 3.2 Salud Humana base CERRADO al 100%
- **Schema tenant 4.15 V1** (10 modelos + 7 enums nuevos):
  - `Paciente` (numeroExpediente EXP-NNNNNN único + datos demográficos completos + alergias/antecedentes/medicamentos crónicos JSONB + tutorClienteId FK opcional a Cliente B2C + medicoAsignadoId + clasificacionRiesgo capturada por médico)
  - `Medico` (extensión 1:1 de Usuario con cédula profesional + especialidades + bio + firma electrónica + acepta telemedicina + isPerfilPublicoDoctoralia)
  - `Agenda` (medico + sucursal + diaSemana recurrente O fechaEspecifica + horarios + duracion slot + tiposSlots)
  - `AgendaBloqueo` (vacaciones/congreso/personal/incapacidad/cerrado_sucursal con motivoPublico)
  - `MotivoCitaCatalogo` (catalogo nombre+vertical+duracionDefault)
  - `Cita` (folio CT-{CODIGO}-NNNNNN + estado [programada→confirmada→checkin→en_consulta→completada/cancelada/no_asistio] + signos vitales recepción + tiempoEspera computado)
  - `Consulta` SOAP (citaId @unique opcional + paciente + medico + tipo + sintomas/exploración/diagnóstico CIE-10/diferenciales/pronóstico/plan/resumenParaTutor + estado [borrador|firmada|enmendada|cancelada] inmutable post-firma NOM-024 + consultaOriginalId para enmiendas + firmaElectronicaAplicadaUrl snapshot)
  - `ConsultaSignoVital` historial granular (peso/T°/FC/FR/presión/SatO2/glucosa)
  - `DiagnosticoCatalogo` CIE-10/CIE-11 humano+vet
  - `MedicamentoCatalogo` (nombre comercial + principio activo + concentración + clasificacionCofepris [G_I-VI|vet|OTC] + dosisRecomendada{Pediatrica,Adulto,Vet} JSONB de REFERENCIA + interaccionesConocidas + alergiasRelacionadas — **NO motor IA**)
  - `Receta` (folio RX-{CODIGO}-NNNNNN + qrValidacionToken único para validación pública + esGrupoControlado + numeroRecetarioOficial COFEPRIS + fechaExpiracion + estado [emitida|surtida|cancelada|expirada])
  - `RecetaItem` (snapshot del medicamento + dosis manual capturada por médico + alertasAplicadas array JSONB)
  - `CitaFolioCounter` + `RecetaFolioCounter` atómicos
- **3 roles preset nuevos**: medico (CRUD consultas + recetas + agenda), enfermera (checkin + lectura), recepcion (agenda + checkin + cobros). Gerente extendido con todos los permisos clínicos.
- **18 permisos nuevos**: PACIENTES_LEER/CREAR/ACTUALIZAR/ARCHIVAR, MEDICOS_LEER/EDITAR_PERFIL, AGENDA_LEER/GESTIONAR/BLOQUEAR, CITAS_LEER/CREAR/GESTIONAR/CHECKIN/CANCELAR, CONSULTAS_LEER/CREAR/FIRMAR/ENMENDAR, RECETAS_LEER/EMITIR/CANCELAR.
- **Migration `add_salud_humana`** (549 SQL, la mayor del proyecto) vía CLI shadow-database aplicada cross-tenant.
- **Seed catálogos clínicos** nuevo módulo `seed-clinical-catalogs.ts` integrado en `seedTenantDefaults`:
  - **30 CIE-10** top medicina humana general (J00/J06.9/J20.9 respiratorias, A09 gastro, N39.0 UI, E11.9 DM2, I10 HTA, J45.9 asma, K21.9 ERGE, R51 cefalea, F32.9 depresión, F41.1 ansiedad, etc.)
  - **25 medicamentos PLM** top (Tempra/Advil/Naproxeno OTC/G_IV; Amoxil/Augmentin/Bactrim/Ciprolet antibióticos; Pantoprazol/Omeprazol IBP; Losartán/Norvasc/Atenolol antihipertensivos; Metformina; Salbutamol inhalador; Atorvastatina; Plasil antiemético; Ambroxol; Hidrocortisona tópica; Postday G_II controlado). Cada medicamento con `dosisRecomendadaPediatrica`+`dosisRecomendadaAdulto` JSONB para LECTURA del médico (NO IA calcula).
  - **8 motivos de cita** seed (Consulta general/seguimiento/primera vez/chequeo anual/urgencia/vacunación/control postoperatorio/telemedicina) — vertical "humana" o "ambos".
- **Módulos `apps/api/src/modules/tenant/`**:
  - `pacientes/` CRUD con búsqueda multi-criterio (nombre/apellidos/expediente/CURP/teléfono/email), archivar, generador automático `EXP-NNNNNN`
  - `medicos/` PUT upsert perfil clínico (cédula, especialidades, bio, firma, telemedicina, perfil público Doctoralia)
  - `agenda/` CRUD horarios recurrentes (diaSemana) y específicos (fecha), bloqueos por tipo con validación fechaFin>fechaInicio
  - `citas/` con state machine `programada→confirmada→checkin→en_consulta→completada/cancelada/no_asistio` (transiciones validadas con error 409 explicando válidas), check-in con signos vitales recepción y tiempo de espera computado automáticamente
  - `consultas/` SOAP con `crear` (borrador) → `editar` (solo borrador) → `firmar` (estado=firmada **inmutable NOM-024**) → `enmendar` (clona a nueva consulta vinculada `consultaOriginalId` + marca original `enmendada`). PATCH a firmada → 409. Catálogo CIE-10 público.
  - `recetas/` con `crear` que detecta automáticamente G_II/G_III/requiereRecetarioOficial del catálogo y exige `numeroRecetarioOficial` COFEPRIS (409 sin él). QR token único 48 hex para validación pública. Endpoint `GET /validar/:token` retorna datos completos + flag `vigente` cuando `estado=emitida AND fechaExpiracion>now`.
- **27 tests integración** (`tenant-salud-humana.test.ts`) cubriendo:
  - Catálogos sembrados (CIE-10 ≥25 dx, PLM ≥20 meds, motivos de cita)
  - CRUD pacientes con búsqueda por nombre/expediente/CURP
  - Flujo full agenda recurrente → cita programada → checkin con signos vitales → iniciar consulta → SOAP borrador → editar → firmar → PATCH bloqueado 409 → emitir receta con QR → validación pública QR
  - Receta G_II sin numeroRecetarioOficial → 409, con él → OK
  - Cancelar receta + re-cancelar → 409
  - Enmienda consulta firmada crea nueva borrador con `consultaOriginalId` enlazado y marca original `enmendada`
  - Permisos RBAC diferenciados: enfermera sin CONSULTAS_FIRMAR/RECETAS_EMITIR → 403, recepción sin CONSULTAS_CREAR → 403
  - Bloqueo agenda + validación fechas invertidas → 400
- Suite total: **309 tests verde** en 92s. Lint sin errores.
- **Diferidos a V1.5+**: PHR cross-tenant master DB con FHIR + sync, vacunas (Vacuna/Vacunacion/CartillaPaciente) + cartilla SS MX obligatoria, pediatría (curvas crecimiento OMS + hitos desarrollo), motor reglas interacciones que cruza automáticamente alergias del paciente vs medicamento, telemedicina Daily.co (→ Hito 4), vector embeddings búsqueda semántica consultas/medicamentos, perfil público Doctoralia (→ Hito 4), validación cédula profesional vs SSa API real.

### 2026-05-21 — 🎉 Hito 3.1 Abarrotes CERRADO al 100%
- **Schema tenant 4.14** (4 modelos + 4 enums nuevos):
  - `RecargaProveedorConfig` per-tenant: proveedor enum [recargaki|mtscellular|pymeya|mock] unique + api_url/api_key/webhook_secret encrypted + isPrimario/isActive + **saldoPrefondeado** decimal + **saldoAlertaMinimo** + comisionProveedorPct + lastRechargeAt + totalConsumidoLifetime
  - `Recarga` folio único per-sucursal `RC-{CODIGO}-NNNNNN`, tipo [tiempo_aire|pago_servicio], 10 compañías enum (telcel/movistar/att/bait/unefon/virgin_mobile/maz/spentel/freedom_pop/bait_pospago V1), numeroTelefonico 10 dígitos + referenciaCapturada opcional (servicios), montoSolicitado vs montoCobradoCliente con comisionTenant separado, costoRealTenant, folioProveedor (referencia agregador para reclamos), respuestaProveedor JSONB raw, estado [pendiente|exitosa|fallida|reembolsada|disputada], motivoFalla, intentosTotales, reembolsadaAt/PorId/Motivo, disputadaAt/Motivo, vinculación con `cajaApertura` y `venta` opcionales
  - `RecargaReintento` append-only — intento_numero + respuesta JSONB + errorMensaje
  - `RecargaFolioCounter` atómico per-sucursal
- **4 permisos nuevos**: RECARGAS_LEER/VENDER/REEMBOLSAR/CONFIGURAR. Presets: gerente todos, cajero LEER+VENDER, vendedor LEER+VENDER.
- **Migration `add_recargas`** (145 SQL) vía CLI shadow-database, aplicada cross-tenant.
- **Paquete nuevo `@gaespos/recargas`** (5 archivos + tests):
  - `types.ts` con `RechargeProvider` interface (`recargar` + `consultarEstado`), `RecargaInput`/`RecargaResult` + `RecargaError`
  - `catalogo.ts` hardcoded V1: 9 compañías tiempo_aire + Bait pospago con montos válidos + 3 proveedores agregadores. `validarMonto` + `validarNumeroMx` helpers
  - `mock.ts` `MockRecargaProvider` determinista con idempotency memo + opciones para tests (`failNextRecharge`, `rejectNextRecharge`, `numerosInvalidos`)
  - `recargaki.ts` `RecargaKiClient` stub V1 (lanza `RECARGAKI_NOT_CONFIGURED` si api_key vacío/stub-*; URLs reales se conectan cuando Gaby contrate)
  - **17 unit tests** del catálogo + mock + validaciones (idempotencia, monto telcel válido vs inválido, número MX 10 dígitos)
- **Plugin Fastify `apps/api/src/plugins/recargas.ts`** mismo patrón que fiscal: `recargaProviderFactory` decorator con defaultFactory RecargaKi + override para tests con Mock
- **Módulo `apps/api/src/modules/tenant/recargas/`**:
  - `service.ts` con `procesarRecarga` (valida número MX + monto compañía + referencia si servicio + apertura caja, saldo prefondeado suficiente → 409 si no, llama provider con idempotency key derivado de recarga.id, **retry 1x automático** si falla primer intento, persiste RecargaReintento append-only por cada intento, actualiza saldo del proveedor solo si exitosa), `reembolsarRecarga` (solo fallidas/disputadas, devuelve saldo prefondeado), `marcarDisputada` (flag para investigación con agregador), `consultarSaldos` con `bajo` flag cuando saldoActual ≤ alertaMinimo
  - `routes.ts` 8 endpoints `/t/recargas/*`: catalogo público + saldos por proveedor + config proveedor (PUT upsert per-codigo) + list paginado + detalle + procesar + reembolsar + marcar-disputada
- **23 tests integración** (`tenant-recargas.test.ts`) cubriendo catálogo público no expone `mock` provider, sin proveedor configurado→409, config proveedor + roles, recarga exitosa descuenta saldo + comisión calculada, validaciones (número/monto/referencia/montoCobrado<solicitado), retry 1x cuando primera intento rechazada→exitosa→intentosTotales=2 + 2 RecargaReintento records, fallida en ambos intentos NO descuenta saldo, saldo insuficiente→409, reembolso reverses saldo + marca estado=reembolsada + 409 si re-reembolsar + 409 si reembolsar exitosa + 403 si cajero, disputar permite reembolso después, filtros lista. Mock provider con `setOptions()` helper público.
- **IEPS completado** (3.1.d): motor `calcularImpuestosLinea` ahora descompone IEPS+IVA del precio final según tipo:
  - **Porcentaje** (cigarro 160%, cerveza 53%): `base = subtotal / ((1+iepsPct)×(1+ivaPct))`, IEPS=base×iepsPct, IVA=(base+IEPS)×ivaPct ← SAT MX aplica IVA sobre IEPS
  - **Cuota_por_unidad** (refresco azucarado $1.5375/L): IEPS=cantidad×cuota, IVA aplica solo sobre baseSinIeps (cuota NO entra a base IVA por norma SAT)
  - `tasaIeps` JSONB formato `{tipo, valor}` validado con `parseIepsSpec`
  - CFDI 4.0 ahora pasa `aplicaIeps + tasaIeps` por concepto (calculado proporcionalmente del IEPS por línea)
- **4 tests IEPS** verifican aritmética exacta cigarro 2 cajetillas $150.80 → IEPS $80 + IVA $20.80, cerveza $35.46 → IEPS $10.59 + IVA $4.89, refresco 3×$17 → IEPS $4.6125 + IVA $6.398, CFDI emitido con cigarros lleva monto IEPS correcto. Suite total: **282 tests verde** en 73s.
- **Diferidos V1.5/V2**: cron monitor saldo prefondeado bajo via BullMQ + WhatsApp/email al dueño, RecargaKi API real cuando Gaby contrate cuenta, V2 expansión servicios (CFE/SIAPA/Telmex/Megacable) reusará `Recarga` con `tipo=pago_servicio` y nuevas compañías al enum, webhook secret para confirmación async de algunos agregadores.

### 2026-05-20 — 🎉 Hito 2.7 Demo comercial end-to-end CERRADO · Hito 2 al 100%
- **Script nuevo `apps/api/scripts/demo-comercial.ts`** (~620 líneas) registrado como `pnpm --filter @gaespos/api demo:comercial`. Acompaña al `demo:retail` de Hito 1; cada uno ataca un flujo distinto sin duplicar setup.
- **20 pasos verificados contra API LIVE en mock fiscal** (corrida real exitosa):
  1-7. Setup tenant + admin → owner → cajero/vendedor/almacen + CFDI sandbox + 3 productos obra (cemento, tubo PVC, grava) con stock 200 c/u + apertura caja $1,000
  8-9. **Apartado**: cliente B2C aparta 5 cementos con abono inicial $500 → 2 abonos parciales → liquida → genera venta con folio + stockReservado libera + stockActual −5
  10-11. **Fiado**: venta `credito_fiado` 3 tubos PVC $1,392 sube saldo informal; **regularización fiado→CxC**: $1,000 se convierte a CxC formal con interés 2%, fiado queda en $392
  12-13. **Cotización B2B**: vendedor cotiza 30 cementos $6,960 → envía email a `compras@construbajio.com` con PDF placeholder → owner acepta (firma electrónica simulada V1)
  14-16. **Pedido + aprobación umbralizada**: convertir-pedido genera PD-* en estadoAprobacion=`pendiente` (>$5K umbral del cliente), almacen intenta preparar→409 con mensaje claro, owner aprueba
  17. **Tracking paquetería**: almacen prepara→marca enviado con Estafeta+guía+URL→marca entregado
  18. **Convertir-venta credito_b2b**: cajero convierte pedido entregado → venta canal=mayoreo, stock−30, **CxC automática** CXC-* enlazada, línea B2B disponible cae de $50K a $43,040
  19. **Devolución con nota_credito_cxc**: 5 cementos defectuosos devueltos con `reponeStock=false` (merma net-zero), reembolso $1,160 **abona automáticamente a la CxC** del pedido
  20. **Pago final CxC**: cajero registra abono efectivo $5,800 → CxC pasa a estado=liquidada con saldo=0
- **Fix infra**: helper `call()` del demo solo agrega `Content-Type: application/json` cuando hay body (Fastify rechazaba POST sin body cuando declaras content-type JSON).
- **Hito 2 Comercial CERRADO al 100%**. 7/7 sub-tareas verde. Suite total: **255 tests** + 2 demos CLI end-to-end (retail+comercial) funcionando contra API real.
- **Próximos pasos**: tag `hito-2-comercial-v1`. Arrancar Hito 3 Verticales (decisión pendiente: arrancar por Abarrotes o Salud Vet primero).

### 2026-05-20 — Hito 2.6 Cotizaciones → Pedidos B2B cerrado
- **Schema tenant 4.10** (6 modelos + 4 enums nuevos):
  - `Cotizacion` (folio único per-sucursal `QT-{CODIGO}-NNNNNN` + clienteB2bId + vendedorId + estado [borrador|enviada|aceptada|rechazada|vencida|convertida] + totales completos + `fechaVencimiento` + `condicionesPago` snapshot + `pdfFirmadoUrl` + `enviadoCanal` enum [email|whatsapp|descarga|otro] + `enviadoDestino` + `aceptadoAt`/`rechazadoAt`/`rechazoMotivo` + `pedidoId @unique` 1:1 cuando convertida)
  - `CotizacionLinea` snapshot inmutable misma estructura que VentaLinea (sin lote/serie)
  - `CotizacionFolioCounter` atómico per-sucursal
  - `Pedido` (folio único `PD-{CODIGO}-NNNNNN` + clienteB2bId + vendedorId + `cotizacionId @unique` opcional + estado [creado|preparando|enviado|entregado|cancelado] + `estadoAprobacion` [no_requiere|pendiente|aprobada|rechazada] + `aprobadoPorId`/`aprobadoAt`/`rechazadoMotivo` + totales + `ordenCompraCliente` + `direccionEnvioId` FK a ClienteB2bDireccion + `paqueteria`/`trackingExterno`/`trackingUrl` + `fechaEntregaEstimada` + `ventaId @unique` cuando convertido)
  - `PedidoLinea` + `PedidoFolioCounter` atómico
- **5 permisos nuevos**: COTIZACIONES_LEER/ENVIAR/GESTIONAR_ESTADO + PEDIDOS_LEER/CREAR/APROBAR/GESTIONAR/CONVERTIR_VENTA. Presets: gerente todos, vendedor lee+crea+gestiona (sin aprobar), cajero lee+convertir_venta (la cobranza al entregar), almacen lee+gestiona (preparar/enviar/entregar).
- **Migration `add_cotizaciones_pedidos`** (240 SQL) vía CLI shadow-database, aplicada cross-tenant.
- **Módulo `apps/api/src/modules/tenant/cotizaciones/`**:
  - `service.ts` con `crearCotizacion` (motor cascada precios → snapshots por línea + folio + estado borrador, fechaVencimiento derivada de diasVigencia), `enviarCotizacion` (estado=enviada + pdfPlaceholderUrl V1; PDF real con Puppeteer + firma digital → V1.5), `aceptarCotizacion` (valida no vencida), `rechazarCotizacion`. Estado transitions enforced con 409 cuando no aplica
  - `routes.ts` 6 endpoints `/t/cotizaciones/*`
- **Módulo `apps/api/src/modules/tenant/pedidos/`**:
  - `service.ts` con `crearPedido` (directo sin cotización + motor cascada), `convertirCotizacionAPedido` (atomic tx: copia líneas+totales del snapshot, marca cotizacion.estado=convertida+pedidoId, hereda `estadoAprobacion` según `cliente_b2b.requiereAprobacionInterna` + `montoAprobacionRequired` comparado con total), `aprobarPedido`/`rechazarPedido` (gate gerente), state machine `marcarPreparando` (creado→preparando, valida aprobación OK) → `marcarEnviado` con paqueteria+trackingExterno+trackingUrl → `marcarEntregado` (enviado→entregado), `cancelarPedido` (rechazo si entregado o ya ventaId), `convertirAVenta` (entregado → crea Venta canal=mayoreo + descuenta stock con `ajuste_negativo` + valida `credito_b2b` contra línea + **crea CxC automática** desde la venta vía `crearCxcDesdeVentaB2b`, marca pedido.ventaId)
  - `routes.ts` 10 endpoints `/t/pedidos/*` con permisos diferenciados
- **17 tests integración** (`tenant-cotizaciones-pedidos.test.ts`) cubriendo: vendedor crea cotización borrador, **flujo full** cot→enviar→aceptar→convertir→preparar→enviar→entregar→convertir-venta con stock decrementado y `pedido.ventaId` enlazado al final, cliente con `requiereAprobacionInterna` bloquea preparar→409 hasta aprobar, monto bajo umbral → no_requiere → preparar OK, aprobar→preparar happy path, rechazar pedido, vendedor sin PEDIDOS_APROBAR→403, aceptar borrador no enviado→409, convertir cotización rechazada→409, entregar sin enviado→409, convertir pedido no entregado→409, doble convert cotización→409 ya pedidoId, cancelar pedido entregado→409, filtros lista (clienteB2bId, estadoAprobacion=pendiente, estado=entregado), **convertir-venta con `credito_b2b` crea CxC automática y consume línea**. Suite total: **255 tests verde** en 64s.
- **Diferidos a V1.5/V2**: generación PDF real con Puppeteer + firma electrónica cliente, recordatorios automáticos vencimiento via BullMQ, integración paqueterías (Estafeta/DHL/FedEx) consulta tracking, cancelación parcial líneas pedido, validación stock disponible al crear pedido (V1 sólo se valida al convertir-venta), pedido directo sin cotización con motor de aprobación adicional.

### 2026-05-20 — Hito 2.5 Devoluciones con CFDI Egreso cerrado
- **Schema tenant 4.9.d** (3 modelos + 4 enums nuevos):
  - `Devolucion` (folio único per-sucursal `DV-{CODIGO}-NNNNNN` + `tipo` [total|parcial] + `motivo` [defectuoso|cambio_opinion|talla_color|error_cobro|garantia|otro] + `metodoReembolso` [efectivo|tarjeta_misma|saldo_a_favor|vale|transferencia|nota_credito_cxc|nota_credito_fiado] + totales devueltos + `reponeStockDefault` + `aprobadoPorId` para flujo V1.5 + estado [procesada|cancelada])
  - `DevolucionLinea` (snapshot inmutable, `ventaLineaId` link, `cantidadDevuelta`, `reponeStock` per-linea con override, `motivoLinea` opcional)
  - `DevolucionFolioCounter` atómico per-sucursal (mismo patrón que ventas/apartados/cxc)
- **Refactor Cfdi**: removido `@unique` de `Cfdi.ventaId` (una venta puede tener 1 Ingreso + N Egresos), agregados campos `devolucionId @unique` + `tipoRelacionSat` + `cfdiRelacionadoUuids[]` para soportar CFDI Egreso con relación SAT tipo 03 (Nota de crédito).
- **Extensión `@gaespos/fiscal`**: tipo `CfdiEmitirInput` ahora acepta `cfdisRelacionados?: { tipoRelacion; uuids[] }` para que el mock y Facturama V1.5 generen el nodo `CfdiRelacionados` correcto.
- **Inventario service**: nuevo tipo `devolucion_cliente` en `MovimientoTipoFront` con signo +1 (reusa el mismo enum del schema).
- **Permisos cajero/vendedor extendidos**: añadido `VENTAS_DEVOLVER` por default (referencia Square/Shopify retail estándar — refunds rutinarios al register). Manager approval umbralizado queda para V1.5.
- **Bonus infra cumplido**: la migration `add_devoluciones` (140 SQL) se generó vía `pnpm migrate make tenant add_devoluciones` (el CLI shadow-database introducido en Hito 2.4 sigue funcionando perfectamente para schema deltas multi-tabla).
- **Módulo `apps/api/src/modules/tenant/devoluciones/`**:
  - `service.ts` con `procesarDevolucion(client, provider, usuarioId, ventaId, input)`:
    - Carga venta (valida cobrada, no cancelada), valida método reembolso compatible (`nota_credito_fiado` requiere cliente B2C y pago previo `credito_fiado`, `nota_credito_cxc` requiere `cuentaCobrar` enlazada)
    - `validateAndCalcLineas`: calcula cantidad ya devuelta acumulada por VentaLinea (sumando devoluciones procesadas), valida `cantidadDev <= disponible` (409 con extra `disponible/intentado`), proporciona prorrateo de iva/ieps/subtotal según `cantidadDev / cantidadOriginal`
    - Determina `tipo` total si todas las líneas devueltas = cantidad original, parcial en otro caso
    - Genera folio + crea registros + por cada línea: `aplicarAjuste(devolucion_cliente, +N)` SIEMPRE (las piezas vuelven al inventario); si `reponeStock=false`, adicionalmente `aplicarAjuste(merma, -N)` (net 0 en stock pero 2 movimientos para audit/trazabilidad)
    - Aplica reembolso: `nota_credito_fiado` → `aplicarAbonoFiado` (reduce saldo), `nota_credito_cxc` → `registrarPago` (abona a CxC), otros métodos solo se registran
    - Si venta tiene CFDI Ingreso vigente y `input.cfdiEgreso` provisto: emite CFDI Egreso (tipoComprobante="E") con `cfdisRelacionados={tipoRelacion:"03", uuids:[ingreso.folioFiscal]}`, hereda emisor/receptor del Ingreso, persiste en `Cfdi` con link `devolucionId @unique` + `tipoRelacionSat="03"`, estado pendiente→vigente; si timbrado falla mantiene estado=error
  - `routes.ts` 3 endpoints: `POST /t/ventas/:id/devolver` (gate `VENTAS_DEVOLVER`, factory provider por config tenant, 409 si pide cfdiEgreso pero CFDI no configurado), `GET /t/devoluciones` con filtros (estado/tipo/motivo/metodoReembolso/sucursal/venta/usuario/desde/hasta), `GET /t/devoluciones/:id` con detalle líneas+CFDI
- **15 tests integración nuevos** (`tenant-devoluciones.test.ts`) cubriendo: devolución parcial repone stock con `devolucion_cliente`, defectuoso con `reponeStockDefault=false` produce net-zero stock + 2 movimientos audit, override per-linea, tipo total vs parcial, cantidad acumulada (segunda devolución rechazada 409 con extra `disponible`), ventaLineaId cruzado entre ventas → 400, venta cancelada → 409, `nota_credito_fiado` reduce saldo fiado / 400 sin clienteId / 409 sin credito_fiado previo, `nota_credito_cxc` registra pago en CxC asociada, CFDI Egreso emitido cuando hay Ingreso vigente / `cfdiEgresoId=null` si no hay Ingreso, listado filtrado por motivo/ventaId, rol almacen sin VENTAS_DEVOLVER → 403. Suite total: **238 tests verde**.
- **Diferidos a Hito 2.7/V1.5**: cancelación de devolución (revertir stock + reversal CFDI Egreso), aprobación de devoluciones >umbral por gerente, motivo `defectuoso` con devolución a proveedor (`devolucion_proveedor` movimiento), refunds automáticos a tarjeta vía Stripe/Conekta (hoy queda en mano del cajero).

### 2026-05-20 — Hito 2.4 CxC formal cerrado
- **Schema tenant 4.9.c** (3 modelos + 2 enums nuevos):
  - `CuentaCobrar` con folio único per-sucursal `CXC-{CODIGO}-{NNNNNN}`, `tipoOrigen` enum [venta_credito|regularizacion_fiado|manual|apertura_saldo_inicial], `clienteId` O `clienteB2bId` (exactamente uno), `ventaId @unique` (opcional, link 1:1 a venta), `vendedorId` + `comisionPagadaAVendedor` flag para Hito 4 comisiones, `montoOriginal`/`montoPagado`/`currency`, `fechaEmision`/`fechaVencimiento`/`diasCreditoOtorgados`, `tasaInteresMoraPct`/`interesAcumulado` (interés job nocturno → V2), estado [activa|vencida|liquidada|incobrable|condonada]
  - `CxcPago` append-only (metodo VentaPagoMetodo + monto + referencia + comprobanteUrl + usuarioId)
  - `CxcFolioCounter` atómico per-sucursal (mismo patrón que ventas/apartados)
- **Enum extendido**: `VentaPagoMetodo` ahora incluye `credito_b2b` (junto al `credito_fiado` informal B2C).
- **4 permisos nuevos**: CXC_LEER/CREAR/COBRAR/CONDONAR. Roles preset: gerente (4), cajero (LEER+COBRAR), vendedor (LEER+CREAR+COBRAR), contador_interno (LEER+COBRAR).
- **Bonus infra**: nuevo CLI `pnpm migrate make <target> <name>` que genera migrations vía shadow database temporal — reutilizable para todas las migrations futuras. Resuelve la limitación de `prisma migrate dev` con multi-schema.
- **Migration `add_cxc`** generada (102 líneas SQL: enums + tablas + 7 FKs + índices) y aplicada cross-tenant.
- **Módulo `apps/api/src/modules/tenant/cxc/`**:
  - `service.ts` con `lineaCreditoDisponible(clienteB2bId)` (autorizada - sum CxC abiertas), `validarCreditoB2bSuficiente`, `crearCuentaCobrar` (genera folio + fechaVencimiento computada), `crearCxcDesdeVentaB2b`, `registrarPago` (marca liquidada cuando saldo=0, rechaza pagos sobre liquidada/condonada), `condonarCxc`, `marcarIncobrable`. `CxcError` con statusCode+extra estructurado.
  - `routes.ts` 8 endpoints `/t/cxc/*`: GET list (filtros estado/tipoOrigen/cliente/vendidasAntes), GET /linea-credito, GET /:id, POST manual, POST /:id/pagos, POST /:id/condonar, POST /:id/incobrable, POST /regularizar-fiado
- **Integración `crearVenta`**: detecta `pago.metodo === "credito_b2b"`, valida `clienteB2bId` requerido + línea suficiente ANTES de la transacción, dentro de la tx crea la CxC con `tipoOrigen=venta_credito` heredando `diasCredito` y `tasaInteresMoraPct` de la línea activa. Rechaza cambio cuando hay pago a crédito.
- **Regularización fiado→CxC** en `fiado-service.ts`: nueva `regularizarFiadoToCxc` que en una sola tx reduce el saldo de fiado vía `FiadoMovimiento(tipo=regularizacion_cxc)` + crea CxC `tipoOrigen=regularizacion_fiado` ligada via `referenciaTipo/referenciaId`.
- **23 tests integración nuevos** (`tenant-cxc.test.ts`) cubriendo: línea crédito sin/con CxC abiertas, CxC manual + permisos cajero, pagos parciales/totales/excedidos, venta credito_b2b auto-CxC + consumo línea + 409 si excede + 400 si cambio + 400 sin clienteB2bId, condonar/incobrable + 403 cajero, regularización fiado con saldo restante, filtros lista. Suite total: 223 tests verde.

### 2026-05-20 — Hito 2.3 Apartados cerrado
- **Schema tenant 4.9.b** (4 modelos + 2 enums nuevos):
  - `Apartado` (folio único per-sucursal `AP-{CODIGO}-{NNNNNN}`, sucursal+caja+usuario, clienteId O clienteB2bId, totales completos, **montoPagado** acumulado, fechaApartado + **fechaLimite** computado de `diasVigencia`, estado [activo|liquidado_y_entregado|cancelado|expirado], `politicaCancelacion` snapshot + `penaCancelacionPct`, motivoCancelacion + canceladaPorId, liquidadoAt/canceladoAt, relación 1:1 inversa con Venta para detalle)
  - `ApartadoLinea` (numero per-apartado unique, snapshot inmutable del producto, mismos campos que VentaLinea: cantidad+precios+impuestos+descuentos+totalLinea+`descuentosAplicados` jsonb del motor cascada + `snapshotProducto` jsonb)
  - `ApartadoAbono` (append-only: metodo enum 6 valores + monto + referencia + comprobanteUrl + usuarioId, no admite eliminación)
  - `ApartadoFolioCounter` (counter atómico por sucursal — mismo patrón que VentaFolioCounter)
- **Extensión Venta**: campo `apartadoId @unique` (FK opcional) para relación 1:1 inversa cuando la venta nace de un apartado liquidado.
- **5 permisos nuevos** en `@gaespos/permissions`: APARTADOS_LEER/CREAR/ABONAR/LIQUIDAR/CANCELAR + descripciones por categoría. Roles preset actualizados: gerente tiene todos los 5; cajero y vendedor tienen LEER/CREAR/ABONAR/LIQUIDAR (no CANCELAR).
- **Migration `add_apartados`** generada via shadow schema postgres + aplicada cross-tenant a 7 tenants.
- **Extensión `@gaespos/api`** inventario service con dos helpers nuevos:
  - `aplicarReservaApartado(tx, input)` valida `stockActual - stockReservado >= cantidad` (rechaza con `InsufficientStockError` 409), incrementa `stockReservado` SIN tocar `stockActual`, crea movimiento tipo `apartado_reservado`
  - `liberarReservaApartado(tx, input)` decrementa `stockReservado` con `Math.max(0, ...)` para no ir negativo, crea movimiento tipo `apartado_liberado`
- **Service `apartados/service.ts`** con 4 operaciones atómicas en `$transaction`:
  - `crearApartado` invoca `calcularPreview` del motor cascada (reusa motor de pricing) → buildLineas con impuestos desglosados → `nextFolio` → crear apartado + reserva stock por cada línea + abono inicial opcional. InsufficientStockError mapeado a ApartadoError 409 con extra.stockDisponible/intentado
  - `registrarAbono` valida apartado activo + monto ≤ saldo (no excede), actualiza `montoPagado`, crea abono
  - `liquidarApartado` valida `montoPagado >= total` → por cada línea: libera reserva + descuenta stockActual via `aplicarAjuste(tipo: ajuste_negativo)` → genera folio venta con `nextVentaFolio` → crea Venta con `apartadoId` + VentaLineas con snapshot copiado + VentaPagos copiando los abonos como pagos → marca apartado `liquidado_y_entregado`
  - `cancelarApartado` libera todas las reservas + calcula pena = `montoPagado * penaPct/100` (override opcional) + reembolso = `montoPagado - pena` + marca cancelado con motivo + canceladaPorId
- **Endpoints `/t/apartados*`**:
  - GET lista paginada con filtros estado/clienteId/clienteB2bId/sucursalId/desde/hasta (helper `buildApartadoWhere`)
  - GET `/:id` detalle full con líneas+abonos+canceladaPor+venta linkada
  - POST `/` (APARTADOS_CREAR) crear apartado atómico
  - POST `/:id/abonos` (APARTADOS_ABONAR) registrar abono
  - POST `/:id/liquidar` (APARTADOS_LIQUIDAR) genera venta vinculada
  - POST `/:id/cancelar` (APARTADOS_CANCELAR — sólo gerente/dueno) aplica pena con override opcional
- **Schema Zod refine**: apartado requiere `clienteId` O `clienteB2bId` (400 si ambos null).
- **14 tests integración** en `tenant-apartados.test.ts`:
  - Crear: rechaza sin cliente (400), cajero crea apartado con abono inicial → reserva stockReservado +N sin tocar stockActual, stock insuficiente → 409 con extra, abono inicial > total → 400
  - Flujo abonos: abono parcial reduce saldo, abono > saldo → 409, liquidar antes de saldar → 409
  - **Liquidación**: abono final + liquidar → crea venta `SUC-PRINCIPAL-NNNNNN`, libera reservado, descuenta stockActual, estado=liquidado_y_entregado, venta linkada visible en detalle, re-liquidación → 409
  - **Cancelación**: cajero sin APARTADOS_CANCELAR → 403, owner cancela $200 con penaPct 25% → pena=$50 reembolso=$150, stockReservado liberado, cancelación con `penaPctOverride: 0` → pena=$0 reembolso=$100 (excepción VIP)
  - Listado: filtros por estado y clienteId
- **Suite total: 200 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 259 tests verdes en ~14s**
- **Diferidos**:
  - Job nocturno `apartado_expirado` (mueve activo+fecha_limite_pasada → expirado + libera reservas + aplica pena automática) → V2 con BullMQ workers
  - Cancelación con CFDI Egreso si abono inicial fue facturado → Hito 2.5 Devoluciones
  - Pena retiene en monedero del tenant (no devolución directa) → V1.5
- **Próxima sesión empieza en**: 2.4 CxC formal — `cuentas_cobrar` auto-creadas al cobrar venta con método `credito`, abonos manuales, regularización fiado→CxC, método pago `credito_b2b` valida línea_disponible.

### 2026-05-20 — Hito 2.2 Clientes B2B + crédito formal cerrado
- **Schema tenant 4.8.b** (6 modelos + 3 enums nuevos):
  - `ClienteB2b` (razonSocial + nombreComercial, **RFC unique** validado, regimenFiscalSat, datos contacto, sitio_web, representante_legal, industria, tamaño_negocio, **nivelMayoreoId FK opcional** a NivelPrecioMayoreo, **listaPrecioPrincipalCodigo** opcional, diasCreditoDefault 0-180, condicionesPago enum [contado|credito|mixto], requiereOrdenCompra toggle del cliente, formatoFacturaPreferido enum [pdf|xml|pdf_xml], **requiereAprobacionInterna + montoAprobacionRequired** para órdenes mayores a X, notas, isActive+archivedAt)
  - `ClienteB2bContacto` (multi: Gerente Compras/Asistente/Contadora con flags esDecisor + esPagador)
  - `ClienteB2bDireccion` (multi sucursales/bodegas envío con contactoRecepcionNombre/Telefono + horarioRecepcion + swap isDefaultEnvio)
  - `ClienteB2bCredito` (lineaAutorizada + diasCredito + tasaInteresMoraPct + permiteFacturasVencidas + garantiaDocumentada + vigencia + aprobadoPorId FK Usuario, **max 1 activa por cliente**, renovaciones archivan la anterior)
  - `ClienteB2bListaPrecio` join M2M (cliente_b2b + lista + prioridad + vigencia) — un cliente puede tener varias listas con orden de prelación
  - `ClienteB2bVendedorAsignado` join (cliente_b2b + usuario + tipo enum [principal|secundario|cobranza] + **comisionPctOverride** opcional + vigencia) — PK compuesta permite mismo vendedor en distintos roles
- **Extensión `Venta`**: nuevo campo `clienteB2bId` (FK opcional a ClienteB2b) + index. Permite que la venta apunte a B2B en vez de B2C (mutuamente excluyentes en práctica).
- **Migration `add_clientes_b2b_credito`** (199 líneas) aplicada cross-tenant via shadow schema postgres.
- **Endpoints `/t/clientes-b2b*`**:
  - GET lista paginada con `buildB2bWhere` (búsqueda multi-criterio: razonSocial/nombreComercial/rfc/email/telefonoPrincipal + contactos relacionales con `.some`) + filtros industria/nivelMayoreo/condicionesPago/isActive
  - GET `/:id` detalle full con nivelMayoreo + contactos activos + direcciones + créditos (ordenados desc) + listasPrecio (incluye lista) + vendedoresAsignados (incluye usuario)
  - POST con validación `nivelMayoreoId` existe (404) y `listaPrecioPrincipalCodigo` existe (404)
  - PATCH/DELETE soft-archive (sin guard de read-only porque B2B no tiene un "público en general")
  - POST `/:id/contactos` (multi-contacto)
  - POST `/:id/direcciones` con swap isDefaultEnvio
  - POST `/:id/credito` (permiso `clientes.fiado_gestionar`): archiva la línea activa anterior + crea nueva. Aprobador = `req.principal.userId`
  - POST `/:id/listas-precio` upsert (cliente_b2b + lista_id PK), valida lista existe (404)
  - POST `/:id/vendedores` upsert (cliente_b2b + usuario + tipo PK), valida usuario existe (404)
- **15 tests integración nuevos** en `tenant-clientes-b2b.test.ts`:
  - CRUD: crear con flags fiscales completos, RFC duplicado → 409, búsqueda parcial razón social + RFC, detalle con todas las relaciones, PATCH notas
  - Sub-recursos: agregar 3 contactos con roles (decisor/pagador), 2 direcciones con swap is_default_envio + recepción contact info
  - Créditos: autorizar línea de $50,000 con tasaInteresMora + notas; segunda autorización ($100,000) archiva la primera automáticamente (max 1 activa)
  - Listas precio: asignar PUBLICO con prioridad, lista inexistente → 404
  - Vendedores: asignar principal con comisionOverride 7.5%, segundo rol "cobranza" sobre mismo cliente (PK compuesta permite ambos)
  - **Venta a B2B**: crear venta con `clienteB2bId` (sin clienteId) cobra correctamente y persiste la referencia para detalle
- **Suite total: 186 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 245 tests verdes en ~14s**
- **Diferidos**:
  - `cliente_b2b_documentos` (acta constitutiva, comprobante domicilio, ID, RIF, pagaré con S3) → V1.5
  - `cliente_b2b_usuarios` (portal autoservicio B2B con su propio login) → Hito 3 B2B portal
  - Método pago `credito_b2b` que valida `linea_disponible = autorizada - sum(cxc abiertas)` → Hito 2.4 cuando exista CxC formal
- **Próxima sesión empieza en**: 2.3 Apartados — reserva de stock con abonos, liquidación a venta, cancelación con pena de cancelación. Reusará `aplicarAjuste` con tipo nuevo `apartado_reservado`.

### 2026-05-20 — Hito 2.1 Clientes B2C + fiados cerrado
- **Schema tenant 4.8** (7 modelos + 3 enums nuevos):
  - `Cliente` (B2C) con tipo enum [publico_general|frecuente|vip|empleado] + is_default flag, nombre/apellidos separados (CFDI), email/teléfono principales, fecha_nacimiento + género, RFC unique + regimenFiscalSat + usoCfdiDefault + codigoPostalFiscal + direccionFacturacion jsonb, cliente_grupo_id FK, vendedor_asignado_id FK, permite_fiado + limite_fiado, acepta_marketing opt-in, idioma_preferido, notas, is_active + archived_at. **Vinculación PHR diferida a Hito 3 Salud** (campo patient_master_id NO incluido todavía)
  - `ClienteDireccion` (multi: Casa/Oficina/Mamá con calle+CP+lat/lng+is_default_envio/facturacion swap)
  - `ClienteTelefono` (multi: Celular/Casa/Trabajo con flag whatsapp + es_principal swap)
  - `ClienteGrupo` (segmentación: código único + descuento_default_pct + lista_precio_codigo + color/icono)
  - `ClienteEtiqueta` (tags libres many-to-many, PK compuesta cliente+etiqueta)
  - `Fiado` (1 fila por cliente: monto_total + fecha_ultimo_movimiento + estado [activo|liquidado|incobrable])
  - `FiadoMovimiento` (append-only: cargo_venta | abono_pago | ajuste_+/- | regularizacion_cxc, con venta_id FK opcional + metodo_pago + comprobante_url)
- **Migration `add_clientes_b2c_fiados`** aplicada cross-tenant via shadow schema postgres.
- **Migration adicional `add_credito_fiado_metodo`** agrega valor `credito_fiado` al enum `VentaPagoMetodo` (`ALTER TYPE ... ADD VALUE`).
- **Seed extendido**: `seedTenantDefaults` ahora crea cliente "Público en general" con `isDefault=true` + tipo `publico_general` por tenant. Re-aplicado a 6 tenants existentes.
- **Service `clientes/fiado-service.ts`**:
  - `aplicarCargoFiado(tx, input)`: valida cliente.permiteFiado, calcula nuevo total, rechaza con `FiadoError 409` si excede `limite_fiado`, actualiza fiado + crea movimiento `cargo_venta` referencia venta_id
  - `aplicarAbonoFiado(client, input)`: en `$transaction` valida monto ≤ saldoActual, marca `liquidado` si saldo=0, crea movimiento `abono_pago` con método de pago + comprobante opcional
  - `disponibleFiado(limite, total)`: helper computado para vista
  - `ensureFiado(tx, clienteId)`: upsert idempotente
- **Endpoints `/t/clientes*`**:
  - GET `/t/clientes` lista paginada con búsqueda multi-criterio (`?q=` matchea nombre + apellidos + rfc + email + telefonoPrincipal + telefonos relacionales) + filtros tipo/grupo/permiteFiado/isActive
  - GET `/t/clientes/default` (cliente Público en general para POS quick-pick)
  - GET `/t/clientes/:id` detalle full con direcciones+telefonos+etiquetas+fiado+movimientos
  - POST/PATCH/DELETE bloquean modificar/archivar el cliente `isDefault=true` (público en general read-only)
  - POST `/:id/direcciones`, `:id/telefonos`, `:id/etiquetas` con swap automático de is_default_*
  - DELETE `/:id/direcciones/:dirId`, `/:id/etiquetas/:etiqueta`
  - GET `/:id/fiado` retorna `{limite, usado, disponible, estado, movimientos}`
  - POST `/:id/fiado/abonar` (permiso `clientes.fiado_gestionar`)
  - GET/POST `/t/clientes/grupos` CRUD grupos
- **Integración cross-módulo en `crearVenta`** (apps/api/src/modules/tenant/ventas/service.ts):
  - `validarPagos` ahora detecta método `credito_fiado`, requiere `clienteId` (400 si falta), prohíbe cambio (400 si genera)
  - Tras persistir la venta, si hay `pagoFiado > 0` invoca `aplicarCargoFiado` en la misma transaction → valida límite + crea cargo + recalcula fiado.monto_total
  - `FiadoError` mapeado a `VentaError` con statusCode + extra preservados
- **25 tests integración nuevos** en `tenant-clientes.test.ts`:
  - Seed: GET /default, listado ordena público primero, PATCH/DELETE del público → 403
  - CRUD B2C: crear con RFC case-insensitive normalizado a UPPER, RFC malformado → 400, RFC duplicado → 409, búsqueda por nombre/teléfono/RFC parcial, cajero puede leer pero no crear, PATCH actualiza limiteFiado
  - Sub-recursos: 2 direcciones con swap is_default_envio, 2 teléfonos con swap es_principal + flag whatsapp, agregar/eliminar etiqueta
  - **Fiados**: GET fiado con disponible computado, venta `credito_fiado` $200 dentro de límite $300 carga al fiado, segunda venta excede límite → 409 con extra.disponible, venta a fiado sin clienteId → 400, abono parcial reduce saldo, abono > saldo → 409, abono total marca `liquidado`, cliente sin permiteFiado → 409
  - Grupos: crear grupo con descuentoDefaultPct + asignar cliente al grupo
- **Suite total: 171 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 230 tests verdes en ~14s**
- **Diferidos** (decisiones explícitas):
  - Clientes B2B (`clientes_b2b` + contactos + crédito formal + listas precio + vendedores) → Hito 2.2 siguiente
  - Vinculación PHR cliente↔patient_master → Hito 3 Salud
  - Búsqueda semántica vector_embedding pgvector → V1.5
  - Validación RFC contra SAT API → V2 (V1 solo regex)
  - Regularización fiado → CxC formal → Hito 2.4 cuando exista CxC
  - Job apartado_expirado + interés moratorio CxC → V2 con BullMQ
- **Próxima sesión empieza en**: 2.2 Clientes B2B + crédito formal — modelo 4.8.b con tablas razón social + contactos + direcciones envío + líneas crédito + multi-listas-precio + comisión multi-vendedor.

### 2026-05-17 — 🎉 Hito 1.7 Demo cajero retail end-to-end + cierre Hito 1 completo
- **Script CLI verificado** `apps/api/scripts/demo-cajero-retail.ts` que ejecuta el flujo completo del POS retail contra una API live, con salida colorizada y asserts en cada paso:
  1. Login admin → POST tenant fresh con plan starter
  2. POST `/tenants/:slug/bootstrap-owner` para crear el primer dueño del tenant (endpoint admin nuevo)
  3. Dueño crea cajero con rol preset
  4. Localiza SUC-PRINCIPAL + CAJA-1 sembradas por defecto
  5. PUT `/t/cfdis/config` configura CFDI sandbox
  6. Crea categoría Abarrotes + marca Demo MX + 3 productos (Coca/Sabritas/Galletas) con barcodes EAN-13 + stock 50 c/u
  7. Cajero abre caja con $500 fondo inicial
  8. GET `/t/productos/buscar/:barcode` lookup rápido (UX POS escaneo)
  9. POST `/t/precios/preview` (motor cascada) → POST `/t/ventas` multi-pago tarjeta+efectivo con cambio
  10. POST `/t/ventas/:id/cfdi/emitir` → CFDI 4.0 UUID válido vía MockFacturamaClient
  11. GET `/t/ventas/:id/ticket` JSON listo para Print Bridge con CFDI + autofactura URL embebidos
  12. Movimientos manuales caja (entrada préstamo + salida gasto)
  13. POST `/t/cortes` tipo X informativo
  14. Venta extra post-X
  15. POST `/t/cortes` tipo Z con denominaciones contadas → cierra caja, reporta diferencia/cuadre/sobrante/faltante
  16. Verifica con 409 que ventas quedan bloqueadas hasta nueva apertura
- **Endpoint nuevo admin** `POST /tenants/:slug/bootstrap-owner` para crear el primer dueño del tenant programáticamente (requerido por demo automation + onboarding de nuevos clientes piloto). Valida tenant existe, busca rol preset "dueno", verifica email no duplicado, crea usuario con argon2 + asigna rol.
- **Flag `FISCAL_PROVIDER=mock` en `server.ts`** para inyectar `MockFacturamaClient` en dev/demo sin requerir API key real de Facturama. Default sigue siendo `FacturamaClient` real (prod). Logea warning visible al arrancar con mock.
- **Script `pnpm --filter @gaespos/api demo:retail`** ejecutable con un comando. Salida con emojis + colores ANSI + asserts en cada paso. Si algo falla, dump del response body + exit 1.
- **tsconfig.json apps/api** incluye `scripts/**/*` para que el typecheck en CI valide el demo también.
- **Verificación end-to-end OK**: corrida real contra API local con `FISCAL_PROVIDER=mock` completó los 16 pasos en ~3s, CFDI timbrado con UUID `CA029BF0-1AA7-4775-9670-6977E70583DB`, ticket JSON incluye autofactura URL `/autofactura/demo-mpdhgpou/venta/cmpdhgrs50014eixwgcu55bg9`, corte Z reporta sobrante de $127, ventas post-Z rechazadas con 409 como esperado.
- **Suite total: 146 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 205 tests verdes (sin regresiones por cambio en server.ts)**

### 🏁 Cierre de Hito 1 — POS Core retail
- **8 sub-tareas completadas** (1.0 docs + 1.1 RBAC + 1.2 Productos/Inventario/Precios + 1.3 Ventas + 1.4 Cortes + 1.5 CFDI + 1.6 Print Bridge contract + 1.7 Demo)
- **Commits del Hito 1**: 1 doc + 11 features (un commit por sub-tarea con su test suite)
- **Suite estable**: 205 tests verdes en ~14s (146 integración API + 59 unit packages)
- **6 packages nuevos en workspace**: `@gaespos/permissions`, `@gaespos/pricing`, `@gaespos/fiscal` (además de `@gaespos/db` y `@gaespos/api` ya existentes)
- **App Rust scaffold nuevo**: `apps/print-bridge` (Tauri 2 + axum, espera hardware para 1.6.b)
- **Diferidos a hitos posteriores** (decisiones explícitas):
  - 1.5.c autofactura pública con QR + 1.6.b ESC/POS Rust → cuando Gaby tenga dominio + hardware
  - Apartados, CxC formal, devoluciones parciales por línea, clientes B2B, cotizaciones, promociones lealtad → Hito 2
  - Verticales Salud (vet + humano N3), Abarrotes (recargas+servicios), B2B portal, Doctoralia, Partner contador → Hito 3
  - Bulk import CSV Eleventa, pgvector búsqueda semántica, particionamiento tablas, S3 XML/PDF, IVA 8% frontera → V1.5
  - Hetzner CPX31 + Coolify + dominio staging + GitHub remote + CI deploy → Hito 0 pendientes externos
- **Hito vendible**: el flujo demo (script CLI) es lo que se le muestra a los 1-2 clientes piloto retail para validar el reemplazo de Eleventa antes de empezar Hito 2.
- **Próxima sesión empieza en**: decidir el orden — (a) cerrar las 3 tareas externas pendientes de Hito 0 (Hetzner+dominio+GitHub) para tener staging real y mostrarlo a clientes, o (b) arrancar Hito 2.1 Modelo 4.8 Clientes. La recomendación es (a) primero porque desbloquea validación con clientes reales y CI funcional.

### 2026-05-17 — Hito 1.6.a Print Bridge contrato JSON + endpoints backend cerrado
- **Endpoints backend nuevos** (`apps/api/src/modules/tenant/tickets/`):
  - `GET /t/ventas/:id/ticket` (VENTAS_LEER) — devuelve `TicketVenta` JSON estructurado: emisor (RFC, razónSocial, sucursal con codigo/nombre/teléfono/dirección, caja), venta (folio, fecha, cajero, cliente, canal, moneda), líneas (numero, sku, descripcion, cantidad, precioUnit, subtotal, descuento), pagos (metodo, monto, ultimosCuatro), totales (subtotal, descuentoTotal, ivaTotal, iepsTotal, total, totalCobrado, cambioDado), cfdi opcional (folioFiscal UUID, serie+folio, fechaTimbrado, selloDigital+selloSat+noCertificado+cadenaOriginal, rfc+razónSocial receptor), autofactura opcional con `urlPortal + expiraAt`
  - `GET /t/cortes/:id/ticket` (CORTE_IMPRIMIR) — devuelve `TicketCorte`: emisor (sucursal+caja), corte (tipo X|Z, numero, desdeAt/hastaAt, cajero), ventas (count, canceladas, total), desglosePorMetodo, desgloseMovimientos (entradas/salidas/neto), efectivo (esperado/contado/diferencia), denominaciones (billetes+monedas), observaciones
- **Decisión**: el backend genera el JSON estructurado del ticket; el Print Bridge (Rust nativo) lo recibe via HTTP local y renderiza ESC/POS. Esto desacopla el contrato (estable, testeable) de la implementación de hardware (compleja, requiere device físico).
- **App `apps/print-bridge` scaffold Rust + Tauri 2**:
  - `Cargo.toml`: tauri 2 + axum 0.7 + serde + tokio + tower-http CORS. `escpos` y `rusb` comentados (descomentar en 1.6.b cuando se implemente la impresión real)
  - `src/main.rs`: HTTP server local `127.0.0.1:9876` con endpoints `/status` (healthcheck) y `POST /print/ticket` (recibe Ticket JSON, loggea, devuelve `{ok, queued}`)
  - `src/types.rs`: structs Rust con `serde::Deserialize` que matchean exactamente el contrato JSON del backend (`Ticket` discriminated por `tipo: "venta"|"corte"`)
  - `README.md` extenso documentando: por qué existe, estado actual (contrato listo, ESC/POS pendiente), cómo arrancar local, decisiones cerradas (standalone vs embebido, solo USB V1, solo Epson V1, sin cola persistente V1, sin firma comandos V1)
  - Excluido del workspace pnpm (`!apps/print-bridge` en `pnpm-workspace.yaml`) porque es Rust nativo, no Node
- **5 tests integración nuevos** en `tenant-tickets.test.ts`:
  - Venta sin CFDI: ticket completo con sucursal+caja+cajero+líneas+pagos+totales+cambio, cfdi=null, autofactura=null (porque sin config)
  - Venta CON CFDI vigente: ticket incluye bloque cfdi con folioFiscal UUID válido + rfcReceptor; autofactura con `/autofactura/<slug>/venta/<id>` y expiraAt
  - Venta inexistente → 404
  - Corte: ticket con cabecera + ventas + desglose + denominaciones (billetes 200=1, 50=1, monedas 10=8 → efectivo contado 330)
  - Corte inexistente → 404
- **Suite total: 146 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 205 tests verdes**
- **Diferidos a 1.6.b (cuando Gaby tenga TM-T20III en escritorio)**:
  - Implementar `escpos` Rust en `src/main.rs:print_ticket`: parsear Ticket → comandos ESC/POS (INIT, encoding LATIN1, líneas, separadores, QR autofactura, cortar papel)
  - `rusb` para enumerar impresoras USB conectadas + endpoint `GET /printers`
  - Configuración local (qué impresora por defecto, encoding, anchura caracteres 32|42|48)
  - Build instalador Tauri por OS (Windows .msi, macOS .dmg, Linux .AppImage)
- **Diferidos a V1.5**:
  - Impresoras red TCP/IP (Star TSP650, Zebra, etc.)
  - Cola persistente con Redis local + retries
  - Multi-equipo en red con token compartido
- **Próxima sesión empieza en**: 1.7 Demo cajero retail end-to-end. Pendientes opcionales 1.5.c autofactura pública + 1.6.b ESC/POS Rust quedan para cuando Gaby tenga dominio + hardware listos.

### 2026-05-17 — Hito 1.5 Modelo 4.19 CFDI 4.0 + Facturama cerrado (autofactura pública diferida)
- **Paquete `@gaespos/fiscal` nuevo** abstrayendo el PAC:
  - `FiscalProvider` interface (emitir + cancelar) — permite swappear PAC sin tocar lógica de negocio
  - `MockFacturamaClient`: implementación determinista para tests con UUID v4 random + XML CFDI 4.0 simulado + PDF base64 mock; helpers `failNextEmit/failNextCancel`
  - `FacturamaClient`: cliente HTTP real contra Facturama API (sandbox/prod), Basic auth + timeout 15s + descarga XML/PDF post-timbrado
  - Tipos exportados: `UsoCfdi` (G01/G03/D01/P01/S01), `FormaPagoSat` (01/02/03/04/28/99), `MetodoPagoSat` (PUE/PPD), `RegimenFiscalSat` (12 regímenes principales), `TipoComprobante`, `MotivoCancelacionSat` (01/02/03/04), `CfdiEmitirInput/Result`, `CfdiCancelarInput/Result`, `FiscalError`
  - 3 tests unit del mock (emitir determinista, cancelar Cancelado, failNext)
- **Schema tenant 4.19** (2 modelos + 4 enums):
  - `CfdiConfig` singleton-like (rfcEmisor unique, razonSocial, regimenSat, códigoPostal+lugarExpedicion, serieDefault+folioCounter, facturamaApiKey + ambiente sandbox/prod, autofacturaActiva + diasAutofactura). Certificados .cer/.key NO guardados (Facturama panel los tiene)
  - `Cfdi` (ventaId unique 1:1, serie+folio unique, folioFiscal UUID SAT unique, fecha emisión/timbrado, snapshot completo emisor+receptor con RFC/razonSocial/CP/régimen/usoCFDI, subtotal/iva/ieps/total, estado [pendiente|vigente|cancelado|error], facturamaId + sellos SAT + cadenaOriginal, **xml + pdfBase64 inline V1**, cancelación motivo + folioRelacion + canceladoAt, emitidoPor + canceladoPor FKs, autofacturaToken unique para portal público)
  - `Venta.cfdiId` ahora @unique (1:1 con Cfdi)
- **Migration `add_cfdi_config_emitidos`** aplicada cross-tenant via shadow schema postgres.
- **Permisos**: agregado `CFDI_CONFIGURAR` al catálogo (los 3 LEER/EMITIR/CANCELAR ya existían).
- **Plugin Fastify `fiscal`** (`apps/api/src/plugins/fiscal.ts`): `FiscalProviderFactory` decorador en app instance. `buildApp(config, {fiscalProviderFactory?})` lo acepta opcional — default usa `FacturamaClient`. Tests inyectan `MockFacturamaClient` via factory. Limpio cero magia.
- **Service `cfdis/service.ts`**:
  - `nextFolio`: upsert+increment del `folioCounter` en `CfdiConfig` (no concurrency-safe sin transaction, pero V1 aceptable; Hito 5 lo blinda con SELECT FOR UPDATE)
  - `emitirCfdi`: valida venta cobrada, no facturada (estado pendiente/vigente), config activa → crea row CFDI en pendiente → llama provider → en éxito actualiza con folioFiscal+sellos+xml+pdf+estado vigente y setea `venta.cfdiId`; en error actualiza estado=error + errorMensaje y lanza CfdiError 502
  - `cancelarCfdi`: solo cancela vigentes, motivo 01 requiere folioFiscalRelacionado, llama provider y actualiza estado=cancelado
  - `buildFiscalPayload`: mapea Venta+Lineas+CfdiConfig al input del provider, usa snapshot del producto (nombre/sku) para descripción del concepto
- **Endpoints `/t/cfdis*` + `/t/ventas/:id/cfdi/emitir`**:
  - `GET /t/cfdis/config` (CFDI_CONFIGURAR) — devuelve config SIN exponer `facturamaApiKey` raw, sólo `facturamaApiKeyConfigured: true`
  - `PUT /t/cfdis/config` (CFDI_CONFIGURAR) — upsert (200 si existe, 201 si nuevo); valida formato RFC, regimen 3 dígitos, CP 5 dígitos
  - `POST /t/ventas/:id/cfdi/emitir` (CFDI_EMITIR) — body con receptor (RFC, razónSocial, CP, régimen, usoCfdi, formaPago, correo opcional)
  - `POST /t/cfdis/:id/cancelar` (CFDI_CANCELAR) — body motivo (01-04) + folioFiscalRelacionado opcional
  - `GET /t/cfdis` lista paginada con filtros estado/rfcReceptor/folioFiscal/desde/hasta (helper `buildCfdiWhere`)
  - `GET /t/cfdis/:id` detalle (sin xml/pdf inline en JSON para no inflar respuesta)
  - `GET /t/cfdis/:id/xml` y `/pdf` descarga con content-type + content-disposition correctos
- **15 tests integración** en `tenant-cfdis.test.ts` cubriendo:
  - Config: GET sin configurar → 404, emitir sin config → 409, PUT crea 201, GET no expone apiKey raw
  - Emisión: owner emite OK con UUID válido, venta.cfdiId se actualiza, doble CFDI sobre misma venta → 409, cajero sin CFDI_CONFIGURAR → 403, lista incluye emitido, detalle no expone xml/pdf inline, XML/PDF descargables con content-type correcto
  - Cancelación: cancela vigente con motivo 02 → Cancelado, doble cancel → 409, motivo 01 sin folioRelacion → 400
- **Suite total: 141 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 200 tests verdes**
- **Diferidos**:
  - **1.5.c portal público autofactura con QR** (token JWT, ticket POS lleva URL con `?t=token`): es el endpoint público SIN auth tenant que reusa `emitirCfdi(..., esAutofactura: true)`. Lo cierro como `1.5.c` antes del Hito 1.7 demo
  - XML/PDF a S3 con presigned URLs → V1.5 (V1 inline en DB)
  - Notas crédito (tipo E), PPD + complemento pagos → Hito 2 (devoluciones)
  - Concurrency hardening del folioCounter (SELECT FOR UPDATE) → Hito 5
  - Catálogos SAT completos (no enums limitados): cuando el cliente lo pida
- **Próxima sesión empieza en**: 1.6 Print Bridge Tauri V1 — Rust + escpos-rs + descubrimiento USB para Epson TM-T20III/T88VI. Después 1.5.c (autofactura) y 1.7 demo end-to-end.

### 2026-05-17 — Hito 1.4 Modelo 4.11 Cortes X/Z + arqueo MX cerrado
- **Schema tenant 4.11** (3 modelos + 3 enums nuevos):
  - `CajaApertura` (cajaId+sucursalId+usuarioId, montoInicial, estado [abierta|cerrada], cerradaAt/Por/Forzosa)
  - `CajaMovimiento` (8 tipos: entrada_fondo/prestamo/devolucion/otro, salida_retiro/gasto/deposito/otro)
  - `Corte` (tipo X|Z, numero per-apertura unique, desdeAt/hastaAt, ventasCount/Canceladas/Total, efectivoEsperado/Contado/Diferencia, desglosePorMetodo jsonb, desgloseMovimientos jsonb, denominaciones jsonb)
- **Migration `add_caja_aperturas_cortes`** aplicada cross-tenant via shadow schema.
- **Service `cortes/service.ts`** refactorizado a complejidad cognitiva ≤15 con helpers extraídos (`summarizarVentas`, `summarizarMovimientos`, `serializeDesglose`, `totalDenominaciones`):
  - `abrirCaja`: rechaza si caja inactiva o ya tiene apertura activa (409)
  - `findAperturaActiva`: helper reutilizable que devuelve la apertura abierta o null
  - `requireAperturaAbierta`: exporta error CorteError 409 — **integrado en `crearVenta`**: si la venta llega con `cajaId`, valida que tenga apertura abierta antes de procesar
  - `calcularArqueo`: acumulado desde `apertura.createdAt` (no diferencial entre cortes — convención POS retail). Suma efectivo vendido del periodo + cambios dados + entradas/salidas → `efectivoEsperado`
  - `crearCorte`: calcula arqueo + `totalDenominaciones` (billetes 1000/500/200/100/50/20 + monedas 20/10/5/2/1/0.50 MX) → diferencia (positiva=sobrante, negativa=faltante). Z cierra apertura, X no.
  - `registrarMovimiento`: bloquea si apertura cerrada
- **Endpoints `/t/*`**:
  - `POST /t/cajas/:cajaId/aperturar` (permiso CAJA_ABRIR)
  - `GET /t/cajas/:cajaId/apertura-actual` (CORTE_CONSULTAR, 404 si no hay)
  - `POST /t/caja-movimientos` (CAJA_MOVIMIENTO_CREAR)
  - `POST /t/cortes` con tipo X (CORTE_CONSULTAR) o Z (CAJA_CERRAR); flag `cerradaForzosa` requiere CAJA_CERRAR_FORZOSO
  - `GET /t/cortes` lista paginada con filtros (helper `buildCorteWhere` para sucursal/caja/usuario/tipo/desde/hasta)
  - `GET /t/cortes/:id` detalle con apertura+caja+usuario embebidos
- **Bug fix encontrado en tests**: `nextCorteNumero` antes contaba por `(aperturaId, tipo)`, pero el `@@unique` del schema es solo `(aperturaId, numero)` global. Causaba colisión cuando X numero 1 ya existía y Z intentaba crear numero 1 también. Fix: counter ahora cuenta TODOS los cortes por apertura sin filtrar tipo.
- **Ajuste a Hito 1.3**: tests de ventas ahora abren caja en `beforeAll` porque venta con `cajaId` ahora requiere apertura abierta (regla de negocio del POS retail). 12 tests previos rotos → arreglados con apertura inicial.
- **17 tests integración** en `tenant-cortes.test.ts` cubriendo:
  - **Apertura**: venta sin apertura→409 con mensaje "apertura"; cajero abre OK; segunda apertura mientras abierta→409; GET apertura-actual; ventas con apertura cobran
  - **Movimientos**: entrada préstamo, salida gasto
  - **Corte X**: arqueo acumulado correcto (montoInicial 500 + 3 ventas × 100 + préstamo 200 - gasto 50 = 950); X NO cierra apertura; ventas siguen tras X
  - **Corte Z**: denominaciones incorrectas marca faltante (diferencia<0); Z cierra apertura (apertura-actual ahora 404); ventas bloqueadas→409; nueva apertura permite cobrar; corte sobre apertura cerrada→409; GET cortes lista con filtros
  - **Permisos**: cajero NO puede `cerradaForzosa` (sin CAJA_CERRAR_FORZOSO, 403) — cajero SÍ tiene CAJA_CERRAR normal
- **Suite total: 125 tests API + 22 permissions + 16 pricing + 18 db = 181 tests verdes**
- **Diferidos**:
  - Reportes de diferencia/faltante por usuario (Hito 4 reporting)
  - Apertura forzada de caja por gerente sobre apertura abandonada → CAJA_CERRAR_FORZOSO ya está en catálogo
  - Print de corte → 1.6 Print Bridge
- **Próxima sesión empieza en**: 1.5 CFDI 4.0 + Facturama — emisión desde ventas cobradas, cancelación con motivo SAT, portal público autofactura con QR en ticket.

### 2026-05-17 — Hito 1.3 Modelo 4.9 Ventas + multi-pago cerrado
- **Schema tenant 4.9** (4 modelos + 3 enums nuevos):
  - `Venta` (folio único per-sucursal, sucursal/caja/usuario/cliente, estado [borrador|cobrada|cancelada], canal [pos|ecommerce|mayoreo], desglose subtotal/descuento/iva/ieps/total/totalCobrado/cambioDado, listaPrecioCodigo+cuponCodigo persisted, cfdiId nullable [Hito 1.5], canceladaMotivo/Por/At)
  - `VentaLinea` (numero per-venta, productoId+varianteId+lote/serie nullable, cantidad+precioUnitario+precioOriginal+descuentoUnitario, iva/ieps unitario+total desglosados, `descuentosAplicados jsonb` con paso-a-paso del motor, `snapshotProducto jsonb` inmutable con nombre/sku/marca/categoria/aplicaIva/tasaIva)
  - `VentaPago` (metodo enum efectivo/tarjeta_debito/tarjeta_credito/transferencia/vale/monedero/otro, monto, referencia/autorizacion/ultimosCuatro/terminalReferencia)
  - `VentaFolioCounter` (sucursalId PK, ultimoNumero counter para folios atómicos via upsert+increment dentro de transaction)
- **Migration `add_sales_payments_tickets`** generada con shadow schema postgres y aplicada cross-tenant (3 tenants demo/acme/bodega-norte).
- **Service `ventas/service.ts`** con lógica atómica refactorizada (complejidad cognitiva ≤15):
  - `crearVenta`: validarSucursalCaja → ejecutarPreviewSegura (wrap `calcularPreview` mapeando PreviewError → VentaError) → loadSnapshots + buildLineasCalculo (incluye `calcularImpuestosLinea` que desglosa IVA asumiendo precios CON IVA: `iva = total - total/(1+tasa/100)`) → totalesVenta (descuento líneas + descuento ticket, IVA agregado) → validarPagos (suma ≥ total + cambio requiere efectivo) → `persistirVenta` dentro de `$transaction`:
    1. `nextFolio` con upsert+increment del counter (formato `{SUC-CODIGO}-{000123}`)
    2. `descontarStockLineas` invoca `aplicarAjuste` con tipo `ajuste_negativo` por cada línea — InsufficientStockError → VentaError 409
    3. Insert `Venta` con todos los totales
    4. `insertarLineasYPagos` con snapshot inmutable
  - `cancelarVenta`: valida estado=cobrada (409 si ya cancelada o borrador), en transaction reinserta stock con `ajuste_positivo` por cada línea con motivo `Cancelación venta {folio}: {motivo}`, marca estado=cancelada + canceladaPor/Motivo/At
- **Endpoints `/t/ventas`**:
  - GET lista paginada con filtros sucursal/caja/usuario/cliente/estado/canal/folio/desde/hasta (helper `buildVentaWhere`)
  - GET `/:id` detalle con sucursal+caja+usuario+canceladaPor + líneas (orden ASC) + pagos (orden createdAt)
  - POST `/` cobro atómico (permisos VENTAS_CREAR)
  - POST `/:id/cancelar` (permisos VENTAS_CANCELAR + motivo obligatorio min 3 chars)
  - VentaError con statusCode mapeado + extra fields (varianteId/stockActual/intentado/total/cobrado)
- **15 tests integración end-to-end** en `tenant-ventas.test.ts`:
  - Cobro simple 1 unidad efectivo exacto, folio formato `SUC-PRINCIPAL-{000001}`, folio incrementa
  - Stock descontado atómicamente, IVA desglosado correcto (116 con 16% = 100 base + 16 IVA)
  - Multi-pago tarjeta+efectivo con cambio, multi-línea con totales agregados
  - Rechaza pagos insuficientes → 400, cambio sin efectivo → 400, stock insuficiente → 409 sin mutar
  - Snapshot preserva nombre/sku tras modificar producto
  - cajaId que no pertenece a sucursal → 400
  - Cancelación devuelve stock, cancelar ya cancelada → 409, cajero forbidden → 403
- **Suite total: 108 tests API + 22 permissions + 16 pricing + 18 db = 164 tests verdes en ~12s**
- **Diferidos a Hito 1.5 (CFDI)**: emisión CFDI 4.0 con Facturama (campo `cfdiId` ya está en schema)
- **Diferidos a Hito 1.6 (Print Bridge)**: generación HTML/CSS del ticket print-ready (los datos están todos en `GET /:id`)
- **Diferidos a Hito 2+**: apartados (stockReservado ya existe en inventario), CxC, devoluciones parciales por línea, refunds tarjeta, IEPS detallado (V1 retorna 0)
- **Próxima sesión empieza en**: 1.4 Cortes X/Z con denominaciones MX — apertura de caja, conteo de billetes/monedas, arqueo de movimientos+ventas+pagos por método, faltantes/sobrantes.

### 2026-05-16 — Hito 1.2 Modelo 4.7 Productos + Inventario + Precios cerrado
- **Schema tenant 4.7** (`packages/db/prisma/tenant/schema.prisma`): 20 modelos + 10 enums nuevos: `Categoria` (árbol auto-ref), `Marca`, `Producto` con todos los flags fiscales MX (claveSat, aplicaIva/tasaIva, aplicaIeps/tasaIeps jsonb, requiresLote/Serie/Balanza, permite*), `ProductoVariante` (Shopify-style con opciones jsonb), `ProductoCodigoBarras`, `ProductoImagen`, `ProductoAtributo`, `ProductoTag`, `InventarioSucursal` (DECIMAL 18,3 stock para granel + stockReservado), `InventarioMovimiento` (append-only), `ProductoLote` (caducidad), `ProductoSerie` (electrónicos), `NivelPrecioMayoreo`, `ListaPrecio` + `ListaPrecioItem` (con precioMinimoNegociacion), `ProductoPrecioEscalonado` (RF-02 hasta 5 niveles), `ReglaPrecio` + `ReglaPrecioProducto` + `ReglaPrecioCategoria` (motor de promos con condicion/accion jsonb), `CuponTenant`. Diferidos a V1.5: pgvector búsqueda semántica, particionamiento mensual `inventario_movimientos`, triggers postgres para `stock_disponible` y `costo_promedio` (se computan en código).
- **Migration `add_products_inventory_pricing`** generada via shadow schema postgres temporal (`prisma migrate diff --from-url`) y aplicada a 3 tenants existentes (demo, acme, bodega-norte) via `gaes-migrate tenant migrate-all`.
- **Paquete `@gaespos/pricing`** nuevo con motor cascada 6 pasos puro (Decimal.js):
  - `calcularLinea` → pasos 1 escalonado / 2 lista cliente / 3 reglas línea con stackable+excluyeProductosConEscalonado
  - `calcularTicket` → pasos 4 mayoreo por total / 5 cupón / 6 descuento manual del cajero
  - Tipos exportados (`LineaPrecioInput`, `CalcularTicketInput`, `ReglaPrecioInput`, `CuponInput`, `DescuentoAplicado`, `TicketCalculado`, etc.)
  - **16 tests unit** cubriendo cada paso + cascada completa + edge cases (`precioMinimoViolado`, stackable, montoMin, no aplica si `permiteDescuento=false`)
- **Seed defaults extendido**: `seedTenantDefaults` ahora crea lista_precios `PUBLICO` default por tenant. CLI `gaes-migrate tenant seed-all` re-ejecutado.
- **Endpoints CRUD catálogo** (módulos `apps/api/src/modules/tenant/`):
  - `/t/categorias`: árbol con `parentId` self-ref, valida existencia, bloquea ser su propio padre (400), bloquea archivar si tiene productos (409)
  - `/t/marcas`: CRUD simple con misma protección de archivado
  - `/t/productos`: POST crea producto + **variante default automática** (SKU=skuPadre + barcode opcional EAN-13 en un solo request); GET lista paginada con búsqueda multi-criterio (nombre, sku padre, sku variantes, código de barras); **GET `/buscar/:codigo`** lookup rápido barcode → SKU variante → SKU padre (caso central POS); valida `categoriaId`/`marcaId` existen (404)
  - `/t/variantes`: POST/PATCH con auto-promote `producto.tieneVariantes=true`, swap automático de `isDefault`; DELETE bloquea archivar la variante default (409); sub-endpoints `POST/DELETE :id/codigos-barras` con `isPrimary` mutually exclusive
- **Endpoints inventario** (`/t/inventario/*` + `/t/lotes`, `/t/series`):
  - GET lista paginada filtros sucursal/variante/producto + flag `stockBajoMinimo`
  - PATCH `/:varianteId/:sucursalId` upsertea registro vacío con stockMin/Max/ubicacion
  - **POST `/ajustes`** atómico (transaction): `ensureInventario` + actualiza `stockActual` + inserta `inventario_movimiento` con `usuarioId` del JWT; tipos `ajuste_positivo`/`negativo`/`merma`/`consumo_interno`; rechaza con `InsufficientStockError → 409` si stock se vuelve negativo
  - **POST `/transferencias`**: salida en origen + entrada en destino + 2 movimientos vinculados (`referenciaTipo="transferencia"`, `referenciaId` cruzados) en UNA transacción; rechaza origen=destino (400) y stock insuficiente (409) sin mutar nada
  - GET `/movimientos` audit con filtros varianteId/sucursalId/tipo/desde/hasta, DESC por fecha
  - Lotes con filtro `caducaAntes`, Series con `estado` (disponible/vendido/devuelto/garantia/reparacion)
- **Endpoints precios** (`/t/precios/*`):
  - `/listas` + `/listas/:id/items` (PUT upsert, DELETE)
  - `/escalonados` por variante (POST/DELETE con unique `varianteId+nivel`)
  - **`/reglas`** motor de promos con condicion/accion jsonb, productos/categorias many-to-many, vigencia, prioridad, stackable
  - `/cupones` con vigencia + usos + clientesAplicables jsonb
  - **POST `/preview`** ⭐ endpoint clave para POS: recibe `{lineas, clienteId?, listaPrecioCodigo?, cuponCodigo?, descuentoGlobalPct?}` → carga variantes+escalonados+lista+reglas vigentes+cupón del tenant → invoca `calcularTicket` del paquete pricing → devuelve `TicketCalculado` con descuentos paso-a-paso. Validaciones cupón (existe, vigente, no agotado), variantes inexistentes (404). `PreviewError` con statusCode mapeado.
- **Plugin tenant-context extendido**: `PermissionPrincipal → TenantPrincipal` con `userId/email/tenantSlug` derivados del JWT claim (`req.user.sub`, etc.) — necesario para registrar actor en `inventario_movimientos.usuarioId` y en `descuentoGlobal.usuarioId` del motor.
- **Tests integración**:
  - `tenant-catalogo.test.ts`: 23 tests (categorías árbol, marcas, productos con variante+barcode auto, búsqueda barcode/SKU/inexistente, cajero puede listar pero no crear)
  - `tenant-inventario.test.ts`: 14 tests (ajuste+/-, merma, excede stock → 409, transferencia atómica + 2 mov, origen=destino → 400, stock insuficiente sin mutar, audit DESC, lotes+series)
  - `tenant-precios.test.ts`: 15 tests (seed PUBLICO, upsert item, crear lista, escalonado RF-02, reglas activar/desactivar/duplicar, cupón, **preview end-to-end**: base 20, lista 18.5, escalonado 17 override, cupón 10%, descuento manual 5%, variante 404, cupón 404)
- **Total suite: 93 tests API + 22 permissions + 16 pricing + 18 db = 149 tests verdes en ~12s**
- **Diferidos a 1.2.e (cuando UI los necesite)**: imágenes producto (S3 + thumbnails), atributos custom JSONB, tags, bulk import CSV Eleventa.
- **Próxima sesión empieza en**: 1.3 Modelo 4.9 — Ventas + multi-pago + tickets. POS checkout que reutiliza `/t/precios/preview` + `aplicarAjuste` con tipo `venta` para descontar stock atómicamente.

### 2026-05-15 — Hito 1.1 Modelo 4.6 RBAC tenant cerrado
- **Schema tenant** (`packages/db/prisma/tenant/schema.prisma`): 7 modelos nuevos con `@map` snake_case — `Sucursal`, `Caja`, `Usuario`, `UsuarioSucursal`, `Rol`, `UsuarioRol`, `UsuarioVistaGuardada` + enums `SucursalTipo`, `CajaTipo`, `UsuarioTipo`. Roles guardan `permisos Json @default("[]")` en lugar de tabla `rol_permisos` separada (más simple, validado contra catálogo tipado V1).
- **Migration aplicada** `20260515232059_add_users_branches_cashiers` a tenants existentes (demo, acme, bodega-norte) + tenants nuevos via CLI.
- **Paquete `packages/permissions/`** nuevo: catálogo tipado de 56 permisos (`PERMISSIONS` const), `PermissionCode`, helpers `hasPermission`, `hasAnyPermission`, `requirePermission` con `PermissionDeniedError` (statusCode=403, missing[]), `mergeRolePermissions` (colapsa a `["*"]` si algún rol tiene wildcard owner), `PRESET_ROLES_RETAIL` con 6 roles seed (dueno wildcard, gerente, cajero, vendedor, almacen, contador_interno).
- **Tenant client cache** (`packages/db/src/tenant-client.ts`): factory `createTenantClient(slug)` + `getTenantClient(slug)` con LRU cache (`TENANT_CLIENT_CACHE_MAX=50` default), `disconnectAllTenantClients`, `disconnectTenantClient`. `evictIfNeeded` cuando se llena.
- **Seed defaults por tenant** (`packages/db/src/seed-tenant.ts`): `seedTenantDefaults(slug)` upsertea 6 roles preset + crea 1 sucursal `SUC-PRINCIPAL` + 1 caja `CAJA-1` (idempotente, retorna `{rolesCreated, rolesUpdated, sucursalCreated, cajaCreated}`). Llamado automáticamente en `createTenant` y expuesto en CLI como `gaes-migrate tenant seed <slug>` y `tenant seed-all`.
- **Auth tenant** discriminado por `kind`: `TokenPayload` ahora es union `{kind:"admin"} | {kind:"tenant", tenantSlug, permissions}`. Decoradores `authenticateAdmin` y `authenticateTenant` validan kind matches (token tenant rechazado en endpoints admin y vice-versa).
- **POST `/auth/tenant/login`**: valida `{tenantSlug, email, password}`, carga roles del usuario + permisos efectivos via `mergeRolePermissions`, firma JWT con principal completo. **GET `/auth/tenant/me`** retorna `{userId, email, tenantSlug, isOwner, permissions}`.
- **Plugin `tenantContextPlugin`** (`apps/api/src/plugins/tenant-context.ts`): preHandler verifica JWT con kind=tenant, carga tenant desde master, decora `req.tenantPrisma`, `req.tenantSlug`, `req.principal`, `req.requirePerm()`, `req.requireAnyPerm()`. Todas las rutas tenant montadas bajo `/t` prefix con este plugin.
- **CRUD endpoints `/t/*`** (4 módulos):
  - `/t/sucursales`: GET/GET/POST/PATCH/DELETE con permisos `sucursales.{leer,crear,actualizar,archivar}`.
  - `/t/cajas`: igual + valida sucursal existe (404 si no).
  - `/t/roles`: bloquea editar/archivar roles preset (403). Permisos validados contra catálogo (400 si permiso desconocido).
  - `/t/usuarios`: full CRUD + `POST /:id/roles`, `DELETE /:id/roles/:rolId`, `POST /:id/sucursales`, `POST /:id/reset-password`.
- **Helpers TS strict**: `stripUndefined<T>(obj)` para `exactOptionalPropertyTypes: true` (Prisma rechaza `{foo:undefined}` desde Zod parsed bodies). Patrón alternativo: construcción incremental `if (body.field !== undefined) data.field = body.field`.
- **Error handler**: catch `PermissionDeniedError → 403` con `missing` field. Detección de `PrismaClientKnownRequestError` por **duck-typing** (`err.constructor?.name === "PrismaClientKnownRequestError"` + `err.code` empieza con `P`) en lugar de `instanceof`, porque master y tenant generators son clases distintas en runtime — `instanceof` falla cross-generator. Mapea `P2002→409`, `P2025→404`.
- **Tests integración** (`apps/api/test/tenant-rbac.test.ts`): **21 tests** cubriendo auth tenant (login con tenant inexistente/password mala, /me con permisos efectivos, kind mismatch admin vs tenant) + CRUD sucursales/cajas/roles/usuarios con todos los gates de permisos (cajero NO puede crear sucursal/listar usuarios, dueño wildcard SI puede todo, etc.).
- **Total tests**: 41 verdes (38 anteriores + 21 nuevos − 18 unitarios CLI = 41 en suite). Pasan en 6.61s.
- **Diferido a futuros hitos** (no bloquean MVP retail): `usuario_codigos_acceso` (V1.5 huella/NFC), `usuario_horarios` (V2 opt-in), `usuario_cedulas` (Hito 3 Salud), `usuario_metas` (Hito 2 comisiones), `caja_aperturas`/`caja_movimientos` (Hito 1.4 cortes), refresh tokens para usuarios tenant (V1.5).
- **Próxima sesión empieza en**: 1.2 Modelo 4.7 — Productos + variantes Shopify-style + inventario multi-sucursal + motor precios cascada 6 pasos + lotes/series.

### 2026-05-15 — Hito 1 arranca: doc + STATUS + CHANGELOG (1.0)
- Decisión: arrancar Hito 1 (POS Core retail) en paralelo a las 3 tareas externas pendientes de Hito 0 (0.10/0.11/0.12 requieren credenciales Hetzner + dominio + GitHub remote — no bloquean código local).
- Creado `docs/hitos/hito-1-pos-core.md` con scope cerrado, checklist desglosado en 7 sub-tareas (1.1-1.7) y performance targets a verificar al cierre.
- Sub-tareas Hito 1: 1.1 Modelo 4.6 (usuarios/sucursales/cajas/RBAC) → 1.2 Modelo 4.7 (productos/inventario/motor precios) → 1.3 Modelo 4.9 (ventas básicas/multi-pago/tickets) → 1.4 Modelo 4.11 (cortes X/Z) → 1.5 Modelo 4.19 (CFDI/Facturama/autofacturación QR) → 1.6 Print Bridge Tauri V1 → 1.7 Demo end-to-end.
- Demo objetivo: cajero retail completo (login → POS → multi-pago → ticket → CFDI → corte Z) en staging.
- Hito vendible: primeros 1-2 clientes piloto retail empiezan a usar staging al cerrar 1.7.
- **Próxima sesión empieza en**: 1.1 Schema tenant 4.6 — usuarios + roles + permisos jsonb + sucursales + cajas + vistas_guardadas; migration; seed system roles; package `permissions/`; endpoints API; tests integración.
