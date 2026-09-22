-- AlterTable
-- ETA de entrega del storefront. Aditivo: columnas nuevas con DEFAULT para filas existentes.
ALTER TABLE "config_tienda_ecommerce" ADD COLUMN "eta_dias_envio_min" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "eta_dias_envio_max" INTEGER NOT NULL DEFAULT 5;
