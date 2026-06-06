-- CreateEnum
CREATE TYPE "ClienteB2bUsuarioRol" AS ENUM ('admin', 'comprador');

-- CreateTable
CREATE TABLE "cliente_b2b_usuarios" (
    "id" TEXT NOT NULL,
    "cliente_b2b_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "ClienteB2bUsuarioRol" NOT NULL DEFAULT 'comprador',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_b2b_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_b2b_usuarios_email_key" ON "cliente_b2b_usuarios"("email");

-- CreateIndex
CREATE INDEX "cliente_b2b_usuarios_cliente_b2b_id_idx" ON "cliente_b2b_usuarios"("cliente_b2b_id");

-- AddForeignKey
ALTER TABLE "cliente_b2b_usuarios" ADD CONSTRAINT "cliente_b2b_usuarios_cliente_b2b_id_fkey" FOREIGN KEY ("cliente_b2b_id") REFERENCES "clientes_b2b"("id") ON DELETE CASCADE ON UPDATE CASCADE;
