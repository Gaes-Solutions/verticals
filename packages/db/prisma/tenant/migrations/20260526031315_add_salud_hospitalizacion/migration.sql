-- CreateEnum
CREATE TYPE "CamaTipo" AS ENUM ('general', 'cuidados_intensivos', 'aislamiento', 'cirugia_recuperacion', 'pediatria');

-- CreateEnum
CREATE TYPE "CamaEstado" AS ENUM ('libre', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_de_servicio');

-- CreateEnum
CREATE TYPE "HospitalizacionEstado" AS ENUM ('activa', 'alta', 'fallecimiento', 'fuga', 'traslado_externo');

-- CreateEnum
CREATE TYPE "MedicacionProgramadaEstado" AS ENUM ('activa', 'suspendida', 'completada');

-- CreateEnum
CREATE TYPE "KardexAplicacionEstado" AS ENUM ('pendiente', 'aplicada', 'omitida', 'reprogramada');

-- CreateEnum
CREATE TYPE "CargoHospitalTipo" AS ENUM ('estancia_diaria', 'medicamento', 'procedimiento', 'laboratorio', 'imagenologia', 'consumible', 'honorarios_medicos', 'otro');

-- CreateTable
CREATE TABLE "camas" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT,
    "tipo" "CamaTipo" NOT NULL DEFAULT 'general',
    "estado" "CamaEstado" NOT NULL DEFAULT 'libre',
    "tarifa_por_noche" DECIMAL(14,2),
    "notas" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitalizaciones" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "cama_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "mascota_id" TEXT,
    "medico_responsable_id" TEXT NOT NULL,
    "diagnostico_ingreso_id" TEXT,
    "diagnostico_ingreso_texto" TEXT,
    "motivo_ingreso" TEXT NOT NULL,
    "notas_ingreso" TEXT,
    "fecha_ingreso" TIMESTAMP(3) NOT NULL,
    "fecha_egreso" TIMESTAMP(3),
    "motivo_egreso" TEXT,
    "alta_por_id" TEXT,
    "observaciones_alta" TEXT,
    "venta_al_alta_id" TEXT,
    "estado" "HospitalizacionEstado" NOT NULL DEFAULT 'activa',
    "tarifa_estancia_diaria" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitalizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitalizacion_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_folio" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitalizacion_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateTable
CREATE TABLE "medicaciones_programadas" (
    "id" TEXT NOT NULL,
    "hospitalizacion_id" TEXT NOT NULL,
    "medicamento_catalogo_id" TEXT NOT NULL,
    "medicamento_nombre_snapshot" TEXT NOT NULL,
    "dosis" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "frecuencia_horas" INTEGER NOT NULL,
    "hora_inicio" TIMESTAMP(3) NOT NULL,
    "duracion_dias" INTEGER NOT NULL,
    "indicacion_medica" TEXT NOT NULL,
    "receta_id" TEXT,
    "estado" "MedicacionProgramadaEstado" NOT NULL DEFAULT 'activa',
    "suspendida_at" TIMESTAMP(3),
    "motivo_suspension" TEXT,
    "prescrita_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicaciones_programadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kardex_aplicaciones" (
    "id" TEXT NOT NULL,
    "medicacion_programada_id" TEXT NOT NULL,
    "hora_programada" TIMESTAMP(3) NOT NULL,
    "hora_aplicada" TIMESTAMP(3),
    "enfermera_aplicador_id" TEXT,
    "estado" "KardexAplicacionEstado" NOT NULL DEFAULT 'pendiente',
    "motivo_omision" TEXT,
    "notas" TEXT,
    "reaccion_adversa_observada" TEXT,
    "alerta_enviada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kardex_aplicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signos_vitales_hospital" (
    "id" TEXT NOT NULL,
    "hospitalizacion_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "mascota_id" TEXT,
    "capturado_por_id" TEXT NOT NULL,
    "hora" TIMESTAMP(3) NOT NULL,
    "temperatura_c" DECIMAL(4,2),
    "frecuencia_cardiaca" INTEGER,
    "frecuencia_respiratoria" INTEGER,
    "saturacion_o2" INTEGER,
    "presion_sistolica" INTEGER,
    "presion_diastolica" INTEGER,
    "glucosa" DECIMAL(6,2),
    "dolor_escala" INTEGER,
    "tiempo_llenado_capilar_seg" DECIMAL(4,2),
    "mucosas_color" TEXT,
    "observaciones" TEXT,
    "alertas_marcadas" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signos_vitales_hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos_hospital" (
    "id" TEXT NOT NULL,
    "hospitalizacion_id" TEXT NOT NULL,
    "tipo" "CargoHospitalTipo" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "producto_id" TEXT,
    "facturado_en_venta_id" TEXT,
    "facturado_at" TIMESTAMP(3),
    "capturado_por_id" TEXT NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargos_hospital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "camas_sucursal_id_estado_idx" ON "camas"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "camas_tipo_idx" ON "camas"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "camas_sucursal_id_codigo_key" ON "camas"("sucursal_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "hospitalizaciones_venta_al_alta_id_key" ON "hospitalizaciones"("venta_al_alta_id");

-- CreateIndex
CREATE INDEX "hospitalizaciones_estado_fecha_ingreso_idx" ON "hospitalizaciones"("estado", "fecha_ingreso");

-- CreateIndex
CREATE INDEX "hospitalizaciones_paciente_id_idx" ON "hospitalizaciones"("paciente_id");

-- CreateIndex
CREATE INDEX "hospitalizaciones_mascota_id_idx" ON "hospitalizaciones"("mascota_id");

-- CreateIndex
CREATE INDEX "hospitalizaciones_cama_id_idx" ON "hospitalizaciones"("cama_id");

-- CreateIndex
CREATE INDEX "hospitalizaciones_medico_responsable_id_idx" ON "hospitalizaciones"("medico_responsable_id");

-- CreateIndex
CREATE UNIQUE INDEX "hospitalizaciones_sucursal_id_folio_key" ON "hospitalizaciones"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "medicaciones_programadas_hospitalizacion_id_estado_idx" ON "medicaciones_programadas"("hospitalizacion_id", "estado");

-- CreateIndex
CREATE INDEX "medicaciones_programadas_medicamento_catalogo_id_idx" ON "medicaciones_programadas"("medicamento_catalogo_id");

-- CreateIndex
CREATE INDEX "kardex_aplicaciones_medicacion_programada_id_hora_programad_idx" ON "kardex_aplicaciones"("medicacion_programada_id", "hora_programada");

-- CreateIndex
CREATE INDEX "kardex_aplicaciones_estado_hora_programada_idx" ON "kardex_aplicaciones"("estado", "hora_programada");

-- CreateIndex
CREATE INDEX "kardex_aplicaciones_alerta_enviada_at_idx" ON "kardex_aplicaciones"("alerta_enviada_at");

-- CreateIndex
CREATE INDEX "signos_vitales_hospital_hospitalizacion_id_hora_idx" ON "signos_vitales_hospital"("hospitalizacion_id", "hora");

-- CreateIndex
CREATE INDEX "cargos_hospital_hospitalizacion_id_tipo_idx" ON "cargos_hospital"("hospitalizacion_id", "tipo");

-- CreateIndex
CREATE INDEX "cargos_hospital_facturado_en_venta_id_idx" ON "cargos_hospital"("facturado_en_venta_id");

-- AddForeignKey
ALTER TABLE "camas" ADD CONSTRAINT "camas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_cama_id_fkey" FOREIGN KEY ("cama_id") REFERENCES "camas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_medico_responsable_id_fkey" FOREIGN KEY ("medico_responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_diagnostico_ingreso_id_fkey" FOREIGN KEY ("diagnostico_ingreso_id") REFERENCES "diagnosticos_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_alta_por_id_fkey" FOREIGN KEY ("alta_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizaciones" ADD CONSTRAINT "hospitalizaciones_venta_al_alta_id_fkey" FOREIGN KEY ("venta_al_alta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizacion_folio_counters" ADD CONSTRAINT "hospitalizacion_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicaciones_programadas" ADD CONSTRAINT "medicaciones_programadas_hospitalizacion_id_fkey" FOREIGN KEY ("hospitalizacion_id") REFERENCES "hospitalizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicaciones_programadas" ADD CONSTRAINT "medicaciones_programadas_medicamento_catalogo_id_fkey" FOREIGN KEY ("medicamento_catalogo_id") REFERENCES "medicamentos_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicaciones_programadas" ADD CONSTRAINT "medicaciones_programadas_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicaciones_programadas" ADD CONSTRAINT "medicaciones_programadas_prescrita_por_id_fkey" FOREIGN KEY ("prescrita_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_aplicaciones" ADD CONSTRAINT "kardex_aplicaciones_medicacion_programada_id_fkey" FOREIGN KEY ("medicacion_programada_id") REFERENCES "medicaciones_programadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_aplicaciones" ADD CONSTRAINT "kardex_aplicaciones_enfermera_aplicador_id_fkey" FOREIGN KEY ("enfermera_aplicador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signos_vitales_hospital" ADD CONSTRAINT "signos_vitales_hospital_hospitalizacion_id_fkey" FOREIGN KEY ("hospitalizacion_id") REFERENCES "hospitalizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signos_vitales_hospital" ADD CONSTRAINT "signos_vitales_hospital_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signos_vitales_hospital" ADD CONSTRAINT "signos_vitales_hospital_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signos_vitales_hospital" ADD CONSTRAINT "signos_vitales_hospital_capturado_por_id_fkey" FOREIGN KEY ("capturado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_hospital" ADD CONSTRAINT "cargos_hospital_hospitalizacion_id_fkey" FOREIGN KEY ("hospitalizacion_id") REFERENCES "hospitalizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_hospital" ADD CONSTRAINT "cargos_hospital_facturado_en_venta_id_fkey" FOREIGN KEY ("facturado_en_venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_hospital" ADD CONSTRAINT "cargos_hospital_capturado_por_id_fkey" FOREIGN KEY ("capturado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
