-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "confirmacion_token" TEXT,
ADD COLUMN     "recordatorio_canal" TEXT,
ADD COLUMN     "recordatorio_enviado_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "config_recordatorios" (
    "id" TEXT NOT NULL,
    "citas_activo" BOOLEAN NOT NULL DEFAULT true,
    "citas_horas_antes" INTEGER NOT NULL DEFAULT 24,
    "citas_canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "citas_plantilla" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_recordatorios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "citas_confirmacion_token_key" ON "citas"("confirmacion_token");
