# ADR 005 — TanStack Router sobre React Router

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS tiene múltiples SPAs en el monorepo: web-pos, web-admin, web-clinical, web-b2b, web-partner, web-superadmin, web-paciente, web-doctoralia. Todas necesitan:
- Routing con type-safety (params tipados, rutas no inválidas en compile-time)
- Loaders/actions con cache integrado
- Code splitting automático por ruta
- Prefetch agresivo (POS necesita feel instantáneo)
- Search params tipados (filtros listas productos/clientes con state en URL)
- Integración limpia con TanStack Query (server state, ya elegido)

## Decisión

**TanStack Router** (file-based routing) en todas las SPAs del monorepo.

## Alternativas consideradas

- **A) React Router v7 (antes Remix)**
  - ✅ Defacto histórico, ecosistema masivo
  - ✅ v7 con file-based + loaders/actions (similar a Remix)
  - ❌ Type-safety de params débil (strings sin validación compile-time)
  - ❌ Search params no tipados nativamente
  - ❌ Integración con TanStack Query es manual (loaders separados de queries)

- **B) TanStack Router** ← elegida
  - ✅ Type-safety end-to-end: params, search params, loaders todos tipados
  - ✅ Search params con schemas Zod (ideal para filtros listas)
  - ✅ File-based routing con generación automática de tipos
  - ✅ Integración nativa con TanStack Query (preloader compartido)
  - ✅ Code splitting automático
  - ✅ Search params se vuelven state-management gratis (back/forward funciona)
  - ✅ Mismo equipo que TanStack Query (consistencia API)
  - ⚠️ Menos ejemplos en internet vs React Router (compensado con docs sólidos)
  - ⚠️ V1 estable 2024+ pero ecosistema joven

- **C) Next.js App Router**
  - ✅ SSR/RSC, ideal para ecommerce y Doctoralia (SEO crítico)
  - ❌ Para apps internas POS/admin, SSR es overhead innecesario
  - ✅ **De hecho lo usaremos para apps con SEO**: `web-tienda` (4.21), `web-doctoralia` (4.17), `web-paciente` (Flujo 7), sitio docs públicas
  - 🔀 Stack mixto: Next.js para apps con SEO; TanStack Router para apps internas SPA

## Consecuencias

- ✅ Type-safety en routing → menos bugs en producción
- ✅ Search params tipados → filtros con URL-as-state nativos
- ✅ Integración tight con TanStack Query → preload + cache compartido
- ✅ Apps internas (POS, admin, partner, b2b, superadmin) en Vite + TanStack Router
- ✅ Apps con SEO (tienda, doctoralia, paciente, docs) en Next.js App Router
- ⚠️ Dos paradigmas en monorepo (manejable, separación clara por app)
- ⚠️ Migrar a React Router si TanStack Router cambia API drásticamente sería costo medio
- 🔁 Reversible: routers son intercambiables con refactor controlado

## Referencias

- Análisis 9 — Arquitectura, sección Stack frontend
- Memoria: `project_gaes_pos_analisis_9_arquitectura.md`
