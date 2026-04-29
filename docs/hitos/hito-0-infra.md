# Hito 0 — Infra base

**Duración estimada:** 2 semanas
**Demo objetivo:** Login admin + crear tenant + listar tenants en staging Coolify
**Dependencias:** Ninguna

## Scope cerrado

Levantar la base mínima del monorepo, package de DB con Prisma multi-schema, app `api` con Fastify+auth, CI/CD verde, deploy a staging en Hetzner+Coolify. **No** se agrega ningún módulo de negocio (productos, ventas, etc.); eso es Hito 1.

## Checklist

### 0.1 Estructura de continuidad
- [x] `CLAUDE.md` raíz con reglas + stack + roadmap
- [x] `STATUS.md` checkpoint vivo
- [x] `CHANGELOG.md` inicial
- [x] `docs/hitos/hito-0-infra.md` (este archivo)
- [x] `docs/decisiones-pendientes.md` template
- [x] `docs/adr/000-template.md`
- [x] `docs/analisis/INDEX.md`

### 0.2 Migración análisis a repo ✅
- [x] `docs/analisis/01-modelo-negocio.md`
- [x] `docs/analisis/02-verticales-y-alcance.md`
- [x] `docs/analisis/03-flujos/` (10 flujos en sub-archivos)
- [x] `docs/analisis/04-modelo-datos/` (18 sub-modelos)
- [x] `docs/analisis/05-reglas-mx.md`
- [x] `docs/analisis/06-hardware.md`
- [x] `docs/analisis/07-integraciones.md`
- [x] `docs/analisis/08-offline-first.md`
- [x] `docs/analisis/09-arquitectura.md`
- [x] `docs/analisis/10-roadmap.md`
- [x] `docs/analisis/INDEX.md` (índice con tablas)

### 0.3 ADRs iniciales (12 desde Análisis 9) ✅
- [x] `001-multi-tenancy-schema-per-tenant.md`
- [x] `002-tauri-sobre-electron.md`
- [x] `003-print-bridge-local-sobre-webusb.md`
- [x] `004-fastify-sobre-express.md`
- [x] `005-tanstack-router-sobre-react-router.md`
- [x] `006-hetzner-coolify-sobre-aws-v1.md`
- [x] `007-stripe-connect-direct-sobre-platform-mx.md`
- [x] `008-whatsapp-cloud-meta-directo-sobre-twilio.md`
- [x] `009-sqlite-sync-queue-sobre-crdts.md`
- [x] `010-phr-master-db-sobre-per-tenant.md`
- [x] `011-no-ia-clinica-decisional.md`
- [x] `012-biome-sobre-eslint-prettier.md`

### 0.4 Setup monorepo ✅
- [x] Setup manual (no `create-turbo`: directorio ya tenía CLAUDE.md/docs, template kitchen-sink no encajaba)
- [x] `pnpm-workspace.yaml` con `apps/*`, `packages/*`, `services/*`
- [x] `turbo.json` con pipelines: `dev`, `build`, `lint`, `typecheck`, `test`, `clean` (ui: tui)
- [x] `package.json` raíz con scripts: build/dev/lint/typecheck/test/format/check
- [x] `.gitignore` para Node + Rust (Tauri) + IDEs + `.env*` + Prisma `.db`
- [x] `.editorconfig`
- [x] `.nvmrc` (22) + `engines.node >=20.18.0` en package.json
- [x] `.npmrc` con `auto-install-peers`, `link-workspace-packages=deep`, `save-workspace-protocol=rolling`
- [x] `tsconfig.base.json` strict (extiende sub-packages después)
- [x] `README.md` corto apuntando a `CLAUDE.md` y `STATUS.md`
- [x] `pnpm install` OK: turbo 2.9.6 + typescript 5.9.3 + @types/node 22.19.17 (pnpm 10.33.2)
- [x] `git init -b main` (sin remote aún)
- [x] `pnpm turbo run typecheck --dry-run` reconoce engines correctamente

### 0.5 Linter, formato, hooks ✅
- [x] `biome.json` 1.9.4: linter recommended + TS strict rules (noExplicitAny error, useImportType error, noNonNullAssertion warn, noConsoleLog warn, useConst error, useTemplate error, complexity, performance), formatter (double quotes, semicolons, trailingCommas all, lineWidth 100, lf), organizeImports, VCS git integrado, ignore docs/**/*.md y artefactos build, overrides para tests y *.config.ts/scripts/
- [x] `commitlint.config.cjs` extiende `@commitlint/config-conventional`, type-enum (feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert/wip), scope-case kebab, header-max 100, body/footer libres
- [x] Husky 9.1.7 inicializado con `pnpm exec husky init` (script `prepare: husky`)
- [x] `.husky/pre-commit` → `pnpm exec lint-staged && pnpm exec turbo run typecheck`
- [x] `.husky/commit-msg` → `pnpm exec commitlint --edit "$1"`
- [x] `lint-staged` config en package.json para `*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc}` → `biome check --write --no-errors-on-unmatched`
- [x] `tsconfig.json` raíz extiende `tsconfig.base.json` con `noEmit`, `includes:[]`, `references:[]` (se llena al crear packages)
- [x] `pnpm.onlyBuiltDependencies: ["@biomejs/biome"]` (pnpm 10 bloquea build scripts por seguridad)
- [x] Verificación: `pnpm biome check .` clean; commitlint rechaza/acepta correctamente

### 0.6 Package `db/` ✅
- [x] `packages/db/package.json` con `@prisma/client` 6.19 + `prisma` + `tsx` + scripts (generate/migrate/migrate:deploy/studio/reset/seed:master)
- [x] `packages/db/prisma/master.prisma` schema master: `Plan` (cuid, code unique, priceCents, currency MXN, active), `Tenant` (slug unique, schemaName unique, status enum, planId FK), `TenantStatus` enum (trial/active/suspended/cancelled), `AuditLog` (actor, action, resource, metadata, ipAddress, índices)
- [x] `packages/db/prisma/tenant.template.prisma` Hito 0 vacía (datasource + generator → `src/generated/tenant`); modelos llegan Hito 1+
- [x] `packages/db/src/client.ts` factory `createMasterClient(databaseUrl?)` + singleton `masterPrisma` HMR-safe via global; log levels según NODE_ENV (factory de tenant client con `setSearchPath` middleware llega en 0.7-0.8)
- [x] `packages/db/src/seed-master.ts` upsert 4 planes (Free $0, Starter $499 MXN, Growth $999 MXN, Scale $1999 MXN)
- [x] `packages/db/src/index.ts` re-exports tipados (Prisma, Plan, Tenant, TenantStatus, AuditLog)
- [x] `docker-compose.yml`: Postgres 16-alpine (5432:5432) + Redis 7-alpine (6380:6379, conflicto host port) con healthchecks y volúmenes persistentes
- [x] `.env.example` + `.env` (gitignored) con `DATABASE_URL_MASTER`/`DATABASE_URL_TENANT`/`REDIS_URL`
- [x] Scripts root: `dev:db`/`dev:db:down`/`dev:db:reset`/`dev:db:logs`, `db:generate`/`db:migrate`/`db:migrate:deploy`/`db:studio`/`db:reset`/`db:seed` (todos via dotenv-cli leyendo `.env`)
- [x] `pnpm.onlyBuiltDependencies` aprobado: `@prisma/client`, `@prisma/engines`, `prisma`, `esbuild`
- [x] `tsconfig.json` raíz con `references: [{ path: "./packages/db" }]`
- [x] Verificación E2E: docker compose up → Postgres healthy → migration `20260429025709_init` aplicada (tablas plans/tenants/audit_log/_prisma_migrations) → `seed:master` insertó 4 plans → `pnpm typecheck` y `pnpm biome check .` clean

### 0.7 CLI `gaes-migrate` ✅
- [x] Reorganización `prisma/`: `prisma/master/{schema.prisma, migrations/}` + `prisma/tenant/{schema.prisma, migrations/}` (cada schema con su propio historial `_prisma_migrations`)
- [x] Deps `@gaespos/db`: commander 13.1, pg 8.20, execa 9.6, @types/pg 8.20
- [x] `packages/db/src/cli/migrate.ts` entry point Commander, exit handling, $disconnect en finally
- [x] `packages/db/src/cli/master.ts` invoca `prisma migrate deploy --schema=./prisma/master/schema.prisma`
- [x] `packages/db/src/cli/tenant.ts` con `createTenant`, `migrateTenant`, `migrateAllTenants`, `listTenants`
- [x] `packages/db/src/cli/utils.ts` con `validateSlug` (regex `^[a-z][a-z0-9_-]{1,49}$`), `tenantSchemaName`, `tenantDatabaseUrl`, `requireEnv`, `withPgClient`
- [x] Comando `gaes-migrate master` aplica migrations master idempotente
- [x] Comando `gaes-migrate tenant create <slug> -n <name> -p <plan>`: master row → `CREATE SCHEMA` postgres → `prisma migrate deploy` sobre tenant template con DATABASE_URL_TENANT injectado con `?schema=`
- [x] Comando `gaes-migrate tenant migrate <slug>` aplica migrations tenant
- [x] Comando `gaes-migrate tenant migrate-all` itera tenants no-cancelled
- [x] Comando `gaes-migrate tenant list` (slug, schema, plan, status, name)
- [x] Script root `gaes-migrate` via dotenv-cli + `pnpm --filter @gaespos/db migrate`
- [x] Verificación E2E: 2 tenants creados con schemas postgres correspondientes, migrate-all idempotente
- [ ] Tests unitarios del CLI → diferido a 0.9 (cuando Vitest workspace esté configurado)

### 0.8 App `api/` ✅
- [x] `apps/api/package.json` con Fastify 5.2 + plugins (cors, helmet, rate-limit, jwt, cookie, sensible) + fastify-plugin + Zod + Pino
- [x] Schema master extendido: `AdminUser` (email único, passwordHash argon2, role enum superadmin/support/billing, mfaSecret opcional, active, lastLoginAt) + `RefreshToken` (tokenHash SHA-256 único, adminUserId FK cascade, expiresAt, revokedAt, userAgent, ipAddress) + migration `add_admin_users` + seed con admin default `admin@gaessoft.local` / `ChangeMe!2026`
- [x] `apps/api/src/config.ts` Zod env validation (JWT/REFRESH/COOKIE secrets ≥32, TTLs, CORS, rate limit)
- [x] `apps/api/src/server.ts` bootstrap con SIGINT/SIGTERM graceful shutdown
- [x] `apps/api/src/app.ts` factory `buildApp(config)` (testeable)
- [x] `src/plugins/db.ts`: decora `app.masterPrisma` + onClose disconnect
- [x] `src/plugins/auth.ts`: registra @fastify/jwt + @fastify/cookie con COOKIE_SECRET, decorator `app.authenticate` preHandler
- [x] `src/plugins/security.ts`: helmet (CSP only prod) + cors (credentials true) + rate-limit (100/min global) + sensible
- [x] `src/plugins/error-handler.ts`: ZodError→400 con issues, Prisma P2002→409, P2025→404, fallback 500 con request log
- [x] `src/modules/auth/`: login (rate-limit 10/min, argon2 verify, JWT 15min + refresh cookie HttpOnly signed Path=/auth Max-Age=30d, lastLoginAt update), refresh (rotación: revoca anterior + emite nuevo par), logout (revoca + clearCookie), me (preHandler authenticate)
- [x] `src/modules/tenants/`: preHandler authenticate global, list, get-by-slug, create (reusa `createTenant` de `@gaespos/db`)
- [x] `src/modules/health/`: `/health` (liveness) + `/ready` (Postgres SELECT 1)
- [x] JWT 15min HS256 access + refresh 30d HttpOnly cookie signed
- [x] Pino logger structured JSON (pino-pretty en dev)
- [x] Zod schemas en endpoints (login body, tenant body/params)
- [x] `@node-rs/argon2` 2.0 password hashing (Rust prebuilt)
- [x] Re-export funciones tenant desde `@gaespos/db` (createTenant, migrateTenant, etc. usables desde apps)
- [x] Script root `dev:api` via dotenv-cli + pnpm filter
- [x] `.env.example` actualizado con todas las vars (incluye comentario para generar secrets)
- [x] Verificación E2E manual: login admin → me → list tenants (demo+acme) → POST `bodega-norte` plan growth (creó schema tenant_bodega_norte) → list 3 → /me sin token 401 → refresh OK → password mala 401
- [ ] Tests integración con Postgres real → diferido a 0.9 (Vitest workspace + setup helpers + reset DB entre tests)

### 0.9 CI GitHub Actions + tests ✅
- [x] Vitest 2.1.9 + @vitest/coverage-v8 a nivel root
- [x] `packages/db/src/cli/utils.test.ts` (18 tests): validateSlug, tenantSchemaName, tenantDatabaseUrl — cierra TODO de 0.7
- [x] `apps/api/test/helpers.ts`: buildTestApp + loginAdmin + cleanupTestTenants (DROP SCHEMA CASCADE en slugs `test-*`) + cleanupTestRefreshTokens
- [x] `apps/api/test/setup.ts` con beforeAll/afterAll cleanup
- [x] `apps/api/test/health.test.ts` (2 tests)
- [x] `apps/api/test/auth.test.ts` (11 tests: login OK/inválido, /me con/sin token, /refresh con rotación, /logout)
- [x] `apps/api/test/tenants.test.ts` (7 tests: list/get/create con auth + duplicado 409 + slug inválido 400)
- [x] Tsconfig split: `tsconfig.json` (typecheck sin rootDir incluye test/) y `tsconfig.build.json` (build con rootDir=src, excluye test/)
- [x] Vitest configs inline por package (sin shared root, evita issue rootDir cross-package)
- [x] **Total: 38 tests verdes** corriendo con Postgres real + Redis (no mocks)
- [x] `.github/workflows/pr.yml`: services postgres:16-alpine + redis:7-alpine con healthchecks; env vars dummy; checkout → pnpm 10.33.2 + Node 22 cache pnpm → install --frozen-lockfile → prisma generate/migrate:deploy/seed:master → biome ci → pnpm typecheck → pnpm test → pnpm build
- [x] `.github/workflows/main.yml`: trigger push a main, placeholder deploy staging (real en 0.10/0.11)
- [x] `turbo.json` con `globalEnv: [NODE_ENV, LOG_LEVEL]` y `test.env` con todas las vars que afectan tests
- [x] Script root `test:dev` (con dotenv-cli) para local; `test` puro para CI
- [ ] `.github/workflows/release.yml`: deploy producción → diferido a Hito 6+ (V1 release)
- [ ] Branch protection main: PR review obligatorio + checks verdes → configuración manual via GitHub UI cuando se cree el remote en 0.10/0.11

### 0.10 Hetzner + Coolify staging
- [ ] VM Hetzner CPX31 (~€15/mes)
- [ ] Coolify install via script oficial
- [ ] Dominio `staging.gaessoft.com` apuntando
- [ ] SSL Let's Encrypt automático
- [ ] App `api` deploy desde GitHub
- [ ] Postgres 16 managed o Coolify
- [ ] Redis 7 Coolify
- [ ] Variables de entorno via Coolify secrets

### 0.11 Primer flujo verde
- [ ] PR de Hito 0 con todo arriba
- [ ] CI verde
- [ ] Merge a main
- [ ] Deploy automático a staging
- [ ] Smoke test endpoints `/health`, `/ready`, `/auth/login`

### 0.12 Demo Hito 0
- [ ] Crear tenant superadmin via seed
- [ ] Login con superadmin desde curl/Postman
- [ ] Crear nuevo tenant via API
- [ ] Listar tenants
- [ ] Capturar GIF/video corto demo

## Criterio de "Hito 0 cerrado"

✅ Todo lo de arriba checked
✅ `STATUS.md` actualizado a Hito 1 tarea 1
✅ Entry en `CHANGELOG.md`
✅ Tag `v0.1.0` en git
✅ Demo grabada y enviada a Gaby

## Decisiones tomadas en Hito 0
*(Se llenarán conforme avancemos. Cada decisión genera ADR.)*

## Riesgos / Bloqueos
- **Hetzner setup**: si Coolify falla, fallback Railway (~$20/mes app + DB)
- **Prisma multi-schema**: si `setSearchPath` complica testing, evaluar Drizzle ORM como plan B (mejor multi-schema soporte nativo)
