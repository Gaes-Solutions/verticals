# Segunda auditoría de seguridad y correctitud — 9-sep-2026

Alcance: las **3810 líneas de API** que entraron después de mergear la primera auditoría
(`bf1c589`) y que nunca se habían revisado. Cuatro frentes en paralelo: kiosko, comercio móvil
y pagos, intentos durables de venta, y cálculo fiscal.

## Resumen

| Frente | Críticos | Altos | Estado |
|---|---|---|---|
| Kiosko | 0 | 2 | **corregido** (`a005f39`) |
| Comercio móvil y pagos | 0 | 0 | 1 medio bloquea al cliente |
| Ventas e intentos durables | 0 | 2 | mecanismo construido pero desconectado |
| Cálculo fiscal (CFDI) | **3** | 2 | **bloquea facturar** |

Lo que **sí** está bien resuelto, verificado con lectura de código: aislamiento entre tenants,
ausencia de IDOR en el comercio móvil, firma y anti-replay de webhooks de pago, idempotencia de
ventas garantizada por índice único en la base, atomicidad de venta más inventario más caja, y
uso de Decimal en todo el camino del dinero salvo una excepción.

---

## 🔴 Bloqueantes para facturar (criterio de salida del piloto)

### F1. El comprobante no cuadra: `Total ≠ SubTotal − Descuento + Impuestos`
`apps/api/src/modules/tenant/cfdis/fiscal-amounts.ts:165-180`

Los conceptos se emiten con 6 decimales y luego el encabezado redondea **cada componente por
separado** a 2. La conciliación interna corre *antes* de ese redondeo, así que nunca ve el
desbalance. El SAT valida esa identidad sin tolerancia y rechaza el comprobante.

Ejemplo: producto de $13.50 con 10% de descuento e IVA. Produce subtotal 11.64, descuento 1.16,
IVA 1.68, total 12.15. La suma da 12.16, un centavo de más.

Frecuencia medida: **31%** de las ventas con descuento de línea y **25%** de las que llevan IEPS
por porcentaje.

Arreglo: redondear cada concepto a 2 decimales y absorber el residuo en una línea por mayor
resto, antes de armar el encabezado.

### F2. El IEPS de cuota fija se excluye de la base del IVA: se declara IVA de menos
`fiscal-amounts.ts:80` y su gemelo en `ventas/service.ts:238-247`

La ley del IVA, artículo 12, incluye en la base "las cantidades que además se carguen o cobren
al adquirente por otros impuestos", sin excepción para la cuota. El código impone la política
contraria en los dos lados y además la valida, así que un cálculo correcto sería rechazado.

Ejemplo: refresco de 2 litros a $30.00. Declara IVA de 3.71 cuando corresponde 4.14. **Subdeclara
10.2% del IVA por unidad.** En un abarrote con volumen de refresco, es diferencia de IVA a cargo
todos los meses.

Requiere decisión fiscal antes de cambiarlo, no solo código.

### F3. Las ventas con cupón, mayoreo por ticket o descuento del cajero no se pueden facturar nunca
`fiscal-amounts.ts:55-62` y `160-161`

Dos defectos encadenados. El validador solo acepta descuentos con `fuente: "checkout"`, pero el
motor de precios emite otras cinco fuentes con un nombre de campo distinto, así que en ventas del
punto de venta siempre cae al camino de respaldo. Y los descuentos de ticket reducen el total de
la venta pero no el subtotal de las líneas, así que la conciliación falla por el monto completo
del descuento.

Resultado: `409 FISCAL_RECONCILIATION_REQUIRED`, y encima ya consumió un folio.

Efecto colateral: el IVA registrado en esas ventas es el del subtotal sin descuento. El cliente
pagó 100 pero la venta guarda el IVA de 116.

---

## 🟠 Altos

### A1. La validación previa al timbrado quema folio y deja hueco
`cfdis/service.ts:102-110`. El contador de folio se incrementa antes de validar. Cualquier
rechazo deja un hueco permanente en la numeración. El flujo de notas de crédito ya lo hace bien:
valida primero, incrementa después. Basta invertir el orden.

### A2. Tolerancia de conciliación demasiado estrecha con IEPS alto
`fiscal-amounts.ts:51-54`. La venta guarda 4 decimales y al reconstruir la base el error se
amplifica por la tasa. Con IEPS de tabaco al 160%, **24% de los precios** falla la conciliación
y queda no facturable. La tolerancia debería derivarse de la precisión de almacenamiento, no ser
una constante.

### A3. Un intento de venta interrumpido puede cobrar dos veces
`ventas/attempt-service.ts:93`. La preparación corre fuera de la transacción, así que mientras
dura, consultar el intento responde "no existe". Si el punto de venta interpreta eso como que la
petición no llegó y reintenta con clave nueva, se persisten dos ventas. El módulo hermano de
checkout ya resolvió esto escribiendo la fila antes de trabajar.

**Atenúa el riesgo:** ningún frontend usa todavía los endpoints de intentos. El mecanismo está
construido pero desconectado, así que el hueco aparece cuando se conecte.

### A4. Transacción de venta con timeout por defecto de 5 segundos
`attempt-service.ts:100-115`. Un ticket de 20 líneas hace unos 80 viajes a la base dentro de una
transacción con lock bloqueante sobre la apertura de caja. En hora pico puede pasarse del límite
y volverse permanentemente incobrable, y cada reintento retiene una conexión del pool.

---

## 🟡 Medios que sí golpean al negocio

### M1. Un pago OXXO que expira deja el carrito del cliente bloqueado para siempre
`cliente-portal/comercio-service.ts:234` y `280-285`

Al expirar el voucher, el pedido pasa a "pago fallido" pero nadie libera el intento ni el
carrito. A partir de ahí el cliente **no puede modificar, vaciar ni crear otro carrito**: siempre
gana el mismo carrito activo y siempre responde 409. Cada voucher no pagado inutiliza una cuenta
en la app, sin ruta de recuperación.

### M2. Reembolso a monedero: único punto donde el dinero sale de Decimal
`devoluciones/service.ts:454` convierte a número antes de redondear, así que un monto terminado
en medio centavo pierde un centavo contra lo que dice la devolución. El camino equivalente en
ventas lo hace bien; es la misma operación resuelta de dos formas.

### M3. La venta del comercio móvil se atribuye a un usuario arbitrario
`comercio-checkout-service.ts:186-190` firma la venta con el usuario activo más antiguo, que
suele ser el dueño. Rompe el no repudio del rastro de auditoría.

### M4. Rutas de checkout de tenant sin verificación de permiso
`tenant/checkout/routes.ts:159, 173, 194, 223`. Cualquier empleado con sesión válida puede crear
pedidos y cobros reales contra la pasarela, aunque no tenga permisos de comercio.

---

## ✅ Corregido en esta ronda

`a005f39` — Kiosko: límite de ritmo en los tres endpoints públicos (sin él, un token robado
permitía volcar el catálogo completo con precios y existencias), y bitácora de auditoría al
emitir y revocar tokens de dispositivo.

## Orden sugerido

1. **F3 y F1**, que juntos hacen que la mayoría de las ventas reales no se puedan facturar.
2. **A1**, trivial y evita huecos de folio mientras se arreglan los anteriores.
3. **M1**, que hoy deja clientes sin poder comprar.
4. **F2** requiere decisión fiscal con un contador antes de tocar código.
5. **A3 y A4** antes de conectar los intentos durables al punto de venta.
