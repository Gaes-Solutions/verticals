-- CreateEnum
CREATE TYPE "PreguntaEstado" AS ENUM ('pendiente', 'publicada', 'rechazada');

-- AlterTable
ALTER TABLE "config_tienda_ecommerce" ADD COLUMN     "cancelacion_cliente" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "facturacion_self_service" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preguntas_publicas" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "preguntas_producto" (
    "id" TEXT NOT NULL,
    "producto_publicado_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "autor_nombre" TEXT,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT,
    "respondida_por_id" TEXT,
    "respondida_at" TIMESTAMP(3),
    "estado" "PreguntaEstado" NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preguntas_producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preguntas_producto_producto_publicado_id_estado_idx" ON "preguntas_producto"("producto_publicado_id", "estado");

-- CreateIndex
CREATE INDEX "preguntas_producto_estado_created_at_idx" ON "preguntas_producto"("estado", "created_at");

-- AddForeignKey
ALTER TABLE "preguntas_producto" ADD CONSTRAINT "preguntas_producto_producto_publicado_id_fkey" FOREIGN KEY ("producto_publicado_id") REFERENCES "productos_publicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_producto" ADD CONSTRAINT "preguntas_producto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_producto" ADD CONSTRAINT "preguntas_producto_respondida_por_id_fkey" FOREIGN KEY ("respondida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
