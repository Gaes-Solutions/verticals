# ADR 009 — SQLite local + sync queue idempotency sobre CRDTs

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

POS retail/abarrotes en MX **debe funcionar offline** (sin red ≠ negocio cerrado, fallas frecuentes en zonas rurales/colonias). Cada PC POS necesita:
- Consulta de catálogo + precios + clientes sin red
- Crear ventas + cortes + apartados offline
- Encolar CFDI timbrado + WhatsApp + sync con backend
- Resolver conflictos al reconectar (clientes editados ambos lados, inventario, etc.)

Las ventas son inmutables (una vez emitida, no se modifica), los cortes son atómicos al cerrar, los productos son backend-autoritativos. El conflicto real solo aparece en clientes editados desde múltiples puntos.

## Decisión

**SQLite local por PC POS** (Tauri, ~50MB típico para 10K productos) + **sync queue con `idempotency_key` UUID client-generated** + **resolución de conflictos por entidad** (LWW + flag `merge_required` para clientes; inmutabilidad para ventas; backend-autoritativo para productos).

**No CRDTs / vector clocks V1.**

## Alternativas consideradas

- **A) CRDTs (Yjs, Automerge, Redis CRDT)**
  - ✅ Resolución automática de conflictos sin pérdida
  - ✅ Sync multi-master "natural"
  - ❌ Sobre-engineering brutal para POS:
    - Ventas son inmutables (no hay merge real)
    - Inventario es un counter compartido (eventual consistency con events log es suficiente)
    - Clientes raramente se editan en paralelo desde 2 cajas (mitigado con LWW + flag)
  - ❌ Bundle JS Yjs/Automerge ~50-100KB extra
  - ❌ Curva aprendizaje alta, debugging complicado
  - ❌ Productos backend-autoritativos no necesitan CRDT

- **B) PouchDB + CouchDB sync**
  - ✅ Sync bidireccional automático probado (oferta de Couch desde 2010)
  - ❌ Rendimiento medio en datasets >100K rows
  - ❌ Stack divergente del Postgres principal
  - ❌ Storage en IndexedDB vs SQLite (worse perf en Tauri)

- **C) SQLite + sync queue idempotente con LWW** ← elegida
  - ✅ SQLite via tauri-plugin-sql con WAL mode → durable, performante
  - ✅ Queue local con `idempotency_key` UUID → push idempotente al backend
  - ✅ Backend valida idempotency_key (procesado retorna mismo response, no duplica)
  - ✅ LWW por timestamp para clientes con flag `merge_required` si conflicto real
  - ✅ Inmutabilidad para ventas (duplicado = ignorar por idempotency)
  - ✅ Events log para inventario (suma final puede ir negativa → alerta gerente)
  - ✅ Pull worker cada 30s pide diffs por `last_sync_at` con tombstones
  - ⚠️ Conflictos manuales para clientes (UI de resolución dedicada) — aceptable, raros
  - ⚠️ Si dos cajeros suben mismo cliente offline, LWW gana 1 → otra info se pierde si no fue capturada en flag

## Consecuencias

- ✅ POS opera 100% offline para ventas, devoluciones, apartados, cortes, impresión
- ✅ CFDI offline = ticket inmediato + cola timbrado (cliente recibe CFDI minutos después por email/WhatsApp)
- ✅ Backend recibe operaciones idempotentes (retry seguro sin duplicación)
- ✅ Conflictos clientes: UI dedicada de merge_required (raro, simple de manejar)
- ✅ Stack alineado con backend (SQL en ambos lados, Postgres + SQLite)
- ⚠️ Multi-caja sucursal V1 cada caja independiente (riesgo oversell desde 2 cajas, mitigación = alerta consolidación)
- ⚠️ V2 Opción B: servidor LAN sucursal con Postgres réplica si dolor real
- 🔁 Reversible: si V2+ presenta caso real para CRDTs (multi-master con datos editables paralelo), evaluar Yjs solo en entidades específicas

## Referencias

- Análisis 8 — Offline-first y sync
- Análisis 6 — Hardware (Print Bridge offline-ready también)
- Memoria: `project_gaes_pos_analisis_8_offline_sync.md`
- Pattern referenciado: Eleventa (offline-first SQLite local), Linear (sync engine custom no CRDT)
