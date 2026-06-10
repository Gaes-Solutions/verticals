-- CreateEnum
CREATE TYPE "SolicitudDevolucionEstado" AS ENUM ('solicitada', 'aprobada', 'rechazada', 'cancelada');

-- CreateEnum
CREATE TYPE "MensajePedidoAutor" AS ENUM ('cliente', 'empleado');

-- CreateTable
CREATE TABLE "solicitudes_devolucion" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "pedido_ecommerce_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "motivo" "DevolucionMotivo" NOT NULL,
    "descripcion" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "fotos" JSONB NOT NULL DEFAULT '[]',
    "estado" "SolicitudDevolucionEstado" NOT NULL DEFAULT 'solicitada',
    "rechazo_motivo" TEXT,
    "devolucion_id" TEXT,
    "resuelta_por_id" TEXT,
    "resuelta_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_pedido" (
    "id" TEXT NOT NULL,
    "pedido_ecommerce_id" TEXT NOT NULL,
    "autor_tipo" "MensajePedidoAutor" NOT NULL,
    "usuario_id" TEXT,
    "cliente_id" TEXT,
    "cuerpo" TEXT NOT NULL,
    "leido_por_cliente" BOOLEAN NOT NULL DEFAULT false,
    "leido_por_empleado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_devolucion_folio_key" ON "solicitudes_devolucion"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_devolucion_devolucion_id_key" ON "solicitudes_devolucion"("devolucion_id");

-- CreateIndex
CREATE INDEX "solicitudes_devolucion_estado_created_at_idx" ON "solicitudes_devolucion"("estado", "created_at");

-- CreateIndex
CREATE INDEX "solicitudes_devolucion_cliente_id_idx" ON "solicitudes_devolucion"("cliente_id");

-- CreateIndex
CREATE INDEX "solicitudes_devolucion_pedido_ecommerce_id_idx" ON "solicitudes_devolucion"("pedido_ecommerce_id");

-- CreateIndex
CREATE INDEX "mensajes_pedido_pedido_ecommerce_id_created_at_idx" ON "mensajes_pedido"("pedido_ecommerce_id", "created_at");

-- AddForeignKey
ALTER TABLE "solicitudes_devolucion" ADD CONSTRAINT "solicitudes_devolucion_pedido_ecommerce_id_fkey" FOREIGN KEY ("pedido_ecommerce_id") REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_devolucion" ADD CONSTRAINT "solicitudes_devolucion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_devolucion" ADD CONSTRAINT "solicitudes_devolucion_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_devolucion" ADD CONSTRAINT "solicitudes_devolucion_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_pedido" ADD CONSTRAINT "mensajes_pedido_pedido_ecommerce_id_fkey" FOREIGN KEY ("pedido_ecommerce_id") REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_pedido" ADD CONSTRAINT "mensajes_pedido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_pedido" ADD CONSTRAINT "mensajes_pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
