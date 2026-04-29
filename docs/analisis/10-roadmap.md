# Análisis 10 — Roadmap por hitos demoables

> **Estado:** ✅ Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_analisis_10_roadmap.md`

Define orden de construcción + estrategia de lanzamiento. Último análisis pre-código.

## 7 Hitos demoables — 22 semanas V1

### Hito 0 — Infra base (semana 1-2)
- Monorepo Turborepo + Biome + commitlint + TS strict
- Package `db/` schema Prisma master + plantilla schema tenant
- CLI `gaes-migrate` (aplica migraciones a todos los schemas)
- App `api/` Fastify + auth JWT 15min/refresh 30d
- Deploy primer staging Coolify en Hetzner
- CI/CD GitHub Actions (lint + typecheck + test + build)
- **Demo:** login admin + crear tenant + listar tenants

### Hito 1 — POS Core retail (semana 3-6)
- 4.6 Usuarios + sucursales + cajas + RBAC
- 4.7 Productos + variantes + inventario + motor precios cascada 6 pasos
- 4.9 Ventas básicas + multi-pago + ticket impresión
- 4.11 Cortes X/Z con denominaciones MX
- 4.19 CFDI 4.0 + Facturama + autofacturación QR
- Print Bridge Tauri V1 (Epson TM-T20III/T88VI)
- **Demo:** Cajero retail completo (Eleventa-killer MVP)
- **Hito vendible:** primeros 1-2 clientes retail empiezan a usarlo

### Hito 2 — Comercial (semana 7-9)
- 4.8 Clientes B2C/B2B + fiados informales + multi-direcciones
- 4.10 Cotizaciones + pedidos B2B + state machine + firma electrónica
- 4.9 Apartados + CxC formal + devoluciones + cancelación inmutable
- 4.18 Promociones automáticas + cupones + lealtad puntos lineales
- 4.13 Comisiones quincenales
- **Demo:** Vendedor mayoreo PWA + portal B2B básico

### Hito 3 — Verticales especializados (semana 10-13)
- 4.14 Abarrotes (recargas RecargaKi 9 compañías + servicios + balanza Tor-Rey)
- 4.15-4.16 Salud (consultas SOAP + PHR + N3 hospitalización + lab + imagen)
- 4.3 PHR cross-tenant master DB
- Anti-no-show con reputation score
- 4.5 IA features (10 de V1) con créditos por plan
- **Demo:** Clínica vet completa + abarrotes con recargas
- **Hito 5 clientes piloto cubiertos:** todos los verticales operativos

### Hito 4 — Digital y marketing (semana 14-16)
- 4.21 Ecommerce Next.js subdominio + carrito abandonado + click&collect
- 4.18 Marketing campañas WhatsApp Cloud Meta directo + email + SMS Twilio + RFM
- 4.17 Portal Doctoralia + telemedicina Daily.co + reseñas portables
- Flujo 7 paciente portal completo
- **Demo:** Tienda online + Doctoralia funcional + campañas WhatsApp

### Hito 5 — Multi-plataforma + offline (semana 17-19)
- Tauri desktop empaquetado firmado/notarizado (Windows MSI / macOS DMG / Linux DEB)
- 4.8 SQLite local + sync engine completo + idempotency + LWW
- UI conflict resolver para flag merge_required
- PWA móvil con ZXing scanner cámara
- Multi-caja sucursal V1 (cada caja independiente)
- **Demo:** POS desktop offline + sync al reconectar sin pérdida ventas

### Hito 6 — Negocio SaaS (semana 20-22)
- 4.1 Billing Stripe + 4 tiers (Starter/Pro/Business/Enterprise) + Conekta
- 4.2 Programa partners + comisiones lifetime 25% + niveles Bronze→Diamond
- Flujo 10 Superadmin (app admin GaesSoft separada)
- 4.4 Soporte + audit + observabilidad completa Sentry+PostHog
- 4.20 Configuración tenant completa + branding + plantillas + webhooks + API keys
- Status page V1.5 `status.gaessoft.com`
- **Demo:** Onboarding self-service + billing + dashboard SaaS
- **Hito producción real abierta a registro público con waitlist**

## Decisiones lanzamiento

### MVP vendible
- **Hito 1** ya es vendible a 1-2 clientes retail (Eleventa replacement mínimo)
- **Hito 3** cubre los 5 clientes piloto (retail + abarrotes + vet + humana + contador)
- Diferencia: lanzamiento vertical-by-vertical, no big bang

### Pricing en producción
- **Cobro real desde Hito 6** (Negocio SaaS completo)
- **Hitos 1-5 = free/descuento lanzamiento** para 5 clientes pioneros (descuento cerrado en 4.1)
- Pioneros mantienen pricing preferencial lifetime como early adopters

### Migración Eleventa
- **Script importador CSV en Hito 1**: productos + clientes
- **Ventas históricas NO se migran** (arranque limpio fiscalmente)
- Eleventa queda como referencia consultable, no migración total

### Beta vs producción
- Cada hito → staging Coolify
- **Producción solo después de aprobación cliente piloto + 2 semanas estable**
- Cliente piloto valida hito antes de rollout siguiente

### Quién prueba cada hito
- **Gaby + 5 clientes piloto** (1 por vertical):
  - 1 retail, 1 abarrotes, 1 vet, 1 humana, 1 contador
- Feedback turn-by-turn por WhatsApp
- Iterar ajustes mientras se construye siguiente hito

### Onboarding
- **V1 manual asistido**: Gaby/equipo onboardea 1-1 a cada cliente piloto
- **Self-service desde Hito 6**: cuando docs + videos academy listos
- Onboarding manual = oportunidad de feedback profundo

### Documentación cliente
- **Hito 2**: docs básicas + videos onboarding cortos
- **Hito 6**: docs completas + academy GaesSoft
- Docs públicas en `gaessoft.com/docs`

### Roadmap público
- **Hito 4 en adelante**: roadmap público `gaessoft.com/roadmap`
- Antes: interno + WhatsApp con clientes piloto

### Registro público
- **Después de Hito 6**: registro abierto self-service
- Antes: **invite-only + waitlist** desde Hito 1 (capturar leads early)
- Waitlist en landing page con captura email + vertical de interés

### Estimación tiempo
- **22 semanas V1 = 5.5 meses calendario**
- Riesgo: integraciones externas (Facturama, WhatsApp Cloud) y hardware (Print Bridge cross-OS) son donde más se desviará
- Buffer: tener 4-6 semanas extra mentales (V1 completo en 6.5-7 meses realista)

## Cherry-pick proyecto viejo `GAES_POS_COMPLETO/`

Reusar:
- **Estructura controllers** backend como referencia
- **JWT auth** adaptar a Fastify+Prisma+Postgres (estaba MySQL)
- **docker-compose dev** ajustar a Postgres 16 + Redis
- **Lógica de negocio** validada (cálculos, validaciones)

NO reusar:
- **Schema MySQL** → rehacer Postgres con Prisma multi-tenant
- **Frontend antiguo** → rehacer Vite+React+TanStack desde cero
- **Estructura de proyecto** → reemplazar con monorepo Turborepo

## Why
Hitos demoables = cada 2-4 semanas algo nuevo se puede mostrar a cliente, mantener motivación + feedback. POS Core primero porque es el hook con los 5 clientes esperando (todos quieren Eleventa replacement). Verticales después en Hito 3 (donde GaesSoft realmente diferencia). Negocio SaaS al final porque billing/partners no es bloqueante para validación producto. 22 semanas es agresivo pero alcanzable con feedback turn-by-turn ya cerrado en análisis (no hay decisiones en aire).

## How to apply
Comenzar Hito 0 inmediatamente:
1. `mkdir /home/gaby-pc-ubuntu/Documentos/GaesSoft/gaespos`
2. `pnpm create turbo@latest .`
3. Setup Biome + commitlint + Husky + lint-staged
4. Crear package `db/` con `pnpm init` + Prisma + schemas
5. Crear app `api/` con Fastify + estructura módulos
6. CI GitHub Actions PR workflow
7. Hetzner CPX31 + Coolify install + dominio staging
8. Primer commit + PR + merge + deploy verde

Cliente piloto contacto al cerrar Hito 1 (semana 6) para validación primer demo.
