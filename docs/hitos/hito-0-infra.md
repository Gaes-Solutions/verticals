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

### 0.5 Linter, formato, hooks
- [ ] `biome.json` con config strict
- [ ] `commitlint.config.js` Conventional commits
- [ ] Husky `pre-commit` (Biome check + typecheck) y `commit-msg` (commitlint)
- [ ] `lint-staged` para correr Biome solo en archivos staged
- [ ] `tsconfig.json` raíz con `strict: true`, paths workspace

### 0.6 Package `db/`
- [ ] `packages/db/package.json` con dep Prisma
- [ ] `packages/db/prisma/master.prisma` schema master DB (tenants, billing, partners stub mínimo Hito 0)
- [ ] `packages/db/prisma/tenant.template.prisma` plantilla tenant (vacía Hito 0, llena Hito 1+)
- [ ] `packages/db/src/client.ts` factory de PrismaClient con `setSearchPath` middleware
- [ ] `packages/db/src/seed-master.ts` seed básico
- [ ] Docker compose dev (Postgres 16 + Redis 7)

### 0.7 CLI `gaes-migrate`
- [ ] `packages/db/src/cli/migrate.ts`
- [ ] Comando `gaes-migrate master` (migra master DB)
- [ ] Comando `gaes-migrate tenant <slug>` (crea schema + aplica migrations tenant)
- [ ] Comando `gaes-migrate tenant --all` (itera todos los tenants registrados)
- [ ] Tests unitarios del CLI

### 0.8 App `api/`
- [ ] `apps/api/package.json` con Fastify + plugins (cors, helmet, rate-limit, jwt, sensible)
- [ ] `apps/api/src/server.ts` bootstrap
- [ ] `apps/api/src/plugins/` (db, auth, rate-limit, error-handler)
- [ ] `apps/api/src/modules/auth/` (login, refresh, logout)
- [ ] `apps/api/src/modules/tenants/` (CRUD básico Hito 0)
- [ ] `apps/api/src/modules/health/` (`/health`, `/ready`)
- [ ] JWT 15min access + refresh 30d en HttpOnly cookie
- [ ] Pino logger structured JSON
- [ ] Zod schemas en endpoints
- [ ] Tests integración con Postgres real (no mocks)

### 0.9 CI GitHub Actions
- [ ] `.github/workflows/pr.yml`: install + lint + typecheck + test + build
- [ ] `.github/workflows/main.yml`: build + push Docker images + deploy staging
- [ ] `.github/workflows/release.yml`: deploy producción (Hito 6+)
- [ ] Cache pnpm + Turbo
- [ ] Branch protection main: PR review obligatorio, checks verdes

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
