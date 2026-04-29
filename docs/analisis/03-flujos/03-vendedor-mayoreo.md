# GaesSoft POS — Flujo Vendedor mayoreo (Flujo 3 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_vendedor_mayoreo.md`
> **Descripción:** App móvil PWA para vendedor B2B de campo con CRM ligero, pedidos offline, firma electrónica, comisiones en tiempo real

Flujo 3 (Vendedor de mayoreo / B2B) aprobado por Gaby completo. Aplica a tienda grande con mayoreo, distribuidores y mayoristas — todos los V1 que tienen vendedores externos.

**Plataforma:** PWA móvil en V1 (con notificaciones push web + GPS + cámara). React Native nativa V2 si la fricción es real.

**Pantalla de inicio del vendedor:** dashboard con barra de progreso de meta mes ($X de $Y, comisión generada), ruta de visitas del día con check de visitadas, pendientes (cotizaciones por convertir, pedidos por confirmar, CxC por cobrar). Atajos: Nuevo pedido, Cotización, Llamar, Mapa.

**CRM ligero del cliente:** tarjeta con datos clave + crédito disponible + ventas mes + últimas visitas + notas. Acciones: cotizar, levantar pedido, llamar (con tracking duración), WhatsApp con plantilla, agregar nota, subir foto (anaquel/fachada/exhibidor), geo-checkin opcional.

**Levantar pedido B2B:** catálogo navegable con buscador. Cada producto muestra precio del cliente (no precio público), stock por sucursal, última compra del cliente. Agregar con cantidad. Cross-sell IA. Validaciones: mínimo de pedido, crédito disponible, fecha de entrega, sucursal de entrega, método de pago. Borrador local en SQLite/IndexedDB hasta cerrar.

**Firma electrónica del cliente:** canvas táctil donde el cliente firma con el dedo. Estándar en distribución MX. Imagen vinculada al pedido como evidencia legal y comprobante para almacén. Alternativas: PIN del cliente o foto con INE. Configurable por tenant: off/sugerida/obligatoria.

**Cotización vs Pedido:**
- Cotización = sin compromiso, PDF con membrete, vigencia 7 días default, botón un-clic para convertir, envío automático WhatsApp/email con mensaje personalizado generado por IA.
- Pedido = entra a flujo de almacén para surtir; si crédito → CxC al confirmar entrega; si contado → cobro al entregar (POS móvil del repartidor).

**Sincronización offline-first:** catálogo, precios, clientes asignados y stock se descargan al inicio del día. Pedidos en cola `pending_upload` cuando no hay red. Sync automático al recuperar conexión. Resolución de conflictos (stock agotado entre tanto) con notificación al vendedor. Confirmación al cliente solo tras sync exitoso. Stock crítico marcado "verificar antes de prometer".

**Cierre del día:** reporte automático al gerente con visitas hechas vs planeadas (con georef si activado), pedidos levantados, productos top, clientes no visitados con motivo, comisión generada, progreso de meta.

**Gamificación de comisiones (estilo Numerik):** progreso visible de meta, notificaciones push al alcanzar hitos (80%, 100%, etc), ranking opcional entre vendedores, retos especiales por producto/categoría.

**Cálculo de comisión configurable por tenant:**
- Por monto vendido (% sobre venta neta)
- Por monto cobrado (% al cobrar — alinea vendedor con cobranza)
- Diferenciada por producto/categoría
- Bonos escalonados por meta (0-80% sin bono, 80-100% bono X, 100%+ bono Y)
- Castigos: descuentos no autorizados, cancelaciones, devoluciones

**IA específica:** sugerencia de productos a ofrecer al cliente basada en patrón histórico, ruta optimizada, mensaje WhatsApp personalizado al enviar cotización, alerta de cliente en riesgo de fuga (60 días sin pedir), cross-sell al levantar pedido, resumen del cliente al entrar (mejor mes, productos favoritos, última queja).

**Decisiones cerradas:**
- Geo-checkin: opcional, decide el dueño del tenant
- Firma electrónica: configurable por tenant (off/sugerida/obligatoria)
- Ranking público: opcional, activado por gerente
- PWA en V1, React Native nativa V2 si hay fricción

**Permisos:** ventas.cotizar, ventas.pedido_b2b, clientes.read_asignados (o todos para gerente), precios.read_lista_cliente, inventario.read, comisiones.read_propia (o todos), crm.notas.create, crm.fotos.upload, crm.geocheckin.usar.

**Aplica a:** tienda grande con mayoreo (cliente jugoso de Gaby), distribuidores de medicamentos visitando vet/consultorio, mayoristas de abarrotes, tiendas con vendedoras de piso (variante reducida sin geocheckin/ruta/pedido futuro — cobra en POS pero con comisión).

**Why:** El vendedor es el motor de venta de la tienda grande. Su productividad se mide en visitas + pedidos + cobranza. Una app pobre lo hace lento; una app brillante con IA lo convierte en 1.5x. Microsip/SAP cubren esto pero feo y caro; GaesSoft puede dar una experiencia tipo Pepperi a precio MX.

**How to apply:** En backend, modelar pedidos B2B con estados (borrador → enviado → confirmado → surtido → entregado → cobrado), cotizaciones con vigencia, listas de precios per-cliente, comisiones con reglas configurables. En frontend, app PWA dedicada con sync offline, catálogo descargable, captura táctil de firma.
