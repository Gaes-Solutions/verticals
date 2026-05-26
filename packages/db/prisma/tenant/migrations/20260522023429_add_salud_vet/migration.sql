-- CreateEnum
CREATE TYPE "MascotaEspecie" AS ENUM ('perro', 'gato', 'ave', 'conejo', 'huron', 'reptil', 'pez', 'roedor', 'otro');

-- CreateEnum
CREATE TYPE "MascotaSexo" AS ENUM ('macho', 'hembra', 'desconocido');

-- CreateEnum
CREATE TYPE "CartillaTipo" AS ENUM ('humano_basico_ssa', 'humano_complementario', 'vet_perro', 'vet_gato', 'vet_otro');

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "mascota_id" TEXT,
ALTER COLUMN "paciente_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "consulta_signos_vitales" ADD COLUMN     "mascota_id" TEXT,
ADD COLUMN     "mucosas_color" TEXT,
ADD COLUMN     "tiempo_llenado_capilar_seg" DECIMAL(4,1),
ALTER COLUMN "paciente_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "consultas" ADD COLUMN     "mascota_id" TEXT,
ALTER COLUMN "paciente_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "recetas" ADD COLUMN     "mascota_id" TEXT,
ALTER COLUMN "paciente_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "mascotas" (
    "id" TEXT NOT NULL,
    "numero_expediente" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "especie" "MascotaEspecie" NOT NULL,
    "raza" TEXT,
    "sexo" "MascotaSexo" NOT NULL DEFAULT 'desconocido',
    "es_esterilizado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_nacimiento" TIMESTAMP(3),
    "fecha_nacimiento_aproximada" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "microchip" TEXT,
    "peso_actual_kg" DECIMAL(6,2),
    "foto_url" TEXT,
    "tutor_cliente_id" TEXT,
    "medico_asignado_id" TEXT,
    "alergias" JSONB NOT NULL DEFAULT '[]',
    "antecedentes_patologicos" JSONB NOT NULL DEFAULT '[]',
    "medicamentos_cronicos" JSONB NOT NULL DEFAULT '[]',
    "etiquetas" JSONB NOT NULL DEFAULT '[]',
    "notas_internas" TEXT,
    "alertas_personalizadas" JSONB NOT NULL DEFAULT '[]',
    "fecha_primera_visita" TIMESTAMP(3),
    "fecha_defuncion" TIMESTAMP(3),
    "causa_defuncion" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mascotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacunas_catalogo" (
    "id" TEXT NOT NULL,
    "nombre_comercial" TEXT NOT NULL,
    "principio_activo" TEXT,
    "tipo" TEXT,
    "aplica_humano" BOOLEAN NOT NULL DEFAULT false,
    "aplica_vet" BOOLEAN NOT NULL DEFAULT false,
    "especies_aplicables" JSONB NOT NULL DEFAULT '[]',
    "esquema_default_humano" JSONB,
    "esquema_default_vet" JSONB,
    "via_aplicacion" TEXT,
    "intervalo_refuerzos_dias" INTEGER,
    "is_obligatoria_cartilla_nacional" BOOLEAN NOT NULL DEFAULT false,
    "precio_referencia" DECIMAL(14,2),
    "is_precargado_global" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacunas_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacunaciones" (
    "id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "mascota_id" TEXT,
    "vacuna_catalogo_id" TEXT NOT NULL,
    "medico_aplicador_id" TEXT NOT NULL,
    "fecha_aplicacion" TIMESTAMP(3) NOT NULL,
    "numero_lote" TEXT NOT NULL,
    "caducidad_lote" TIMESTAMP(3) NOT NULL,
    "marca_snapshot" TEXT,
    "via_administracion" TEXT,
    "dosis_aplicada" TEXT,
    "reaccion_adversa_observada" TEXT,
    "proxima_aplicacion_fecha" TIMESTAMP(3),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacunaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mascotas_nombre_idx" ON "mascotas"("nombre");

-- CreateIndex
CREATE INDEX "mascotas_microchip_idx" ON "mascotas"("microchip");

-- CreateIndex
CREATE INDEX "mascotas_tutor_cliente_id_idx" ON "mascotas"("tutor_cliente_id");

-- CreateIndex
CREATE INDEX "mascotas_medico_asignado_id_idx" ON "mascotas"("medico_asignado_id");

-- CreateIndex
CREATE INDEX "mascotas_especie_idx" ON "mascotas"("especie");

-- CreateIndex
CREATE INDEX "mascotas_is_active_idx" ON "mascotas"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "mascotas_numero_expediente_key" ON "mascotas"("numero_expediente");

-- CreateIndex
CREATE INDEX "vacunas_catalogo_aplica_humano_idx" ON "vacunas_catalogo"("aplica_humano");

-- CreateIndex
CREATE INDEX "vacunas_catalogo_aplica_vet_idx" ON "vacunas_catalogo"("aplica_vet");

-- CreateIndex
CREATE INDEX "vacunas_catalogo_nombre_comercial_idx" ON "vacunas_catalogo"("nombre_comercial");

-- CreateIndex
CREATE INDEX "vacunaciones_paciente_id_fecha_aplicacion_idx" ON "vacunaciones"("paciente_id", "fecha_aplicacion");

-- CreateIndex
CREATE INDEX "vacunaciones_mascota_id_fecha_aplicacion_idx" ON "vacunaciones"("mascota_id", "fecha_aplicacion");

-- CreateIndex
CREATE INDEX "vacunaciones_numero_lote_idx" ON "vacunaciones"("numero_lote");

-- CreateIndex
CREATE INDEX "vacunaciones_proxima_aplicacion_fecha_idx" ON "vacunaciones"("proxima_aplicacion_fecha");

-- CreateIndex
CREATE INDEX "citas_mascota_id_fecha_programada_idx" ON "citas"("mascota_id", "fecha_programada");

-- CreateIndex
CREATE INDEX "consulta_signos_vitales_mascota_id_momento_idx" ON "consulta_signos_vitales"("mascota_id", "momento");

-- CreateIndex
CREATE INDEX "consultas_mascota_id_fecha_consulta_idx" ON "consultas"("mascota_id", "fecha_consulta");

-- CreateIndex
CREATE INDEX "recetas_mascota_id_fecha_emision_idx" ON "recetas"("mascota_id", "fecha_emision");

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_signos_vitales" ADD CONSTRAINT "consulta_signos_vitales_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mascotas" ADD CONSTRAINT "mascotas_tutor_cliente_id_fkey" FOREIGN KEY ("tutor_cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mascotas" ADD CONSTRAINT "mascotas_medico_asignado_id_fkey" FOREIGN KEY ("medico_asignado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacunaciones" ADD CONSTRAINT "vacunaciones_vacuna_catalogo_id_fkey" FOREIGN KEY ("vacuna_catalogo_id") REFERENCES "vacunas_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacunaciones" ADD CONSTRAINT "vacunaciones_medico_aplicador_id_fkey" FOREIGN KEY ("medico_aplicador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacunaciones" ADD CONSTRAINT "vacunaciones_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacunaciones" ADD CONSTRAINT "vacunaciones_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
