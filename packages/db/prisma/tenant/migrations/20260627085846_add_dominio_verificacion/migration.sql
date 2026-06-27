-- AlterTable
ALTER TABLE "config_tienda_ecommerce" ADD COLUMN     "dominio_verificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dominio_token_verificacion" TEXT;
