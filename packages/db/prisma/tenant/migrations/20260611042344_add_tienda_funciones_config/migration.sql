-- AlterTable
ALTER TABLE "config_tienda_ecommerce" ADD COLUMN     "comprar_ahora" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cupon_en_checkout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "galeria_zoom" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mostrar_rating_producto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "msi_habilitado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "msi_meses" JSONB NOT NULL DEFAULT '[3, 6, 12]',
ADD COLUMN     "msi_monto_minimo" DECIMAL(14,2) NOT NULL DEFAULT 0;
