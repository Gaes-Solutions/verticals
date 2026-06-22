-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "saldo_monedero" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tarjetas_regalo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "monto_inicial" DECIMAL(12,2) NOT NULL,
    "saldo_actual" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'activa',
    "comprada_por" TEXT,
    "vigencia_hasta" TIMESTAMP(3),
    "creado_por_id" TEXT NOT NULL,
    "canjeada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarjetas_regalo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monedero_movimientos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo_resultante" DECIMAL(14,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "ref_tipo" TEXT,
    "ref_id" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monedero_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarjetas_regalo_codigo_key" ON "tarjetas_regalo"("codigo");

-- CreateIndex
CREATE INDEX "tarjetas_regalo_status_idx" ON "tarjetas_regalo"("status");

-- CreateIndex
CREATE INDEX "monedero_movimientos_cliente_id_idx" ON "monedero_movimientos"("cliente_id");

-- AddForeignKey
ALTER TABLE "monedero_movimientos" ADD CONSTRAINT "monedero_movimientos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
