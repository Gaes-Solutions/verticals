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

### 2.3 Modelo 4.9 Apartados ✅ CERRADO
**Schema tenant:**
- [x] `Apartado` con folio único per-sucursal `AP-{CODIGO}-{NNNNNN}` + cliente_id O cliente_b2b_id + estado enum + montoPagado acumulado + fechaLimite + penaCancelacionPct + politicaCancelacion snapshot + motivoCancelacion + canceladaPorId + liquidadoAt/canceladoAt
- [x] `ApartadoLinea` snapshot inmutable (misma estructura que VentaLinea con descuentos+impuestos+totalLinea+descuentosAplicados jsonb del motor + snapshotProducto jsonb)
- [x] `ApartadoAbono` append-only con 6 métodos + referencia + comprobanteUrl
- [x] `ApartadoFolioCounter` atómico (mismo patrón VentaFolioCounter)
- [x] Extensión `Venta.apartadoId @unique` para relación 1:1 inversa

**Permisos:** 5 nuevos APARTADOS_LEER/CREAR/ABONAR/LIQUIDAR/CANCELAR + categoría en catálogo. Roles preset actualizados.

**Logic + endpoints:**
- [x] Service `aplicarReservaApartado` y `liberarReservaApartado` en inventario service (modifican `stockReservado` NO `stockActual`, validan disponibilidad = actual - reservado, crean movimiento tipo `apartado_reservado`/`apartado_liberado`)
- [x] `POST /t/apartados` (APARTADOS_CREAR) — atómico: preview cascada + reserva por línea + abono inicial opcional
- [x] `POST /t/apartados/:id/abonos` (APARTADOS_ABONAR)
- [x] `POST /t/apartados/:id/liquidar` (APARTADOS_LIQUIDAR) → libera reserva + descuenta stockActual via aplicarAjuste + crea Venta linkada con folio normal copiando líneas/snapshot/abonos como pagos
- [x] `POST /t/apartados/:id/cancelar` (APARTADOS_CANCELAR — gerente/dueno) → libera reservas + aplica pena con override opcional
- [x] `GET /t/apartados` lista paginada con filtros + GET `/:id` detalle full
- [x] Refine schema Zod: requiere clienteId O clienteB2bId (400 si ambos null)

**Diferido a V2:** job nocturno BullMQ apartado_expirado (libera reservas + aplica pena automática). **Diferido a 2.5 Devoluciones:** CFDI Egreso si abono inicial fue facturado. **Diferido a V1.5:** retención de pena en monedero del tenant (V1 sólo la calcula).

**Tests integración:**
- [x] 14 tests: reserva sin tocar stockActual, stock insuficiente→409 con extra.stockDisponible, sin clienteId→400, abono > saldo→409, liquidar antes saldar→409, liquidación crea venta+libera+descuenta atómico, re-liquidación→409, cajero sin CANCELAR→403, pena 25%+override 0%, listado filtros

**Total cierre 2.3: 200 tests API + 22 perm + 16 pricing + 18 db + 3 fiscal = 259 verdes**

### 2.4 Modelo 4.9 CxC formal ✅ CERRADO (2026-05-20)
**Schema tenant:**
- [x] `cuentas_cobrar` (folio CXC-{CODIGO}-NNNNNN unique per-sucursal + tipo_origen [venta_credito|regularizacion_fiado|manual|apertura_saldo_inicial] + cliente_id XOR cliente_b2b_id + venta_id @unique opcional + monto_original + monto_pagado + currency + fecha_emision + fecha_vencimiento + dias_credito_otorgados + tasa_interes_mora_pct + interes_acumulado + estado [activa|vencida|liquidada|incobrable|condonada] + vendedor_id + comision_pagada_a_vendedor boolean + liquidada_at + condonada_at)
- [x] `cxc_pagos` append-only (cuenta_cobrar_id + metodo VentaPagoMetodo + monto + referencia + comprobante_url + usuario_id)
- [x] `cxc_folio_counters` (sucursal_id PK + ultimo_numero atómico)
- [x] Enum `VentaPagoMetodo` extendido con `credito_b2b`
- [x] 4 permisos nuevos: CXC_LEER/CREAR/COBRAR/CONDONAR

**Bonus infra:**
- [x] Nuevo CLI `pnpm migrate make <target> <name>` reutilizable vía shadow database temporal (resuelve limitación de `prisma migrate dev` con multi-schema)

**Logic + endpoints:**
- [x] `lineaCreditoDisponible(clienteB2bId)` = autorizada - sum(CxC abiertas), valida no expirada
- [x] `crearVenta` con `credito_b2b`: valida línea ANTES de tx, crea CxC dentro de tx con días+tasa heredados, rechaza cambio
- [x] `regularizarFiadoToCxc`: tx única reduce saldo via FiadoMovimiento(regularizacion_cxc) + crea CxC tipo_origen=regularizacion_fiado ligada via referenciaTipo/Id
- [x] `POST /t/cxc/:id/pagos` registra pago, marca liquidada si saldo=0, rechaza pagos sobre liquidada/condonada
- [x] `POST /t/cxc` creación manual (para deudas heredadas al onboarding)
- [x] `POST /t/cxc/:id/condonar` y `POST /t/cxc/:id/incobrable` con motivo en notas
- [x] `POST /t/cxc/regularizar-fiado` endpoint cross-módulo
- [x] `GET /t/cxc` con filtros estado/tipoOrigen/cliente/clienteB2b/sucursal/vendedor/vencidasAntes
- [x] `GET /t/cxc/linea-credito?clienteB2bId=` consulta disponible

**Diferido a V2:** job nocturno BullMQ calcula interés mora + envía recordatorios WhatsApp/email

**Tests integración:** 23 tests verdes
- [x] Venta credito_b2b auto-crea CxC y consume línea correctamente
- [x] 409 si excede línea; 400 si cambio o sin clienteB2bId
- [x] Pago parcial mantiene activa, pago total marca liquidada
- [x] Pago sobre liquidada/condonada → 409
- [x] Condonar/incobrable solo con CXC_CONDONAR (cajero → 403)
- [x] Regularización fiado reduce saldo informal y crea CxC formal con tipoOrigen correcto
- [x] CxC vencida marcada por filtro `vencidasAntes` (no requiere job V1)

### 2.5 Modelo 4.9 Devoluciones ✅ CERRADO (2026-05-20)
**Schema tenant:**
- [x] `devoluciones` (folio DV-{CODIGO}-NNNNNN unique per-sucursal + venta_id obligatorio + tipo [total|parcial] + motivo enum 6 valores + metodo_reembolso enum 7 valores incluyendo `nota_credito_cxc` y `nota_credito_fiado` + `repone_stock_default` + `aprobado_por_id` para V1.5 + estado [procesada|cancelada] + cancelacion_motivo/canceladoAt/canceladoPorId)
- [x] `devolucion_lineas` (venta_linea_id FK + cantidad_devuelta + repone_stock per-linea override + motivo_linea opcional + snapshot)
- [x] `devolucion_folio_counters` atómico per-sucursal
- [x] **Refactor Cfdi**: removido `@unique` de `ventaId` (una venta puede tener 1 Ingreso + N Egresos), agregados `devolucionId @unique` + `tipoRelacionSat` + `cfdiRelacionadoUuids[]`
- [x] **Extensión `@gaespos/fiscal`**: `CfdiEmitirInput.cfdisRelacionados` para relación SAT tipo 03
- [x] **MovimientoTipoFront** ahora incluye `devolucion_cliente` (signo +1)
- [x] **Permisos cajero/vendedor** ganaron VENTAS_DEVOLVER por default (Square/Shopify standard)

**Logic + endpoints:**
- [x] `POST /t/ventas/:id/devolver` crea devolución, valida cantidades sumadas ≤ venta original
- [x] Stock con patrón net-zero cuando `reponeStock=false` (`devolucion_cliente +N` luego `merma -N`, 2 movimientos audit)
- [x] Aplica reembolso a fiado/CxC según método (`nota_credito_fiado` → `aplicarAbonoFiado`, `nota_credito_cxc` → `registrarPago`)
- [x] Si venta original facturada con Ingreso vigente y `cfdiEgreso` solicitado → emite CFDI Egreso (tipoComprobante "E") con `cfdisRelacionados` tipoRelacion=03 vinculado al folio fiscal del Ingreso
- [x] `GET /t/devoluciones` con filtros estado/tipo/motivo/metodoReembolso/sucursal/venta/usuario/desde/hasta
- [x] `GET /t/devoluciones/:id` con detalle líneas + CFDI Egreso

**Tests integración:** 15 tests verdes
- [x] Devolución parcial repone stock con tipo `devolucion_cliente`
- [x] Defectuoso con `reponeStockDefault=false` → net-zero stock + 2 movimientos
- [x] Override per-linea (1 repone, 1 merma)
- [x] Tipo total vs parcial determinado por cantidades
- [x] Cantidad acumulada no excede venta original (409 segunda devolución, extra `disponible`)
- [x] ventaLineaId cruzado entre ventas → 400
- [x] Venta cancelada no admite devolución (409)
- [x] `nota_credito_fiado` reduce saldo fiado + 400 sin clienteId + 409 sin credito_fiado previo
- [x] `nota_credito_cxc` registra pago en CxC asociada
- [x] CFDI Egreso emitido si venta con CFDI Ingreso vigente
- [x] Venta sin Ingreso → `cfdiEgresoId=null` (no falla)
- [x] Filtros lista por motivo/ventaId
- [x] Rol almacen sin VENTAS_DEVOLVER → 403

**Diferidos a Hito 2.7/V1.5:** cancelación de devolución (revertir stock + reversal CFDI Egreso), aprobación de devoluciones >umbral por gerente, motivo `defectuoso` con devolución a proveedor, refunds automáticos a tarjeta vía Stripe/Conekta.

### 2.6 Modelo 4.10 Cotizaciones → Pedidos B2B ✅ CERRADO (2026-05-20)
**Schema tenant:**
- [x] `cotizaciones` (folio QT-{CODIGO}-NNNNNN unique per-sucursal + cliente_b2b_id + vendedor_id + estado [borrador|enviada|aceptada|rechazada|vencida|convertida] + totales completos + fecha_vencimiento derivada de diasVigencia + condiciones_pago snapshot + pdf_firmado_url placeholder V1 + canal envío enum + pedidoId @unique 1:1 cuando convertida)
- [x] `cotizacion_lineas` snapshot inmutable
- [x] `cotizacion_folio_counters` atómico
- [x] `pedidos` (folio PD-{CODIGO}-NNNNNN unique per-sucursal + cliente_b2b_id + vendedor_id + cotizacion_id @unique opcional + estado [creado|preparando|enviado|entregado|cancelado] + estado_aprobacion [no_requiere|pendiente|aprobada|rechazada] derivado de cliente.requiereAprobacionInterna vs montoAprobacionRequired + orden_compra_cliente + direccion_envio_id FK + paqueteria/tracking_externo/tracking_url + venta_id @unique cuando convertido a venta)
- [x] `pedido_lineas` + `pedido_folio_counters`
- [x] 5 permisos nuevos COTIZACIONES_LEER/ENVIAR/GESTIONAR_ESTADO + PEDIDOS_LEER/CREAR/APROBAR/GESTIONAR/CONVERTIR_VENTA

**Logic + endpoints:**
- [x] `POST /t/cotizaciones` motor cascada precios → snapshots, estado borrador, fechaVencimiento derivada
- [x] `POST /t/cotizaciones/:id/enviar` con canal (email/whatsapp/descarga/otro) + destino + PDF placeholder (real con Puppeteer+firma → V1.5)
- [x] `POST /t/cotizaciones/:id/aceptar` (valida no vencida) / `:id/rechazar`
- [x] `POST /t/cotizaciones/:id/convertir-pedido` (tx atomic: copia snapshots, marca cotizacion=convertida+pedidoId, hereda estadoAprobacion según cliente)
- [x] `POST /t/pedidos` directo sin cotización
- [x] `POST /t/pedidos/:id/aprobar` / `:id/rechazar` (gate gerente)
- [x] State machine: `preparar` (creado→preparando, valida aprobación OK) → `marcar-enviado` (con paqueteria+trackingExterno+trackingUrl) → `marcar-entregado` (enviado→entregado)
- [x] `POST /t/pedidos/:id/cancelar` (409 si entregado o ya ventaId)
- [x] `POST /t/pedidos/:id/convertir-venta` (entregado → Venta canal=mayoreo + descuenta stock con `ajuste_negativo` + valida `credito_b2b` contra línea + **crea CxC automática** vía `crearCxcDesdeVentaB2b`, marca pedido.ventaId)
- [x] `GET /t/cotizaciones` y `/t/pedidos` con filtros

**Tests integración:** 17 tests verdes
- [x] Vendedor crea cotización borrador
- [x] **Flujo full**: cot→enviar→aceptar→convertir-pedido→preparar→marcar-enviado→marcar-entregado→convertir-venta (con stock validado decremented y pedido.ventaId enlazado al final)
- [x] Cliente con `requiereAprobacionInterna=true` y monto≥umbral → estadoAprobacion=pendiente bloquea preparar (409)
- [x] Monto bajo umbral → no_requiere → permite preparar OK
- [x] Owner aprueba pedido pendiente → almacen prepara OK
- [x] Rechazar pedido cambia estadoAprobacion=rechazada
- [x] Vendedor sin PEDIDOS_APROBAR → 403
- [x] State machine errors: aceptar borrador no enviado 409, convertir rechazada 409, entregar sin pasar enviado 409, convertir no-entregado a venta 409, doble convertir cotización 409, cancelar entregado 409
- [x] Filtros lista (clienteB2bId, estadoAprobacion=pendiente, estado=entregado)
- [x] Convertir-venta con `credito_b2b` crea CxC automática y consume línea de crédito

**Diferidos V1.5/V2:** generación PDF real con Puppeteer + firma electrónica cliente, recordatorios vencimiento via BullMQ, integración tracking paqueterías (Estafeta/DHL/FedEx), cancelación parcial líneas, validación stock al crear pedido (V1 sólo al convertir-venta).

### 2.7 Demo Hito 2 — Cajero mayorista + abarrotes ✅ CERRADO (2026-05-20)
- [x] Nuevo script `apps/api/scripts/demo-comercial.ts` registrado como `pnpm --filter @gaespos/api demo:comercial` (complementa el `demo:retail` de Hito 1, cada uno con su propio enfoque)
- [x] 20 pasos end-to-end cubiertos en una sola corrida contra API LIVE:
  - Setup tenant + 4 usuarios (owner/cajero/vendedor/almacen) + CFDI sandbox + catálogo obra + apertura caja
  - **Apartado**: cliente B2C con fiado, aparta 5 cementos con abono inicial, 2 abonos parciales, liquidación que crea venta y libera reserva
  - **Fiado→CxC**: venta a fiado + regularización a CxC formal con interés mora
  - **Cotización B2B→Pedido**: cotiza, envía email, cliente acepta, convertir-pedido con aprobación umbralizada >$5K, owner aprueba, almacen prepara→envía con tracking Estafeta→entrega
  - **Convertir-venta credito_b2b**: crea CxC automática que consume línea (50K→43K)
  - **Devolución con nota_credito_cxc**: defectuosos reponeStock=false net-zero, abona automáticamente a CxC
  - **Pago final CxC** efectivo que liquida
- [x] Actualizar STATUS.md, CHANGELOG.md (✅)
- [ ] Tag `hito-2-comercial-v1` — pendiente cuando Gaby haga el repo remoto público

## Performance budgets (heredados del Hito 1)
- Crear apartado P95 <500ms
- Convertir cotización a venta P95 <800ms
- Búsqueda cliente B2C/B2B P95 <100ms con 10k clientes seed
- Devolución con CFDI Egreso P95 <3s (incluye Facturama)

## Decisiones tomadas en este hito
*(Se llenarán conforme avancemos. ADR `013+` si surge algo arquitectónico relevante.)*
