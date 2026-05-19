-- CreateEnum
CREATE TYPE "VentaEstado" AS ENUM ('borrador', 'cobrada', 'cancelada');

-- CreateEnum
CREATE TYPE "VentaCanal" AS ENUM ('pos', 'ecommerce', 'mayoreo');

-- CreateEnum
CREATE TYPE "VentaPagoMetodo" AS ENUM ('efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'vale', 'monedero', 'otro');

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "caja_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "estado" "VentaEstado" NOT NULL DEFAULT 'borrador',
    "canal" "VentaCanal" NOT NULL DEFAULT 'pos',
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "lista_precio_codigo" TEXT,
    "cupon_codigo" TEXT,
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "descuento_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_cobrado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cambio_dado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "cfdi_id" TEXT,
    "cancelada_motivo" TEXT,
    "cancelada_por_id" TEXT,
    "cobrada_at" TIMESTAMP(3),
    "cancelada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_lineas" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "producto_id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "lote_id" TEXT,
    "serie_id" TEXT,
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

    CONSTRAINT "venta_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_pagos" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "metodo" "VentaPagoMetodo" NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "referencia" TEXT,
    "autorizacion" TEXT,
    "terminal_referencia" TEXT,
    "ultimos_cuatro" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venta_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE INDEX "ventas_estado_created_at_idx" ON "ventas"("estado", "created_at");

-- CreateIndex
CREATE INDEX "ventas_sucursal_id_cobrada_at_idx" ON "ventas"("sucursal_id", "cobrada_at");

-- CreateIndex
CREATE INDEX "ventas_cliente_id_idx" ON "ventas"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_sucursal_id_folio_key" ON "ventas"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "venta_lineas_producto_id_idx" ON "venta_lineas"("producto_id");

-- CreateIndex
CREATE INDEX "venta_lineas_variante_id_idx" ON "venta_lineas"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "venta_lineas_venta_id_numero_key" ON "venta_lineas"("venta_id", "numero");

-- CreateIndex
CREATE INDEX "venta_pagos_venta_id_idx" ON "venta_pagos"("venta_id");

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cancelada_por_id_fkey" FOREIGN KEY ("cancelada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_lineas" ADD CONSTRAINT "venta_lineas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_folio_counters" ADD CONSTRAINT "venta_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
