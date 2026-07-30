# Instrucciones para IA (Kimi) — Mejorar el frontend de GaesSoft POS

> Archivo autocontenido. Léelo completo y sigue todo lo que dice.

## Quién es la usuaria
Gaby, desarrolladora en Gaes Solutions. Español informal. Construye **GaesSoft POS**: un SaaS
multi-tenant para México que reemplaza a Eleventa + Doctoralia + ContPaq i. 5 clientes piloto esperando.

## Stack frontend
Vite + React + **TypeScript strict (sin `any`)** + TanStack Query/Router + Tailwind + shadcn/ui +
Zustand + react-hook-form + i18next. Monorepo Turborepo + pnpm. Linter **Biome**. Backend
Fastify+Prisma+Postgres (schema-per-tenant). Repo: `Gaes-Solutions/verticals`. Deploy: Railway (push a `main` = producción).
Apps: web-admin, web-pos, web-clinical, web-b2b, web-partner, web-superadmin, web-tienda,
web-marketplace, web-paciente, web-vendedor.

## Reglas de trabajo (innegociables)
1. **No recortar scope** ni proponer "lo fácil / MVP mínimo". Solución completa y sólida a futuro; el tiempo no es la restricción, la calidad sí.
2. **Pulir look & feel**, no solo que funcione: jerarquía visual, sombras/elevación, hero/banners, tarjetas con hover, footer, spacing, micro-detalles. Si se ve "plano/básico" → pase de diseño ANTES de features.
3. **Referenciar a las grandes** y adaptar (Mercado Libre, Shopify, Amazon, Square, Stripe). No inventar desde cero.
4. **Reusar el design system:** tokens y clases `gx-*` (packages/ui). No inventar colores (solo acento `brand`, estados `ok/danger/warn/info`, neutros `slate`). No reescribir botones/inputs/tablas/modales que ya son `gx-*`.
5. **Responsive obligatorio** (móvil ≥360px, tablet, desktop): sin scroll horizontal, sidebars colapsables, tablas en `overflow-x-auto`, targets ≥40px, mobile-first.
6. **Gating por permisos:** nunca mostrar una acción que el usuario no puede ejecutar; usar helper `puede(permiso)` (`*` = dueño). El backend igual valida.
7. **Configurable por tenant + valor recomendado visible** en cada feature con política.
8. **Nombres de competencia** (Eleventa/Doctoralia/ContPaq) **nunca** como etiqueta visible.
9. **Código en inglés, docs en español.** Commits conventional en español. Typecheck (`pnpm --filter <app> exec tsc --noEmit`) y Biome en verde antes de commitear.
10. **Planificar antes de codear:** propón el plan y espera aprobación antes de escribir código.

## ⚠️ Seguridad pendiente — NO la rompas
- Hay una auditoría con **~65 vulnerabilidades arregladas que AÚN NO están en producción**: viven en la rama `seguridad/auditoria` y falta merge + 7 migraciones (6 master + 1 tenant a TODOS los schemas). Ver `docs/security-audit.md` y `docs/PR-seguridad-auditoria.md`.
- **NO toques ni trabajes sobre `seguridad/auditoria`.** Trabaja el frontend en una rama feature aparte (ej. `frontend/mejoras`), partiendo de `origin/main`.
- **NO hagas push a `main`** (dispara deploy a producción). Deja los cambios en la rama feature para revisión.
- Si un cambio de front necesita tocar backend/DB o roza auth/permisos/tenant → **párate y avisa primero** (puede chocar con los fixes de seguridad pendientes).
- Backend: `req.tenantPrisma` (por tenant) vs `app.masterPrisma` (global) — usar el equivocado = fuga de datos entre negocios.

## Tu tarea
Mejorar el frontend (UX + visual) respetando todo lo anterior.
1. Primero pregúntame **qué app/pantalla mejoramos primero**, o propón un **plan priorizado** de mejoras con referencias a las grandes y mockups en texto.
2. **No codees hasta que apruebe el plan.**
3. Al aprobar: entrega los cambios por pantalla, con typecheck en verde, en la rama feature, explicando el antes/después.

**Empieza proponiéndome el plan de mejoras del frontend.**
