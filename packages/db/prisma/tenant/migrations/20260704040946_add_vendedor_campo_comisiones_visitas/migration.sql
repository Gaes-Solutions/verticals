-- CreateEnum
CREATE TYPE "FirmaPedidoModo" AS ENUM ('off', 'sugerida', 'obligatoria');

-- CreateEnum
CREATE TYPE "ComisionBase" AS ENUM ('venta', 'cobro');

-- CreateEnum
CREATE TYPE "ComisionEstado" AS ENUM ('pendiente', 'pagada', 'cancelada');

-- CreateEnum
CREATE TYPE "VisitaTipo" AS ENUM ('visita', 'llamada');

-- CreateEnum
CREATE TYPE "VisitaEstado" AS ENUM ('planeada', 'hecha', 'cancelada');

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "firma_data_url" TEXT,
ADD COLUMN     "firmado_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "config_vendedores" (
    "id" TEXT NOT NULL,
    "geocheckin_activo" BOOLEAN NOT NULL DEFAULT false,
    "ranking_activo" BOOLEAN NOT NULL DEFAULT false,
    "firma_pedido_modo" "FirmaPedidoModo" NOT NULL DEFAULT 'sugerida',
    "meta_mensual_default" DECIMAL(14,2),
    "bonos_escalonados" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_comision" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "base" "ComisionBase" NOT NULL DEFAULT 'venta',
    "pct" DECIMAL(5,2) NOT NULL,
    "categoria_id" TEXT,
    "producto_id" TEXT,
    "prioridad" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas_vendedor" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto_meta" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metas_vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comisiones" (
    "id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "regla_id" TEXT,
    "base" "ComisionBase" NOT NULL,
    "venta_id" TEXT,
    "pedido_id" TEXT,
    "cxc_pago_id" TEXT,
    "periodo" TEXT NOT NULL,
    "monto_base" DECIMAL(14,4) NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "estado" "ComisionEstado" NOT NULL DEFAULT 'pendiente',
    "pagada_at" TIMESTAMP(3),
    "cancelada_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitas" (
    "id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "tipo" "VisitaTipo" NOT NULL DEFAULT 'visita',
    "estado" "VisitaEstado" NOT NULL DEFAULT 'planeada',
    "fecha_planeada" TIMESTAMP(3) NOT NULL,
    "checkin_at" TIMESTAMP(3),
    "checkin_lat" DECIMAL(9,6),
    "checkin_lng" DECIMAL(9,6),
    "notas" TEXT,
    "resultado" TEXT,
    "motivo_no_visita" TEXT,
    "duracion_llamada_seg" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visita_fotos" (
    "id" TEXT NOT NULL,
    "visita_id" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "etiqueta" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visita_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reglas_comision_is_active_prioridad_idx" ON "reglas_comision"("is_active", "prioridad");

-- CreateIndex
CREATE INDEX "metas_vendedor_periodo_idx" ON "metas_vendedor"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "metas_vendedor_usuario_id_periodo_key" ON "metas_vendedor"("usuario_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "comisiones_cxc_pago_id_key" ON "comisiones"("cxc_pago_id");

-- CreateIndex
CREATE INDEX "comisiones_vendedor_id_periodo_idx" ON "comisiones"("vendedor_id", "periodo");

-- CreateIndex
CREATE INDEX "comisiones_estado_idx" ON "comisiones"("estado");

-- CreateIndex
CREATE INDEX "visitas_vendedor_id_fecha_planeada_idx" ON "visitas"("vendedor_id", "fecha_planeada");

-- CreateIndex
CREATE INDEX "visitas_cliente_b2b_id_fecha_planeada_idx" ON "visitas"("cliente_b2b_id", "fecha_planeada");

-- CreateIndex
CREATE INDEX "visita_fotos_visita_id_idx" ON "visita_fotos"("visita_id");

-- AddForeignKey
ALTER TABLE "reglas_comision" ADD CONSTRAINT "reglas_comision_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_comision" ADD CONSTRAINT "reglas_comision_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_vendedor" ADD CONSTRAINT "metas_vendedor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "reglas_comision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_cxc_pago_id_fkey" FOREIGN KEY ("cxc_pago_id") REFERENCES "cxc_pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visita_fotos" ADD CONSTRAINT "visita_fotos_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
