-- CreateEnum
CREATE TYPE "DevolucionTipo" AS ENUM ('total', 'parcial');

-- CreateEnum
CREATE TYPE "DevolucionMotivo" AS ENUM ('defectuoso', 'cambio_opinion', 'talla_color', 'error_cobro', 'garantia', 'otro');

-- CreateEnum
CREATE TYPE "DevolucionReembolsoMetodo" AS ENUM ('efectivo', 'tarjeta_misma', 'saldo_a_favor', 'vale', 'transferencia', 'nota_credito_cxc', 'nota_credito_fiado');

-- CreateEnum
CREATE TYPE "DevolucionEstado" AS ENUM ('procesada', 'cancelada');

-- DropIndex
DROP INDEX "cfdis_venta_id_key";

-- AlterTable
ALTER TABLE "cfdis" ADD COLUMN     "cfdi_relacionado_uuids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "devolucion_id" TEXT,
ADD COLUMN     "tipo_relacion_sat" TEXT;

-- CreateTable
CREATE TABLE "devoluciones" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "caja_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "tipo" "DevolucionTipo" NOT NULL,
    "motivo" "DevolucionMotivo" NOT NULL,
    "motivo_detalle" TEXT,
    "subtotal_devuelto" DECIMAL(14,4) NOT NULL,
    "descuento_devuelto" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_devuelto" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_devuelto" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_devuelto" DECIMAL(14,4) NOT NULL,
    "metodo_reembolso" "DevolucionReembolsoMetodo" NOT NULL,
    "referencia_reembolso" TEXT,
    "repone_stock_default" BOOLEAN NOT NULL DEFAULT true,
    "estado" "DevolucionEstado" NOT NULL DEFAULT 'procesada',
    "notas" TEXT,
    "aprobado_por_id" TEXT,
    "procesado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelada_motivo" TEXT,
    "cancelado_at" TIMESTAMP(3),
    "cancelado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_lineas" (
    "id" TEXT NOT NULL,
    "devolucion_id" TEXT NOT NULL,
    "venta_linea_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "variante_id" TEXT NOT NULL,
    "cantidad_devuelta" DECIMAL(18,3) NOT NULL,
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_linea" DECIMAL(14,4) NOT NULL,
    "repone_stock" BOOLEAN NOT NULL,
    "motivo_linea" "DevolucionMotivo",
    "snapshot_producto" JSONB NOT NULL,

    CONSTRAINT "devolucion_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devolucion_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE INDEX "devoluciones_venta_id_idx" ON "devoluciones"("venta_id");

-- CreateIndex
CREATE INDEX "devoluciones_sucursal_id_procesado_at_idx" ON "devoluciones"("sucursal_id", "procesado_at");

-- CreateIndex
CREATE INDEX "devoluciones_estado_idx" ON "devoluciones"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "devoluciones_sucursal_id_folio_key" ON "devoluciones"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "devolucion_lineas_venta_linea_id_idx" ON "devolucion_lineas"("venta_linea_id");

-- CreateIndex
CREATE INDEX "devolucion_lineas_variante_id_idx" ON "devolucion_lineas"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "devolucion_lineas_devolucion_id_numero_key" ON "devolucion_lineas"("devolucion_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "devolucion_lineas_devolucion_id_venta_linea_id_key" ON "devolucion_lineas"("devolucion_id", "venta_linea_id");

-- CreateIndex
CREATE UNIQUE INDEX "cfdis_devolucion_id_key" ON "cfdis"("devolucion_id");

-- CreateIndex
CREATE INDEX "cfdis_venta_id_idx" ON "cfdis"("venta_id");

-- AddForeignKey
ALTER TABLE "cfdis" ADD CONSTRAINT "cfdis_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_lineas" ADD CONSTRAINT "devolucion_lineas_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_lineas" ADD CONSTRAINT "devolucion_lineas_venta_linea_id_fkey" FOREIGN KEY ("venta_linea_id") REFERENCES "venta_lineas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_folio_counters" ADD CONSTRAINT "devolucion_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
