# GaesSoft POS — Flujo Cajero abarrotes (Flujo 2 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_pos_abarrotes.md`
> **Descripción:** Diferenciadores de abarrotes vs retail — granel, balanza, recargas, fiados, servicios, IEPS, multi-cajero

Flujo 2 (Cajero/a en POS abarrotes) aprobado por Gaby completo. Hereda todo de Flujo 1 retail; aquí solo lo distintivo:

**Layout adaptado:** más tiles grandes (los 30-50 productos del 80% de ventas siempre visibles), tabs por categoría (Refrescos/Cigarros/Abarrotes/Frutas/Botanas/Lácteos/Dulces/Aseo), buscador pequeño arriba. 4 botones grandes en zona de carrito que NO existen en retail: 📒 Fiado, ⚡ Recarga, 💡 Servicios, 🥚 Sin código.

**Productos a granel + balanza:** producto marcado `por_peso`, lectura automática de balanza vía driver serial/USB en desktop o WebSerial API en navegador Chrome/Edge. Marcas certificadas V1: Tor-Rey y CAS (80% del mercado MX). En móvil PWA, captura manual.

**Recargas tiempo aire (40% del tráfico de un abarrotes):** modal con compañías (Telcel/Movistar/AT&T/Bait/Unefon/Virgin/Maz/Spentel), captura número, montos rápidos. Llamada a agregador (RecargaKi primario + secundario fallback, decisión final en Análisis 7). Pre-fondeo del proveedor con saldo visible. Bloqueado offline (requiere confirmación online).

**Fiados (distintos de CxC formal):** clientes marcados `permite_fiado=true` con límite configurable. Sistema valida saldo+venta ≤ límite. Ticket sin total cobrado, leyenda "FIADO — saldo total $XXX". Pantalla dedicada para abonar. WhatsApp recordatorios automáticos por días de mora. IA detecta clientes que nunca pagan y sugiere bajar límite.

**Cobro de servicios:** V1 incluye recargas + Bait pago. V2 agrega luz CFE / agua / Telmex / Mercado Pago Cobranza vía Páguelo Fácil. Cada uno con folio del agregador con validez legal. Tenant cobra margen sobre el pago real.

**Productos sin código:** botón dedicado con catálogo simplificado (huevo, tortilla, fruta, pan dulce). Atajo numérico tipo Eleventa: cajero teclea `5+` y agrega 5 unidades del último producto. Producto "Otro" sin nombre captura precio manual sin afectar inventario.

**IEPS:** flag por producto + tasa/cuota. Cigarros 160%, cervezas alta graduación 53%, refrescos azucarados $1.5375/L (2026), comida alta densidad calórica 8%. Ticket desglosa IEPS separado de IVA. CFDI 4.0 con nodo Impuestos > Traslados específico. Reporte mensual de IEPS.

**Modo turno multi-cajero:** botón "Cambiar cajero" sin cerrar caja. Cajero saliente snapshot, entrante login PIN. Corte Z desglosa por cajero al cierre. NO existe en Eleventa, sí lo necesita el abarrotes — diferenciador.

**Móvil PWA:** modo "venta rápida ambulante" para dueño que cobra desde celular fuera de la tienda. Cámara para barcode, Stripe Terminal Tap-to-Pay iOS/Android, sync inmediato.

**Permisos adicionales:** recargas.vender, servicios.cobrar, fiados.crear, fiados.cobrar, fiados.modificar_limite, productos.sin_codigo, balanza.usar.

**IA aplicada (de las 10 features V1):** cross-sell por categoría típica (cigarro+cerveza→botana margen alto), pronóstico de demanda diario (quincena vende 2.5x cerveza, sugiere reposición), insights de huecos horarios bajos, recordatorios WhatsApp tono adecuado a fiados.

**Why:** Abarrotes es el segundo cliente de Gaby y un mercado masivo en MX. Necesita features muy específicos de este vertical (recargas, fiados, balanza, servicios) que retail no usa. Eleventa los cubre pero feo; GaesSoft los cubre con UX moderna + IA.

**How to apply:** En backend, modelar productos con `tipo_venta` (unidad/peso), `permite_fiado` en cliente, módulo de recargas y servicios con providers configurables, IEPS como impuesto adicional al IVA en el motor fiscal. En frontend del POS, layout de tiles grandes con tabs categorías cuando el tenant es vertical Abarrotes.
