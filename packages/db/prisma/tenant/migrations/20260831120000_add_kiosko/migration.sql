-- CreateEnum
CREATE TYPE "KioskoContenido" AS ENUM ('promociones', 'destacados', 'ambos');

-- CreateTable
CREATE TABLE "kiosko_devices" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_visto" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosko_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosko_config" (
    "id" TEXT NOT NULL,
    "reposo_segundos" INTEGER NOT NULL DEFAULT 20,
    "precio_segundos" INTEGER NOT NULL DEFAULT 8,
    "contenido_reposo" "KioskoContenido" NOT NULL DEFAULT 'ambos',
    "slide_segundos" INTEGER NOT NULL DEFAULT 6,
    "mostrar_existencia" BOOLEAN NOT NULL DEFAULT false,
    "sonido_beep" BOOLEAN NOT NULL DEFAULT true,
    "mensaje_bienvenida" TEXT NOT NULL DEFAULT 'Escanea tu producto',
    "color_acento" TEXT NOT NULL DEFAULT '#0f766e',
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosko_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosko_devices_token_hash_key" ON "kiosko_devices"("token_hash");

-- CreateIndex
CREATE INDEX "kiosko_devices_sucursal_id_idx" ON "kiosko_devices"("sucursal_id");

-- AddForeignKey
ALTER TABLE "kiosko_devices" ADD CONSTRAINT "kiosko_devices_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

