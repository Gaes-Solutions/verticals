ALTER TABLE "config_tienda_ecommerce" ADD COLUMN "envio_variante_id" TEXT;
ALTER TABLE "pedidos_ecommerce" ADD COLUMN "snapshot_comercial" JSONB;
