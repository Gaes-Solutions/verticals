# Análisis 8 — Offline-first y sync

> **Estado:** ✅ Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_analisis_8_offline_sync.md`
> **ADRs relacionados:** ADR-009 (SQLite + sync queue sobre CRDTs)

POS retail/abarrotes funciona offline (sin red ≠ sin negocio). Decisión arquitectónica más profunda del cliente.

## Filosofía: qué módulos offline-first

**Offline-first (críticos):**
- Ventas POS efectivo, devoluciones del día, apartados informales
- Cortes X/Z (Z encola email)
- Imprimir ticket (Print Bridge local)
- Catálogo + precios + clientes (lectura SQLite local)
- Inventario consulta + decremento

**Encolado (sync al reconectar):**
- CFDI timbrado
- WhatsApp/email envíos
- Sync con admin remoto

**Online required (bloqueado offline):**
- Recargas TAE (proveedor en vivo)
- Cobro tarjeta Clip/MPP (terminal usa red celular propia, no POS)
- PHR cross-tenant
- Cotización B2B nueva, pedido B2B
- Telemedicina, Doctoralia, Ecommerce

## Arquitectura

```
Backend cloud (Postgres central — fuente de verdad)
     ↕ sync engine
Cliente POS (Tauri desktop + SQLite local + sync queue)
     ↕ Print Bridge local
Hardware
```

- SQLite local por PC POS (~50MB típico para 10K productos)
- Sync engine bidireccional
- Idempotency keys UUID client-generated en cada operación
- Push primero, pull después al reconectar

## `sync_queue` local

Campos: id_local uuid, entity_type, entity_id_local, entity_id_remoto (null hasta sync), operation (create|update|delete|action_event), payload jsonb, version_local, intentos, ultimo_intento_at, ultimo_error, status (pending|syncing|synced|conflict|failed), idempotency_key UUID.

Backend recibe batch, valida idempotency_key (procesado retorna mismo response), aplica, retorna entity_id_remoto + timestamp servidor.

## Resolución conflictos por entidad

| Entidad | Estrategia |
|---------|-----------|
| Ventas | Inmutable + idempotency_key dedup. Duplicado = ignorar |
| Inventario | Events log movimientos; suma final puede ir negativa → alerta gerente |
| Productos/Precios | Backend autoritativo (cliente solo lee) |
| Clientes | **LWW por timestamp + flag `merge_required`** si campo divergió ambos lados → UI resolución manual al sync |
| Apartados/CxC | LWW simple |
| Cortes X/Z | Locales hasta cierre; push como evento atómico al cerrar |
| Configuración tenant | Backend autoritativo |

**No CRDTs/vector clocks V1** (complejidad excesiva no justificada). LWW + idempotency + flag manual = suficiente.

## Catálogos sync (pull)

Tablas locales SQLite: productos_local + variantes_local + precios_local (cascada precalculada), clientes_local, promociones_local + cupones_local, empleados_local (login+permisos offline), configuracion_local.

**Sync inicial completo en primer login** del cajero (1-2 min descarga, ~50MB típico).

Heartbeat cada 30s pide diffs por `last_sync_at`. Backend retorna registros modificados + tombstones de borrados.

## Inventario offline — 3 políticas

1. **Strict offline** (Salud) — bloquea venta si sin stock confirmado en último sync
2. **Soft offline** (Retail/Abarrotes) — permite venta, alerta si stock va negativo, reconcilia al sync
3. **Override gerente** con permiso especial

**Defaults cerrados:**
- Retail/Abarrotes: Soft
- Salud (medicamentos controlados): Strict

## CFDI offline — flujo

1. Venta crea ticket interno con folio interno → imprime ticket cliente
2. Si pidió factura: captura RFC+datos, queda con `requiere_facturacion=true` + status `pendiente_timbrado`
3. Al reconectar: sync push ventas → dispara timbrado de pendientes en cola
4. Cliente recibe CFDI por email/WhatsApp cuando se timbra (minutos después)
5. UI ticket: "Factura en proceso, recibirás CFDI en tu email/WhatsApp"

## Multi-caja sucursal sin red

**V1 — Opción A:** cada caja independiente con SQLite, sin coordinación local. Riesgo oversell desde 2 cajas. Mitigación: alerta consolidación al reconectar + reportes diferencias inventario.

**V2 — Opción B:** servidor LAN sucursal con Postgres réplica para coordinación local entre cajas. Más infra. Solo si dolor real.

## Detección red y UI

- WebSocket persistente al backend, ping cada 5s
- **3 pings fallidos = modo offline** activado
- Banner UI: "Modo offline · X operaciones pendientes de sincronizar"
- Reconexión automática al restablecer red
- Indicador discreto verde "Todo sincronizado"
- Animación durante sync activo

## Backup local

- SQLite + WAL mode (journal transacciones, durable)
- Snapshot diario local (file aparte)
- PC POS rota: cualquier otra PC del tenant importa SQLite y recupera ventas pendientes
- Catálogo se rebaja desde backend en login inicial

## Modo degradado — UI clara por feature

```
✅ Disponible offline:
   Vender, devolver, apartar, imprimir, corte X/Z, buscar local

⚠️ Encolado (sync al reconectar):
   CFDI timbrado, WhatsApp/email cliente, sync admin remoto

❌ Requiere conexión:
   Recargas TAE, cobro tarjeta online, PHR cross-tenant,
   cotización B2B nueva, pedido B2B, telemedicina, ecommerce
```

## Reset y recovery

- **"Forzar resync"** si cajero sospecha desync (limpia local, baja todo de backend)
- Auditoría backend: log de cada sync con dispositivo origen + count operaciones + duración
- Alerta admin si dispositivo no syncs >24h
- Sync forzado al iniciar cada turno

## Why
POS sin internet ≠ negocio cerrado. Mexico tiene fallas frecuentes de red en zonas rurales/colonias. Si Eleventa funciona offline, GaesSoft tiene que funcionar igual o mejor. SQLite + Tauri permite app robusta con perf nativa. CRDTs son sobre-engineering para POS donde ventas son inmutables y conflictos clientes son raros.

## How to apply
Cliente Tauri tiene módulo `sync/` con: SQLite manager, queue worker, conflict resolver, network monitor. Worker push procesa cola FIFO con backoff. Pull worker corre cada 30s pidiendo diffs. Backend tiene endpoint `/sync/push` (recibe batch idempotente) y `/sync/pull?since={timestamp}` (retorna diffs+tombstones). Conflictos se almacenan en `sync_conflicts` local con UI dedicada para resolverlos.
