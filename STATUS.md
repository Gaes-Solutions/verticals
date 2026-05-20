# 🔖 STATUS — Checkpoint vivo

> **Cómo usar:** Claude actualiza este archivo al final de cada sesión productiva. Si una sesión se trunca o hay que retomar después, este archivo dice exactamente dónde quedamos.

**Última actualización:** 2026-05-15

## 🎯 Estado actual

- **Fase**: Hito 1 — POS Core retail (semana 3-6). Hito 0 al 9/12; las 3 pendientes (0.10/0.11/0.12) son acciones externas de Gaby (Hetzner + dominio + GitHub remote) y se completan en paralelo, no bloquean código Hito 1.
- **Progreso Hito 1**: 7 de 8 tareas cerradas (1.0-1.6 + 1.6.a contract). 1.6.b ESC/POS Rust real y 1.5.c autofactura quedan como sub-tareas opcionales antes/durante 1.7
- **Tarea actual**: 1.7 Demo cajero retail end-to-end — flujo completo en staging: login cajero → apertura caja → POS busca producto barcode → cobro multi-pago → ticket → CFDI Facturama sandbox → corte Z. Replaces Eleventa para 1-2 clientes piloto retail
- **Próximo paso concreto**: Decidir si el demo es CLI scripted (curl/fetch que ejecuta el flujo completo con asserts) o requiere mini UI web. Recomendado: script CLI end-to-end que demuestra los endpoints encadenados + un README con el flujo paso a paso para el cliente. UI POS web completa cae fuera del Hito 1 (es Hito 2+). Pendiente: 1.5.c autofactura y 1.6.b ESC/POS Rust se cierran cuando Gaby tenga hardware/dominio listos
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
- [ ] **1.7 Demo cajero retail end-to-end**

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
