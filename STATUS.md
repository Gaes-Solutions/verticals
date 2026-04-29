# 🔖 STATUS — Checkpoint vivo

> **Cómo usar:** Claude actualiza este archivo al final de cada sesión productiva. Si una sesión se trunca o hay que retomar después, este archivo dice exactamente dónde quedamos.

**Última actualización:** 2026-04-28

## 🎯 Estado actual

- **Fase**: Hito 0 — Infra base (semana 1-2)
- **Progreso Hito 0**: 8 de 12 tareas completas (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
- **Tarea actual**: Listo para arrancar 0.9 — CI GitHub Actions + tests integración
- **Próximo paso concreto**: Crear `.github/workflows/pr.yml` (install + lint + typecheck + test + build) y `main.yml` (build + push images + deploy staging). Configurar Vitest workspace-wide y agregar tests integración api/auth + tenants + CLI gaes-migrate (Postgres real, no mocks)
- **Bloqueos**: Ninguno

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
- [ ] 0.9 CI GitHub Actions (lint + typecheck + test + build)
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
- **Próxima sesión empieza en**: 0.9 CI GitHub Actions + tests Vitest
