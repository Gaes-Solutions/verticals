-- CreateEnum
CREATE TYPE "NotificacionDestinatario" AS ENUM ('usuario', 'cliente');

-- AlterTable
ALTER TABLE "pedidos_ecommerce" ADD COLUMN     "asignado_a_id" TEXT,
ADD COLUMN     "asignado_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "config_ecommerce" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "etiquetas_estado" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_ecommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "destinatario_tipo" "NotificacionDestinatario" NOT NULL,
    "usuario_id" TEXT,
    "cliente_id" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "link" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leida_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_leida_created_at_idx" ON "notificaciones"("usuario_id", "leida", "created_at");

-- CreateIndex
CREATE INDEX "notificaciones_cliente_id_leida_created_at_idx" ON "notificaciones"("cliente_id", "leida", "created_at");

-- CreateIndex
CREATE INDEX "pedidos_ecommerce_asignado_a_id_idx" ON "pedidos_ecommerce"("asignado_a_id");

-- AddForeignKey
ALTER TABLE "pedidos_ecommerce" ADD CONSTRAINT "pedidos_ecommerce_asignado_a_id_fkey" FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
