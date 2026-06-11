-- AlterEnum
ALTER TYPE "EnvioPaqueteria" ADD VALUE 'otro';

-- AlterTable
ALTER TABLE "config_tienda_ecommerce" ADD COLUMN     "paqueteria_provider" TEXT,
ADD COLUMN     "paqueteria_auto_guia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tarifas_en_vivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paqueteria_peso_default_kg" DECIMAL(8,3) NOT NULL DEFAULT 1,
ADD COLUMN     "push_habilitado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "push_eventos" JSONB NOT NULL DEFAULT '["pago_confirmado", "enviado", "entregado"]';

-- AlterTable
ALTER TABLE "envios_pedidos" ADD COLUMN     "proveedor_logistico" TEXT,
ADD COLUMN     "carrier_real" TEXT,
ADD COLUMN     "guia_proveedor_id" TEXT,
ADD COLUMN     "tracking_url" TEXT;

-- CreateIndex
CREATE INDEX "envios_pedidos_guia_tracking_idx" ON "envios_pedidos"("guia_tracking");

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_cliente_id_idx" ON "push_subscriptions"("cliente_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
