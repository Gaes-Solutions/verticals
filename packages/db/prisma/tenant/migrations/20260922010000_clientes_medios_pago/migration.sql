-- CreateTable
-- "Mis tarjetas" del comprador. Aditivo: tabla nueva; solo persisten ids del
-- proveedor y máscara (marca/last4/expiración) — nunca PAN ni CVV (PCI).
CREATE TABLE "clientes_medios_pago" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cliente_id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "proveedor_customer_id" TEXT NOT NULL,
    "proveedor_source_id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "exp_mes" INTEGER NOT NULL,
    "exp_anio" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_medios_pago_cliente_id_proveedor_source_id_key" ON "clientes_medios_pago"("cliente_id", "proveedor_source_id");

-- CreateIndex
CREATE INDEX "clientes_medios_pago_cliente_id_activo_idx" ON "clientes_medios_pago"("cliente_id", "activo");

-- AddForeignKey
ALTER TABLE "clientes_medios_pago" ADD CONSTRAINT "clientes_medios_pago_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
