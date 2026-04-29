# ADR 004 — Fastify sobre Express para backend

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

El backend de GaesSoft POS sirve múltiples apps web + desktop + bridges + integraciones externas (Facturama, WhatsApp Cloud, Stripe, Conekta, etc.). Performance budgets exigen búsqueda producto <100ms P95, agregar línea <50ms, checkout <500ms. El backend debe:
- Escalar a cientos/miles de tenants concurrentes
- Validar schemas de input con Zod en cada boundary
- Tener tipos TypeScript fuertes en el ecosistema
- Soportar plugins (auth JWT, rate-limit, cors, helmet, multipart, sensible)
- Integrarse con Prisma + Pino + OpenTelemetry

## Decisión

**Fastify** como framework HTTP del backend (`apps/api/`). TypeScript strict, plugins oficiales para cors, helmet, rate-limit, jwt, sensible, multipart, swagger.

## Alternativas consideradas

- **A) Express**
  - ✅ Defacto Node, ecosistema masivo
  - ✅ Familiar para todo developer JS
  - ❌ ~30K req/s vs Fastify ~70K req/s en benchmarks
  - ❌ Tipos TypeScript de comunidad, no nativos
  - ❌ Validación schemas requiere middleware externo
  - ❌ Sin async/await idiomático en el core (callback-style legacy)

- **B) Fastify** ← elegida
  - ✅ ~2x más rápido que Express en benchmarks oficiales
  - ✅ TypeScript nativo, tipos derivados del schema
  - ✅ Schema validation built-in (JSON Schema → integración con Zod via `fastify-type-provider-zod`)
  - ✅ Plugin system formal con encapsulamiento (mejor para monorepo)
  - ✅ Hooks lifecycle bien definidos (preHandler, onRequest, onResponse)
  - ✅ Logger Pino integrado (stack ya elegido)
  - ✅ Madurez 2025+: v5 estable, casos producción de NearForm, Microsoft, Yahoo
  - ⚠️ Plugins menos numerosos que Express (suficientes para nuestro stack)

- **C) NestJS**
  - ✅ Arquitectura opinada (decoradores, DI, módulos)
  - ✅ Builds sobre Fastify o Express
  - ❌ Magia de DI con metadata reflection puede ser confusa al debuggear
  - ❌ Boilerplate alto para CRUD simples
  - ❌ Comunidad TS menos cohesionada con resto del stack (TanStack, Prisma)

- **D) Hono / Elysia (Edge runtimes)**
  - ✅ Performance ultra alta
  - ❌ Maduración aún incipiente para SaaS complejo
  - ❌ Algunos plugins críticos (multipart streaming, rate-limit distribuido) faltan o inmaduros

## Consecuencias

- ✅ Performance budgets alcanzables sin tuning agresivo
- ✅ Validación Zod en boundaries con tipos derivados
- ✅ Pino integrado → structured logs JSON listos para Better Stack/Grafana
- ✅ Plugin system facilita modularización (auth, db, rate-limit, errors como plugins)
- ⚠️ Algunos plugins requieren wrappers custom (ej. Stripe Connect webhook con account header)
- 🔁 Si Fastify se vuelve dolor (raro), migración a Express posible con costo medio (handlers son similares)

## Referencias

- Análisis 9 — Arquitectura
- Memoria: `project_gaes_pos_analisis_9_arquitectura.md`
- Pattern referenciado: NearForm (creadores Fastify), Yahoo, Microsoft Graph
