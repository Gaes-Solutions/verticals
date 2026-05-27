-- CreateEnum
CREATE TYPE "PromocionTipo" AS ENUM ('dos_x_uno', 'tres_x_n', 'mxn', 'compra_x_lleva_y', 'descuento_pct', 'descuento_monto', 'precio_especial', 'regalo_con_compra', 'escalonado_volumen', 'happy_hour');

-- CreateEnum
CREATE TYPE "PromocionStatus" AS ENUM ('draft', 'programada', 'activa', 'pausada', 'expirada', 'cancelada');

-- CreateEnum
CREATE TYPE "PromocionProductoRol" AS ENUM ('incluido', 'excluido', 'regalo', 'comprado', 'requerido');

-- CreateEnum
CREATE TYPE "SegmentoTipo" AS ENUM ('estatico', 'dinamico_rfm', 'dinamico_query');

-- CreateEnum
CREATE TYPE "SegmentoRfm" AS ENUM ('champion', 'leal', 'en_riesgo', 'perdido', 'nuevo', 'hibernando');

-- CreateEnum
CREATE TYPE "CampanaCanal" AS ENUM ('whatsapp', 'email', 'sms', 'push', 'multi');

-- CreateEnum
CREATE TYPE "CampanaTipoDisparo" AS ENUM ('inmediato', 'programado', 'recurrente', 'trigger_event');

-- CreateEnum
CREATE TYPE "CampanaStatus" AS ENUM ('draft', 'programada', 'enviando', 'enviada', 'pausada', 'cancelada');

-- CreateEnum
CREATE TYPE "CampanaEnvioStatus" AS ENUM ('pendiente', 'enviado', 'entregado', 'abierto', 'click', 'convertido', 'opt_out', 'bounce', 'fallido');

-- CreateEnum
CREATE TYPE "PlantillaCanal" AS ENUM ('whatsapp', 'email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "PlantillaTipo" AS ENUM ('transaccional', 'promocional', 'utility', 'servicio');

-- CreateEnum
CREATE TYPE "PlantillaScope" AS ENUM ('gaessoft_global', 'tenant_propia');

-- CreateEnum
CREATE TYPE "OptOutTipo" AS ENUM ('promocional', 'todo');

-- CreateEnum
CREATE TYPE "LoyaltyTipo" AS ENUM ('puntos_por_peso', 'puntos_por_visita', 'tiers_volumen', 'mixto');

-- CreateEnum
CREATE TYPE "LoyaltyMovimientoTipo" AS ENUM ('acumulacion', 'canje', 'expiracion', 'ajuste_admin', 'reverso');

-- CreateTable
CREATE TABLE "promociones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "PromocionTipo" NOT NULL,
    "condiciones" JSONB NOT NULL DEFAULT '{}',
    "acciones" JSONB NOT NULL DEFAULT '{}',
    "vigencia_inicio" TIMESTAMP(3) NOT NULL,
    "vigencia_fin" TIMESTAMP(3),
    "horarios" JSONB,
    "canales" JSONB NOT NULL DEFAULT '["todos"]',
    "sucursales_aplicables" JSONB NOT NULL DEFAULT '[]',
    "stack_con_otras" BOOLEAN NOT NULL DEFAULT false,
    "prioridad" INTEGER NOT NULL DEFAULT 100,
    "limite_usos_total" INTEGER,
    "limite_usos_cliente" INTEGER,
    "usos_actuales" INTEGER NOT NULL DEFAULT 0,
    "requiere_codigo" BOOLEAN NOT NULL DEFAULT false,
    "codigo" TEXT,
    "visible_publico" BOOLEAN NOT NULL DEFAULT true,
    "banner_url" TEXT,
    "status" "PromocionStatus" NOT NULL DEFAULT 'draft',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promociones_productos" (
    "id" TEXT NOT NULL,
    "promocion_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "rol" "PromocionProductoRol" NOT NULL DEFAULT 'incluido',

    CONSTRAINT "promociones_productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promociones_aplicaciones" (
    "id" TEXT NOT NULL,
    "promocion_id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "monto_descuento" DECIMAL(14,4) NOT NULL,
    "productos_afectados" JSONB NOT NULL DEFAULT '[]',
    "revocada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promociones_aplicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmentos_clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "SegmentoTipo" NOT NULL DEFAULT 'dinamico_rfm',
    "definicion" JSONB NOT NULL DEFAULT '{}',
    "count_clientes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segmentos_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmentos_clientes_miembros" (
    "id" TEXT NOT NULL,
    "segmento_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "snapshot_metricas" JSONB,
    "agregado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segmentos_clientes_miembros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_metricas_rfm" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "recency_dias" INTEGER,
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "monetary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "score_r" INTEGER,
    "score_f" INTEGER,
    "score_m" INTEGER,
    "segmento_rfm_calculado" "SegmentoRfm",
    "ultima_compra_at" TIMESTAMP(3),
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_metricas_rfm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_mensajes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "canal" "PlantillaCanal" NOT NULL,
    "tipo" "PlantillaTipo" NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es-MX',
    "asunto" TEXT,
    "contenido_handlebars" TEXT NOT NULL,
    "variables_disponibles" JSONB NOT NULL DEFAULT '[]',
    "aprobacion_meta_status" TEXT NOT NULL DEFAULT 'no_aplica',
    "meta_template_id" TEXT,
    "scope" "PlantillaScope" NOT NULL DEFAULT 'tenant_propia',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "canal" "CampanaCanal" NOT NULL,
    "segmento_id" TEXT,
    "plantilla_id" TEXT,
    "variables_dinamicas" JSONB NOT NULL DEFAULT '{}',
    "tipo_disparo" "CampanaTipoDisparo" NOT NULL DEFAULT 'inmediato',
    "trigger_event_config" JSONB,
    "recurrente_cron" TEXT,
    "ventana_horario_envio" JSONB NOT NULL DEFAULT '{"desde":"09:00","hasta":"21:00"}',
    "status" "CampanaStatus" NOT NULL DEFAULT 'draft',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "presupuesto_max_creditos" DECIMAL(14,2) NOT NULL DEFAULT 500,
    "creditos_consumidos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "programada_para" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanas_envios" (
    "id" TEXT NOT NULL,
    "campana_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "destino" TEXT NOT NULL,
    "canal" "CampanaCanal" NOT NULL,
    "status" "CampanaEnvioStatus" NOT NULL DEFAULT 'pendiente',
    "proveedor_msg_id" TEXT,
    "creditos" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "error_mensaje" TEXT,
    "enviado_at" TIMESTAMP(3),
    "entregado_at" TIMESTAMP(3),
    "abierto_at" TIMESTAMP(3),
    "click_at" TIMESTAMP(3),
    "convertido_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanas_envios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanas_triggers" (
    "id" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "campana_id" TEXT NOT NULL,
    "ventana_envio" JSONB,
    "frecuencia_max_por_cliente_30d" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanas_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_opt_outs" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "canal" "CampanaCanal" NOT NULL,
    "tipo" "OptOutTipo" NOT NULL DEFAULT 'promocional',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "LoyaltyTipo" NOT NULL DEFAULT 'puntos_por_peso',
    "regla_acumulacion" JSONB NOT NULL DEFAULT '{}',
    "valor_punto_redimible" DECIMAL(10,4) NOT NULL DEFAULT 0.1,
    "caducidad_puntos_meses" INTEGER NOT NULL DEFAULT 12,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "inscripcion_automatica" BOOLEAN NOT NULL DEFAULT false,
    "requiere_consentimiento" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_loyalty" (
    "id" TEXT NOT NULL,
    "loyalty_program_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "puntos_actuales" INTEGER NOT NULL DEFAULT 0,
    "lifetime_acumulado" INTEGER NOT NULL DEFAULT 0,
    "lifetime_canjeado" INTEGER NOT NULL DEFAULT 0,
    "tier_actual" TEXT,
    "fecha_alcanzo_tier" TIMESTAMP(3),
    "consentimiento_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_loyalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_movimientos" (
    "id" TEXT NOT NULL,
    "loyalty_program_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" "LoyaltyMovimientoTipo" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "saldo_resultante" INTEGER NOT NULL,
    "origen_venta_id" TEXT,
    "origen_campana_id" TEXT,
    "origen_admin_id" TEXT,
    "caduca_at" TIMESTAMP(3),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promociones_status_vigencia_inicio_idx" ON "promociones"("status", "vigencia_inicio");

-- CreateIndex
CREATE INDEX "promociones_prioridad_idx" ON "promociones"("prioridad");

-- CreateIndex
CREATE UNIQUE INDEX "promociones_codigo_key" ON "promociones"("codigo");

-- CreateIndex
CREATE INDEX "promociones_productos_producto_id_idx" ON "promociones_productos"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "promociones_productos_promocion_id_producto_id_rol_key" ON "promociones_productos"("promocion_id", "producto_id", "rol");

-- CreateIndex
CREATE INDEX "promociones_aplicaciones_promocion_id_idx" ON "promociones_aplicaciones"("promocion_id");

-- CreateIndex
CREATE INDEX "promociones_aplicaciones_venta_id_idx" ON "promociones_aplicaciones"("venta_id");

-- CreateIndex
CREATE INDEX "segmentos_clientes_tipo_idx" ON "segmentos_clientes"("tipo");

-- CreateIndex
CREATE INDEX "segmentos_clientes_miembros_cliente_id_idx" ON "segmentos_clientes_miembros"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "segmentos_clientes_miembros_segmento_id_cliente_id_key" ON "segmentos_clientes_miembros"("segmento_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_metricas_rfm_cliente_id_key" ON "clientes_metricas_rfm"("cliente_id");

-- CreateIndex
CREATE INDEX "clientes_metricas_rfm_segmento_rfm_calculado_idx" ON "clientes_metricas_rfm"("segmento_rfm_calculado");

-- CreateIndex
CREATE INDEX "plantillas_mensajes_canal_tipo_idx" ON "plantillas_mensajes"("canal", "tipo");

-- CreateIndex
CREATE INDEX "campanas_status_tipo_disparo_idx" ON "campanas"("status", "tipo_disparo");

-- CreateIndex
CREATE INDEX "campanas_envios_campana_id_status_idx" ON "campanas_envios"("campana_id", "status");

-- CreateIndex
CREATE INDEX "campanas_envios_cliente_id_created_at_idx" ON "campanas_envios"("cliente_id", "created_at");

-- CreateIndex
CREATE INDEX "campanas_envios_status_idx" ON "campanas_envios"("status");

-- CreateIndex
CREATE INDEX "campanas_triggers_evento_is_active_idx" ON "campanas_triggers"("evento", "is_active");

-- CreateIndex
CREATE INDEX "clientes_opt_outs_cliente_id_idx" ON "clientes_opt_outs"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_opt_outs_cliente_id_canal_tipo_key" ON "clientes_opt_outs"("cliente_id", "canal", "tipo");

-- CreateIndex
CREATE INDEX "clientes_loyalty_cliente_id_idx" ON "clientes_loyalty"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_loyalty_loyalty_program_id_cliente_id_key" ON "clientes_loyalty"("loyalty_program_id", "cliente_id");

-- CreateIndex
CREATE INDEX "loyalty_movimientos_cliente_id_created_at_idx" ON "loyalty_movimientos"("cliente_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_movimientos_caduca_at_idx" ON "loyalty_movimientos"("caduca_at");

-- AddForeignKey
ALTER TABLE "promociones_productos" ADD CONSTRAINT "promociones_productos_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones_productos" ADD CONSTRAINT "promociones_productos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones_aplicaciones" ADD CONSTRAINT "promociones_aplicaciones_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones_aplicaciones" ADD CONSTRAINT "promociones_aplicaciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentos_clientes_miembros" ADD CONSTRAINT "segmentos_clientes_miembros_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmentos_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentos_clientes_miembros" ADD CONSTRAINT "segmentos_clientes_miembros_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_metricas_rfm" ADD CONSTRAINT "clientes_metricas_rfm_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmentos_clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_mensajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanas_envios" ADD CONSTRAINT "campanas_envios_campana_id_fkey" FOREIGN KEY ("campana_id") REFERENCES "campanas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanas_envios" ADD CONSTRAINT "campanas_envios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanas_triggers" ADD CONSTRAINT "campanas_triggers_campana_id_fkey" FOREIGN KEY ("campana_id") REFERENCES "campanas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_opt_outs" ADD CONSTRAINT "clientes_opt_outs_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_loyalty" ADD CONSTRAINT "clientes_loyalty_loyalty_program_id_fkey" FOREIGN KEY ("loyalty_program_id") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_loyalty" ADD CONSTRAINT "clientes_loyalty_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movimientos" ADD CONSTRAINT "loyalty_movimientos_loyalty_program_id_fkey" FOREIGN KEY ("loyalty_program_id") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
