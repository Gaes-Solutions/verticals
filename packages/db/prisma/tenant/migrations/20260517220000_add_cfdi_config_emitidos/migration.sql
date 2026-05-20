-- CreateEnum
CREATE TYPE "CfdiAmbiente" AS ENUM ('sandbox', 'prod');

-- CreateEnum
CREATE TYPE "CfdiEstado" AS ENUM ('pendiente', 'vigente', 'cancelado', 'error');

-- CreateEnum
CREATE TYPE "CfdiTipoComprobante" AS ENUM ('I', 'E', 'T', 'N', 'P');

-- CreateEnum
CREATE TYPE "CfdiMetodoPago" AS ENUM ('PUE', 'PPD');

-- CreateTable
CREATE TABLE "cfdi_config" (
    "id" TEXT NOT NULL,
    "rfc_emisor" TEXT NOT NULL,
    "razon_social_emisor" TEXT NOT NULL,
    "regimen_fiscal_sat" TEXT NOT NULL,
    "codigo_postal_emisor" TEXT NOT NULL,
    "lugar_expedicion" TEXT NOT NULL,
    "serie_default" TEXT NOT NULL DEFAULT 'A',
    "folio_counter" INTEGER NOT NULL DEFAULT 0,
    "facturama_api_key" TEXT NOT NULL,
    "facturama_ambiente" "CfdiAmbiente" NOT NULL DEFAULT 'sandbox',
    "correo_emisor" TEXT,
    "telefono_emisor" TEXT,
    "autofactura_activa" BOOLEAN NOT NULL DEFAULT true,
    "dias_autofactura" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfdi_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cfdis" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "folio_fiscal" TEXT,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_timbrado" TIMESTAMP(3),
    "tipo_comprobante" "CfdiTipoComprobante" NOT NULL DEFAULT 'I',
    "metodo_pago" "CfdiMetodoPago" NOT NULL DEFAULT 'PUE',
    "forma_pago" TEXT NOT NULL,
    "uso_cfdi" TEXT NOT NULL,
    "rfc_emisor" TEXT NOT NULL,
    "razon_social_emisor" TEXT NOT NULL,
    "regimen_fiscal_emisor" TEXT NOT NULL,
    "lugar_expedicion" TEXT NOT NULL,
    "rfc_receptor" TEXT NOT NULL,
    "razon_social_receptor" TEXT NOT NULL,
    "codigo_postal_receptor" TEXT NOT NULL,
    "regimen_fiscal_receptor" TEXT NOT NULL,
    "correo_receptor" TEXT,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "descuento" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iva" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ieps" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "estado" "CfdiEstado" NOT NULL DEFAULT 'pendiente',
    "facturama_id" TEXT,
    "sello_digital_cfdi" TEXT,
    "sello_sat" TEXT,
    "no_certificado_sat" TEXT,
    "cadena_original_sat" TEXT,
    "xml" TEXT,
    "pdf_base64" TEXT,
    "error_mensaje" TEXT,
    "cancelacion_motivo" TEXT,
    "cancelacion_folio_relacion" TEXT,
    "cancelado_at" TIMESTAMP(3),
    "emitido_por_id" TEXT NOT NULL,
    "cancelado_por_id" TEXT,
    "autofactura_token" TEXT,
    "es_autofactura" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfdis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cfdi_config_rfc_emisor_key" ON "cfdi_config"("rfc_emisor");

-- CreateIndex
CREATE UNIQUE INDEX "cfdis_venta_id_key" ON "cfdis"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "cfdis_folio_fiscal_key" ON "cfdis"("folio_fiscal");

-- CreateIndex
CREATE UNIQUE INDEX "cfdis_autofactura_token_key" ON "cfdis"("autofactura_token");

-- CreateIndex
CREATE INDEX "cfdis_estado_idx" ON "cfdis"("estado");

-- CreateIndex
CREATE INDEX "cfdis_rfc_receptor_idx" ON "cfdis"("rfc_receptor");

-- CreateIndex
CREATE INDEX "cfdis_fecha_emision_idx" ON "cfdis"("fecha_emision");

-- CreateIndex
CREATE UNIQUE INDEX "cfdis_serie_folio_key" ON "cfdis"("serie", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_cfdi_id_key" ON "ventas"("cfdi_id");

-- AddForeignKey
ALTER TABLE "cfdis" ADD CONSTRAINT "cfdis_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfdis" ADD CONSTRAINT "cfdis_emitido_por_id_fkey" FOREIGN KEY ("emitido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfdis" ADD CONSTRAINT "cfdis_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
