# 🚀 Lanzamiento — qué falta para comercializar GaesSoft POS

> **Propósito:** mapa honesto entre "el producto está construido" y "le cobro a un
> cliente y opera en producción". Checklist priorizado + decisiones que necesito
> de Gaby + cuentas/llaves que hay que conseguir. Actualizar conforme se cierra.
>
> **Última revisión:** 2026-06-11

## TL;DR

El **producto está hecho** (POS multi-vertical, tienda online pulida, billing,
superadmin, paqueterías, ~600 tests, `docker-compose.prod` + Dockerfile de la API
+ CI verde). Lo que falta **no es producto**: es la capa de *"hacerlo real"* —
**deploy a producción**, **conectar las integraciones que hoy son mock** (sobre
todo pagos y CFDI), **backups/monitoring** y **lo legal**. Hasta que pagos + CFDI
estén en vivo y esté desplegado con respaldos, no se le puede cobrar a un cliente.

Leyenda: ✅ hecho · ⚠️ parcial · ❌ falta · 🔑 necesito que consigas algo · 🧠 decisión tuya

---

## 🎯 Camino crítico al PRIMER cliente que paga (1 piloto retail)

No hace falta TODO. Mínimo para facturarle a 1 piloto real y dormir tranquilo:

1. **Deploy a producción** (servidor + frontends + dominio + TLS) — área A
2. **Pagos reales** (Conekta) + **CFDI real** (Facturama) + **Email** (Resend) — área B
3. **Backups Postgres + Sentry** (no operar a ciegas) — área A
4. Al primer piloto se le **factura a mano** (el self-serve del SaaS viene después) — área C

Todo lo demás (offline desktop, WhatsApp, IA, más verticales, self-serve billing)
es **post-lanzamiento**.

---

## A. Producción / infraestructura

| # | Item | Estado | Nota |
|---|------|--------|------|
| A1 | Servidor Hetzner + Coolify | ❌ 🔑 | ADR-006 + runbook en `hito-0-infra.md`. Falta provisionar. |
| A2 | Dominio + DNS + TLS (Cloudflare) | ❌ 🔑🧠 | Runbook A.0.10 ya escrito. Falta comprar dominio + decidir cuál. |
| A3 | Dockerfile API | ✅ | `apps/api/Dockerfile` |
| A4 | Dockerfiles frontends (tienda Next, web-admin, web-pos, web-superadmin) | ✅ | Hecho: Next standalone + nginx para SPAs (`deploy/nginx-spa.conf`). |
| A5 | `docker-compose.prod` completo | ✅ | 7 servicios (postgres, redis, api + 4 frontends). Reverse proxy lo da Coolify/Traefik. |
| A6 | Migraciones en prod + provisioning de tenant automatizado | ⚠️ | CLI `gaes-migrate` existe; falta correrlo en prod + script de alta de tenant. |
| A7 | Backups automáticos Postgres → Backblaze B2 + **restauración probada** | ❌ 🔑 | Crítico antes de datos reales. |
| A8 | Monitoring: Sentry (errores) | ✅ código (⚠️ DSN) | Cableado en API (`observability/sentry.ts`, no-op sin `SENTRY_DSN`). Falta 🔑 cuenta Sentry + DSN. Uptime/logs aún pendientes. |
| A9 | CI/CD deploy (hoy hay `main.yml`/`pr.yml` de tests) | ⚠️ | Falta el step de deploy a Coolify. |

## B. Integraciones reales (hoy todo es **mock-first**)

> El código está listo y probado contra mocks; falta conectar llaves reales y
> probar contra sandbox→prod. Variables de entorno ya documentadas en `.env.example`.

| # | Integración | Para qué | Estado | Necesito |
|---|-------------|----------|--------|----------|
| B1 | **Conekta / Stripe** (pagos) | Cobrar en la tienda + MSI + webhooks | ⚠️ código listo, mock | 🔑 cuenta + llaves sandbox→prod |
| B2 | **Facturama** (CFDI 4.0) | Timbrado real con CSD del cliente (**legal MX**) | ⚠️ `FacturamaClient` existe | 🔑 cuenta Facturama + CSD de cada tenant |
| B3 | **Resend** (email) | Confirmaciones de pedido, etc. | ⚠️ mock | 🔑 cuenta + dominio verificado (SPF/DKIM) |
| B4 | **Skydropx / Envía** (paqueterías) | Auto-guías | ⚠️ mock | 🔑 cuenta (si el cliente usa envíos) |
| B5 | **Web Push (VAPID)** | Avisos de pedido en la tienda | ⚠️ mock | generar par VAPID (`npx web-push generate-vapid-keys`) |
| B6 | **WhatsApp Cloud (Meta)** | Notificaciones / marketing | ⚠️ mock | 🔑 cuenta Meta Business (post-lanzamiento) |
| B7 | **Anthropic / OpenAI** (IA) | Features IA según plan | ⚠️ mock | 🔑 API key (post-lanzamiento) |

## C. Negocio / legal / comercial

| # | Item | Estado | Nota |
|---|------|--------|------|
| C1 | Cobro del SaaS al tenant (signup→trial→cobro→dunning) | ⚠️ | Billing core construido y testeado; falta conectarlo a cobro real y probar en vivo. Para pilotos: **facturar a mano**. |
| C2 | Términos del SaaS + Aviso de privacidad (LFPDPPP) de **GaesSoft** | ❌ 🧠 | No del tenant — los de tu empresa. Decisión + redacción legal. |
| C3 | Página de **pricing pública** + landing | ❌ 🧠 | Para vender formalmente. |
| C4 | Onboarding de tenant (alta + carga catálogo + capacitación) | ⚠️ | Carga masiva Excel existe; falta el flujo guiado + datos demo. |
| C5 | Entidad legal / facturación de GaesSoft a clientes | 🧠 | Tu decisión de negocio. |
| C6 | Soporte: canal + SLA | ⚠️ | El ticketing del superadmin existe; falta el canal hacia el cliente. |

## D. Endurecimiento (antes de datos reales)

| # | Item | Estado | Nota |
|---|------|--------|------|
| D1 | Aislamiento entre tenants verificado (schema-per-tenant) | ⚠️ | Arquitectura sólida; conviene un test/auditoría explícita de fuga cross-tenant. |
| D2 | Manejo de secretos (hoy env vars) | ⚠️ | El plan menciona `services/secrets`; mínimo: secrets de Coolify, no en git. |
| D3 | Rate limiting / WAF / hardening | ⚠️ | `@fastify/rate-limit` está; falta política + Cloudflare. |
| D4 | Pruebas de carga (k6) + performance budgets | ❌ | En el plan; correr antes de abrir a varios tenants. |
| D5 | Revisión de seguridad (dependencias, headers, CORS prod) | ⚠️ | `helmet`/CORS existen; revisar config de producción. |

---

## 🤝 Lo que necesito de ti

**Decisiones (🧠):**
- Dominio a comprar (A2) y nombre comercial de la tienda demo.
- Primer piloto: ¿cuál cliente y qué vertical? (define qué integraciones son obligatorias).
- Legal: ¿quién redacta Términos + Aviso de privacidad de GaesSoft? (C2).
- ¿Self-serve billing desde el día 1, o facturar a mano a los primeros pilotos? (recomiendo a mano al inicio).

**Cuentas/llaves a conseguir (🔑):**
- Servidor Hetzner (o el que prefieras) + cuenta Cloudflare + dominio.
- Conekta (y/o Stripe) — llaves sandbox primero.
- Facturama + CSD (.cer/.key + contraseña) del primer tenant.
- Resend + dominio de correo para verificar.
- (Opcional según piloto) Skydropx/Envía, Meta WhatsApp, Anthropic.

---

## 📦 Orden sugerido (fases)

- **Fase L1 — Deploy:** A1–A6, A8 (Sentry), A7 (backups). Resultado: corriendo en un dominio real con respaldos y visibilidad.
- **Fase L2 — Cobrar de verdad:** B1 (Conekta), B2 (CFDI), B3 (email). Resultado: la tienda cobra y factura legalmente.
- **Fase L3 — Primer piloto:** onboarding + carga de catálogo + capacitación + facturación a mano (C1/C4).
- **Fase L4 — Endurecer + abrir:** D1–D5, luego C1 self-serve + C2/C3 legal/pricing para abrir registro público.

> Cada fase es demoable y deja el sistema un paso más cerca de cobrar. L1+L2+L3 = primer cliente pagando.
