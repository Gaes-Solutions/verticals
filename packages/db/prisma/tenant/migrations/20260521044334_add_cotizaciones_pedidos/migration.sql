-- CreateEnum
CREATE TYPE "CotizacionEstado" AS ENUM ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida', 'convertida');

-- CreateEnum
CREATE TYPE "CotizacionCanalEnvio" AS ENUM ('email', 'whatsapp', 'descarga', 'otro');

-- CreateEnum
CREATE TYPE "PedidoEstado" AS ENUM ('creado', 'preparando', 'enviado', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "PedidoEstadoAprobacion" AS ENUM ('no_requiere', 'pendiente', 'aprobada', 'rechazada');

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "estado" "CotizacionEstado" NOT NULL DEFAULT 'borrador',
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "lista_precio_codigo" TEXT,
    "cupon_codigo" TEXT,
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "descuento_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "condiciones_pago" TEXT,
    "notas" TEXT,
    "pdf_firmado_url" TEXT,
    "enviado_at" TIMESTAMP(3),
    "enviado_canal" "CotizacionCanalEnvio",
    "enviado_destino" TEXT,
    "aceptado_at" TIMESTAMP(3),
    "rechazado_at" TIMESTAMP(3),
    "rechazo_motivo" TEXT,
    "pedido_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_lineas" (
    "id" TEXT NOT NULL,
    "cotizacion_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "producto_id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "precio_original" DECIMAL(14,4) NOT NULL,
    "descuento_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "iva_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_linea" DECIMAL(14,4) NOT NULL,
    "descuentos_aplicados" JSONB NOT NULL DEFAULT '[]',
    "snapshot_producto" JSONB NOT NULL,

    CONSTRAINT "cotizacion_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizacion_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "cotizacion_id" TEXT,
    "estado" "PedidoEstado" NOT NULL DEFAULT 'creado',
    "estado_aprobacion" "PedidoEstadoAprobacion" NOT NULL DEFAULT 'no_requiere',
    "aprobado_por_id" TEXT,
    "aprobado_at" TIMESTAMP(3),
    "rechazado_motivo" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "descuento_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orden_compra_cliente" TEXT,
    "direccion_envio_id" TEXT,
    "paqueteria" TEXT,
    "tracking_externo" TEXT,
    "tracking_url" TEXT,
    "fecha_entrega_estimada" TIMESTAMP(3),
    "notas" TEXT,
    "venta_id" TEXT,
    "enviado_at" TIMESTAMP(3),
    "entregado_at" TIMESTAMP(3),
    "cancelado_at" TIMESTAMP(3),
    "cancelado_por_id" TEXT,
    "cancelado_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_lineas" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "producto_id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "precio_original" DECIMAL(14,4) NOT NULL,
    "descuento_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "iva_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_linea" DECIMAL(14,4) NOT NULL,
    "descuentos_aplicados" JSONB NOT NULL DEFAULT '[]',
    "snapshot_producto" JSONB NOT NULL,

    CONSTRAINT "pedido_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedido_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_pedido_id_key" ON "cotizaciones"("pedido_id");

-- CreateIndex
CREATE INDEX "cotizaciones_estado_fecha_vencimiento_idx" ON "cotizaciones"("estado", "fecha_vencimiento");

-- CreateIndex
CREATE INDEX "cotizaciones_cliente_b2b_id_idx" ON "cotizaciones"("cliente_b2b_id");

-- CreateIndex
CREATE INDEX "cotizaciones_vendedor_id_idx" ON "cotizaciones"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_sucursal_id_folio_key" ON "cotizaciones"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "cotizacion_lineas_variante_id_idx" ON "cotizacion_lineas"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_lineas_cotizacion_id_numero_key" ON "cotizacion_lineas"("cotizacion_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_cotizacion_id_key" ON "pedidos"("cotizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_venta_id_key" ON "pedidos"("venta_id");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- CreateIndex
CREATE INDEX "pedidos_estado_aprobacion_idx" ON "pedidos"("estado_aprobacion");

-- CreateIndex
CREATE INDEX "pedidos_cliente_b2b_id_idx" ON "pedidos"("cliente_b2b_id");

-- CreateIndex
CREATE INDEX "pedidos_vendedor_id_idx" ON "pedidos"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_sucursal_id_folio_key" ON "pedidos"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "pedido_lineas_variante_id_idx" ON "pedido_lineas"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_lineas_pedido_id_numero_key" ON "pedido_lineas"("pedido_id", "numero");

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_lineas" ADD CONSTRAINT "cotizacion_lineas_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_folio_counters" ADD CONSTRAINT "cotizacion_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_direccion_envio_id_fkey" FOREIGN KEY ("direccion_envio_id") REFERENCES "cliente_b2b_direcciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_lineas" ADD CONSTRAINT "pedido_lineas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_folio_counters" ADD CONSTRAINT "pedido_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
