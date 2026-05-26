-- CreateEnum
CREATE TYPE "CxcTipoOrigen" AS ENUM ('venta_credito', 'regularizacion_fiado', 'manual', 'apertura_saldo_inicial');

-- CreateEnum
CREATE TYPE "CxcEstado" AS ENUM ('activa', 'vencida', 'liquidada', 'incobrable', 'condonada');

-- AlterEnum
ALTER TYPE "VentaPagoMetodo" ADD VALUE 'credito_b2b';

-- CreateTable
CREATE TABLE "cuentas_cobrar" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "tipo_origen" "CxcTipoOrigen" NOT NULL,
    "cliente_id" TEXT,
    "cliente_b2b_id" TEXT,
    "venta_id" TEXT,
    "vendedor_id" TEXT,
    "comision_pagada_a_vendedor" BOOLEAN NOT NULL DEFAULT false,
    "monto_original" DECIMAL(14,4) NOT NULL,
    "monto_pagado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "dias_credito_otorgados" INTEGER NOT NULL,
    "tasa_interes_mora_pct" DECIMAL(5,2),
    "interes_acumulado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "estado" "CxcEstado" NOT NULL DEFAULT 'activa',
    "notas" TEXT,
    "liquidada_at" TIMESTAMP(3),
    "condonada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_cobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cxc_pagos" (
    "id" TEXT NOT NULL,
    "cuenta_cobrar_id" TEXT NOT NULL,
    "metodo" "VentaPagoMetodo" NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "referencia" TEXT,
    "comprobante_url" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cxc_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cxc_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cxc_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_cobrar_venta_id_key" ON "cuentas_cobrar"("venta_id");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_estado_fecha_vencimiento_idx" ON "cuentas_cobrar"("estado", "fecha_vencimiento");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_cliente_id_idx" ON "cuentas_cobrar"("cliente_id");

-- CreateIndex
CREATE INDEX "cuentas_cobrar_cliente_b2b_id_idx" ON "cuentas_cobrar"("cliente_b2b_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_cobrar_sucursal_id_folio_key" ON "cuentas_cobrar"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "cxc_pagos_cuenta_cobrar_id_created_at_idx" ON "cxc_pagos"("cuenta_cobrar_id", "created_at");

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "cuentas_cobrar_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cxc_pagos" ADD CONSTRAINT "cxc_pagos_cuenta_cobrar_id_fkey" FOREIGN KEY ("cuenta_cobrar_id") REFERENCES "cuentas_cobrar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cxc_pagos" ADD CONSTRAINT "cxc_pagos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cxc_folio_counters" ADD CONSTRAINT "cxc_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
