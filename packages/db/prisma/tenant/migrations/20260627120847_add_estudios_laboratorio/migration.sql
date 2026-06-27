-- CreateTable
CREATE TABLE "estudios_laboratorio" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "mascota_id" TEXT,
    "medico_solicitante_id" TEXT NOT NULL,
    "consulta_id" TEXT,
    "tipo_estudio" TEXT NOT NULL,
    "nombre_estudio" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL DEFAULT 'rutina',
    "notas_clinicas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'solicitado',
    "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resultado" TIMESTAMP(3),
    "resultado_resumen" TEXT,
    "resultado_archivo_url" TEXT,
    "resultados" JSONB NOT NULL DEFAULT '[]',
    "cargado_por_id" TEXT,
    "cancelado_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estudios_laboratorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estudios_laboratorio_folio_key" ON "estudios_laboratorio"("folio");
CREATE INDEX "estudios_laboratorio_mascota_id_idx" ON "estudios_laboratorio"("mascota_id");
CREATE INDEX "estudios_laboratorio_paciente_id_idx" ON "estudios_laboratorio"("paciente_id");
CREATE INDEX "estudios_laboratorio_estado_idx" ON "estudios_laboratorio"("estado");
