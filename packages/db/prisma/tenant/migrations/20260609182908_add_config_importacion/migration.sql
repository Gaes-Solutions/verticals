-- CreateTable
CREATE TABLE "config_importacion_productos" (
    "id" TEXT NOT NULL,
    "columnas_activas" JSONB NOT NULL DEFAULT '[]',
    "columnas_obligatorias" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_importacion_productos_pkey" PRIMARY KEY ("id")
);
