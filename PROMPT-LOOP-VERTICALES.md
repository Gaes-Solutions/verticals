# Prompt para `/loop` — Terminar verticales pendientes (GaesSoft POS / angaes)

> Uso: en Claude Code, pega TODO el bloque de abajo (empieza con `/loop`).
> Corre auto-pausado (sin intervalo): yo decido cuándo seguir y me re-invoco solo.

---

/loop Trabaja de forma AUTÓNOMA hasta terminar TODAS las verticales pendientes de GaesSoft POS (angaes) según nuestros PRDs. Modo nocturno: NO uses AskUserQuestion; ante cualquier duda decide con el default más sólido y sigue. Registra todo.

WORKTREE (ya está creado, úsalo — NO trabajes en el repo principal):
- Carpeta: /home/gaby-pc-ubuntu/Documentos/GaesSoft/gaespos-verticales
- Rama: autonomo/verticales-pendientes (basada en origin/main, incluye superadmin, NO veterinaria)
- Ya tiene pnpm install + prisma:generate + .env. Si falta algo, arréglalo.

AISLAMIENTO (crítico — hay otra sesión activa en veterinaria):
- NO toques archivos en vuelo de veterinaria: web-clinical, web-marketplace, modules/tenant/salud*, ni áreas salud de schema.prisma. Si una vertical pendiente los necesita, sáltala y anótala como BLOQUEADA por dependencia.
- Push SOLO a la rama autonomo/verticales-pendientes, NUNCA a main. Gaby revisa y mergea. (deny list ya bloquea force-push/reset.)

FUENTE DE VERDAD (leer al arrancar cada iteración):
- Memorias project_gaes_pos_* (flujos 1-10, modelos 4.x, análisis 5-10, roadmap) y docs/autonomo-verticales.md (bitácora/estado).
- docs/ del repo (deploy-railway.md, design-system.md, hitos/).

ORDEN DE VERTICALES (la de mayor prioridad que no esté hecha ni bloqueada):
1. Abarrotes (flujo 2 / modelo 4.14): granel+balanza, recargas, fiados, servicios, IEPS, multi-cajero.
2. Vendedor mayoreo PWA de campo (flujo 3): CRM ligero, pedidos offline, firma electrónica, gamificación comisiones.
3. Médico humano + portal Paciente + telemedicina (flujos 6 y 7): pediatría, CFDI exento, marketplace, Daily.co, PHR — SIN IA clínica decisional.
4. Partner Contador / despacho contable (flujo 9 / modelo 4.12): programa partners, niveles, IA contable no-decisional.

CICLO POR VERTICAL (una vertical por tanda):
1. Deriva el alcance desde el PRD/flujo/modelo. Plan corto antes de codear.
2. Backend (Fastify+Prisma+Zod, TS strict SIN any) + frontend (Vite+React, clases gx-*, responsive obligatorio).
3. Tests unitarios; valida a la perfección: typecheck + build + tests verdes (correr con: set -a; . ./.env; set +a).
4. commit conventional + push a la rama. Un commit por pieza verificada.
5. Actualiza docs/autonomo-verticales.md (qué hiciste, decisiones + porqué, BLOQUEADOS) y pasa a la siguiente.

REGLAS DE PRODUCTO (innegociables):
- No recortar scope: arquitectura completa, pensada a futuro; referenciar a las grandes (Shopify/Square/Stripe/Toast) adaptando lo validado.
- Nunca nombres de competencia (Doctoralia/Eleventa/ContPaq) como marca visible en UI.
- NADA de IA clínica decisional (dosis/diagnóstico): línea roja.
- Features default = configurables por tenant. Pulir visual, no solo features.

PARAR (terminar el loop) cuando todas las verticales estén hechas o bloqueadas. Al final, resumen de lo hecho, lo bloqueado y qué falta para producción.
