# Análisis 7 — Integraciones externas

> **Estado:** ✅ Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_analisis_7_integraciones.md`
> **ADRs relacionados:** ADR-007 (Stripe Connect Direct), ADR-008 (WhatsApp Cloud Meta directo)

Define cómo se integran proveedores externos, credenciales, webhooks, resiliencia.

## Integraciones cerradas

### Facturama (PAC CFDI)
API REST sandbox+prod, credenciales por tenant (CSD encriptado Vault), endpoints `/3/cfdis` POST/GET/DELETE, retry 3x backoff exponencial, fallback alerta tenant, reintegro folios al cancelar, webhook entrante para confirmación cancelación SAT >72h.

### WhatsApp Cloud API directo Meta V1
~$0.04 USD/conversación, ~50% más barato que Twilio WhatsApp. **Twilio solo SMS V1**, voz V2. Plantillas Meta dual-scope (4.18). Opt-out LFPDPPP. Webhook delivered/read/clicked/replied + inbound. Business account GaesSoft + Meta phone number ID por tenant verificado.

### Stripe (3 usos)
1. **Billing SaaS** master (4.1)
2. **Stripe Connect Direct Charges V1** (tenant abre su Stripe — más simple legal MX); Platform charges V2
3. **Stripe Terminal** POS presencial V1 si MX disponible

Webhook único `/webhooks/stripe` con firma HMAC y enrutamiento por `account` header.

### Conekta
Cobertura MX nativa para tarjeta MX + OXXO Pay + SPEI. **Tenant elige Stripe O Conekta O ambos** V1.

### Paqueterías escalonado
- **V1:** tarifas fijas configuradas tenant (no integración directa)
- **V1.5:** **Huipix agregador broker** (un SDK cubre FedEx + Estafeta + Paquete Express + DHL) → más simple que integrar cada una. RecargaKi-style.
- **V2:** label generation + tracking en vivo todas las paqueterías

### RecargaKi (recargas TAE)
V1 con 9 compañías: Telcel, Movistar, AT&T, Bait, Unefon, Virgin, Pillofon, Weex, FreedomPop. Saldo prefondeado tenant (4.14). Webhook confirmación. **MTSCellular V1.5** alternativa si mejor pricing.

### Daily.co (telemedicina)
Room efímera + tokens + webhook status sesión. Grabación opcional storage Daily o S3 GaesSoft con consentimiento. White-label logo tenant.

### Stack IA con BAA V1
- **Anthropic Claude** texto/razonamiento principal — **BAA Enterprise tier V1**
- **OpenAI GPT-4o** complementario + embeddings + Whisper transcripción — **BAA V1**
- BAA cumple HIPAA-equivalent / LFPDPPP datos sensibles para vertical Salud
- Costo mayor pero compliance no negociable

### SAT
Lista RFC API (validación cache 4.19), descarga catálogos cron mensual, validación CFDI recibidos via Facturama relay. **Firma FIEL V2** (PKI compleja, V1 firma simple cubierta flujo 6).

### Banxico SIE
API oficial con registro gratuito. Tipo cambio DOF. Cron diario 18:00 MX (post cierre mercados). Cache 24h.

### Google Health Connect + Apple HealthKit
**V1 lectura solamente** (4.7 paciente portal): peso, presión, glucosa, oxigenación → PHR. PWA + Capacitor móvil V2. Escritura V2.

### Doctoralia/Wellnex sync — V2
API privada o scraping. V1 médico crea perfil GaesSoft desde cero.

### Contpaq i / Aspel COI export — V2
V1 solo XML SAT estándar (universal).

## Webhooks entrantes — patrón estándar V1

- Endpoint por proveedor: `/webhooks/{provider}/{tenant_id?}`
- Validación **firma HMAC obligatoria**
- **Idempotencia:** tabla `webhooks_entrantes_log` con `event_id` único + **retención 90 días**
- Retry backoff con jitter (1s/5s/30s/5min/1h)
- **DLQ Redis Streams** para errores no recuperables
- Alerta admin GaesSoft si proveedor falla >5 webhooks consecutivos

## Manejo de credenciales

| Tipo | Almacén | Encriptación |
|------|---------|--------------|
| Master GaesSoft (Anthropic, OpenAI, Twilio, Daily, Banxico) | HashiCorp Vault o AWS Secrets Manager | KMS |
| Tenant (Facturama PAC, Stripe Connect, Conekta, paqueterías) | DB con `pgp_sym_encrypt` | KMS por tenant |

Rotación anual default + por evento (admin sale, key comprometida).

## Resiliencia

- **Circuit breakers** por proveedor (5 fallos/60s = abrir 5 min)
- Retry jitter exponencial
- DLQ Redis Streams o BullMQ
- Slack admin GaesSoft + email tenant si provider crítico falla
- **Status page público `status.gaessoft.com` V1.5** (no V1) con health integraciones

## Why
Cada integración se eligió por costo/cobertura MX/SLA. WhatsApp Cloud Meta directo ahorra ~50% vs Twilio para volumen alto. Huipix agregador V1.5 evita 4 integraciones separadas. Stripe Direct Charges es legalmente más simple que Platform en MX (tenant abre su account, GaesSoft no es money transmitter). BAA con Anthropic+OpenAI no negociable porque vertical Salud maneja PHI. RecargaKi vs MTSCellular se elige por pricing al lanzar.

## How to apply
Servicios externos viven en `services/integrations/{provider}/`. Cada uno con cliente HTTP wrapper, manejo errores, retry, circuit breaker. Webhooks entrantes en `apps/api/src/webhooks/{provider}.ts` con middleware HMAC + idempotencia. Credenciales via `services/secrets/` que abstrae Vault local dev / AWS Secrets prod. Status page = uptime monitor (Better Uptime / Statuspage.io) en V1.5.
