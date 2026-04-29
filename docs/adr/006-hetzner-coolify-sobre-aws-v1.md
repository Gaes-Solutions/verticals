# ADR 006 — Hetzner + Coolify sobre AWS para deploy V1

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS V1 sirve a 5 clientes piloto. Necesita infraestructura para:
- Backend Fastify + Postgres 16 + Redis 7 + BullMQ workers
- Object storage para CFDIs PDF/XML, fotos productos, recetas, audio recetas, etc.
- CDN + DDoS para assets estáticos y ecommerce
- SSL automático
- Backups encriptados con retención 30d + WAL streaming PITR
- Monitoring (Sentry, PostHog, OpenTelemetry — externos)

Presupuesto V1 tight: GaesSoft está bootstrapped. Cada peso de infra mensual reduce la pista para iterar producto.

## Decisión

**Stack cloud para V1:**
- **Hetzner Cloud** — VMs (CPX31/CPX41) ~€30-50/mes
- **Coolify** — orquestador self-hosted en una VM Hetzner (alternativa Vercel/Railway/Fly)
- **Backblaze B2** — object storage S3-compatible (~$0.005/GB/mes)
- **Cloudflare** — CDN, DDoS, WAF, Workers (free tier suficiente V1)
- **Postgres 16** — managed Hetzner o self-hosted en VM

**Costo objetivo total: ~$200/mes** (vs ~$1000/mes AWS equivalente).

## Alternativas consideradas

- **A) AWS (ECS/Fargate + RDS + S3 + CloudFront + Route 53)**
  - ✅ Ecosistema completo, compliance (SOC 2, HIPAA)
  - ✅ Escala "infinita" sin pensar
  - ❌ ~$800-1200/mes para stack equivalente V1 con baja carga real
  - ❌ Egress costs sangran al servir CFDIs PDF a clientes
  - ❌ Complejidad operativa alta (IAM, VPC, Security Groups) para 5 clientes
  - ❌ Vendor lock-in fuerte

- **B) Vercel + Railway + Supabase**
  - ✅ DX excelente, deploys triviales
  - ✅ Buen tier para V1
  - ❌ Costo crece rápido al escalar (Vercel egress, Supabase row counts)
  - ❌ Postgres Supabase con extensiones limitadas (no postgis nativo en algunos planes)
  - ❌ Múltiples vendors → más superficies de falla

- **C) Hetzner + Coolify** ← elegida
  - ✅ Hetzner Cloud tiene mejor relación CPU/RAM/€ del mercado (3-5x AWS)
  - ✅ Coolify orquesta Docker apps con Git push deploys (Heroku-like) self-hosted gratis
  - ✅ Backblaze B2 + Cloudflare egress free → costos object storage 1/10 de S3+CloudFront
  - ✅ Stack reproducible (Docker compose en Coolify)
  - ✅ Postgres 16 con todas las extensiones (postgis, pg_trgm, pgcrypto, unaccent)
  - ⚠️ Tenemos que mantener nosotros (no es serverless puro): updates, monitoring, backups
  - ⚠️ Coolify v4 maduro pero ocasionalmente requiere intervención manual

- **D) Fly.io / Render**
  - ✅ DX bueno, edge automático
  - ❌ Postgres managed con costo medio
  - ❌ Egress costs no tan ventajosos como Hetzner+CF

## Consecuencias

- ✅ Costo V1 ~$200/mes → 6 meses de runway extra vs AWS al mismo presupuesto
- ✅ Postgres 16 con todas las extensiones para PHR (postgis), full-text (pg_trgm + unaccent)
- ✅ Stack 100% reproducible en local (Docker compose) y CI
- ✅ Backups: pg_dump nightly → Backblaze B2 + WAL streaming PITR 7d
- ⚠️ Mantener uptime es responsabilidad nuestra (mitigación: monitoring, runbooks, status page V1.5)
- ⚠️ Si Coolify falla, fallback Railway (~$20/mes app + DB) en pocas horas — runbook documentado
- 🔁 V1.5+: migración Railway/Render si Coolify estresa op
- 🔁 V2+: migración a AWS si cliente Enterprise requiere SOC 2/HIPAA US

## Referencias

- Análisis 9 — Arquitectura, sección Deploy V1
- Memoria: `project_gaes_pos_analisis_9_arquitectura.md`
- Pattern referenciado: PlanetScale (Vitess + bare metal), Linear (Hetzner + custom orquestación) — startups que optimizan unit economics
