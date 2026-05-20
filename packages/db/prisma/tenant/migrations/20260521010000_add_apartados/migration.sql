-- CreateEnum
CREATE TYPE "ApartadoEstado" AS ENUM ('activo', 'liquidado_y_entregado', 'cancelado', 'expirado');

-- CreateEnum
CREATE TYPE "ApartadoAbonoMetodo" AS ENUM ('efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'vale', 'otro');

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "apartado_id" TEXT;

-- CreateTable
CREATE TABLE "apartados" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "caja_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "cliente_b2b_id" TEXT,
    "estado" "ApartadoEstado" NOT NULL DEFAULT 'activo',
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "subtotal" DECIMAL(14,4) NOT NULL,
    "descuento_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL,
    "monto_pagado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "fecha_apartado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_limite" TIMESTAMP(3) NOT NULL,
    "observaciones" TEXT,
    "politica_cancelacion" TEXT,
    "pena_cancelacion_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "motivo_cancelacion" TEXT,
    "cancelada_por_id" TEXT,
    "liquidado_at" TIMESTAMP(3),
    "cancelado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apartados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apartado_lineas" (
    "id" TEXT NOT NULL,
    "apartado_id" TEXT NOT NULL,
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

    CONSTRAINT "apartado_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apartado_abonos" (
    "id" TEXT NOT NULL,
    "apartado_id" TEXT NOT NULL,
    "metodo" "ApartadoAbonoMetodo" NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "referencia" TEXT,
    "comprobante_url" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apartado_abonos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apartado_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apartado_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE INDEX "apartados_estado_fecha_limite_idx" ON "apartados"("estado", "fecha_limite");

-- CreateIndex
CREATE INDEX "apartados_cliente_id_idx" ON "apartados"("cliente_id");

-- CreateIndex
CREATE INDEX "apartados_cliente_b2b_id_idx" ON "apartados"("cliente_b2b_id");

-- CreateIndex
CREATE UNIQUE INDEX "apartados_sucursal_id_folio_key" ON "apartados"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "apartado_lineas_variante_id_idx" ON "apartado_lineas"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "apartado_lineas_apartado_id_numero_key" ON "apartado_lineas"("apartado_id", "numero");

-- CreateIndex
CREATE INDEX "apartado_abonos_apartado_id_created_at_idx" ON "apartado_abonos"("apartado_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_apartado_id_key" ON "ventas"("apartado_id");

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_cancelada_por_id_fkey" FOREIGN KEY ("cancelada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_lineas" ADD CONSTRAINT "apartado_lineas_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_lineas" ADD CONSTRAINT "apartado_lineas_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_abonos" ADD CONSTRAINT "apartado_abonos_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_abonos" ADD CONSTRAINT "apartado_abonos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_folio_counters" ADD CONSTRAINT "apartado_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
