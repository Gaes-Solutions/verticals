# GaesSoft POS — Flujo Superadmin GaesSoft (Flujo 10 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_superadmin.md`
> **Descripción:** Panel maestro de operación SaaS — métricas, tenants, billing, soporte, partners, observabilidad

Flujo 10 (Superadmin GaesSoft) aprobado por Gaby completo. Es el panel desde donde Gaby (y eventualmente equipo) opera el SaaS.

**Decisión arquitectónica fundacional:** app SEPARADA del producto. Vive en `apps/admin-gaessoft/` con endpoints `/api/admin/*` propios, deploy en `admin.gaessoft.com` con auth estricta y audit log automático de toda acción. NO contaminar código del producto con código admin.

**Auth con 2FA forzoso desde V1 (TOTP only, no SMS por SIM swap).** IP whitelist opcional desde V2.

**Dashboard ejecutivo SaaS (métricas que importan):**
- Negocio: MRR, ARR, tenants activos, trials activos, conversion trial→paid (objetivo 35%), churn mensual (objetivo <5%), NRR, CAC promedio, LTV, LTV/CAC (saludable >3x)
- Uso: ventas procesadas hoy (todos tenants), GMV hoy, pacientes en PHR, citas Doctoralia, telemedicina activa
- IA: créditos consumidos hoy, costo OpenAI/Anthropic, margen IA (cobrado/costo)
- Alertas: tenants en mora, errores 500 spike, partners con bono pendiente
- 🤖 IA narrativa automática del estado del negocio

**Tenants — gestión global:** lista con filtros (plan/estado/vertical/partner), health score IA por tenant (frecuencia uso, productos catalogados, soporte abierto, pagos a tiempo, NPS) en 🟢/🟡/🔴, acciones (ver detalle 360°, impersonar, suspender, reactivar, cambiar plan, aplicar descuento/cupón, write-off, cancelar definitivo con backup, exportar datos del tenant).

**Health score solo a operación V1**, V2 evaluar versión gamificada al cliente.

**Billing operations:** ingresos hoy, pagos fallidos, renovaciones mañana, atención urgente (suspensiones por mora 7d, reintentos pendientes, disputas Stripe). Acciones: refund, aplicar crédito, cambiar plan con prorrateo, pausar suscripción, cupón retención, re-emitir CFDI, disputar chargeback.

**Tickets de soporte:** lista priorizada (🔴 urgente / 🟡 alta / 🟢 media), 🤖 IA auto-respuesta nivel 1 (60-70% de tickets son FAQ, IA resuelve solo) con disclaimer + escalado a humano si no resuelve. Detección de sentimiento prioriza molestos. Aprende de respuestas humanas.

**Impersonation con reglas estrictas:**
- Razón obligatoria
- Default solo lectura, escritura requiere segunda confirmación
- Tiempo limitado (default 60 min)
- Cliente recibe notificación: "El equipo GaesSoft accedió a tu cuenta a las X — Razón: ticket #Y"
- Toda acción en log con user ID + timestamp + IP
- Banner permanente arriba mientras impersonas

**Pipeline comercial / CRM ligero V1** (no integramos HubSpot todavía con 5 clientes; V2 cuando equipo comercial crezca):
- Leads (de partners, landing, inbound)
- Demos agendadas
- Deals en proceso (negociación / esperando firma / onboarding)
- Conversion funnel (lead→demo→deal→cliente)

**Partners management:** lista por nivel (Bronze/Silver/Gold/Diamond), MRR generado por cada uno, comisiones pagadas mes en curso, top performers, aprobaciones pendientes (nuevos aplicando), partners en riesgo (sin actividad).

**Configuración global del producto sin redeploys:**
- Editar planes y precios
- **Feature flags por tenant y globales** (estilo LaunchDarkly) — beta features a clientes específicos antes de release general
- Plantillas WhatsApp/Email/Tickets globales
- Configuración Stripe / Conekta
- Configuración IA (modelos por tarea, costos por feature)

**Observabilidad técnica:** uptime, latencias p95, queue de jobs BullMQ, errores última hora con Sentry link, performance top endpoints, infra costs hoy (AWS/VPS, OpenAI/Anthropic, Stripe fees). Integraciones: **Sentry** (errores), **Datadog** o **Better Stack** (logs/métricas), **PostHog** (product analytics), **PgHero** (Postgres health).

**Audit log global con who/when/what/from-where:** logins admin, impersonations con motivo, cambios billing/plan/refund, configuraciones modificadas, accesos a datos de tenants, acciones de soporte. Cumple SOC2 / ISO 27001 preparación para venta enterprise. Filtros + exportable CSV/API.

**IA específica superadmin:** resumen ejecutivo día/semana en narrativa, predicción churn próximos 30 días, anomalía detection (spikes errores), pregunta libre al dashboard (text-to-SQL), auto-resolución tickets, sentiment analysis tickets, sugerencia upsell automática (Pro consumiendo features Business → invitar upgrade), detección de fraude en tenant nuevo.

**Onboarding asistido por IA de tenants nuevos:**
1. IA lee respuesta del onboarding ("vendo ropa de mujer en Tapachula con 2 sucursales")
2. Configura vertical = Retail
3. Crea categorías iniciales sugeridas
4. Sugiere catálogo de 100 productos típicos del rubro
5. Configura impuestos
6. Genera plantillas tickets/emails/WhatsApp
7. Tiempo a primera venta: 2h → 15 min
8. Escala adopción sin saturar a Gaby con cada onboarding manual

**Permisos del superadmin (granulares para crecimiento de equipo):**
admin.dashboard.read, admin.tenants.read/modify/suspend/cancel, admin.tenants.impersonate (razón obligatoria), admin.billing.read/refund/credit, admin.support.read/respond, admin.partners.read/approve/modify, admin.config.read/modify, admin.audit.read, admin.observability.read, admin.team.manage.

**Roles iniciales equipo GaesSoft (V1=solo Gaby; V2+ crece):**
- Owner (Gaby) — todo
- Soporte — tickets + impersonate + read tenants
- Comercial — pipeline + leads + demos + read partners
- Operaciones — billing + facturación + cobranza + dunning
- Desarrollo — observability + audit + config

**Decisiones cerradas Q&A final:**
- App admin separada (no módulo dentro del producto): SÍ
- 2FA: TOTP only desde V1, no SMS
- Health score: solo a operación V1, gamificado al cliente V2
- CRM: propio V1, HubSpot integrado V2
- Auto-resolución tickets IA: V1 con disclaimer y escalado humano

**Why:** Operar un SaaS multi-tenant sin panel maestro es imposible. Las grandes (Stripe, HubSpot, Intercom) demuestran que herramientas de operación rigurosas son la diferencia entre escalar a 1,000 clientes vs ahogarse en 50. App separada con audit estricto + IA para auto-resolver lo trivial = Gaby puede operar GaesSoft con foco estratégico mientras escala.

**How to apply:** En backend, módulo `apps/api-admin` separado del API del producto. Auth con 2FA y session shorter. En frontend, `apps/admin-gaessoft` Next.js. Audit log automático vía middleware Express/Fastify que captura toda acción admin. Integrar Sentry/Datadog/PostHog desde día 1.
