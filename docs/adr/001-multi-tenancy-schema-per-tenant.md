# ADR 001 — Multi-tenancy: schema-per-tenant Postgres

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS es un SaaS multi-tenant que servirá inicialmente a 5 clientes piloto y debe escalar a cientos/miles. Los tenants manejan datos sensibles (CFDIs fiscales, datos clínicos PHI bajo NOM-024, datos personales LFPDPPP). El sistema debe ofrecer:
- Aislamiento real entre tenants (no solo lógico vía `tenant_id`)
- Backups granulares por tenant (recuperación individual)
- Auditoría clara (datos de un tenant nunca tocan los de otro accidentalmente)
- Escalabilidad horizontal cuando crezcamos (poder shardear por tenant)
- Rendimiento aceptable con índices "limpios" por tenant

## Decisión

**Multi-tenancy schema-per-tenant en Postgres**: una master DB compartida para entidades cross-tenant (tenants, billing, partners, PHR centrado en paciente, audit, soporte, IA, Doctoralia, catálogos SAT) y un schema dedicado por cada tenant (`tenant_{slug}`) para sus datos operativos (productos, ventas, clientes, configuración, etc.).

Conexión Prisma única con middleware que ejecuta `SET search_path TO tenant_{slug}, public` por request según tenant del usuario autenticado.

## Alternativas consideradas

- **A) Row-level multi-tenancy (todos los tenants en mismas tablas con `tenant_id`)**
  - ✅ Más simple operativamente: una sola migración para todos
  - ✅ Backups simples
  - ❌ Riesgo real de bug que filtra datos entre tenants (un WHERE faltante)
  - ❌ Índices "sucios" con datos mezclados, queries más lentos cuando crece
  - ❌ Backup/restore individual de tenant complicado (export filtrado)
  - ❌ No soporta tenants con compliance distinto (Salud HIPAA-equivalent vs retail)

- **B) Database-per-tenant (una DB Postgres separada por tenant)**
  - ✅ Aislamiento máximo
  - ❌ Connection pooling explota con muchos tenants
  - ❌ Operaciones cross-tenant (PHR, billing) requieren queries federados
  - ❌ Costo infra alto (1000 DBs Hetzner = imposible)

- **C) Schema-per-tenant** ← elegida
  - ✅ Aislamiento fuerte (queries no pueden tocar otro schema sin code change)
  - ✅ Connection pool único compartido
  - ✅ Backup granular: `pg_dump --schema=tenant_xyz`
  - ✅ Master DB para datos cross-tenant nativos (PHR, billing) sin federación
  - ⚠️ Migraciones requieren iterar schemas (resuelto con CLI propio `gaes-migrate`)
  - ⚠️ Prisma multi-schema requiere setup específico (manejable)

## Consecuencias

- ✅ Aislamiento real entre tenants — clave para Salud y auditoría
- ✅ Backups granulares por tenant (export individual on-demand desde superadmin)
- ✅ Sharding horizontal cuando >1000 tenants: mover schemas a otro Postgres
- ✅ Compliance distinto por vertical posible (encriptación adicional en schemas Salud)
- ⚠️ Migración requiere CLI custom (`gaes-migrate tenant --all`) — costo upfront
- ⚠️ Conexión dinámica vía middleware — testing más cuidadoso
- 🔁 Reversible a row-level si Prisma multi-schema se vuelve dolor: scripts de consolidación

## Referencias

- Análisis 9 — Arquitectura técnica final
- Análisis 4.1, 4.3, 4.20 — entidades master vs tenant
- Memoria persistente: `project_gaes_pos_analisis_9_arquitectura.md`
- Pattern referenciado: Shopify (db-per-shop), Notion (workspace-per-schema parcial)
