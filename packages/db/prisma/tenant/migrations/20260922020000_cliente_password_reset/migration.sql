-- CreateTable
-- Recuperación de contraseña del comprador. Aditiva: tabla nueva; el token en
-- claro viaja solo por email, en BD vive su sha256, con caducidad de 1 hora y
-- un solo uso (usadoEn). Índices por cliente y por hash de token.
CREATE TABLE "cliente_password_reset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cliente_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "usado_en" TIMESTAMP(3)
);

-- CreateIndex
CREATE INDEX "cliente_password_reset_cliente_id_idx" ON "cliente_password_reset"("cliente_id");

-- CreateIndex
CREATE INDEX "cliente_password_reset_token_hash_idx" ON "cliente_password_reset"("token_hash");

-- AddForeignKey
ALTER TABLE "cliente_password_reset" ADD CONSTRAINT "cliente_password_reset_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
