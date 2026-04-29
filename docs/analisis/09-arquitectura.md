# Análisis 9 — Arquitectura técnica final

> **Estado:** ✅ Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_analisis_9_arquitectura.md`
> **ADRs relacionados:** ADR-001 a ADR-012 (12 ADRs derivados de este análisis)

Define la arquitectura técnica completa pre-código.

## Stack backend
- **Fastify** (sobre Express, mejor perf + types nativos)
- **Prisma ORM** + **Postgres 16** (extensiones: pg_trgm, pgcrypto, postgis, unaccent)
- **Redis** + **BullMQ** para colas (sync queue, webhooks DLQ, cron jobs, recovery emails)
- **TypeScript strict mode**
- **Zod** validación de schemas en boundaries
- **JWT 15min access + refresh 30d**, refresh token rotation
- **MFA TOTP** opcional V1 — **default ON para vertical Salud**

## Stack frontend
- **Vite + React + TypeScript**
- **TanStack Query** (server state) + **TanStack Router** (file-based routing)
- **Tailwind + shadcn/ui** (componentes accesibles + customizables, no Material)
- **Zustand** state local UI; nada de Redux
- **react-hook-form + Zod resolver** para forms
- **i18next** para es/en (4.20)

## Stack desktop
- **Tauri** (Rust + WebView OS, ~10MB)
- Compartir UI con web POS via package común
- SQLite local + sync engine (Análisis 8)
- Print Bridge integrado (Análisis 6)

## Monorepo Turborepo
```
gaespos/
├── apps/
│   ├── api/              # Fastify backend principal
│   ├── web-admin/        # Tenant admin GaesSoft
│   ├── web-pos/          # POS web (también build desktop)
│   ├── web-clinical/     # Salud (vet/humana)
│   ├── web-b2b/          # Portal B2B mayorista
│   ├── web-partner/      # Portal Partner Contador
│   ├── web-superadmin/   # App admin GaesSoft (Flujo 10)
│   ├── web-tienda/       # Ecommerce Next.js subdominio (4.21)
│   ├── web-doctoralia/   # Portal Doctoralia (4.17)
│   ├── web-paciente/     # Portal paciente PHR (Flujo 7)
│   ├── pos-desktop/      # Tauri shell del POS
│   ├── print-bridge/     # Tauri Rust (repo separado lo ideal, mono ok V1)
│   └── docs/             # Documentación pública
├── packages/
│   ├── db/               # Prisma schema + migrations + seeds
│   ├── shared-types/     # Tipos compartidos client+server
│   ├── ui/               # shadcn/ui base + componentes GaesSoft
│   ├── utils/            # Helpers
│   ├── sat-catalogos/    # Catálogos SAT precargados (4.19, Análisis 5)
│   ├── fiscal/           # Motor reglas fiscales MX (Análisis 5)
│   ├── pricing/          # Motor cascada 6 pasos (4.7)
│   ├── permissions/      # RBAC granular (4.6)
│   ├── sync/             # Lógica sync engine compartida
│   ├── ai/               # Wrappers Anthropic+OpenAI+Whisper
│   ├── phr-fhir/         # FHIR JSONB helpers (4.3)
│   └── analytics/        # PostHog wrapper
├── services/
│   ├── webhooks/         # Endpoints webhooks entrantes
│   ├── workers/          # BullMQ workers
│   ├── ai-orchestrator/  # Routing OpenAI/Anthropic + créditos
│   └── secrets/          # Vault dev / AWS Secrets prod (Análisis 7)
└── tools/                # Scripts internos
```

## Multi-tenancy: schema-per-tenant Postgres
- **1 master DB** (compartida): tenants, billing, partners, PHR, audit, soporte, IA, Doctoralia, SAT catálogos
- **1 schema por tenant** (`tenant_{slug}`): productos, ventas, clientes locales, configuración, etc.
- Prisma multi-schema con conexión dinámica via middleware `setSearchPath`
- Pros: aislamiento real, backup granular, escalabilidad horizontal por shard de tenants
- Contras: migraciones requieren script que itera schemas (resuelto con CLI propio `gaes-migrate`)

## Deploy V1 — Hetzner + Coolify + Backblaze + Cloudflare
- **Hetzner Cloud**: 2-3 VMs (CPX31/CPX41) ~€30-50/mes
- **Coolify**: orquestador self-hosted (alternativa Vercel/Railway)
- **Backblaze B2**: object storage (CFDIs PDF/XML, fotos productos, recetas, etc.) ~$0.005/GB
- **Cloudflare**: CDN + DDoS + WAF + Workers para edge
- **Postgres managed Hetzner** o self-hosted con backups automatizados
- **Costo total V1: ~$200/mes** (vs ~$1000/mes AWS equivalente)
- **V1.5+**: migración Railway/Render si Coolify estresa op
- **V2+**: AWS si Enterprise pide compliance específico (SOC 2, HIPAA US)

## Observabilidad
- **Sentry** (errors backend+frontend)
- **PostHog** (analytics + session replay + feature flags self-hosted)
- **OpenTelemetry** traces distribuidos
- **Pino** structured logs JSON
- **Better Stack o Grafana Cloud** para dashboards/alertas (V1.5)
- **Status page** `status.gaessoft.com` V1.5

## Seguridad
- JWT corto (15min) + refresh rotation (30d) en HttpOnly cookie
- MFA TOTP opcional, default ON Salud
- Audit logs inmutables (4.4) en master DB
- Rate limiting por IP+user (Fastify rate-limit)
- CSRF tokens en formularios sensibles
- CSP headers + HSTS via Cloudflare
- Cifrado en reposo: pgp_sym_encrypt para credenciales tenant; KMS para master
- Backups encriptados S3-compatible (Backblaze B2 + key rotation anual)
- LFPDPPP/ARCO compliance: aviso privacidad, derecho borrado, log accesos PHI

## CI/CD
- **GitHub Actions**
- Workflow PR: lint (Biome) + typecheck (tsc) + test (Vitest) + build
- Workflow main: build + push Docker images + deploy a Coolify staging
- Workflow tag `v*`: deploy a producción + migraciones DB
- **Branching: main + staging + feature branches** (trunk-based, no gitflow)
- Conventional commits + commitlint
- Releases versionadas SemVer

## Backups
- **pg_dump nightly** → Backblaze B2 con retención 30d
- **WAL streaming continuo** para PITR (point-in-time recovery hasta 7d)
- Test restore mensual automatizado (validar backups no rotos)
- Backup de tenant individual on-demand desde superadmin (4.20)

## Testing
- **Vitest** unit + integración (apps + packages)
- **Playwright** E2E (flujos críticos: venta POS, timbrado CFDI, telemedicina, sync offline)
- **k6** load testing pre-release
- **Coverage objetivo: 70% packages / 85% packages fiscales/críticos**
- Tests de integración golpean Postgres real (no mocks DB) — feedback validado
- CI bloquea merge si coverage baja del threshold

## Performance budgets
- Búsqueda producto POS: **<100ms** P95
- Agregar línea a venta: **<50ms** P95
- Checkout completo (sin CFDI): **<500ms** P95
- Timbrado CFDI: **<3s** P95 (depende Facturama)
- Carga inicial app POS: **<2s** TTI
- Sync push batch 100 ops: **<1s** P95

## Escalabilidad V1.5+
- Read replicas Postgres para queries pesadas (reportes, analytics)
- Particionamiento por tenant_id en tablas grandes (ventas, audit_logs)
- CDN para assets estáticos (Cloudflare ya cubierto)
- Queue priorizada en BullMQ (CFDI > webhooks > emails)
- Sharding horizontal cuando >1000 tenants (V2)

## ADRs (Architectural Decision Records) iniciales
- ADR-001: Multi-tenancy schema-per-tenant vs row-level
- ADR-002: Tauri sobre Electron para desktop
- ADR-003: Print Bridge local sobre WebUSB
- ADR-004: Fastify sobre Express
- ADR-005: TanStack Router sobre React Router
- ADR-006: Hetzner+Coolify sobre AWS para V1
- ADR-007: Stripe Connect Direct sobre Platform en MX
- ADR-008: WhatsApp Cloud Meta directo sobre Twilio
- ADR-009: SQLite local + sync queue sobre CRDTs
- ADR-010: PHR centrado en paciente (master DB) sobre per-tenant
- ADR-011: NO IA clínica decisional (regla extendida)
- ADR-012: Biome sobre ESLint+Prettier (perf + simplicidad)

ADRs viven en `docs/adr/NNN-titulo.md` formato Michael Nygard.

## Convenciones código
- **Código en inglés** (variables, funciones, comments)
- **Documentación + ADRs en español** (Gaby + clientes MX)
- **TypeScript strict mode**, no `any`
- **Biome** sobre ESLint+Prettier (10x más rápido, 1 config)
- **Conventional commits** + commitlint
- **Trunk-based development**: main siempre deployable
- **PRs review obligatorio** (incluso solo de Gaby al inicio, mantener disciplina)
- **Naming consistency**: snake_case DB, camelCase TS, kebab-case URLs

## Why
Stack elegido por (1) madurez 2025+ probada en producción, (2) costo bajo para V1 con 5 clientes (Hetzner 5x más barato que AWS sin pérdida funcional), (3) developer experience (Tauri+Vite+TanStack > Electron+Webpack+RR), (4) escalabilidad clara cuando crezca (read replicas → sharding). Schema-per-tenant es más complejo upfront pero da aislamiento real (clave para Salud + auditoría) y backup granular. ADRs documentan razones para que futuros developers entiendan decisiones sin re-debate.

## How to apply
Crear monorepo en `/home/gaby-pc-ubuntu/Documentos/GaesSoft/gaespos/` con Turborepo init. Primer paso código: package `db/` con schema Prisma master + plantilla schema tenant + script `gaes-migrate` que aplica a todos los schemas. Después package `shared-types/` con tipos base. Luego app `api/` con Fastify + auth + endpoints CRUD básicos. Cherry-pick de `GAES_POS_COMPLETO/` solo: estructura controllers (referencia), JWT auth (adaptar), docker-compose dev, NO schema MySQL (rehacer Postgres). Coolify se setup en Hetzner una sola vez al deploy primero.
