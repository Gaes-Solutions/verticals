# Alcance fiscal T14 — 2026-09-08

La emisión de ingresos ahora utiliza tasas, importes y claves SAT congeladas de cada línea de venta; convierte los precios con impuestos incluidos a bases fiscales y distribuye el descuento ya registrado. Verifica total, descuentos e impuestos contra la venta antes de solicitar timbrado. El adapter transmite bases e importes de IVA e IEPS, incluyendo cuota; no vuelve a calcular una tasa desde el precio actual ni impone IVA 16%.

Cuando faltan datos o no concilian, devuelve `409 FISCAL_RECONCILIATION_REQUIRED`. No consulta el catálogo actual para reinterpretar operaciones anteriores. La validación puede consumir un folio interno, pero no crea CFDI ni llama al proveedor.

## Bloqueos de liberación que permanecen

- Ventas históricas sin claves SAT, unidad, tasas completas o descuentos asignados a líneas requieren conciliación explícita. El código no inventa esas propiedades.
- El modelo de producto no distingue exento de no objeto. Si ambos impuestos están desactivados, es indispensable registrar y congelar un objeto fiscal explícito antes de habilitar la emisión de esos productos. IVA aplicable con tasa cero se conserva como sujeto a impuesto.
- El cálculo existente de IVA con IEPS por cuota excluye la cuota de la base IVA. Esta corrección conserva y verifica el cálculo registrado; requiere revisión fiscal del tratamiento por producto antes de liberación. No convierte silenciosamente ventas cobradas a otra política tributaria.
- Notas de crédito por devolución ahora prorratean cantidad, cupón, base e impuestos de las líneas originales y conservan claves SAT y relación UUID. Validan antes de persistir reembolso/stock y antes de solicitar timbrado. Histórico sin snapshot fiscal suficiente requiere conciliación. Un fallo externo de timbrado después de devolver aún requiere recuperación operativa; no se ha implementado reintento idempotente del proveedor fiscal.
- No se certificó timbrado en sandbox ni se cambió el endpoint heredado `/api-lite/3/cfdis`; verificar compatibilidad de versión y comprobantes de ingreso/egreso antes de configurar proveedor real.
- Las pruebas unitarias validan transformación y cuerpo HTTP simulado; no certifican aceptación SAT ni reemplazan prueba fiscal con credenciales sandbox autorizadas.

Documentación oficial consultada (sin llamadas de timbrado):
- https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxBindingModel
- https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemFullBindingModel
- https://apisandbox.facturama.mx/guias/api-web/cfdi/factura
- https://apisandbox.facturama.mx/guias/conocimientos/cfdi-relacionados

## Verificación sin base de datos ni red

- `pnpm --filter @gaespos/api exec vitest run --config test/fiscal-unit.config.ts`: once pruebas de tasas mixtas, IVA cero, objeto, IEPS porcentaje/cuota, cupón y rechazos.
- `pnpm --filter @gaespos/fiscal test`: cinco pruebas incluyendo adapter con fetch simulado y rechazo anterior a solicitud.


### Fuente del objeto fiscal

Actualmente `Producto` y el snapshot ordinario no tienen campo `objetoImpuesto`. El sistema sí soporta nuevas ventas con IVA aplicable 16%, 8% o 0%, y/o IEPS de porcentaje/cuota, siempre que los importes concilien y se hayan configurado claves SAT: se identifican como objeto `02`. No soporta aún capturar de forma inequívoca exento/no objeto; requiere ampliar catálogo y snapshot con esa elección explícita. No se cambia un producto sin impuestos a tasa cero por conveniencia.

Regresión DB preparada (ejecución a cargo del coordinador): `tenant-cfdis.test.ts`, `tenant-devoluciones.test.ts`; fixtures fiscales válidos y egreso parcial de una unidad de dos, con aserciones de base, tasa, impuesto, total, claves SAT y relación al ingreso.
