-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pendiente', 'confirmada', 'rechazada', 'cancelada', 'completada');

-- CreateEnum
CREATE TYPE "BookingModalidad" AS ENUM ('presencial', 'telemedicina');

-- CreateTable
CREATE TABLE "public_bookings" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "location_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "medico_id_local" TEXT,
    "paciente_master_id" TEXT NOT NULL,
    "paciente_nombre" TEXT NOT NULL,
    "paciente_telefono" TEXT,
    "paciente_email" TEXT,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "modalidad" "BookingModalidad" NOT NULL DEFAULT 'presencial',
    "motivo" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'pendiente',
    "cita_id_local" TEXT,
    "confirmada_at" TIMESTAMP(3),
    "rechazada_at" TIMESTAMP(3),
    "motivo_rechazo" TEXT,
    "cancelada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_bookings_tenant_id_status_idx" ON "public_bookings"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "public_bookings_professional_id_fecha_hora_idx" ON "public_bookings"("professional_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "public_bookings_paciente_master_id_idx" ON "public_bookings"("paciente_master_id");

-- AddForeignKey
ALTER TABLE "public_bookings" ADD CONSTRAINT "public_bookings_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public_professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_bookings" ADD CONSTRAINT "public_bookings_paciente_master_id_fkey" FOREIGN KEY ("paciente_master_id") REFERENCES "pacientes_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
