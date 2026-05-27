-- CreateEnum
CREATE TYPE "CarritoCanal" AS ENUM ('web', 'mobile', 'whatsapp');

-- CreateEnum
CREATE TYPE "CarritoEstado" AS ENUM ('activo', 'abandonado', 'convertido', 'expirado');

-- CreateEnum
CREATE TYPE "PedidoEcommerceEstadoPago" AS ENUM ('pendiente', 'pago_confirmado', 'pago_fallido', 'reembolsado');

-- CreateEnum
CREATE TYPE "PedidoEcommerceEstado" AS ENUM ('recibido', 'pago_confirmado', 'preparando', 'listo_pickup', 'enviado', 'en_camino', 'entregado', 'recogido', 'cancelado');

-- CreateEnum
CREATE TYPE "PedidoEcommerceMetodoEnvio" AS ENUM ('paqueteria', 'click_collect', 'envio_local');

-- CreateEnum
CREATE TYPE "TarifaEnvioTipoCalculo" AS ENUM ('fija', 'por_peso', 'por_monto');

-- CreateEnum
CREATE TYPE "EnvioPaqueteria" AS ENUM ('fedex', 'estafeta', 'paquete_express', 'huipix', 'propio');

-- CreateEnum
CREATE TYPE "ResenaEstado" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateEnum
CREATE TYPE "TiendaModo" AS ENUM ('b2c', 'b2b_only');

-- CreateTable
CREATE TABLE "config_tienda_ecommerce" (
    "id" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "subdominio" TEXT NOT NULL,
    "dominio_propio" TEXT,
    "nombre" TEXT NOT NULL,
    "lema" TEXT,
    "descripcion_seo" TEXT,
    "idiomas_disponibles" JSONB NOT NULL DEFAULT '["es-MX"]',
    "monedas" JSONB NOT NULL DEFAULT '["MXN"]',
    "paises_envio" JSONB NOT NULL DEFAULT '["MX"]',
    "politicas_html" JSONB NOT NULL DEFAULT '{}',
    "whatsapp_chat_widget" TEXT,
    "tags_analytics" JSONB NOT NULL DEFAULT '{}',
    "modo" "TiendaModo" NOT NULL DEFAULT 'b2c',
    "mostrar_inventario_publico" BOOLEAN NOT NULL DEFAULT true,
    "buffer_inventario_publico" INTEGER NOT NULL DEFAULT 0,
    "guest_checkout_permitido" BOOLEAN NOT NULL DEFAULT true,
    "requiere_aprobacion_cliente_nuevo" BOOLEAN NOT NULL DEFAULT false,
    "branding_override" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_tienda_ecommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_publicas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug_seo" TEXT NOT NULL,
    "parent_id" TEXT,
    "descripcion" TEXT,
    "imagen_url" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "meta_titulo" TEXT,
    "meta_descripcion" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_publicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos_publicados" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "categoria_publica_id" TEXT,
    "titulo_publico" TEXT NOT NULL,
    "slug_seo" TEXT NOT NULL,
    "descripcion_md" TEXT,
    "descripcion_corta_md" TEXT,
    "meta_titulo" TEXT,
    "meta_descripcion" TEXT,
    "fotos_array" JSONB NOT NULL DEFAULT '[]',
    "video_url" TEXT,
    "precio_publico_override" DECIMAL(14,2),
    "precio_promocion" DECIMAL(14,2),
    "promocion_vigente_hasta" TIMESTAMP(3),
    "atributos_publicos" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "ranking_score" INTEGER NOT NULL DEFAULT 0,
    "destacado_home" BOOLEAN NOT NULL DEFAULT false,
    "publicado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relacionados_ids" JSONB NOT NULL DEFAULT '[]',
    "is_publicado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_publicados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_traducciones" (
    "id" TEXT NOT NULL,
    "producto_publicado_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "titulo_publico" TEXT NOT NULL,
    "descripcion_md" TEXT,
    "meta_titulo" TEXT,
    "meta_descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_traducciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carritos_ecommerce" (
    "id" TEXT NOT NULL,
    "session_id_anonimo" TEXT,
    "cliente_id" TEXT,
    "email_anonimo" TEXT,
    "canal" "CarritoCanal" NOT NULL DEFAULT 'web',
    "items" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "descuento_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costo_envio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "cupon_codigo" TEXT,
    "promociones_aplicadas" JSONB NOT NULL DEFAULT '[]',
    "direccion_envio" JSONB,
    "direccion_factura" JSONB,
    "metodo_envio" "PedidoEcommerceMetodoEnvio",
    "metodo_pago_seleccionado" TEXT,
    "status" "CarritoEstado" NOT NULL DEFAULT 'activo',
    "abandonado_at" TIMESTAMP(3),
    "recordatorio_24h_at" TIMESTAMP(3),
    "recordatorio_72h_at" TIMESTAMP(3),
    "recovery_codigo" TEXT,
    "convertido_a_pedido_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "referrer" TEXT,
    "utm" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carritos_ecommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_ecommerce" (
    "id" TEXT NOT NULL,
    "folio_publico" TEXT NOT NULL,
    "carrito_origen_id" TEXT,
    "cliente_id" TEXT,
    "email_comprador" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(14,4) NOT NULL,
    "descuento_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costo_envio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "tipo_cambio" DECIMAL(10,6) NOT NULL DEFAULT 1,
    "cupones_snapshot" JSONB NOT NULL DEFAULT '[]',
    "direccion_envio" JSONB,
    "direccion_factura" JSONB,
    "requiere_factura" BOOLEAN NOT NULL DEFAULT false,
    "datos_factura" JSONB,
    "status_pago" "PedidoEcommerceEstadoPago" NOT NULL DEFAULT 'pendiente',
    "payment_intent_id" TEXT,
    "metodo_pago" TEXT,
    "metodo_envio" "PedidoEcommerceMetodoEnvio" NOT NULL,
    "sucursal_pickup_id" TEXT,
    "paqueteria" "EnvioPaqueteria",
    "guia_tracking" TEXT,
    "costo_envio_real" DECIMAL(14,4),
    "status_pedido" "PedidoEcommerceEstado" NOT NULL DEFAULT 'recibido',
    "venta_id_generada" TEXT,
    "factura_cfdi_id" TEXT,
    "pago_confirmado_at" TIMESTAMP(3),
    "enviado_at" TIMESTAMP(3),
    "entregado_at" TIMESTAMP(3),
    "cancelado_at" TIMESTAMP(3),
    "cancelado_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_ecommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_ecommerce_eventos" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "visible_cliente" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_ecommerce_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_ecommerce_folio_counter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ultimo_folio" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedido_ecommerce_folio_counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zonas_envio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cps_incluidos" JSONB NOT NULL DEFAULT '[]',
    "estados_incluidos" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zonas_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifas_envio" (
    "id" TEXT NOT NULL,
    "zona_envio_id" TEXT NOT NULL,
    "paqueteria" "EnvioPaqueteria" NOT NULL,
    "nombre_publico" TEXT NOT NULL,
    "tipo_calculo" "TarifaEnvioTipoCalculo" NOT NULL DEFAULT 'fija',
    "monto_fijo" DECIMAL(14,2),
    "escalon_peso" JSONB,
    "monto_minimo_envio_gratis" DECIMAL(14,2),
    "dias_entrega_estimados" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_pedidos" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "paqueteria" "EnvioPaqueteria" NOT NULL,
    "guia_tracking" TEXT,
    "etiqueta_url" TEXT,
    "costo_real" DECIMAL(14,4),
    "costo_cobrado" DECIMAL(14,4),
    "status_externo" TEXT,
    "eventos_externos" JSONB NOT NULL DEFAULT '[]',
    "evidencia_entrega_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envios_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_resenas" (
    "id" TEXT NOT NULL,
    "producto_publicado_id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "rating" INTEGER NOT NULL,
    "titulo" TEXT,
    "comentario" TEXT,
    "imagenes_array" JSONB NOT NULL DEFAULT '[]',
    "video_url" TEXT,
    "estado" "ResenaEstado" NOT NULL DEFAULT 'pendiente',
    "moderacion_ia_nota" TEXT,
    "verificada_por_compra" BOOLEAN NOT NULL DEFAULT true,
    "respuesta_tienda" TEXT,
    "respondida_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_resenas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT 'Mi lista',
    "es_publica" BOOLEAN NOT NULL DEFAULT false,
    "slug_publico" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "producto_publicado_id" TEXT NOT NULL,
    "agregado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_pickup_sucursal" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "horario_pickup" JSONB NOT NULL DEFAULT '{}',
    "tiempo_preparacion_promedio_min" INTEGER NOT NULL DEFAULT 60,
    "requiere_id_recoger" BOOLEAN NOT NULL DEFAULT true,
    "notificacion_listo_canal" TEXT NOT NULL DEFAULT 'email',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_pickup_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_pedidos" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "listo_at" TIMESTAMP(3),
    "recogido_at" TIMESTAMP(3),
    "recogido_por_nombre" TEXT,
    "recogido_por_id" TEXT,
    "responsable_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_configuracion_tienda" (
    "id" TEXT NOT NULL,
    "robots_txt" TEXT,
    "sitemap_auto" BOOLEAN NOT NULL DEFAULT true,
    "redirects_301" JSONB NOT NULL DEFAULT '[]',
    "structured_data_template" JSONB,
    "google_search_console_verif" TEXT,
    "bing_verif" TEXT,
    "canonical_dominio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_configuracion_tienda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "config_tienda_ecommerce_subdominio_key" ON "config_tienda_ecommerce"("subdominio");

-- CreateIndex
CREATE UNIQUE INDEX "config_tienda_ecommerce_dominio_propio_key" ON "config_tienda_ecommerce"("dominio_propio");

-- CreateIndex
CREATE INDEX "categorias_publicas_parent_id_idx" ON "categorias_publicas"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_publicas_slug_seo_key" ON "categorias_publicas"("slug_seo");

-- CreateIndex
CREATE UNIQUE INDEX "productos_publicados_producto_id_key" ON "productos_publicados"("producto_id");

-- CreateIndex
CREATE INDEX "productos_publicados_categoria_publica_id_idx" ON "productos_publicados"("categoria_publica_id");

-- CreateIndex
CREATE INDEX "productos_publicados_destacado_home_idx" ON "productos_publicados"("destacado_home");

-- CreateIndex
CREATE INDEX "productos_publicados_is_publicado_idx" ON "productos_publicados"("is_publicado");

-- CreateIndex
CREATE UNIQUE INDEX "productos_publicados_slug_seo_key" ON "productos_publicados"("slug_seo");

-- CreateIndex
CREATE UNIQUE INDEX "producto_traducciones_producto_publicado_id_locale_key" ON "producto_traducciones"("producto_publicado_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "carritos_ecommerce_recovery_codigo_key" ON "carritos_ecommerce"("recovery_codigo");

-- CreateIndex
CREATE INDEX "carritos_ecommerce_session_id_anonimo_idx" ON "carritos_ecommerce"("session_id_anonimo");

-- CreateIndex
CREATE INDEX "carritos_ecommerce_cliente_id_idx" ON "carritos_ecommerce"("cliente_id");

-- CreateIndex
CREATE INDEX "carritos_ecommerce_status_abandonado_at_idx" ON "carritos_ecommerce"("status", "abandonado_at");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_ecommerce_folio_publico_key" ON "pedidos_ecommerce"("folio_publico");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_ecommerce_venta_id_generada_key" ON "pedidos_ecommerce"("venta_id_generada");

-- CreateIndex
CREATE INDEX "pedidos_ecommerce_cliente_id_idx" ON "pedidos_ecommerce"("cliente_id");

-- CreateIndex
CREATE INDEX "pedidos_ecommerce_status_pedido_created_at_idx" ON "pedidos_ecommerce"("status_pedido", "created_at");

-- CreateIndex
CREATE INDEX "pedidos_ecommerce_status_pago_idx" ON "pedidos_ecommerce"("status_pago");

-- CreateIndex
CREATE INDEX "pedidos_ecommerce_email_comprador_idx" ON "pedidos_ecommerce"("email_comprador");

-- CreateIndex
CREATE INDEX "pedidos_ecommerce_eventos_pedido_id_created_at_idx" ON "pedidos_ecommerce_eventos"("pedido_id", "created_at");

-- CreateIndex
CREATE INDEX "tarifas_envio_zona_envio_id_idx" ON "tarifas_envio"("zona_envio_id");

-- CreateIndex
CREATE UNIQUE INDEX "envios_pedidos_pedido_id_key" ON "envios_pedidos"("pedido_id");

-- CreateIndex
CREATE INDEX "producto_resenas_producto_publicado_id_estado_idx" ON "producto_resenas"("producto_publicado_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "producto_resenas_pedido_id_producto_publicado_id_key" ON "producto_resenas"("pedido_id", "producto_publicado_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_slug_publico_key" ON "wishlists"("slug_publico");

-- CreateIndex
CREATE INDEX "wishlists_cliente_id_idx" ON "wishlists"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_wishlist_id_producto_publicado_id_key" ON "wishlist_items"("wishlist_id", "producto_publicado_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_pickup_sucursal_sucursal_id_key" ON "config_pickup_sucursal"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_pedidos_pedido_id_key" ON "pickup_pedidos"("pedido_id");

-- AddForeignKey
ALTER TABLE "categorias_publicas" ADD CONSTRAINT "categorias_publicas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categorias_publicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_publicados" ADD CONSTRAINT "productos_publicados_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_publicados" ADD CONSTRAINT "productos_publicados_categoria_publica_id_fkey" FOREIGN KEY ("categoria_publica_id") REFERENCES "categorias_publicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_traducciones" ADD CONSTRAINT "producto_traducciones_producto_publicado_id_fkey" FOREIGN KEY ("producto_publicado_id") REFERENCES "productos_publicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carritos_ecommerce" ADD CONSTRAINT "carritos_ecommerce_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_ecommerce" ADD CONSTRAINT "pedidos_ecommerce_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_ecommerce" ADD CONSTRAINT "pedidos_ecommerce_sucursal_pickup_id_fkey" FOREIGN KEY ("sucursal_pickup_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_ecommerce" ADD CONSTRAINT "pedidos_ecommerce_venta_id_generada_fkey" FOREIGN KEY ("venta_id_generada") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_ecommerce_eventos" ADD CONSTRAINT "pedidos_ecommerce_eventos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas_envio" ADD CONSTRAINT "tarifas_envio_zona_envio_id_fkey" FOREIGN KEY ("zona_envio_id") REFERENCES "zonas_envio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_pedidos" ADD CONSTRAINT "envios_pedidos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_resenas" ADD CONSTRAINT "producto_resenas_producto_publicado_id_fkey" FOREIGN KEY ("producto_publicado_id") REFERENCES "productos_publicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_resenas" ADD CONSTRAINT "producto_resenas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_resenas" ADD CONSTRAINT "producto_resenas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_resenas" ADD CONSTRAINT "producto_resenas_respondida_por_id_fkey" FOREIGN KEY ("respondida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_pickup_sucursal" ADD CONSTRAINT "config_pickup_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_pedidos" ADD CONSTRAINT "pickup_pedidos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_pedidos" ADD CONSTRAINT "pickup_pedidos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_pedidos" ADD CONSTRAINT "pickup_pedidos_responsable_user_id_fkey" FOREIGN KEY ("responsable_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
