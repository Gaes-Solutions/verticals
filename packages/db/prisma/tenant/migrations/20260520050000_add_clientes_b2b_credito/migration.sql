-- CreateEnum
CREATE TYPE "CondicionesPagoB2b" AS ENUM ('contado', 'credito', 'mixto');

-- CreateEnum
CREATE TYPE "FormatoFacturaB2b" AS ENUM ('pdf', 'xml', 'pdf_xml');

-- CreateEnum
CREATE TYPE "VendedorB2bTipo" AS ENUM ('principal', 'secundario', 'cobranza');

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "cliente_b2b_id" TEXT;

-- CreateTable
CREATE TABLE "clientes_b2b" (
    "id" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "rfc" TEXT NOT NULL,
    "regimen_fiscal_sat" TEXT NOT NULL,
    "uso_cfdi_default" TEXT,
    "codigo_postal_fiscal" TEXT,
    "direccion_fiscal" JSONB,
    "email_principal" TEXT,
    "telefono_principal" TEXT,
    "sitio_web" TEXT,
    "representante_legal" TEXT,
    "industria" TEXT,
    "tamano_negocio" TEXT,
    "nivel_mayoreo_id" TEXT,
    "lista_precio_principal_codigo" TEXT,
    "dias_credito_default" INTEGER NOT NULL DEFAULT 0,
    "condiciones_pago" "CondicionesPagoB2b" NOT NULL DEFAULT 'contado',
    "requiere_orden_compra" BOOLEAN NOT NULL DEFAULT false,
    "formato_factura_preferido" "FormatoFacturaB2b" NOT NULL DEFAULT 'pdf_xml',
    "requiere_aprobacion_interna" BOOLEAN NOT NULL DEFAULT false,
    "monto_aprobacion_required" DECIMAL(14,2),
    "notas" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_b2b_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_b2b_contactos" (
    "id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "puesto" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "es_decisor" BOOLEAN NOT NULL DEFAULT false,
    "es_pagador" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_b2b_contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_b2b_direcciones" (
    "id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numero_exterior" TEXT,
    "numero_interior" TEXT,
    "colonia" TEXT,
    "municipio" TEXT,
    "estado" TEXT,
    "codigo_postal" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'MX',
    "referencias" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "contacto_recepcion_nombre" TEXT,
    "contacto_recepcion_telefono" TEXT,
    "horario_recepcion" TEXT,
    "is_default_envio" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_b2b_direcciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_b2b_creditos" (
    "id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "linea_autorizada" DECIMAL(14,2) NOT NULL,
    "dias_credito" INTEGER NOT NULL DEFAULT 30,
    "tasa_interes_mora_pct" DECIMAL(5,2),
    "permite_facturas_vencidas" BOOLEAN NOT NULL DEFAULT false,
    "garantia_documentada" TEXT,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3),
    "aprobado_por_id" TEXT NOT NULL,
    "aprobado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas_autorizacion" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_b2b_creditos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_b2b_listas_precio" (
    "cliente_b2b_id" TEXT NOT NULL,
    "lista_precio_id" TEXT NOT NULL,
    "prioridad" INTEGER NOT NULL DEFAULT 100,
    "vigente_desde" TIMESTAMP(3),
    "vigente_hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_b2b_listas_precio_pkey" PRIMARY KEY ("cliente_b2b_id","lista_precio_id")
);

-- CreateTable
CREATE TABLE "cliente_b2b_vendedores_asignados" (
    "cliente_b2b_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "VendedorB2bTipo" NOT NULL DEFAULT 'principal',
    "comision_pct_override" DECIMAL(5,2),
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_b2b_vendedores_asignados_pkey" PRIMARY KEY ("cliente_b2b_id","usuario_id","tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_b2b_rfc_key" ON "clientes_b2b"("rfc");

-- CreateIndex
CREATE INDEX "clientes_b2b_razon_social_idx" ON "clientes_b2b"("razon_social");

-- CreateIndex
CREATE INDEX "clientes_b2b_rfc_idx" ON "clientes_b2b"("rfc");

-- CreateIndex
CREATE INDEX "clientes_b2b_nivel_mayoreo_id_idx" ON "clientes_b2b"("nivel_mayoreo_id");

-- CreateIndex
CREATE INDEX "clientes_b2b_is_active_idx" ON "clientes_b2b"("is_active");

-- CreateIndex
CREATE INDEX "cliente_b2b_contactos_cliente_b2b_id_idx" ON "cliente_b2b_contactos"("cliente_b2b_id");

-- CreateIndex
CREATE INDEX "cliente_b2b_direcciones_cliente_b2b_id_idx" ON "cliente_b2b_direcciones"("cliente_b2b_id");

-- CreateIndex
CREATE INDEX "cliente_b2b_creditos_cliente_b2b_id_is_active_idx" ON "cliente_b2b_creditos"("cliente_b2b_id", "is_active");

-- CreateIndex
CREATE INDEX "cliente_b2b_listas_precio_cliente_b2b_id_idx" ON "cliente_b2b_listas_precio"("cliente_b2b_id");

-- CreateIndex
CREATE INDEX "cliente_b2b_vendedores_asignados_usuario_id_idx" ON "cliente_b2b_vendedores_asignados"("usuario_id");

-- CreateIndex
CREATE INDEX "ventas_cliente_b2b_id_idx" ON "ventas"("cliente_b2b_id");

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_b2b" ADD CONSTRAINT "clientes_b2b_nivel_mayoreo_id_fkey" FOREIGN KEY ("nivel_mayoreo_id") REFERENCES "niveles_precio_mayoreo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_contactos" ADD CONSTRAINT "cliente_b2b_contactos_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_direcciones" ADD CONSTRAINT "cliente_b2b_direcciones_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_creditos" ADD CONSTRAINT "cliente_b2b_creditos_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_creditos" ADD CONSTRAINT "cliente_b2b_creditos_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_listas_precio" ADD CONSTRAINT "cliente_b2b_listas_precio_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_listas_precio" ADD CONSTRAINT "cliente_b2b_listas_precio_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_vendedores_asignados" ADD CONSTRAINT "cliente_b2b_vendedores_asignados_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_b2b_vendedores_asignados" ADD CONSTRAINT "cliente_b2b_vendedores_asignados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
