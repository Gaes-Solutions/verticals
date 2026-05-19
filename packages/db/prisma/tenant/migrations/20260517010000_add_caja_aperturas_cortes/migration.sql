-- CreateEnum
CREATE TYPE "CajaAperturaEstado" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "CajaMovimientoTipo" AS ENUM ('entrada_fondo', 'entrada_prestamo', 'entrada_devolucion', 'entrada_otro', 'salida_retiro', 'salida_gasto', 'salida_deposito', 'salida_otro');

-- CreateEnum
CREATE TYPE "CorteTipo" AS ENUM ('X', 'Z');

-- CreateTable
CREATE TABLE "caja_aperturas" (
    "id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "monto_inicial" DECIMAL(14,4) NOT NULL,
    "observaciones_apertura" TEXT,
    "estado" "CajaAperturaEstado" NOT NULL DEFAULT 'abierta',
    "cerrada_at" TIMESTAMP(3),
    "cerrada_por_id" TEXT,
    "cerrada_forzosa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caja_aperturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_movimientos" (
    "id" TEXT NOT NULL,
    "apertura_id" TEXT NOT NULL,
    "tipo" "CajaMovimientoTipo" NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "motivo" TEXT NOT NULL,
    "referencia" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cortes" (
    "id" TEXT NOT NULL,
    "apertura_id" TEXT NOT NULL,
    "tipo" "CorteTipo" NOT NULL,
    "numero" INTEGER NOT NULL,
    "desde_at" TIMESTAMP(3) NOT NULL,
    "hasta_at" TIMESTAMP(3) NOT NULL,
    "ventas_count" INTEGER NOT NULL,
    "ventas_canceladas" INTEGER NOT NULL DEFAULT 0,
    "ventas_total" DECIMAL(14,4) NOT NULL,
    "efectivo_esperado" DECIMAL(14,4) NOT NULL,
    "efectivo_contado" DECIMAL(14,4) NOT NULL,
    "diferencia" DECIMAL(14,4) NOT NULL,
    "desglose_por_metodo" JSONB NOT NULL,
    "desglose_movimientos" JSONB NOT NULL,
    "denominaciones" JSONB NOT NULL,
    "observaciones" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cortes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "caja_aperturas_caja_id_estado_idx" ON "caja_aperturas"("caja_id", "estado");

-- CreateIndex
CREATE INDEX "caja_aperturas_sucursal_id_estado_idx" ON "caja_aperturas"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "caja_aperturas_usuario_id_estado_idx" ON "caja_aperturas"("usuario_id", "estado");

-- CreateIndex
CREATE INDEX "caja_movimientos_apertura_id_created_at_idx" ON "caja_movimientos"("apertura_id", "created_at");

-- CreateIndex
CREATE INDEX "cortes_apertura_id_tipo_idx" ON "cortes"("apertura_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "cortes_apertura_id_numero_key" ON "cortes"("apertura_id", "numero");

-- AddForeignKey
ALTER TABLE "caja_aperturas" ADD CONSTRAINT "caja_aperturas_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_aperturas" ADD CONSTRAINT "caja_aperturas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_aperturas" ADD CONSTRAINT "caja_aperturas_cerrada_por_id_fkey" FOREIGN KEY ("cerrada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_apertura_id_fkey" FOREIGN KEY ("apertura_id") REFERENCES "caja_aperturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_apertura_id_fkey" FOREIGN KEY ("apertura_id") REFERENCES "caja_aperturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
