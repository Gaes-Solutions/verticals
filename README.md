# GaesSoft POS

SaaS multi-tenant POS para México — Retail, Abarrotes, Salud Vet/Humana N3, Despacho Contable.

## Para empezar

1. Lee [`CLAUDE.md`](CLAUDE.md) — identidad, stack, reglas no negociables
2. Lee [`STATUS.md`](STATUS.md) — checkpoint vivo: dónde quedamos
3. Lee el hito en curso en [`docs/hitos/`](docs/hitos/)

## Requisitos

- Node `>=20.18.0` (objetivo: Node 22 LTS, ver [`.nvmrc`](.nvmrc))
- pnpm `>=10.0.0` (activar via `corepack enable`)
- Docker + Docker Compose (Postgres 16 + Redis 7 dev)

## Comandos

```bash
pnpm install          # Instalar dependencias
pnpm dev              # Levantar todo en watch mode
pnpm build            # Build producción
pnpm lint             # Biome check
pnpm typecheck        # tsc --noEmit en todo el monorepo
pnpm test             # Vitest + Playwright
pnpm check            # Biome format + lint write
```

## Documentación

- [`docs/analisis/`](docs/analisis/) — 10 análisis pre-código (modelo negocio, datos, reglas MX, etc.)
- [`docs/adr/`](docs/adr/) — Architectural Decision Records
- [`docs/hitos/`](docs/hitos/) — Hitos demoables y checklists
- [`CHANGELOG.md`](CHANGELOG.md) — historial de cambios
