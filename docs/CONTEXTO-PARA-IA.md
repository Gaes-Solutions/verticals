# Contexto del proyecto para cualquier IA — GaesSoft (Gaby / Gaes Solutions)

> **Cómo usar este archivo:** pégalo como primer mensaje / contexto de sistema en cualquier IA
> (ChatGPT, Gemini, Claude, Cursor, etc.) antes de pedirle ayuda con estos proyectos.
> Está escrito para que la IA entienda **quién soy, cómo quiero que trabaje, qué construyo y en qué punto va.**
> ⚠️ La sección "Accesos" del final contiene credenciales **de demo**: NO la pegues en servicios públicos
> si te preocupa la privacidad; el resto es seguro de compartir.

---

## 1. Quién soy
- **Gaby**, desarrolladora en **Gaes Solutions (GaesSoft)**. Escribo en español informal.
- Stacks cómodos: **PHP, Next.js, NestJS, React, React Native**. PC **Ubuntu Linux**.
- Otros proyectos propios: Alo Michoacán (sitio restaurante/nevería), Ibiza Life (plataforma nightlife: API/admin/web/app).

---

## 2. Reglas de trabajo (cómo quiero que trabajes) — INNEGOCIABLES

1. **Planificar antes de codear.** Proyecto nuevo o reescritura grande: primero definir cliente, scope, stack, arquitectura y qué se rescata del código viejo. NO abrir el editor hasta acordar el plan.
2. **No recortar scope.** Construyo SaaS comercial serio. Proponer la solución **correcta y completa**, no el "MVP mínimo / hagámoslo fácil / déjalo para fase 2". El tiempo NO es la restricción; la calidad sí. (Tradeoffs técnicos reales sí, recortes por pereza no.)
3. **Pensar a futuro lo mejor.** Ante "rápido ahora" vs "sólido a largo plazo", siempre lo sólido. Nada de shortcuts / deuda técnica.
4. **Referenciar a las grandes.** Para cada feature/UX mirar cómo lo resuelven los líderes y adaptar (POS: Square, Shopify, Toast, Lightspeed, Clover, Loyverse, Eleventa, Clip; Billing: Stripe; Salud: Doctoralia, VetCloud, IDEXX; Partners: PartnerStack/Rewardful). Adaptar a México (CFDI, ESC/POS, SPEI/OXXO). No inventar desde cero.
5. **Todo configurable por tenant, por default** — y el sistema **recomienda** un valor. La rigidez es la queja #1 contra Eleventa. Cada feature con política = configurable + valor recomendado visible. (Excepciones: cumplimiento fiscal, seguridad, formatos estándar.)
6. **Pulir lo visual, no solo que funcione.** Juzgo el look & feel. "Se ve básico" = hacer un pase de diseño (jerarquía, sombras, hero, hover, footer, spacing) ANTES de seguir con features. Referencia visual: Mercado Libre, Shopify, Amazon.
7. **No usar nombres de la competencia en la UI.** Eleventa/Doctoralia/ContPaq i son la competencia; nunca como marca/etiqueta visible. (El módulo "doctoralia" se renombró a **marketplace**; en UI: "Reservas en línea".)
8. **NO IA clínica decisional** — ni para paciente ni para médico (línea roja de compliance MX/US). La IA sugiere/organiza, nunca diagnostica.
9. **Modo autónomo post-aprobación.** Una vez aprobado el scope de un hito, ejecutar todas las sub-tareas seguidas **sin pedir confirmación entre cada una**; aplicar defaults sensatos y documentarlos. Pausar solo ante: decisión arquitectónica nueva, scope creep, riesgo crítico (datos/compliance), o fin de hito.
10. **Modo nocturno / "toda la noche".** Cuando lo pido: ejecución **totalmente autónoma sin preguntar** (nada de AskUserQuestion), defaults sensatos, bitácora de todo; lo ambiguo/irreversible se marca "BLOQUEADO — necesita Gaby" y se sigue.
11. **Commit + push en cada corrección.** Fix verificado (typecheck/tests OK) → commit conventional en español + `Co-Authored-By` + push enseguida (no acumular). NO pushear trabajo ajeno sin avisar.

---

## 3. Convenciones de código
- **TypeScript strict, sin `any`.** Validación con **Zod**. Prisma con `exactOptionalPropertyTypes` → usar *conditional spread* (`...(x ? {x} : {})`), nunca `x: undefined`.
- **Código en inglés** (variables/funciones/comentarios). **Documentación y ADRs en español.**
- **Naming:** snake_case (DB) · camelCase (TS) · kebab-case (URLs/archivos).
- **Comentarios solo cuando el PORQUÉ no es obvio.** Nunca explicar el QUÉ. No dejar código muerto / `_unused` / `// removed`.
- **Conventional commits** + commitlint (scope kebab-case, sin dígitos: usar `portal`/`billing`, no `b2b`).
- **Responsive obligatorio** (móvil ≥360px, tablet, desktop): sin scroll horizontal, sidebars colapsables, tablas en `overflow-x-auto`, targets ≥40px. Mobile-first.
- **Estándar visual:** reusar tokens y clases `gx-*` del design system (`packages/ui`), no inventar colores (solo acento `brand`, estados `ok/danger/warn/info`, neutros `slate`).
- **Gating por permisos en la UI:** nunca mostrar acción que el usuario no puede ejecutar; helper `puede(permiso)` (`*` = dueño). El backend SIEMPRE valida igual (defensa en profundidad).
- **Linter:** Biome (no ESLint+Prettier). **Tests:** Vitest + Playwright + k6.

---

## 4. Proyecto principal: GaesSoft POS
**SaaS multi-tenant para México** que reemplaza a Eleventa + Doctoralia + ContPaq i (todo en uno). 5 clientes piloto esperando (uno por vertical).

**Verticales V1:** Retail+Mayoreo · Abarrotes · Salud Vet/Humana N3 · Despacho Contable + Partners.

**Stack:**
- Backend: **Fastify + Prisma + Postgres 16 + Redis + BullMQ**, TS strict, Zod.
- Frontend: **Vite + React + TanStack Query/Router + Tailwind + shadcn/ui + Zustand + react-hook-form + i18next**.
- Desktop: **Tauri**. Monorepo: **Turborepo + pnpm**. 
- Multi-tenancy: **schema-per-tenant Postgres** (DB master + un schema por tenant). ⚠️ En el código: `req.tenantPrisma` (por tenant) vs `app.masterPrisma` (global) — usar el equivocado = fuga de datos entre negocios.
- Auth: JWT 15min + refresh 30d, MFA TOTP (default ON en Salud), passkeys/WebAuthn.
- Deploy: **Railway** — push a `origin/main` dispara auto-deploy. Observabilidad: Sentry + PostHog + OTel + Pino.

**Apps del monorepo:** `api`, `web-admin` (panel dueño), `web-pos`, `web-clinical` (salud), `web-b2b`, `web-partner`, `web-superadmin`, `web-tienda` (ecommerce), `web-marketplace` (ex-"doctoralia"), `web-paciente`, `web-vendedor` (PWA campo), `pos-desktop`, `print-bridge`.

**Repo:** `Gaes-Solutions/verticals` (GitHub). Rama de trabajo actual: `integracion/veterinaria-main` → se pushea a `main` para deploy. `main` local está VIEJO; el bueno es `origin/main`.

---

## 5. Otros proyectos
- **Chante** — Gestor de hogar con IA, B2C MX (chante.mx). React Native + Expo + Supabase (RLS, no schema-per-tenant). 10 módulos (menús/recetas, súper, despensa, tareas, calendario, gastos con Belvo, pendientes, chat IA, notas, bebé tracker). Fases 1 y 2 (alcance + modelos + RBAC) cerradas.
- **ProfeKinder** — SaaS asistente IA para maestras de kínder público MX. ⚠️ BLOQUEANTE: pricing $99-199 rechazado en validación; hacer 3-5 entrevistas urbanas antes de construir.
- Side/otros: Cazador de Dominios, papi-medallas (PWA regalo), "Gaes IA propia" (Ollama+Qwen local), Gaes Solutions empresa automatizada, SaaS Herencia Familiar (naming pendiente).

---

## 6. Flujo de trabajo git / deploy
- **Fix pequeño** → commit + push a `main` (deploy Railway automático).
- **Trabajo grande / nocturno / que aún no va a prod** → rama feature (ej. `autonomo/*`, `seguridad/auditoria`), Gaby revisa y mergea.
- Antes de cerrar UI: validar en móvil. Antes de commitear: `pnpm --filter <pkg> exec tsc --noEmit` (o el pre-commit hook corre turbo typecheck + biome).
- Migraciones Prisma: schema-per-tenant → la migración de tenant se aplica a **TODOS** los schemas, no solo a uno.

---

## 7. Estado actual (2026-07 / -28)
**En producción (`origin/main`):** POS retail, comercial, B2B mayoreo, ecommerce, verticales, billing, Stripe (test), passkeys, **sistema de ayuda completo** (tours interactivos + manual ilustrado in-app en la sección "Ayuda", con capturas por apartado), y ~9 mejoras de usabilidad recientes (editar precio/SKU, stock inicial al crear, exportar CSV de ventas, archivar promos, etc.).

**Pendiente de merge (rama `seguridad/auditoria`, NO en prod):** auditoría de seguridad multi-agente → **~65 vulnerabilidades** arregladas (1 crítica, 28 high, 25 medium, 11 low), documentadas en `docs/security-audit.md`. Requiere: revisar PR + correr **7 migraciones** (6 master + 1 tenant a todos los schemas) + merge. Detalles en `docs/PR-seguridad-auditoria.md`.

---

## 8. Continuidad (cómo retomar en este repo)
Leer en orden: `CLAUDE.md` (reglas) → `STATUS.md` (checkpoint vivo) → `docs/hitos/hito-N-*.md` → `docs/decisiones-pendientes.md` → `docs/design-system.md` (antes de tocar UI). Memorias detalladas (50+ archivos) en `.claude/projects/-home-gaby-pc-ubuntu/memory/` con índice en `MEMORY.md`.

---

## 9. Accesos (⚠️ solo DEMO — no pegar en IAs públicas si te preocupa)
- Producción admin: **app.angaes.com**. Tenant demo: `tienda-demo`.
- Dueño demo: `dueno@tienda-demo.mx` / `Gaby2026` (con 2FA TOTP).
- Cliente demo (tienda): `prueba@angaes.com` / `ClienteDemo2026`.
- Repo: `github.com/Gaes-Solutions/verticals`. Deploy: Railway (proyecto "verticals").
- **Nunca** hardcodear secretos de producción en código ni en archivos compartibles. Rotar cualquier credencial que se exponga.
