-- CreateEnum
CREATE TYPE "ClienteTipo" AS ENUM ('publico_general', 'frecuente', 'vip', 'empleado');

-- CreateEnum
CREATE TYPE "FiadoEstado" AS ENUM ('activo', 'liquidado', 'incobrable');

-- CreateEnum
CREATE TYPE "FiadoMovimientoTipo" AS ENUM ('cargo_venta', 'abono_pago', 'ajuste_positivo', 'ajuste_negativo', 'regularizacion_cxc');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tipo" "ClienteTipo" NOT NULL DEFAULT 'frecuente',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "email_principal" TEXT,
    "telefono_principal" TEXT,
    "fecha_nacimiento" DATE,
    "genero" TEXT,
    "rfc" TEXT,
    "regimen_fiscal_sat" TEXT,
    "uso_cfdi_default" TEXT,
    "codigo_postal_fiscal" TEXT,
    "direccion_facturacion" JSONB,
    "cliente_grupo_id" TEXT,
    "vendedor_asignado_id" TEXT,
    "permite_fiado" BOOLEAN NOT NULL DEFAULT false,
    "limite_fiado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "acepta_marketing" BOOLEAN NOT NULL DEFAULT false,
    "idioma_preferido" TEXT NOT NULL DEFAULT 'es-MX',
    "notas" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_direcciones" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numero_exterior" TEXT,
    "numero_interior" TEXT,
    "colonia" TEXT,
    "municipio" TEXT,
    "estado" TEXT,
    "codigo_postal" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'MX',
    "referencias" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "is_default_envio" BOOLEAN NOT NULL DEFAULT false,
    "is_default_facturacion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_direcciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_telefonos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_telefonos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_grupos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "descuento_default_pct" DECIMAL(5,2),
    "lista_precio_codigo" TEXT,
    "color" TEXT,
    "icono" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_etiquetas" (
    "cliente_id" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_etiquetas_pkey" PRIMARY KEY ("cliente_id","etiqueta")
);

-- CreateTable
CREATE TABLE "fiados" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "monto_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fecha_ultimo_movimiento" TIMESTAMP(3),
    "estado" "FiadoEstado" NOT NULL DEFAULT 'activo',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiado_movimientos" (
    "id" TEXT NOT NULL,
    "fiado_id" TEXT NOT NULL,
    "tipo" "FiadoMovimientoTipo" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "venta_id" TEXT,
    "referencia_tipo" TEXT,
    "referencia_id" TEXT,
    "metodo_pago" TEXT,
    "comprobante_url" TEXT,
    "motivo" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiado_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_nombre_idx" ON "clientes"("nombre");

-- CreateIndex
CREATE INDEX "clientes_telefono_principal_idx" ON "clientes"("telefono_principal");

-- CreateIndex
CREATE INDEX "clientes_email_principal_idx" ON "clientes"("email_principal");

-- CreateIndex
CREATE INDEX "clientes_is_active_idx" ON "clientes"("is_active");

-- CreateIndex
CREATE INDEX "clientes_cliente_grupo_id_idx" ON "clientes"("cliente_grupo_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_rfc_key" ON "clientes"("rfc");

-- CreateIndex
CREATE INDEX "cliente_direcciones_cliente_id_idx" ON "cliente_direcciones"("cliente_id");

-- CreateIndex
CREATE INDEX "cliente_telefonos_cliente_id_idx" ON "cliente_telefonos"("cliente_id");

-- CreateIndex
CREATE INDEX "cliente_telefonos_telefono_idx" ON "cliente_telefonos"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_grupos_codigo_key" ON "cliente_grupos"("codigo");

-- CreateIndex
CREATE INDEX "cliente_etiquetas_etiqueta_idx" ON "cliente_etiquetas"("etiqueta");

-- CreateIndex
CREATE UNIQUE INDEX "fiados_cliente_id_key" ON "fiados"("cliente_id");

-- CreateIndex
CREATE INDEX "fiados_estado_idx" ON "fiados"("estado");

-- CreateIndex
CREATE INDEX "fiado_movimientos_fiado_id_created_at_idx" ON "fiado_movimientos"("fiado_id", "created_at");

-- CreateIndex
CREATE INDEX "fiado_movimientos_venta_id_idx" ON "fiado_movimientos"("venta_id");

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_cliente_grupo_id_fkey" FOREIGN KEY ("cliente_grupo_id") REFERENCES "cliente_grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_asignado_id_fkey" FOREIGN KEY ("vendedor_asignado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_direcciones" ADD CONSTRAINT "cliente_direcciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_telefonos" ADD CONSTRAINT "cliente_telefonos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_etiquetas" ADD CONSTRAINT "cliente_etiquetas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiados" ADD CONSTRAINT "fiados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_fiado_id_fkey" FOREIGN KEY ("fiado_id") REFERENCES "fiados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
