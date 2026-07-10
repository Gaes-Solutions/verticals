-- CreateTable
CREATE TABLE "estudios_imagen" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "mascota_id" TEXT,
    "medico_solicitante_id" TEXT NOT NULL,
    "consulta_id" TEXT,
    "modalidad" TEXT NOT NULL,
    "region" TEXT,
    "nombre_estudio" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL DEFAULT 'rutina',
    "notas_clinicas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'solicitado',
    "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resultado" TIMESTAMP(3),
    "hallazgos" TEXT,
    "impresion_diagnostica" TEXT,
    "imagenes" JSONB NOT NULL DEFAULT '[]',
    "cargado_por_id" TEXT,
    "cancelado_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estudios_imagen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estudios_imagen_folio_key" ON "estudios_imagen"("folio");
CREATE INDEX "estudios_imagen_mascota_id_idx" ON "estudios_imagen"("mascota_id");
CREATE INDEX "estudios_imagen_paciente_id_idx" ON "estudios_imagen"("paciente_id");
CREATE INDEX "estudios_imagen_estado_idx" ON "estudios_imagen"("estado");
