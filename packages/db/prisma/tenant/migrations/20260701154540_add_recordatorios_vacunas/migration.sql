-- AlterTable
ALTER TABLE "config_recordatorios" ADD COLUMN     "vacunas_activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vacunas_canal" TEXT NOT NULL DEFAULT 'whatsapp',
ADD COLUMN     "vacunas_dias_antes" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "vacunas_plantilla" TEXT;

-- AlterTable
ALTER TABLE "vacunaciones" ADD COLUMN     "recordatorio_proxima_enviado_at" TIMESTAMP(3);
