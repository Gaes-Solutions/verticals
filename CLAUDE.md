# GaesSoft POS — Guía para Claude Code

Este archivo se carga automáticamente en cada sesión que abra Claude Code en este repo. Define quién soy, qué construyo, cómo, y qué reglas no se rompen.

## Identidad del proyecto
- **Producto**: GaesSoft POS — SaaS multi-tenant para México
- **Reemplazo de**: Eleventa + Doctoralia + ContPaq i (todo en uno)
- **Verticales V1**: Retail+Mayoreo · Abarrotes · Salud Vet/Humana N3 · Despacho Contable + Partners
- **Owner**: Gaby (developer at Gaes Solutions)
- **Clientes esperando**: 5 piloto (1 por vertical aproximadamente)

## Stack técnico (cerrado en Análisis 9)
- **Backend**: Fastify + Prisma + Postgres 16 + Redis + BullMQ + TS strict + Zod
- **Frontend**: Vite + React + TanStack Query/Router + Tailwind + shadcn/ui + Zustand + react-hook-form + i18next
- **Desktop**: Tauri (Rust + WebView OS, ~10MB)
- **Monorepo**: Turborepo + pnpm workspaces
- **Multi-tenancy**: schema-per-tenant Postgres (master DB + schema por tenant)
- **Deploy V1**: Hetzner + Coolify + Backblaze B2 + Cloudflare (~$200/mes)
- **Observabilidad**: Sentry + PostHog + OpenTelemetry + Pino
- **CI/CD**: GitHub Actions
- **Linter**: Biome (no ESLint+Prettier)
- **Testing**: Vitest + Playwright + k6 (coverage 70% / 85% packages críticos)
- **Auth**: JWT 15min + refresh 30d, MFA TOTP opcional (default ON Salud)

## Reglas no negociables (memorias feedback)

1. **Planificar antes de codear** — para algo nuevo, definir estructura/scope/stack ANTES de tocar código
2. **No recortar scope** — Gaby hace SaaS comercial; arquitectura completa, no "lo fácil"
3. **Referenciar a las grandes** — Square, Shopify, Stripe, Toast, Doctoralia. Adaptar lo validado, no inventar
4. **Default personalizable** — features default = configurables por tenant, no rígidas
5. **NO IA clínica decisional** — ni paciente NI médico (compliance MX/US, línea roja)
6. **Default no comments** — solo si el WHY no es obvio. Nunca explicar WHAT
7. **No backwards-compat hacks** — si algo no se usa, eliminar; no `_unused`, no `// removed`

## Convenciones código
- **TypeScript strict**, sin `any`
- **Código en inglés** (variables, funciones, comments)
- **Documentación + ADRs en español** (Gaby + clientes MX)
- **Naming**: snake_case DB · camelCase TS · kebab-case URLs/archivos
- **Conventional commits** + commitlint
- **Trunk-based**: main siempre deployable, feature branches cortas
- **PRs review obligatorio**, incluso solo de Gaby al inicio (mantener disciplina)
- **SIEMPRE responsive** — todo frontend debe verse y funcionar bien en celular (≥360px), tablet y desktop. Validar SIEMPRE el contenido en móvil antes de cerrar una pantalla: sin scroll horizontal accidental, sidebars colapsables (drawer/hamburguesa en móvil), tablas en `overflow-x-auto`, grids con breakpoints (`grid-cols-1 sm: md: lg:`), targets táctiles ≥40px. Mobile-first con Tailwind: base = móvil, `sm:`/`md:`/`lg:` agrandan. Un layout que solo se ve bien en desktop NO está terminado.
- **ESTÁNDAR VISUAL obligatorio** — antes de crear UI, leer [`docs/design-system.md`](docs/design-system.md) y reusar los tokens (`packages/ui/tailwind-preset.cjs`) y las clases de componentes `gx-*` (`packages/ui/components.css`). NO inventar colores a mano (solo acento `brand`/`marca`, estados `ok/danger/warn/info`, neutros `slate`); NO reescribir botones/inputs/tablas/modales que ya existen como `gx-*`. Cada app comparte TODO menos su color de acento.
- **GATING POR PERMISOS en la UI** — nunca mostrar un botón/acción que el usuario no tiene permiso de ejecutar (reventaría con 403). El frontend guarda los `permissions` del usuario al login y usa un helper `puede(permiso)` (con `*` = dueño) para ocultar/condicionar acciones. El backend SIEMPRE valida igual (defensa en profundidad), pero la UI no debe ofrecer lo prohibido. Aplica a las 4 apps.

## Performance budgets (no negociables)
- Búsqueda producto POS: <100ms P95
- Agregar línea a venta: <50ms P95
- Checkout completo (sin CFDI): <500ms P95
- Timbrado CFDI: <3s P95
- Carga inicial app POS: <2s TTI
- Sync push batch 100 ops: <1s P95

## Sistema de continuidad (CÓMO RETOMAR)

**Antes de codear cada sesión, leer en orden:**
1. `CLAUDE.md` (este archivo) — reglas
2. `STATUS.md` — checkpoint vivo: hito actual, tarea, próximo paso
3. `docs/hitos/hito-N-*.md` — scope y checklist del hito en curso
4. `docs/decisiones-pendientes.md` — bloqueos esperando decisión
5. `docs/design-system.md` — estándar visual (SIEMPRE antes de tocar UI)

**Al terminar tarea o sesión:**
1. Actualizar `STATUS.md` con progreso real
2. Marcar checkboxes en `docs/hitos/hito-N-*.md`
3. Si hubo decisión nueva: ADR en `docs/adr/NNN-*.md`
4. Si quedó algo pendiente: entrada en `docs/decisiones-pendientes.md`
5. Entrada en `CHANGELOG.md` si aplica

**Memorias persistentes**: 50+ archivos en `/home/gaby-pc-ubuntu/.claude/projects/-home-gaby-pc-ubuntu/memory/` con todos los análisis detallados. Ver `MEMORY.md` para índice.

## Estructura del repo (objetivo Hito 0+)

```
gaespos/
├── CLAUDE.md                    # Este archivo
├── STATUS.md                    # Checkpoint vivo
├── CHANGELOG.md                 # Histórico
├── docs/
│   ├── analisis/                # Los 10 análisis pre-código
│   ├── adr/                     # Architectural Decision Records
│   ├── hitos/                   # Un archivo por hito demoable
│   └── decisiones-pendientes.md # Backlog incertidumbre
├── apps/
│   ├── api/                     # Fastify backend
│   ├── web-admin/               # Tenant admin
│   ├── web-pos/                 # POS web (también build desktop)
│   ├── web-clinical/            # Salud
│   ├── web-b2b/                 # Portal B2B
│   ├── web-partner/             # Portal Partner Contador
│   ├── web-superadmin/          # App admin GaesSoft
│   ├── web-tienda/              # Ecommerce Next.js
│   ├── web-doctoralia/          # Portal Doctoralia
│   ├── web-paciente/            # Portal paciente PHR
│   ├── pos-desktop/             # Tauri shell del POS
│   ├── print-bridge/            # Tauri Rust hardware
│   └── docs/                    # Sitio docs públicas
├── packages/
│   ├── db/                      # Prisma schema + CLI gaes-migrate
│   ├── shared-types/
│   ├── ui/                      # shadcn/ui base + GaesSoft
│   ├── utils/
│   ├── sat-catalogos/
│   ├── fiscal/
│   ├── pricing/                 # Motor cascada 6 pasos
│   ├── permissions/             # RBAC granular
│   ├── sync/                    # Lógica sync engine
│   ├── ai/                      # Wrappers Anthropic+OpenAI+Whisper
│   ├── phr-fhir/
│   └── analytics/
└── services/
    ├── webhooks/
    ├── workers/
    ├── ai-orchestrator/
    └── secrets/
```

## Roadmap (Análisis 10)
- **Hito 0** Infra base (sem 1-2)
- **Hito 1** POS Core retail (sem 3-6) — MVP vendible
- **Hito 2** Comercial (sem 7-9)
- **Hito 3** Verticales especializados (sem 10-13) — 5 clientes piloto cubiertos
- **Hito 4** Digital y marketing (sem 14-16)
- **Hito 5** Multi-plataforma + offline (sem 17-19)
- **Hito 6** Negocio SaaS (sem 20-22) — registro público abierto

## Cherry-pick proyecto viejo `GAES_POS_COMPLETO/`
Reusar:
- Estructura controllers como referencia
- Lógica JWT auth (adaptar a Fastify+Prisma)
- Lógica de negocio validada
- docker-compose dev (ajustar a Postgres 16+Redis)

NO reusar:
- Schema MySQL → Prisma multi-schema Postgres
- Frontend antiguo → Vite+React+TanStack desde cero
- Estructura proyecto → reemplazar por Turborepo

## Si me trabo
1. Leer STATUS.md
2. Leer hito actual
3. Leer decisiones-pendientes.md
4. Si la duda no está documentada: PARAR y preguntar a Gaby. NO improvisar.
5. Si surge nueva decisión arquitectónica: crear ADR antes de codear
