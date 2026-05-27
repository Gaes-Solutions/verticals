-- CreateEnum
CREATE TYPE "ProfesionalTipo" AS ENUM ('medico_humano', 'veterinario', 'dentista', 'nutriologo', 'psicologo');

-- CreateEnum
CREATE TYPE "ProfesionalStatus" AS ENUM ('borrador', 'en_revision', 'publicado', 'suspendido', 'desactivado');

-- CreateEnum
CREATE TYPE "ReviewModeracionStatus" AS ENUM ('pendiente', 'auto_aprobado_ia', 'revision_humana', 'publicado', 'rechazado', 'denunciado_medico');

-- CreateTable
CREATE TABLE "pacientes_master" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "otp_verificado_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacientes_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_professionals" (
    "id" TEXT NOT NULL,
    "tenant_id_principal" TEXT NOT NULL,
    "tenant_ids_adicionales" JSONB NOT NULL DEFAULT '[]',
    "tipo" "ProfesionalTipo" NOT NULL,
    "nombre_publico" TEXT NOT NULL,
    "slug_seo" TEXT NOT NULL,
    "cedula_profesional" TEXT,
    "cedula_especialidad" TEXT,
    "especialidades" JSONB NOT NULL DEFAULT '[]',
    "validada_ssa_at" TIMESTAMP(3),
    "validada_por_admin_at" TIMESTAMP(3),
    "foto_perfil_url" TEXT,
    "bio_corta" TEXT,
    "bio_larga" TEXT,
    "anos_experiencia" INTEGER,
    "idiomas" JSONB NOT NULL DEFAULT '["es-MX"]',
    "genero" TEXT,
    "atiende_ninos" BOOLEAN NOT NULL DEFAULT true,
    "atiende_adultos" BOOLEAN NOT NULL DEFAULT true,
    "acepta_telemedicina" BOOLEAN NOT NULL DEFAULT false,
    "acepta_mismo_dia" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProfesionalStatus" NOT NULL DEFAULT 'borrador',
    "score_promedio" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_resenas" INTEGER NOT NULL DEFAULT 0,
    "fee_plataforma_pct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_professional_locations" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre_lugar" TEXT NOT NULL,
    "direccion" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "ciudad" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "colonia" TEXT,
    "cp" TEXT,
    "telefono_publico" TEXT,
    "horario_atencion" JSONB,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_professional_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_reviews" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "paciente_master_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "verificada" BOOLEAN NOT NULL DEFAULT false,
    "rating_general" INTEGER NOT NULL,
    "rating_puntualidad" INTEGER,
    "rating_explicacion" INTEGER,
    "rating_trato" INTEGER,
    "comentario" TEXT,
    "moderacion_status" "ReviewModeracionStatus" NOT NULL DEFAULT 'pendiente',
    "moderacion_ia_score" JSONB,
    "publicada_at" TIMESTAMP(3),
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "reportada_count" INTEGER NOT NULL DEFAULT 0,
    "respuesta_medico" TEXT,
    "arco_anonymized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_professional_search_index" (
    "professional_id" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "ciudad" TEXT,
    "estado" TEXT,
    "tipo" "ProfesionalTipo" NOT NULL,
    "score_ranking" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "acepta_telemedicina" BOOLEAN NOT NULL DEFAULT false,
    "acepta_mismo_dia" BOOLEAN NOT NULL DEFAULT false,
    "idiomas" JSONB NOT NULL DEFAULT '[]',
    "atiende_ninos" BOOLEAN NOT NULL DEFAULT true,
    "atiende_adultos" BOOLEAN NOT NULL DEFAULT true,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_professional_search_index_pkey" PRIMARY KEY ("professional_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_master_email_key" ON "pacientes_master"("email");

-- CreateIndex
CREATE INDEX "pacientes_master_email_idx" ON "pacientes_master"("email");

-- CreateIndex
CREATE UNIQUE INDEX "public_professionals_slug_seo_key" ON "public_professionals"("slug_seo");

-- CreateIndex
CREATE INDEX "public_professionals_tipo_status_idx" ON "public_professionals"("tipo", "status");

-- CreateIndex
CREATE INDEX "public_professionals_cedula_profesional_idx" ON "public_professionals"("cedula_profesional");

-- CreateIndex
CREATE INDEX "public_professional_locations_professional_id_idx" ON "public_professional_locations"("professional_id");

-- CreateIndex
CREATE INDEX "public_professional_locations_ciudad_estado_idx" ON "public_professional_locations"("ciudad", "estado");

-- CreateIndex
CREATE INDEX "public_reviews_professional_id_moderacion_status_idx" ON "public_reviews"("professional_id", "moderacion_status");

-- CreateIndex
CREATE INDEX "public_reviews_paciente_master_id_idx" ON "public_reviews"("paciente_master_id");

-- CreateIndex
CREATE INDEX "public_professional_search_index_ciudad_estado_idx" ON "public_professional_search_index"("ciudad", "estado");

-- CreateIndex
CREATE INDEX "public_professional_search_index_tipo_idx" ON "public_professional_search_index"("tipo");

-- CreateIndex
CREATE INDEX "public_professional_search_index_score_ranking_idx" ON "public_professional_search_index"("score_ranking");

-- AddForeignKey
ALTER TABLE "public_professional_locations" ADD CONSTRAINT "public_professional_locations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public_professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_reviews" ADD CONSTRAINT "public_reviews_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public_professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_reviews" ADD CONSTRAINT "public_reviews_paciente_master_id_fkey" FOREIGN KEY ("paciente_master_id") REFERENCES "pacientes_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_professional_search_index" ADD CONSTRAINT "public_professional_search_index_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public_professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
