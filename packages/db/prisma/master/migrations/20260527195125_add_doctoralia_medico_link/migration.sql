-- AlterTable
ALTER TABLE "public_professionals" ADD COLUMN     "medico_id_local" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "public_professionals_tenant_id_principal_medico_id_local_key" ON "public_professionals"("tenant_id_principal", "medico_id_local");
