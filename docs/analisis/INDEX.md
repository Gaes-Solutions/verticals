# Índice de Análisis pre-código

Los 10 análisis cerrados antes de tocar código. Cada uno cubre una dimensión del producto.

## Análisis migrados al repo ✅

| #  | Análisis | Archivo repo | Memoria persistente origen |
|----|----------|--------------|----------------------------|
| 1  | Modelo de negocio | [`01-modelo-negocio.md`](01-modelo-negocio.md) | `project_gaes_pos_modelo_negocio.md` |
| 2  | Industrias y casos de uso | [`02-verticales-y-alcance.md`](02-verticales-y-alcance.md) | `project_gaes_pos_alcance_v1.md` |
| 3  | Personas y flujos diarios | [`03-flujos/`](03-flujos/) (10 archivos) | `project_gaes_pos_flujo_*.md` |
| 4  | Modelo de datos | [`04-modelo-datos/`](04-modelo-datos/) (18 sub-archivos) | `project_gaes_pos_modelo_4_*.md` |
| 5  | Reglas de negocio mexicanas | [`05-reglas-mx.md`](05-reglas-mx.md) | `project_gaes_pos_analisis_5_reglas_negocio_mx.md` |
| 6  | Hardware soportado | [`06-hardware.md`](06-hardware.md) | `project_gaes_pos_analisis_6_hardware.md` |
| 7  | Integraciones externas | [`07-integraciones.md`](07-integraciones.md) | `project_gaes_pos_analisis_7_integraciones.md` |
| 8  | Offline-first y sync | [`08-offline-first.md`](08-offline-first.md) | `project_gaes_pos_analisis_8_offline_sync.md` |
| 9  | Arquitectura técnica final | [`09-arquitectura.md`](09-arquitectura.md) | `project_gaes_pos_analisis_9_arquitectura.md` |
| 10 | Roadmap por hitos demoables | [`10-roadmap.md`](10-roadmap.md) | `project_gaes_pos_analisis_10_roadmap.md` |

## Detalle Análisis 3 — Flujos diarios

10 personas/flujos en [`03-flujos/`](03-flujos/):

| # | Flujo | Archivo |
|---|-------|---------|
| 1 | Cajero retail | [`01-cajero-retail.md`](03-flujos/01-cajero-retail.md) |
| 2 | Cajero abarrotes | [`02-cajero-abarrotes.md`](03-flujos/02-cajero-abarrotes.md) |
| 3 | Vendedor mayoreo | [`03-vendedor-mayoreo.md`](03-flujos/03-vendedor-mayoreo.md) |
| 4 | Veterinario | [`04-veterinario.md`](03-flujos/04-veterinario.md) |
| 5 | Recepción vet | [`05-recepcion-vet.md`](03-flujos/05-recepcion-vet.md) |
| 6 | Médico humano + Doctoralia | [`06-medico-humano.md`](03-flujos/06-medico-humano.md) |
| 7 | Paciente portal | [`07-paciente-portal.md`](03-flujos/07-paciente-portal.md) |
| 8 | B2B mayorista | [`08-b2b-mayorista.md`](03-flujos/08-b2b-mayorista.md) |
| 9 | Partner Contador | [`09-partner-contador.md`](03-flujos/09-partner-contador.md) |
| 10 | Superadmin GaesSoft | [`10-superadmin.md`](03-flujos/10-superadmin.md) |

## Detalle Análisis 4 — Modelo de datos

18 sub-modelos en [`04-modelo-datos/`](04-modelo-datos/):

### Master DB (cross-tenant)
| # | Modelo | Archivo |
|---|--------|---------|
| 4.1 | Tenants y Billing | [`4.1-tenants-billing.md`](04-modelo-datos/4.1-tenants-billing.md) |
| 4.2 | Partners y Comisiones | [`4.2-partners.md`](04-modelo-datos/4.2-partners.md) |
| 4.3 | PHR centrado en paciente | [`4.3-phr.md`](04-modelo-datos/4.3-phr.md) |
| 4.4 | Soporte/Audit/Pipeline + IA | [`4.4-soporte-audit-ia.md`](04-modelo-datos/4.4-soporte-audit-ia.md) |
| 4.17 | Portal Doctoralia | [`4.17-portal-doctoralia.md`](04-modelo-datos/4.17-portal-doctoralia.md) |

### Tenant schema (por cada tenant)
| # | Modelo | Archivo |
|---|--------|---------|
| 4.6 | Usuarios, Roles, Sucursales, Cajas | [`4.6-usuarios-sucursales.md`](04-modelo-datos/4.6-usuarios-sucursales.md) |
| 4.7 | Productos, Inventario, Pricing | [`4.7-productos-inventario.md`](04-modelo-datos/4.7-productos-inventario.md) |
| 4.8 | Clientes B2C y B2B | [`4.8-clientes.md`](04-modelo-datos/4.8-clientes.md) |
| 4.9 | Ventas, Apartados, CxC, Devoluciones | [`4.9-ventas-apartados-cxc.md`](04-modelo-datos/4.9-ventas-apartados-cxc.md) |
| 4.10 | Cotizaciones y Pedidos B2B | [`4.10-cotizaciones-pedidos.md`](04-modelo-datos/4.10-cotizaciones-pedidos.md) |
| 4.11-4.13 | Caja, Compras, Comisiones | [`4.11-caja-compras-comisiones.md`](04-modelo-datos/4.11-caja-compras-comisiones.md) |
| 4.14 | Abarrotes (recargas, servicios) | [`4.14-abarrotes.md`](04-modelo-datos/4.14-abarrotes.md) |
| 4.15 | Salud — pacientes y consultas | [`4.15-salud-pacientes-consultas.md`](04-modelo-datos/4.15-salud-pacientes-consultas.md) |
| 4.16 | Salud N3 — hospitalización, lab, imagen | [`4.16-salud-n3.md`](04-modelo-datos/4.16-salud-n3.md) |
| 4.18 | Promociones y Marketing | [`4.18-promociones-marketing.md`](04-modelo-datos/4.18-promociones-marketing.md) |
| 4.19 | CFDI / Facturación | [`4.19-cfdi-facturacion.md`](04-modelo-datos/4.19-cfdi-facturacion.md) |
| 4.20 | Configuración tenant | [`4.20-configuracion-tenant.md`](04-modelo-datos/4.20-configuracion-tenant.md) |
| 4.21 | Ecommerce | [`4.21-ecommerce.md`](04-modelo-datos/4.21-ecommerce.md) |

## Decisiones críticas transversales

Presentes en múltiples análisis y formalizadas como ADRs en [`docs/adr/`](../adr/):

- **NO IA clínica decisional** ni paciente NI médico (regla extendida) → [ADR-011](../adr/011-no-ia-clinica-decisional.md)
- **PHR centrado en paciente** master DB cross-tenant (HL7 FHIR JSONB) → [ADR-010](../adr/010-phr-master-db-sobre-per-tenant.md)
- **Multi-tenancy schema-per-tenant** Postgres → [ADR-001](../adr/001-multi-tenancy-schema-per-tenant.md)
- **Tauri sobre Electron** desktop → [ADR-002](../adr/002-tauri-sobre-electron.md)
- **Print Bridge local** sobre WebUSB → [ADR-003](../adr/003-print-bridge-local-sobre-webusb.md)
- **Fastify sobre Express** backend → [ADR-004](../adr/004-fastify-sobre-express.md)
- **TanStack Router sobre React Router** apps internas → [ADR-005](../adr/005-tanstack-router-sobre-react-router.md)
- **Hetzner+Coolify sobre AWS** deploy V1 → [ADR-006](../adr/006-hetzner-coolify-sobre-aws-v1.md)
- **Stripe Connect Direct sobre Platform** MX → [ADR-007](../adr/007-stripe-connect-direct-sobre-platform-mx.md)
- **WhatsApp Cloud Meta directo sobre Twilio** → [ADR-008](../adr/008-whatsapp-cloud-meta-directo-sobre-twilio.md)
- **SQLite + sync queue sobre CRDTs** offline → [ADR-009](../adr/009-sqlite-sync-queue-sobre-crdts.md)
- **Biome sobre ESLint+Prettier** linting → [ADR-012](../adr/012-biome-sobre-eslint-prettier.md)

## Cómo usar este directorio

- **Antes de codear un módulo**, leer el análisis correspondiente. Ej: codear productos → leer [`04-modelo-datos/4.7-productos-inventario.md`](04-modelo-datos/4.7-productos-inventario.md).
- **Si surge contradicción** entre código actual y análisis: el análisis manda. Si el análisis está mal, abrir entrada en [`../decisiones-pendientes.md`](../decisiones-pendientes.md) antes de cambiar código.
- **Cambios al análisis** se hacen vía PR + se reflejan en memory de Claude (`/home/gaby-pc-ubuntu/.claude/projects/-home-gaby-pc-ubuntu/memory/`). Ver fechas de actualización al inicio de cada archivo.

## Estado de migración

✅ **Completa.** Los 10 análisis (37 archivos en total: 9 raíz + 10 flujos + 18 sub-modelos) están migrados al repo. La memoria de Claude sigue siendo redundante para sesiones nuevas, pero el repo es ahora la fuente de verdad versionada.
