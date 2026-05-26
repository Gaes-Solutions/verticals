-- CreateEnum
CREATE TYPE "CfdiRecibidoTipoComprobante" AS ENUM ('I', 'E', 'N', 'P', 'T');

-- CreateEnum
CREATE TYPE "CfdiRecibidoEstado" AS ENUM ('vigente', 'cancelado');

-- CreateEnum
CREATE TYPE "CfdiRecibidoOrigen" AS ENUM ('upload_manual', 'facturama_retrieve', 'webhook');

-- CreateEnum
CREATE TYPE "CategoriaContableTipo" AS ENUM ('activo', 'pasivo', 'capital', 'ingreso', 'gasto', 'costo');

-- CreateEnum
CREATE TYPE "CategorizadoPor" AS ENUM ('ia', 'regla_heuristica', 'manual');

-- CreateEnum
CREATE TYPE "OrdenCompraEstado" AS ENUM ('borrador', 'enviada', 'recibida_parcial', 'recibida_total', 'cancelada');

-- CreateEnum
CREATE TYPE "CfdiMetodoPagoEnum" AS ENUM ('PUE', 'PPD');

-- CreateTable
CREATE TABLE "cfdis_recibidos" (
    "id" TEXT NOT NULL,
    "uuid_sat" TEXT NOT NULL,
    "tipo_comprobante" "CfdiRecibidoTipoComprobante" NOT NULL,
    "serie" TEXT,
    "folio" TEXT,
    "emisor_rfc" TEXT NOT NULL,
    "emisor_razon_social" TEXT NOT NULL,
    "receptor_rfc" TEXT NOT NULL,
    "receptor_razon_social" TEXT,
    "fecha_emision" TIMESTAMP(3) NOT NULL,
    "fecha_timbrado" TIMESTAMP(3),
    "subtotal" DECIMAL(14,4) NOT NULL,
    "descuento" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_trasladado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_retenido" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "isr_retenido" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps_trasladado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "tipo_cambio" DECIMAL(10,6) NOT NULL DEFAULT 1,
    "metodo_pago" "CfdiMetodoPagoEnum",
    "forma_pago" TEXT,
    "uso_cfdi" TEXT,
    "version_sat" TEXT NOT NULL DEFAULT '4.0',
    "xml_raw" TEXT NOT NULL,
    "pdf_url" TEXT,
    "estado" "CfdiRecibidoEstado" NOT NULL DEFAULT 'vigente',
    "cancelado_at" TIMESTAMP(3),
    "origen" "CfdiRecibidoOrigen" NOT NULL DEFAULT 'upload_manual',
    "uploaded_by_usuario_id" TEXT,
    "procesado" BOOLEAN NOT NULL DEFAULT false,
    "procesado_at" TIMESTAMP(3),
    "error_procesamiento" TEXT,
    "orden_compra_id" TEXT,
    "movimiento_bancario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfdis_recibidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_contables" (
    "id" TEXT NOT NULL,
    "codigo_contable" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "CategoriaContableTipo" NOT NULL,
    "es_deducible_sat" BOOLEAN NOT NULL DEFAULT false,
    "iva_acreditable" BOOLEAN NOT NULL DEFAULT false,
    "isr_retenible_default" DECIMAL(5,2),
    "parent_id" TEXT,
    "color_ui" TEXT,
    "descripcion" TEXT,
    "clave_prod_serv_sat_regex" TEXT,
    "is_precargado_global" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_contables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cfdi_recibido_categorizaciones" (
    "id" TEXT NOT NULL,
    "cfdi_recibido_id" TEXT NOT NULL,
    "categoria_contable_id" TEXT NOT NULL,
    "categorizado_por" "CategorizadoPor" NOT NULL,
    "ia_modelo" TEXT,
    "ia_confianza" DECIMAL(4,3),
    "ia_justificacion" TEXT,
    "regla_aplicada" TEXT,
    "asignado_por_usuario_id" TEXT,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "asignado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cfdi_recibido_categorizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "proveedor_rfc" TEXT NOT NULL,
    "proveedor_razon_social" TEXT NOT NULL,
    "proveedor_email" TEXT,
    "estado" "OrdenCompraEstado" NOT NULL DEFAULT 'borrador',
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_esperada" TIMESTAMP(3),
    "fecha_recepcion" TIMESTAMP(3),
    "observaciones" TEXT,
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "creado_por_usuario_id" TEXT NOT NULL,
    "autorizado_por_id" TEXT,
    "autorizado_at" TIMESTAMP(3),
    "cancelada_motivo" TEXT,
    "cancelada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra_lineas" (
    "id" TEXT NOT NULL,
    "orden_compra_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "producto_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "cantidad_recibida" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordenes_compra_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_compra_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orden_compra_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cfdis_recibidos_uuid_sat_key" ON "cfdis_recibidos"("uuid_sat");

-- CreateIndex
CREATE INDEX "cfdis_recibidos_emisor_rfc_fecha_emision_idx" ON "cfdis_recibidos"("emisor_rfc", "fecha_emision");

-- CreateIndex
CREATE INDEX "cfdis_recibidos_fecha_emision_idx" ON "cfdis_recibidos"("fecha_emision");

-- CreateIndex
CREATE INDEX "cfdis_recibidos_estado_idx" ON "cfdis_recibidos"("estado");

-- CreateIndex
CREATE INDEX "cfdis_recibidos_procesado_idx" ON "cfdis_recibidos"("procesado");

-- CreateIndex
CREATE INDEX "cfdis_recibidos_orden_compra_id_idx" ON "cfdis_recibidos"("orden_compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_contables_codigo_contable_key" ON "categorias_contables"("codigo_contable");

-- CreateIndex
CREATE INDEX "categorias_contables_tipo_idx" ON "categorias_contables"("tipo");

-- CreateIndex
CREATE INDEX "categorias_contables_es_deducible_sat_idx" ON "categorias_contables"("es_deducible_sat");

-- CreateIndex
CREATE UNIQUE INDEX "cfdi_recibido_categorizaciones_cfdi_recibido_id_key" ON "cfdi_recibido_categorizaciones"("cfdi_recibido_id");

-- CreateIndex
CREATE INDEX "cfdi_recibido_categorizaciones_categoria_contable_id_idx" ON "cfdi_recibido_categorizaciones"("categoria_contable_id");

-- CreateIndex
CREATE INDEX "ordenes_compra_estado_fecha_creacion_idx" ON "ordenes_compra"("estado", "fecha_creacion");

-- CreateIndex
CREATE INDEX "ordenes_compra_proveedor_rfc_idx" ON "ordenes_compra"("proveedor_rfc");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_sucursal_id_folio_key" ON "ordenes_compra"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "ordenes_compra_lineas_orden_compra_id_idx" ON "ordenes_compra_lineas"("orden_compra_id");

-- AddForeignKey
ALTER TABLE "cfdis_recibidos" ADD CONSTRAINT "cfdis_recibidos_uploaded_by_usuario_id_fkey" FOREIGN KEY ("uploaded_by_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfdis_recibidos" ADD CONSTRAINT "cfdis_recibidos_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "ordenes_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_contables" ADD CONSTRAINT "categorias_contables_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categorias_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfdi_recibido_categorizaciones" ADD CONSTRAINT "cfdi_recibido_categorizaciones_cfdi_recibido_id_fkey" FOREIGN KEY ("cfdi_recibido_id") REFERENCES "cfdis_recibidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfdi_recibido_categorizaciones" ADD CONSTRAINT "cfdi_recibido_categorizaciones_categoria_contable_id_fkey" FOREIGN KEY ("categoria_contable_id") REFERENCES "categorias_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfdi_recibido_categorizaciones" ADD CONSTRAINT "cfdi_recibido_categorizaciones_asignado_por_usuario_id_fkey" FOREIGN KEY ("asignado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_autorizado_por_id_fkey" FOREIGN KEY ("autorizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra_lineas" ADD CONSTRAINT "ordenes_compra_lineas_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_folio_counters" ADD CONSTRAINT "orden_compra_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
