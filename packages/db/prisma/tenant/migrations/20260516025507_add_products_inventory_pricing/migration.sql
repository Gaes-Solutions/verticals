-- CreateEnum
CREATE TYPE "TipoVenta" AS ENUM ('unidad', 'peso', 'volumen', 'tiempo', 'servicio');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('pza', 'kg', 'g', 'lt', 'ml', 'm', 'm2', 'hora', 'servicio');

-- CreateEnum
CREATE TYPE "CodigoBarrasTipo" AS ENUM ('ean13', 'upc', 'corto_interno', 'qr');

-- CreateEnum
CREATE TYPE "ProductoImagenTipo" AS ENUM ('principal', 'lifestyle', 'detalle', 'lateral', 'back');

-- CreateEnum
CREATE TYPE "InventarioMovimientoTipo" AS ENUM ('compra', 'venta', 'devolucion_cliente', 'devolucion_proveedor', 'ajuste_positivo', 'ajuste_negativo', 'transferencia_salida', 'transferencia_entrada', 'merma', 'apartado_reservado', 'apartado_liberado', 'consumo_interno');

-- CreateEnum
CREATE TYPE "SerieEstado" AS ENUM ('disponible', 'vendido', 'devuelto', 'garantia', 'reparacion');

-- CreateEnum
CREATE TYPE "ListaPrecioTipo" AS ENUM ('publico', 'mayoreo_nivel', 'cliente_individual');

-- CreateEnum
CREATE TYPE "ReglaPrecioTipo" AS ENUM ('descuento_global_por_monto', 'descuento_producto', 'descuento_categoria', 'descuento_cliente', 'bogo_compra_x_lleva_y', 'precio_temporada', 'mayoreo_por_total_ticket');

-- CreateEnum
CREATE TYPE "ReglaPrecioCanal" AS ENUM ('pos_fisico', 'ecommerce', 'b2b', 'todos');

-- CreateEnum
CREATE TYPE "CuponTipo" AS ENUM ('monto_fijo', 'porcentaje', 'envio_gratis', 'producto_gratis');

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagen_url" TEXT,
    "icono" TEXT,
    "color" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "vertical_aplicable" TEXT,
    "is_visible_pos" BOOLEAN NOT NULL DEFAULT true,
    "is_visible_publico" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descripcion" TEXT,
    "logo_url" TEXT,
    "pais_origen" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "sku_padre" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion_corta" TEXT,
    "descripcion_larga" TEXT,
    "categoria_id" TEXT,
    "marca_id" TEXT,
    "tipo_venta" "TipoVenta" NOT NULL DEFAULT 'unidad',
    "unidad_medida" "UnidadMedida" NOT NULL DEFAULT 'pza',
    "unidad_medida_compra" "UnidadMedida" NOT NULL DEFAULT 'pza',
    "factor_compra_a_venta" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "tiene_variantes" BOOLEAN NOT NULL DEFAULT false,
    "requires_recipe" BOOLEAN NOT NULL DEFAULT false,
    "clave_sat" TEXT,
    "clave_unidad_sat" TEXT,
    "aplica_iva" BOOLEAN NOT NULL DEFAULT true,
    "tasa_iva" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "aplica_ieps" BOOLEAN NOT NULL DEFAULT false,
    "tasa_ieps" JSONB,
    "permite_descuento" BOOLEAN NOT NULL DEFAULT true,
    "permite_fiado" BOOLEAN NOT NULL DEFAULT true,
    "permite_apartado" BOOLEAN NOT NULL DEFAULT true,
    "permite_devolucion" BOOLEAN NOT NULL DEFAULT true,
    "dias_devolucion" INTEGER NOT NULL DEFAULT 15,
    "dias_garantia" INTEGER NOT NULL DEFAULT 0,
    "requires_lote" BOOLEAN NOT NULL DEFAULT false,
    "requires_serie" BOOLEAN NOT NULL DEFAULT false,
    "requires_balanza" BOOLEAN NOT NULL DEFAULT false,
    "peso_kg" DECIMAL(10,3),
    "dimensiones" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_visible_publico" BOOLEAN NOT NULL DEFAULT true,
    "is_visible_b2b" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_variantes" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre_variante" TEXT,
    "opciones" JSONB NOT NULL DEFAULT '{}',
    "precio_base" DECIMAL(14,4) NOT NULL,
    "costo_promedio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costo_ultimo" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "peso_kg" DECIMAL(10,3),
    "imagen_url" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_variantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_codigos_barras" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "CodigoBarrasTipo" NOT NULL DEFAULT 'ean13',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_codigos_barras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_imagenes" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT,
    "variante_id" TEXT,
    "s3_key" TEXT,
    "cdn_url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "tipo" "ProductoImagenTipo" NOT NULL DEFAULT 'principal',
    "alt_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_imagenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_atributos" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo_dato" TEXT NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_atributos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_tags" (
    "producto_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_tags_pkey" PRIMARY KEY ("producto_id","tag")
);

-- CreateTable
CREATE TABLE "inventario_sucursal" (
    "variante_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "stock_actual" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "stock_reservado" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "stock_maximo" DECIMAL(18,3),
    "ubicacion" TEXT,
    "last_inventory_at" TIMESTAMP(3),
    "next_inventory_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_sucursal_pkey" PRIMARY KEY ("variante_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "inventario_movimientos" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "sucursal_origen_id" TEXT,
    "tipo" "InventarioMovimientoTipo" NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "costo_unitario" DECIMAL(14,4),
    "referencia_tipo" TEXT,
    "referencia_id" TEXT,
    "lote_id" TEXT,
    "serie_id" TEXT,
    "motivo" TEXT,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_lotes" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "numero_lote" TEXT NOT NULL,
    "fecha_caducidad" TIMESTAMP(3),
    "cantidad_inicial" DECIMAL(18,3) NOT NULL,
    "cantidad_actual" DECIMAL(18,3) NOT NULL,
    "proveedor_id" TEXT,
    "notas" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_series" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "numero_serie" TEXT NOT NULL,
    "estado" "SerieEstado" NOT NULL DEFAULT 'disponible',
    "vendido_a_cliente_id" TEXT,
    "venta_id" TEXT,
    "vendido_at" TIMESTAMP(3),
    "garantia_hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niveles_precio_mayoreo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "descuento_default_pct" DECIMAL(5,2),
    "monto_minimo_compra" DECIMAL(14,2),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "niveles_precio_mayoreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listas_precios" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "ListaPrecioTipo" NOT NULL DEFAULT 'publico',
    "nivel_mayoreo_id" TEXT,
    "cliente_b2b_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "vigente_desde" TIMESTAMP(3),
    "vigente_hasta" TIMESTAMP(3),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_precio_items" (
    "lista_precio_id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "precio" DECIMAL(14,4) NOT NULL,
    "precio_minimo_negociacion" DECIMAL(14,4),
    "incluye_iva" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lista_precio_items_pkey" PRIMARY KEY ("lista_precio_id","variante_id")
);

-- CreateTable
CREATE TABLE "producto_precios_escalonados" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "cantidad_minima" DECIMAL(18,3) NOT NULL,
    "cantidad_maxima" DECIMAL(18,3),
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_precios_escalonados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_precio" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "ReglaPrecioTipo" NOT NULL,
    "prioridad" INTEGER NOT NULL DEFAULT 100,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "excluye_productos_con_escalonado" BOOLEAN NOT NULL DEFAULT true,
    "aplica_a" "ReglaPrecioCanal" NOT NULL DEFAULT 'todos',
    "condicion" JSONB NOT NULL DEFAULT '{}',
    "accion" JSONB NOT NULL DEFAULT '{}',
    "vigente_desde" TIMESTAMP(3),
    "vigente_hasta" TIMESTAMP(3),
    "dias_semana" JSONB,
    "horarios" JSONB,
    "usos_max_por_cliente" INTEGER,
    "usos_total" INTEGER,
    "usos_actuales" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regla_precio_productos" (
    "regla_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,

    CONSTRAINT "regla_precio_productos_pkey" PRIMARY KEY ("regla_id","producto_id")
);

-- CreateTable
CREATE TABLE "regla_precio_categorias" (
    "regla_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,

    CONSTRAINT "regla_precio_categorias_pkey" PRIMARY KEY ("regla_id","categoria_id")
);

-- CreateTable
CREATE TABLE "cupones_tenant" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "CuponTipo" NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "monto_minimo_compra" DECIMAL(14,2),
    "productos_aplicables" JSONB NOT NULL DEFAULT '[]',
    "categorias_aplicables" JSONB NOT NULL DEFAULT '[]',
    "clientes_aplicables" JSONB NOT NULL DEFAULT '[]',
    "usos_max_por_cliente" INTEGER,
    "usos_total" INTEGER,
    "usos_actuales" INTEGER NOT NULL DEFAULT 0,
    "vigente_desde" TIMESTAMP(3),
    "vigente_hasta" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cupones_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE INDEX "categorias_parent_id_idx" ON "categorias"("parent_id");

-- CreateIndex
CREATE INDEX "categorias_is_active_idx" ON "categorias"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_slug_key" ON "marcas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "productos_sku_padre_key" ON "productos"("sku_padre");

-- CreateIndex
CREATE INDEX "productos_categoria_id_idx" ON "productos"("categoria_id");

-- CreateIndex
CREATE INDEX "productos_marca_id_idx" ON "productos"("marca_id");

-- CreateIndex
CREATE INDEX "productos_is_active_idx" ON "productos"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "producto_variantes_sku_key" ON "producto_variantes"("sku");

-- CreateIndex
CREATE INDEX "producto_variantes_producto_id_idx" ON "producto_variantes"("producto_id");

-- CreateIndex
CREATE INDEX "producto_variantes_is_active_idx" ON "producto_variantes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigos_barras_codigo_key" ON "producto_codigos_barras"("codigo");

-- CreateIndex
CREATE INDEX "producto_codigos_barras_variante_id_idx" ON "producto_codigos_barras"("variante_id");

-- CreateIndex
CREATE INDEX "producto_imagenes_producto_id_idx" ON "producto_imagenes"("producto_id");

-- CreateIndex
CREATE INDEX "producto_imagenes_variante_id_idx" ON "producto_imagenes"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "producto_atributos_producto_id_clave_key" ON "producto_atributos"("producto_id", "clave");

-- CreateIndex
CREATE INDEX "producto_tags_tag_idx" ON "producto_tags"("tag");

-- CreateIndex
CREATE INDEX "inventario_sucursal_sucursal_id_idx" ON "inventario_sucursal"("sucursal_id");

-- CreateIndex
CREATE INDEX "inventario_movimientos_variante_id_sucursal_id_created_at_idx" ON "inventario_movimientos"("variante_id", "sucursal_id", "created_at");

-- CreateIndex
CREATE INDEX "inventario_movimientos_referencia_tipo_referencia_id_idx" ON "inventario_movimientos"("referencia_tipo", "referencia_id");

-- CreateIndex
CREATE INDEX "producto_lotes_fecha_caducidad_idx" ON "producto_lotes"("fecha_caducidad");

-- CreateIndex
CREATE UNIQUE INDEX "producto_lotes_variante_id_sucursal_id_numero_lote_key" ON "producto_lotes"("variante_id", "sucursal_id", "numero_lote");

-- CreateIndex
CREATE UNIQUE INDEX "producto_series_numero_serie_key" ON "producto_series"("numero_serie");

-- CreateIndex
CREATE INDEX "producto_series_variante_id_estado_idx" ON "producto_series"("variante_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "niveles_precio_mayoreo_codigo_key" ON "niveles_precio_mayoreo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "listas_precios_codigo_key" ON "listas_precios"("codigo");

-- CreateIndex
CREATE INDEX "listas_precios_tipo_is_active_idx" ON "listas_precios"("tipo", "is_active");

-- CreateIndex
CREATE INDEX "lista_precio_items_variante_id_idx" ON "lista_precio_items"("variante_id");

-- CreateIndex
CREATE INDEX "producto_precios_escalonados_variante_id_is_active_idx" ON "producto_precios_escalonados"("variante_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "producto_precios_escalonados_variante_id_nivel_key" ON "producto_precios_escalonados"("variante_id", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_precio_codigo_key" ON "reglas_precio"("codigo");

-- CreateIndex
CREATE INDEX "reglas_precio_tipo_is_active_idx" ON "reglas_precio"("tipo", "is_active");

-- CreateIndex
CREATE INDEX "reglas_precio_vigente_desde_vigente_hasta_idx" ON "reglas_precio"("vigente_desde", "vigente_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "cupones_tenant_codigo_key" ON "cupones_tenant"("codigo");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_variantes" ADD CONSTRAINT "producto_variantes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_codigos_barras" ADD CONSTRAINT "producto_codigos_barras_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_imagenes" ADD CONSTRAINT "producto_imagenes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_imagenes" ADD CONSTRAINT "producto_imagenes_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_atributos" ADD CONSTRAINT "producto_atributos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_tags" ADD CONSTRAINT "producto_tags_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_sucursal" ADD CONSTRAINT "inventario_sucursal_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_sucursal" ADD CONSTRAINT "inventario_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "producto_lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "producto_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_lotes" ADD CONSTRAINT "producto_lotes_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_lotes" ADD CONSTRAINT "producto_lotes_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_series" ADD CONSTRAINT "producto_series_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_series" ADD CONSTRAINT "producto_series_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_nivel_mayoreo_id_fkey" FOREIGN KEY ("nivel_mayoreo_id") REFERENCES "niveles_precio_mayoreo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_precio_items" ADD CONSTRAINT "lista_precio_items_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_precio_items" ADD CONSTRAINT "lista_precio_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_precios_escalonados" ADD CONSTRAINT "producto_precios_escalonados_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regla_precio_productos" ADD CONSTRAINT "regla_precio_productos_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "reglas_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regla_precio_productos" ADD CONSTRAINT "regla_precio_productos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regla_precio_categorias" ADD CONSTRAINT "regla_precio_categorias_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "reglas_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regla_precio_categorias" ADD CONSTRAINT "regla_precio_categorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
