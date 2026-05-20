# Hito 2 — Comercial (apartados, CxC, devoluciones, clientes, promociones)

**Estimado:** Semanas 7-9 (3 semanas, post-Hito 1 listo)
**Objetivo demo:** El cajero retail/abarrotes puede manejar fiados, apartados, devoluciones, y atender mayoristas con crédito formal + cotizaciones. Cierra el ciclo comercial completo de retail+mayoreo MX.

## Scope cerrado

### Incluido V1 (este hito)
- **2.1 Modelo 4.8 Clientes B2C**: persona física + multi-dirección + multi-teléfono + grupos + etiquetas + fiado informal (RF abarrotes). Cliente "Público en general" auto-sembrado.
- **2.2 Modelo 4.8 Clientes B2B**: empresa mayorista + contactos + direcciones envío + crédito autorizado + multi-listas-precio + vendedores asignados con comisión configurable.
- **2.3 Modelo 4.9 Apartados**: reserva stock + abonos + liquidación con conversión a venta + cancelación con pena.
- **2.4 Modelo 4.9 CxC formal**: auto-creada cuando venta con método `credito`, abonos manuales, status activa/vencida/liquidada.
- **2.5 Modelo 4.9 Devoluciones**: parciales por línea + motivos + reposición de stock condicional + CFDI Egreso (nota crédito) integrado con Facturama.
- **2.6 Modelo 4.10 Cotizaciones → Pedidos B2B**: quote PDF firmable → pedido aprobado → conversión a venta cuando se entrega/cobra.

### Diferido a hitos posteriores (decisión explícita)
- **Vinculación PHR (cliente↔patient_master)** → Hito 3 Salud (Vet/Humana)
- **Portal autoservicio B2B (cliente_b2b_usuarios + login)** → Hito 3 B2B portal
- **Documentos B2B en S3** → V1.5 cuando configuremos S3/Backblaze
- **Validación RFC contra SAT API** → V2 (V1 solo regex de formato)
- **Búsqueda semántica vector_embedding pgvector** → V1.5
- **Job nocturno apartado_expirado + interés moratorio CxC** → V2 con BullMQ workers
- **Promociones avanzadas: programa lealtad puntos, happy hour, BOGO completo** → Hito 4 Marketing
- **Modelo 4.18 Marketing campañas WhatsApp/email/SMS** → Hito 4

## Decisiones arquitectónicas

1. **Clientes B2C separados de B2B** (Salesforce-pattern): tablas distintas `clientes` y `clientes_b2b`. Una venta puede ser a uno o al otro (foreign key alternativo). Nunca se mezclan.
2. **Fiados informales ≠ CxC formal**: tabla `fiados` (1 fila por cliente, libreta de abarrotes) distinta de `cuentas_cobrar` (CFDI obligatorio). Cliente puede "regularizar" fiado → CxC formal si pide factura.
3. **Snapshot inmutable** ya implementado en Hito 1.3 — sigue el patrón en apartados/devoluciones.
4. **Stock reservado** vía `aplicarAjuste` con tipos nuevos: `apartado_reservado` (al crear apartado), `apartado_liberado` (al cancelar/expirar), `devolucion_cliente` (al devolver).
5. **CFDI Egreso (nota crédito)** auto-emitida al procesar devolución si la venta original estaba facturada. Reusa `@gaespos/fiscal` interface.
6. **Cancelación tres factores** (permiso + motivo + PIN gerente): append-only en `ventas_canceladas`. PIN ya en `Usuario.pinHash` desde Hito 1.1.

## Checklist por sub-tarea

### 2.0 Doc + STATUS + CHANGELOG ✅
- [x] `docs/hitos/hito-2-comercial.md` (este archivo)
- [x] STATUS.md actualizado por sub-hito conforme se cierra
- [x] CHANGELOG.md entrada por sub-hito

### 2.1 Modelo 4.8.a — Clientes B2C + fiados ✅ CERRADO
**Schema tenant:**
- [x] `clientes` con flags fiscales completos (RFC unique + régimen + uso CFDI + CP fiscal + dirección JSONB), cliente_grupo_id, vendedor_asignado_id, permite_fiado + limite_fiado, is_default flag para Público en general (read-only). Vinculación PHR (patient_master_id) diferida a Hito 3.
- [x] `cliente_direcciones` con swap automático is_default_envio/facturacion
- [x] `cliente_telefonos` con flag whatsapp + es_principal swap
- [x] `cliente_grupos` con código único + descuento_default_pct + listaPrecioCodigo
- [x] `cliente_etiquetas` many-to-many (PK compuesta)
- [x] `fiados` (1 fila por cliente, estado enum activo/liquidado/incobrable)
- [x] `fiado_movimientos` append-only con 5 tipos (cargo_venta/abono_pago/ajuste_+/-/regularizacion_cxc)

**Migrations + seed:**
- [x] Migration `20260520030000_add_clientes_b2c_fiados` cross-tenant via shadow schema
- [x] Migration `20260520031000_add_credito_fiado_metodo` agrega valor al enum VentaPagoMetodo
- [x] Seed extendido: `seedTenantDefaults` crea cliente "Público en general" con isDefault=true. Re-sembrado a 6 tenants existentes.

**Service `fiado-service.ts`:**
- [x] `aplicarCargoFiado` valida permiteFiado + límite, FiadoError 409 con extra.disponible
- [x] `aplicarAbonoFiado` en transaction, marca liquidado si saldo=0
- [x] `disponibleFiado` helper computado para vista
- [x] `ensureFiado` upsert idempotente

**API endpoints `/t/clientes*`:**
- [x] GET lista paginada con búsqueda multi-criterio (nombre/apellidos/rfc/email/teléfono incl. relacional) + filtros tipo/grupo/permiteFiado/isActive
- [x] GET `/default` para POS quick-pick del Público en general
- [x] GET `/:id` detalle con direcciones+teléfonos+etiquetas+fiado+movimientos
- [x] POST/PATCH/DELETE con guard read-only del cliente público
- [x] Sub-recursos con swap automático del flag default
- [x] GET/POST fiado, permiso `clientes.fiado_gestionar`
- [x] CRUD grupos
- [ ] **Diferido a Hito 2.4**: POST `/:id/fiado/regularizar` que convierte fiado → CxC formal (necesita Hito 2.4 CxC primero)

**Integración cross-módulo:**
- [x] `crearVenta` detecta `credito_fiado`, requiere clienteId, prohíbe cambio, invoca `aplicarCargoFiado` dentro de la $transaction. FiadoError mapeado a VentaError.

**Tests integración:**
- [x] 25 tests `tenant-clientes.test.ts`: seed público read-only, CRUD con RFC case-insensitive + duplicate, búsqueda multi-criterio, sub-recursos con swap, fiados (límite/abono/cliente sin permiteFiado), grupos
- [x] Suite total: 171 tests API + 22 permissions + 16 pricing + 18 db + 3 fiscal = 230 verdes

**Total cierre 2.1: 230 tests verdes**

### 2.2 Modelo 4.8.b — Clientes B2B + crédito ✅ CERRADO
**Schema tenant:**
- [x] `ClienteB2b` con razónSocial+RFC unique+régimen+nivelMayoreoId FK+listaPrecioPrincipalCodigo+diasCreditoDefault+condicionesPago enum+requiereOrdenCompra+formatoFacturaPreferido+requiereAprobacionInterna+montoAprobacionRequired
- [x] `ClienteB2bContacto` multi con esDecisor/esPagador
- [x] `ClienteB2bDireccion` multi con contactoRecepcion+horarioRecepcion+swap isDefaultEnvio
- [x] `ClienteB2bCredito` con max 1 activa por cliente (renovaciones archivan previa automáticamente)
- [x] `ClienteB2bListaPrecio` M2M con prioridad+vigencia
- [x] `ClienteB2bVendedorAsignado` PK compuesta cliente+usuario+tipo con comisionPctOverride
- [x] Extensión `Venta`: nuevo `clienteB2bId` FK opcional

**Diferidos:** `cliente_b2b_documentos` (S3) → V1.5 ; `cliente_b2b_usuarios` (portal autoservicio) → Hito 3

**API endpoints `/t/clientes-b2b*`:**
- [x] CRUD + búsqueda multi-criterio (razónSocial/nombreComercial/rfc/email/teléfono + contactos relacional) + filtros industria/nivelMayoreo/condicionesPago/isActive
- [x] POST `/:id/credito` (CLIENTES_FIADO_GESTIONAR; archiva línea activa anterior automáticamente)
- [x] POST `/:id/contactos`, `/:id/direcciones`, `/:id/listas-precio` (upsert con validación lista existe→404), `/:id/vendedores` (upsert con validación usuario→404)
- [ ] **Diferido a 2.4 CxC**: método pago `credito_b2b` que valida `linea_disponible = autorizada - sum(cxc abiertas)`

**Tests integración:**
- [x] 15 tests `tenant-clientes-b2b.test.ts`: CRUD + RFC duplicate + búsqueda parcial + detalle con todas las relaciones + PATCH; 3 contactos con roles (decisor/pagador); 2 direcciones con swap is_default_envio + recepción info; crédito $50k → autorización archiva, $100k crea nueva (max 1 activa); listas precio: PUBLICO asignada, lista inexistente→404; multi-vendedor (principal + cobranza al mismo cliente); venta con `clienteB2bId` cobra OK y persiste referencia
- [ ] Diferido a 2.4: línea_disponible computado contra CxC abiertas
- [ ] Diferido a V2: validación SAT API

**Total cierre 2.2: 186 tests API + 22 perm + 16 pricing + 18 db + 3 fiscal = 245 verdes**

### 2.3 Modelo 4.9 Apartados
**Schema tenant:**
- [ ] `apartados` (folio AP-001-A-NNNNN + cliente_id O cliente_b2b_id + sucursal+caja+usuario + subtotal/descuentos/total + monto_pagado computed + saldo computed + fecha_apartado + fecha_limite (default +30 días config tenant) + status [activo|liquidado_y_entregado|cancelado|expirado] + politica_cancelacion snapshot + pena_cancelacion_pct + convertido_a_venta_id FK)
- [ ] `apartado_items` (snapshot similar venta_lineas + stock_reservado_movimiento_id FK)
- [ ] `apartado_abonos` (append-only: monto + método + referencia + comprobante)

**Logic + endpoints:**
- [ ] Service `aplicarApartadoReserva` reusa `aplicarAjuste` con tipo `apartado_reservado` (nuevo tipo en inventario_movimientos)
- [ ] `POST /t/apartados` crea + reserva stock atómicamente
- [ ] `POST /t/apartados/:id/abonos`
- [ ] `POST /t/apartados/:id/liquidar` → crea venta, libera stock reservado, marca apartado liquidado, descuenta stock vendido
- [ ] `POST /t/apartados/:id/cancelar` → libera stock con tipo `apartado_liberado`, aplica pena (porcentaje de los abonos)
- [ ] `GET /t/apartados` lista con filtros estado/cliente/vencimiento

**Diferido a V2:** job nocturno BullMQ que mueve apartados activos+fecha_limite_pasada → estado=expirado + libera stock + aplica pena automática

**Tests integración:**
- [ ] Crear apartado reserva stock (stockReservado +N)
- [ ] Abonos suman a monto_pagado, validan no exceder total
- [ ] Liquidación crea venta vinculada + libera reservado + decrementa stock vendido en una transacción
- [ ] Cancelación libera stock + aplica pena

### 2.4 Modelo 4.9 CxC formal
**Schema tenant:**
- [ ] `cuentas_cobrar` (folio CXC-A-NNNNN + tipo_origen [venta_credito|regularizacion_fiado|manual] + cliente_id O cliente_b2b_id + venta_id FK opcional + monto_original + monto_pagado + saldo computed + fecha_emision + fecha_vencimiento + dias_credito_otorgados + tasa_interes_mora_pct + interes_acumulado + status [activa|vencida|liquidada|incobrable|condonada] + vendedor_id + comision_pagada_a_vendedor boolean)
- [ ] `cxc_pagos` (cuenta_cobrar_id + monto + método + referencia + comprobante + usuario)

**Logic + endpoints:**
- [ ] Auto-creación: si venta con método `credito` o `credito_fiado_regularizado` → crea CxC con saldo
- [ ] `POST /t/cxc/:id/pagos` registra pago, recalcula saldo, marca liquidada si saldo=0
- [ ] `GET /t/cxc` con filtros estado/cliente/vencidas
- [ ] `POST /t/cxc/manual` creación manual (para deudas heredadas al onboarding)

**Diferido a V2:** job nocturno BullMQ calcula interés mora + envía recordatorios WhatsApp/email

**Tests integración:**
- [ ] Venta con método credito auto-crea CxC con saldo
- [ ] Pago parcial recalcula saldo; pago total marca liquidada
- [ ] CxC vencida marcada por status_at_query (no requiere job V1)

### 2.5 Modelo 4.9 Devoluciones
**Schema tenant:**
- [ ] `devoluciones` (folio DV-A-NNNNN + venta_id obligatorio + tipo [total|parcial] + motivo [defectuoso|cambio_opinion|talla|error_cobro|otro] + subtotal_devuelto + total_devuelto + metodo_reembolso [efectivo|tarjeta_misma|saldo_a_favor|vale|transferencia] + repone_stock + cfdi_nota_credito_id FK + aprobado_por_id + status)
- [ ] `devolucion_items` (venta_item_id FK + cantidad_devuelta + monto_devuelto + repone_stock override)

**Logic + endpoints:**
- [ ] `POST /t/ventas/:id/devolver` crea devolución, valida que cantidades sumadas ≤ venta original
- [ ] Reusa `aplicarAjuste` con tipo `devolucion_cliente` por cada item (excepto si `defectuoso` + repone_stock=false va a `merma`)
- [ ] Si venta original facturada → emite CFDI Egreso (nota crédito) vía `@gaespos/fiscal` reusing emitirCfdi con tipoComprobante: E
- [ ] `GET /t/devoluciones` con filtros

**Tests integración:**
- [ ] Devolución parcial repone stock excepto items con motivo defectuoso
- [ ] Cantidad acumulada de devoluciones no excede venta original
- [ ] CFDI Egreso emitido si venta con CFDI vigente

### 2.6 Modelo 4.10 Cotizaciones → Pedidos B2B
**Schema tenant:**
- [ ] `cotizaciones` (folio QT-A-NNNNN + cliente_b2b_id + vendedor_id + items snapshot + total + vigencia + status [borrador|enviada|aceptada|rechazada|vencida|convertida] + pdf_firmado_url + convertida_a_pedido_id FK)
- [ ] `pedidos` (folio PD-A-NNNNN + cliente_b2b_id + cotizacion_id FK opcional + estado_aprobacion [pendiente|aprobada|rechazada] + aprobado_por_id + items + total + paqueteria + tracking_externo + status [creado|preparando|enviado|entregado|cancelado] + convertido_a_venta_id FK)

**Logic + endpoints:**
- [ ] `/t/cotizaciones` CRUD + POST `:id/enviar` (genera PDF con firma digital cliente)
- [ ] `POST /t/cotizaciones/:id/convertir-pedido`
- [ ] `/t/pedidos` CRUD + POST `:id/aprobar` (si cliente_b2b.requiere_aprobacion_interna)
- [ ] `POST /t/pedidos/:id/marcar-enviado` (registra tracking paquetería)
- [ ] `POST /t/pedidos/:id/convertir-venta` (entregado → cobrado)

**Tests integración:**
- [ ] Flujo full: cotización borrador → enviar → aceptar → convertir pedido → aprobar → enviar → convertir venta
- [ ] Cliente B2B con requiere_aprobacion_interna bloquea conversión sin aprobación

### 2.7 Demo Hito 2 — Cajero mayorista + abarrotes
- [ ] Extender script `pnpm demo:retail` para incluir flujo B2B + fiado + apartado + devolución + cotización
- [ ] Actualizar STATUS.md, CHANGELOG.md
- [ ] Tag `hito-2-comercial-v1`

## Performance budgets (heredados del Hito 1)
- Crear apartado P95 <500ms
- Convertir cotización a venta P95 <800ms
- Búsqueda cliente B2C/B2B P95 <100ms con 10k clientes seed
- Devolución con CFDI Egreso P95 <3s (incluye Facturama)

## Decisiones tomadas en este hito
*(Se llenarán conforme avancemos. ADR `013+` si surge algo arquitectónico relevante.)*
