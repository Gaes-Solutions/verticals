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
