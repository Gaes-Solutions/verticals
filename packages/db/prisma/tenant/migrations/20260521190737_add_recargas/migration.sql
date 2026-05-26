-- CreateEnum
CREATE TYPE "RecargaProveedorCodigo" AS ENUM ('recargaki', 'mtscellular', 'pymeya', 'mock');

-- CreateEnum
CREATE TYPE "RecargaCompaniaCodigo" AS ENUM ('telcel', 'movistar', 'att', 'bait', 'unefon', 'virgin_mobile', 'maz', 'spentel', 'freedom_pop', 'bait_pospago');

-- CreateEnum
CREATE TYPE "RecargaTipo" AS ENUM ('tiempo_aire', 'pago_servicio');

-- CreateEnum
CREATE TYPE "RecargaEstado" AS ENUM ('pendiente', 'exitosa', 'fallida', 'reembolsada', 'disputada');

-- CreateTable
CREATE TABLE "recarga_proveedor_config" (
    "id" TEXT NOT NULL,
    "proveedor_codigo" "RecargaProveedorCodigo" NOT NULL,
    "api_url" TEXT,
    "api_key_encrypted" TEXT,
    "webhook_secret_encrypted" TEXT,
    "is_primario" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "saldo_prefondeado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "saldo_alerta_minimo" DECIMAL(14,4) NOT NULL DEFAULT 500,
    "comision_proveedor_pct" DECIMAL(5,2),
    "last_recharge_at" TIMESTAMP(3),
    "total_consumido_lifetime" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recarga_proveedor_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recargas" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "caja_apertura_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "venta_id" TEXT,
    "tipo" "RecargaTipo" NOT NULL DEFAULT 'tiempo_aire',
    "compania_codigo" "RecargaCompaniaCodigo" NOT NULL,
    "proveedor_config_id" TEXT NOT NULL,
    "proveedor_codigo" "RecargaProveedorCodigo" NOT NULL,
    "numero_telefonico" TEXT NOT NULL,
    "referencia_capturada" TEXT,
    "monto_solicitado" DECIMAL(14,4) NOT NULL,
    "monto_cobrado_cliente" DECIMAL(14,4) NOT NULL,
    "comision_tenant" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "comision_proveedor" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costo_real_tenant" DECIMAL(14,4) NOT NULL,
    "folio_proveedor" TEXT,
    "respuesta_proveedor" JSONB,
    "estado" "RecargaEstado" NOT NULL DEFAULT 'pendiente',
    "motivo_falla" TEXT,
    "intentos_totales" INTEGER NOT NULL DEFAULT 0,
    "reembolsada_at" TIMESTAMP(3),
    "reembolsada_por_id" TEXT,
    "reembolso_motivo" TEXT,
    "disputada_at" TIMESTAMP(3),
    "disputa_motivo" TEXT,
    "procesado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recargas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recarga_reintentos" (
    "id" TEXT NOT NULL,
    "recarga_id" TEXT NOT NULL,
    "intento_numero" INTEGER NOT NULL,
    "respuesta" JSONB,
    "error_mensaje" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recarga_reintentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recarga_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recarga_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recarga_proveedor_config_proveedor_codigo_key" ON "recarga_proveedor_config"("proveedor_codigo");

-- CreateIndex
CREATE INDEX "recarga_proveedor_config_is_primario_idx" ON "recarga_proveedor_config"("is_primario");

-- CreateIndex
CREATE INDEX "recarga_proveedor_config_is_active_idx" ON "recarga_proveedor_config"("is_active");

-- CreateIndex
CREATE INDEX "recargas_estado_created_at_idx" ON "recargas"("estado", "created_at");

-- CreateIndex
CREATE INDEX "recargas_compania_codigo_idx" ON "recargas"("compania_codigo");

-- CreateIndex
CREATE INDEX "recargas_proveedor_codigo_idx" ON "recargas"("proveedor_codigo");

-- CreateIndex
CREATE INDEX "recargas_numero_telefonico_idx" ON "recargas"("numero_telefonico");

-- CreateIndex
CREATE INDEX "recargas_venta_id_idx" ON "recargas"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "recargas_sucursal_id_folio_key" ON "recargas"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "recarga_reintentos_recarga_id_created_at_idx" ON "recarga_reintentos"("recarga_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recarga_reintentos_recarga_id_intento_numero_key" ON "recarga_reintentos"("recarga_id", "intento_numero");

-- AddForeignKey
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_caja_apertura_id_fkey" FOREIGN KEY ("caja_apertura_id") REFERENCES "caja_aperturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_reembolsada_por_id_fkey" FOREIGN KEY ("reembolsada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_proveedor_config_id_fkey" FOREIGN KEY ("proveedor_config_id") REFERENCES "recarga_proveedor_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recarga_reintentos" ADD CONSTRAINT "recarga_reintentos_recarga_id_fkey" FOREIGN KEY ("recarga_id") REFERENCES "recargas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recarga_folio_counters" ADD CONSTRAINT "recarga_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
