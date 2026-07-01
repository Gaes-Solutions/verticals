-- AlterTable
ALTER TABLE "pacientes_master" ADD COLUMN     "otp_codigo" TEXT,
ADD COLUMN     "otp_expira_at" TIMESTAMP(3);
