# CHANGELOG — GaesSoft POS

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [SemVer](https://semver.org/lang/es/) (aplica desde primer release).

## [Unreleased]

### Added
- **2026-04-27** — Estructura de continuidad inicial: `CLAUDE.md`, `STATUS.md`, `CHANGELOG.md`, `docs/hitos/`, `docs/adr/`, `docs/analisis/`, `docs/decisiones-pendientes.md`
- **2026-04-27** — Checklist Hito 0 (Infra base) en `docs/hitos/hito-0-infra.md`
- **2026-04-27** — Template ADR en `docs/adr/000-template.md`
- **2026-04-27** — Migración completa de los 10 análisis pre-código al repo (37 archivos en `docs/analisis/`): modelo de negocio, verticales y alcance, 10 flujos diarios, 18 sub-modelos de datos, reglas MX, hardware, integraciones, offline-first, arquitectura técnica, roadmap. Repo es ahora fuente de verdad versionada.
- **2026-04-27** — 12 ADRs derivados de Análisis 9 (`docs/adr/001-012`): multi-tenancy schema-per-tenant, Tauri sobre Electron, Print Bridge sobre WebUSB, Fastify sobre Express, TanStack Router sobre React Router, Hetzner+Coolify sobre AWS V1, Stripe Connect Direct sobre Platform MX, WhatsApp Cloud Meta directo sobre Twilio, SQLite + sync queue sobre CRDTs, PHR master DB sobre per-tenant, NO IA clínica decisional (línea roja), Biome sobre ESLint+Prettier.

### Closed (pre-código)
- **2026-04-27** — Análisis 1-10 cerrados al 100% (modelo negocio, verticales, flujos, modelo de datos, reglas MX, hardware, integraciones, offline-first, arquitectura, roadmap).

### Infra (Hito 0)
- **2026-04-28** — Hito 0.4 Setup monorepo completo: `pnpm@10.33.2` via Corepack, `git init -b main`, `package.json` workspace root (engines `node>=20.18`, `pnpm>=10`), `pnpm-workspace.yaml` (apps/*, packages/*, services/*), `turbo.json` con pipelines build/dev/lint/typecheck/test/clean, `tsconfig.base.json` TS strict total, `.nvmrc` (22), `.npmrc`, `.editorconfig`, `.gitignore`, `README.md` mínimo. Deps root: turbo 2.9.6 + typescript 5.9.3 + @types/node 22.19.17.
- **2026-04-28** — Hito 0.5 Lint + hooks: Biome 1.9.4 (linter + formatter), husky 9.1.7, commitlint 19.8.1 + config-conventional, lint-staged 15.5.2. `biome.json` con reglas TS strict (noExplicitAny, useImportType, noNonNullAssertion warn). `commitlint.config.cjs` extiende conventional. Hooks `.husky/pre-commit` (lint-staged + turbo typecheck) y `.husky/commit-msg` (commitlint). `tsconfig.json` raíz extiende base con project references vacías.
- **2026-04-28** — Hito 0.6 Package `@gaespos/db` + Docker dev: Prisma 6.19.3, Postgres 16-alpine + Redis 7-alpine via docker-compose (healthchecks, volúmenes persistentes, Redis mapeado a host 6380 por conflicto). Schema master con `Plan` (cuid, code, priceCents, currency MXN), `Tenant` (slug, schemaName único, status enum, planId FK), `AuditLog` cross-tenant. Tenant template Hito 0 vacía (modelos en Hito 1+). Factory `createMasterClient` + singleton HMR-safe. Seed con 4 planes (Free/Starter/Growth/Scale). Scripts root `dev:db*` y `db:*` via dotenv-cli. Verificación E2E: migration `init` aplicada, 4 tablas, 4 plans seedeados.
- **2026-04-28** — Hito 0.7 CLI `gaes-migrate` para migraciones multi-schema: commander 13 + pg 8 + execa 9. Comandos: `master`, `tenant create <slug> --name <n> --plan <code>`, `tenant migrate <slug>`, `tenant migrate-all`, `tenant list`. Reorganización `prisma/master/{schema, migrations}` + `prisma/tenant/{schema, migrations}` para historial separado por schema. Verificación E2E: 2 tenants creados (demo trial free, acme trial starter) con sus schemas postgres correspondientes (tenant_demo, tenant_acme); migrate-all idempotente.
