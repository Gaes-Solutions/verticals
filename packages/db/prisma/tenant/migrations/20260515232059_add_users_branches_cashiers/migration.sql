-- CreateEnum
CREATE TYPE "SucursalTipo" AS ENUM ('tienda_fisica', 'bodega', 'consultorio', 'kiosko', 'oficina');

-- CreateEnum
CREATE TYPE "CajaTipo" AS ENUM ('fija', 'movil_tablet', 'movil_celular');

-- CreateEnum
CREATE TYPE "UsuarioTipo" AS ENUM ('empleado', 'vendedor_externo', 'medico', 'enfermera', 'recepcion', 'almacen', 'contador_interno');

-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" JSONB,
    "telefono" TEXT,
    "email_contacto" TEXT,
    "horario" JSONB,
    "tipo" "SucursalTipo" NOT NULL DEFAULT 'tienda_fisica',
    "vertical_principal" TEXT,
    "is_visible_publico" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "CajaTipo" NOT NULL DEFAULT 'fija',
    "impresora_default" TEXT,
    "lector_barras_default" TEXT,
    "balanza_default" TEXT,
    "terminal_pago_default" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "codigo_escaneo" TEXT,
    "qr_code_url" TEXT,
    "foto_url" TEXT,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "telefono" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "tipo_usuario" "UsuarioTipo" NOT NULL DEFAULT 'empleado',
    "language_preferred" TEXT NOT NULL DEFAULT 'es-MX',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "last_login_sucursal_id" TEXT,
    "terminated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_sucursales" (
    "usuario_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_sucursales_pkey" PRIMARY KEY ("usuario_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "is_preset" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permisos" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_roles" (
    "usuario_id" TEXT NOT NULL,
    "rol_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_user_id" TEXT,

    CONSTRAINT "usuario_roles_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "usuario_vistas_guardadas" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "filtros" JSONB NOT NULL DEFAULT '{}',
    "ordenamiento" JSONB NOT NULL DEFAULT '{}',
    "columnas_visibles" JSONB NOT NULL DEFAULT '[]',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "es_compartida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_vistas_guardadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_codigo_key" ON "sucursales"("codigo");

-- CreateIndex
CREATE INDEX "sucursales_is_active_idx" ON "sucursales"("is_active");

-- CreateIndex
CREATE INDEX "cajas_sucursal_id_is_active_idx" ON "cajas"("sucursal_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cajas_sucursal_id_codigo_key" ON "cajas"("sucursal_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigo_escaneo_key" ON "usuarios"("codigo_escaneo");

-- CreateIndex
CREATE INDEX "usuarios_is_active_idx" ON "usuarios"("is_active");

-- CreateIndex
CREATE INDEX "usuarios_tipo_usuario_idx" ON "usuarios"("tipo_usuario");

-- CreateIndex
CREATE INDEX "usuario_sucursales_sucursal_id_idx" ON "usuario_sucursales"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE INDEX "roles_is_active_idx" ON "roles"("is_active");

-- CreateIndex
CREATE INDEX "usuario_roles_rol_id_idx" ON "usuario_roles"("rol_id");

-- CreateIndex
CREATE INDEX "usuario_vistas_guardadas_usuario_id_recurso_idx" ON "usuario_vistas_guardadas"("usuario_id", "recurso");

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_last_login_sucursal_id_fkey" FOREIGN KEY ("last_login_sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursales" ADD CONSTRAINT "usuario_sucursales_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursales" ADD CONSTRAINT "usuario_sucursales_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_vistas_guardadas" ADD CONSTRAINT "usuario_vistas_guardadas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
