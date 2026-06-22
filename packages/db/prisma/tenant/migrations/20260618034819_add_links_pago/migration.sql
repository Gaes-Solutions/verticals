-- CreateTable
CREATE TABLE "links_pago" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "cliente_nombre" TEXT,
    "cliente_telefono" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "metodo_pago" TEXT,
    "proveedor_ref" TEXT,
    "vigencia_hasta" TIMESTAMP(3),
    "creado_por_id" TEXT NOT NULL,
    "pagado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "links_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "links_pago_token_key" ON "links_pago"("token");

-- CreateIndex
CREATE INDEX "links_pago_status_idx" ON "links_pago"("status");
