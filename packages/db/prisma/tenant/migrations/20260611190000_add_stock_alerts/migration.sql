-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "producto_publicado_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "email" TEXT NOT NULL,
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "notificado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_alerts_producto_publicado_id_notificado_idx" ON "stock_alerts"("producto_publicado_id", "notificado");

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_producto_publicado_id_fkey" FOREIGN KEY ("producto_publicado_id") REFERENCES "productos_publicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
