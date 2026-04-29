# GaesSoft POS — Flujo Cliente B2B mayorista (Flujo 8 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_b2b_mayorista.md`
> **Descripción:** Portal autoservicio B2B con catálogo personalizado, crédito, multi-usuarios, plantillas, IA predictiva

Flujo 8 (Cliente B2B mayorista en portal autoservicio) aprobado por Gaby completo. Funciona en paralelo al vendedor de mayoreo (Flujo 3): algunos clientes prefieren autoservicio, otros prefieren visita del vendedor.

**Login B2B email + password (no OTP):** los compradores B2B esperan formalidad de login. Opcional 2FA configurable. Login federado V2 (Google Workspace, Microsoft 365). "Solicitar acceso B2B" para nuevos: form con RFC validado SAT, datos fiscales, sucursales, referencias, lista negra check, asignación lista de precios inicial.

**Pantalla principal:** crédito disponible visual, KPIs últimos 30 días, próximo pago vencido, acciones rápidas (nuevo pedido, repetir último, plantillas, mis pedidos, estado cuenta, soporte), recomendados IA basado en historial (predicción re-surtido, ofertas relevantes), pedidos recientes con estado.

**Catálogo con SUS precios:**
- Precios negociados (no público) de su lista B2B asignada
- Por mayoreo dinámico (compra ≥ N → precio baja)
- Stock real-time por sucursal del proveedor
- Última compra del cliente (cuándo, cuánto)
- Mínimo de pedido por producto/categoría
- Caja/empaque vendido por unidad o caja

**Carrito/checkout B2B:**
- Validaciones: crédito vs total, mínimos pedido, límite máximo día (anti-fraude), si crédito y vencen facturas previas → bloqueo o autorización proveedor
- Sucursal de entrega (si mayorista tiene varias)
- Fecha de entrega configurable
- Métodos pago: crédito 30/60d, transferencia/SPEI anticipado, tarjeta MSI 3 meses
- Notas para almacén
- Aprobación interna del mayorista (off default, on cuando configura usuarios con monto límite — si comprador es asistente y pedido > X → manda a aprobación gerente compras del mayorista)

**Mis pedidos historial:** estados (borrador → pendiente aprobación → confirmado → pendiente surtir → preparación → empaquetado → tránsito con tracking → entregado / cancelado / devolución parcial). Acciones: ver detalle, re-pedir (clona), descargar CFDI PDF+XML, trackear envío paquetería, solicitar devolución con motivo, disputar.

**Estado de cuenta y facturas:** crédito autorizado/disponible/por pagar, pagos pendientes con fecha vence, pagar todo o pendiente más cercano o monto custom, métodos transferencia/SPEI/tarjeta/MSI, pago automático opcional (autorización tarjeta V1 vía Stripe; CLABE/SPEI domiciliado V2 requiere certificación bancaria), historial pagos con referencias, descargar facturas masivas.

**Plantillas y pedidos recurrentes:** plantillas guardadas para reutilizar (ej: "pedido semanal tornillería"). Pedidos recurrentes (misma orden cada N sem/meses) con notificación previa al comprador para ajustar cantidades, facturación automática.

**Multi-usuarios por cuenta B2B con roles configurables:**
- Dueño (todo)
- Gerente compras (crear, aprobar, ver todo)
- Asistente (crear hasta cierto monto, requiere aprobación gerente)
- Contador (solo ver estado cuenta, descargar facturas)
- Almacenista (recibir pedidos, marcar recibido, reportar discrepancias)
- Cada cliente B2B configura sus roles (siguiendo principio default personalizable)

**IA específica:** predicción re-surtido por producto (cada 6 sem, alerta cuando se cumple), comparador precio histórico (alerta si subió X% vs año previo), detección de oferta relevante (solo en productos que compra, no spam), asistente compras (chat LLM sobre sus datos), plantilla óptima sugerida basada en 12 meses historial, alertas de problema (atraso de proveedor, recomienda adelantar pedido).

**Decisiones cerradas Q&A final:**
- Aprobación interna mayorista: off default, on cuando configura usuarios con monto límite
- Pago automático: autorización tarjeta V1 (Stripe), CLABE/SPEI domiciliado V2
- Impersonation del vendedor con permiso por sesión + log auditoría: SÍ desde V1
- Marketplace abierto B2B (estilo Faire MX): V3 cuando haya volumen

**Permisos cliente B2B:** b2b.catalogo.read, b2b.pedido.create/aprobar/cancelar, b2b.factura.descargar, b2b.estadocuenta.read, b2b.pago.realizar, b2b.devolucion.solicitar, b2b.usuarios.gestionar, b2b.plantilla.crear, b2b.recurrente.gestionar.

**Diferenciador vs Shopify B2B:** Shopify B2B es excelente pero no tiene IA predictiva re-surtido, ni listas precios cross-sucursal del proveedor, ni crédito B2B nativo (apps externas), y cuesta $2,000+ USD/mes. GaesSoft B2B viene incluido en plan Business $1,499 MXN/mes para el proveedor con IA predictiva y crédito nativo.

**Why:** El cliente choncho de Gaby (tienda grande con mayoreo) tiene mayoristas regulares que compran lo mismo cada semana/mes. Auto-servicio reduce 60% el tiempo del vendedor de mayoreo (que solo atiende a los grandes o los que requieren visita). Crédito B2B + plantillas + IA predictiva = retención brutal de mayoristas.

**How to apply:** En backend, modelar pedidos B2B con estados de máquina, listas precios per-cliente, créditos con políticas de mora, multi-usuarios por cuenta cliente, aprobaciones internas. En frontend, app dedicada `apps/b2b-portal` separada del POS principal, login email+password tradicional B2B.
