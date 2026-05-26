-- CreateEnum
CREATE TYPE "PacienteSexo" AS ENUM ('masculino', 'femenino', 'otro', 'no_especificado');

-- CreateEnum
CREATE TYPE "PacienteClasificacionRiesgo" AS ENUM ('bajo', 'medio', 'alto', 'critico');

-- CreateEnum
CREATE TYPE "ConsultaTipo" AS ENUM ('primera_vez', 'seguimiento', 'urgencia', 'control_post_cirugia', 'telemedicina');

-- CreateEnum
CREATE TYPE "ConsultaPronostico" AS ENUM ('favorable', 'reservado', 'grave', 'desconocido');

-- CreateEnum
CREATE TYPE "ConsultaEstado" AS ENUM ('borrador', 'firmada', 'enmendada', 'cancelada');

-- CreateEnum
CREATE TYPE "CitaEstado" AS ENUM ('programada', 'confirmada', 'checkin', 'en_consulta', 'completada', 'cancelada', 'no_asistio');

-- CreateEnum
CREATE TYPE "AgendaBloqueoTipo" AS ENUM ('vacaciones', 'congreso', 'personal', 'incapacidad', 'cerrado_sucursal');

-- CreateEnum
CREATE TYPE "RecetaEstado" AS ENUM ('emitida', 'surtida', 'cancelada', 'expirada');

-- CreateEnum
CREATE TYPE "MedicamentoClasificacionCofepris" AS ENUM ('G_I', 'G_II', 'G_III', 'G_IV', 'G_V', 'G_VI', 'vet', 'OTC');

-- CreateTable
CREATE TABLE "pacientes" (
    "id" TEXT NOT NULL,
    "numero_expediente" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido_paterno" TEXT,
    "apellido_materno" TEXT,
    "fecha_nacimiento" TIMESTAMP(3),
    "sexo" "PacienteSexo" NOT NULL DEFAULT 'no_especificado',
    "curp" TEXT,
    "rfc" TEXT,
    "telefono_principal" TEXT,
    "email_principal" TEXT,
    "direccion" JSONB,
    "ocupacion" TEXT,
    "estado_civil" TEXT,
    "contacto_emergencia_nombre" TEXT,
    "contacto_emergencia_tel" TEXT,
    "tipo_sangre" TEXT,
    "alergias" JSONB NOT NULL DEFAULT '[]',
    "antecedentes_patologicos" JSONB NOT NULL DEFAULT '[]',
    "antecedentes_familiares" JSONB NOT NULL DEFAULT '[]',
    "medicamentos_cronicos" JSONB NOT NULL DEFAULT '[]',
    "tutor_cliente_id" TEXT,
    "medico_asignado_id" TEXT,
    "etiquetas" JSONB NOT NULL DEFAULT '[]',
    "notas_internas" TEXT,
    "alertas_personalizadas" JSONB NOT NULL DEFAULT '[]',
    "clasificacion_riesgo" "PacienteClasificacionRiesgo",
    "fecha_primera_visita" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicos" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "cedula_profesional" TEXT,
    "especialidades" JSONB NOT NULL DEFAULT '[]',
    "subespecialidades" JSONB NOT NULL DEFAULT '[]',
    "anos_experiencia" INTEGER,
    "idiomas_atencion" JSONB NOT NULL DEFAULT '["es-MX"]',
    "bio" TEXT,
    "foto_perfil_url" TEXT,
    "consultorios" JSONB NOT NULL DEFAULT '[]',
    "precio_consulta_primera" DECIMAL(14,2),
    "precio_consulta_seguimiento" DECIMAL(14,2),
    "acepta_seguros" JSONB NOT NULL DEFAULT '[]',
    "firma_electronica_url" TEXT,
    "acepta_telemedicina" BOOLEAN NOT NULL DEFAULT false,
    "is_perfil_publico_doctoralia" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendas" (
    "id" TEXT NOT NULL,
    "medico_usuario_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "dia_semana" INTEGER,
    "fecha_especifica" DATE,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "duracion_slot_minutos" INTEGER NOT NULL DEFAULT 30,
    "tipos_slots" JSONB NOT NULL DEFAULT '["consulta"]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_bloqueos" (
    "id" TEXT NOT NULL,
    "medico_usuario_id" TEXT,
    "sucursal_id" TEXT,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "tipo" "AgendaBloqueoTipo" NOT NULL,
    "motivo_publico" TEXT,
    "notas_internas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_bloqueos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_cita_catalogo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "vertical" TEXT NOT NULL DEFAULT 'humana',
    "duracion_default_minutos" INTEGER NOT NULL DEFAULT 30,
    "costo_referencia" DECIMAL(14,2),
    "requiere_anticipo" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motivos_cita_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citas" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "medico_usuario_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "motivo_cita_id" TEXT,
    "motivo_texto" TEXT,
    "consultorio_room" TEXT,
    "recursos_clinicos_asignados" JSONB NOT NULL DEFAULT '[]',
    "fecha_programada" TIMESTAMP(3) NOT NULL,
    "duracion_estimada_minutos" INTEGER NOT NULL DEFAULT 30,
    "estado" "CitaEstado" NOT NULL DEFAULT 'programada',
    "peso_checkin_kg" DECIMAL(6,2),
    "temperatura_checkin_c" DECIMAL(4,1),
    "pre_questions_responses" JSONB,
    "notas_recepcion" TEXT,
    "fecha_checkin_at" TIMESTAMP(3),
    "checkin_por_id" TEXT,
    "fecha_inicio_consulta" TIMESTAMP(3),
    "fecha_fin_consulta" TIMESTAMP(3),
    "tiempo_espera_minutos" INTEGER,
    "duracion_consulta_minutos" INTEGER,
    "cancelado_at" TIMESTAMP(3),
    "cancelado_por_id" TEXT,
    "cancelado_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cita_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cita_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateTable
CREATE TABLE "diagnosticos_catalogo" (
    "id" TEXT NOT NULL,
    "codigo_cie10" TEXT NOT NULL,
    "codigo_cie11" TEXT,
    "nombre_es" TEXT NOT NULL,
    "nombre_en" TEXT,
    "aplica_humano" BOOLEAN NOT NULL DEFAULT true,
    "aplica_vet" BOOLEAN NOT NULL DEFAULT false,
    "categoria" TEXT,
    "is_precargado_global" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnosticos_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicamentos_catalogo" (
    "id" TEXT NOT NULL,
    "nombre_comercial" TEXT NOT NULL,
    "principio_activo" TEXT NOT NULL,
    "concentracion" TEXT,
    "presentacion" TEXT,
    "via_administracion" TEXT,
    "categoria" TEXT,
    "clasificacion_cofepris" "MedicamentoClasificacionCofepris" NOT NULL DEFAULT 'OTC',
    "requiere_recetario_oficial" BOOLEAN NOT NULL DEFAULT false,
    "es_controlado_vet" BOOLEAN NOT NULL DEFAULT false,
    "dosis_recomendada_pediatrica" JSONB,
    "dosis_recomendada_adulto" JSONB,
    "dosis_recomendada_vet" JSONB,
    "interacciones_conocidas" JSONB NOT NULL DEFAULT '[]',
    "alergias_relacionadas" JSONB NOT NULL DEFAULT '[]',
    "efectos_adversos" JSONB NOT NULL DEFAULT '[]',
    "precio_referencia_mercado" DECIMAL(14,2),
    "is_precargado_global" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicamentos_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultas" (
    "id" TEXT NOT NULL,
    "cita_id" TEXT,
    "paciente_id" TEXT NOT NULL,
    "medico_usuario_id" TEXT NOT NULL,
    "enfermera_asistente_id" TEXT,
    "sucursal_id" TEXT NOT NULL,
    "fecha_consulta" TIMESTAMP(3) NOT NULL,
    "duracion_minutos" INTEGER,
    "tipo" "ConsultaTipo" NOT NULL DEFAULT 'seguimiento',
    "motivo_consulta" TEXT,
    "sintomas" JSONB NOT NULL DEFAULT '[]',
    "tiempo_evolucion" TEXT,
    "tratamientos_previos" TEXT,
    "signos_vitales" JSONB,
    "exploracion_aparatos" JSONB,
    "diagnostico_principal_id" TEXT,
    "diagnostico_principal_texto" TEXT,
    "diagnosticos_diferenciales" JSONB NOT NULL DEFAULT '[]',
    "pronostico" "ConsultaPronostico" NOT NULL DEFAULT 'desconocido',
    "plan_tratamiento" TEXT,
    "siguiente_control_dias" INTEGER,
    "notas_clinicas_internas" TEXT,
    "resumen_para_tutor" TEXT,
    "estado" "ConsultaEstado" NOT NULL DEFAULT 'borrador',
    "firmada_at" TIMESTAMP(3),
    "firmada_por_medico_usuario_id" TEXT,
    "firma_electronica_aplicada_url" TEXT,
    "consulta_original_id" TEXT,
    "enmienda_motivo" TEXT,
    "cancelada_at" TIMESTAMP(3),
    "cancelada_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta_signos_vitales" (
    "id" TEXT NOT NULL,
    "consulta_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "momento" TIMESTAMP(3) NOT NULL,
    "peso_kg" DECIMAL(6,2),
    "temperatura_c" DECIMAL(4,1),
    "frecuencia_cardiaca" INTEGER,
    "frecuencia_respiratoria" INTEGER,
    "presion_sistolica" INTEGER,
    "presion_diastolica" INTEGER,
    "saturacion_o2" DECIMAL(5,2),
    "glucosa_mg_dl" DECIMAL(6,2),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consulta_signos_vitales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recetas" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "consulta_id" TEXT,
    "paciente_id" TEXT NOT NULL,
    "medico_usuario_id" TEXT NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigencia_dias" INTEGER NOT NULL DEFAULT 30,
    "fecha_expiracion" TIMESTAMP(3) NOT NULL,
    "qr_validacion_token" TEXT NOT NULL,
    "firma_electronica_url" TEXT,
    "estado" "RecetaEstado" NOT NULL DEFAULT 'emitida',
    "enviada_whatsapp_at" TIMESTAMP(3),
    "enviada_email_at" TIMESTAMP(3),
    "pdf_url" TEXT,
    "es_grupo_controlado" BOOLEAN NOT NULL DEFAULT false,
    "numero_recetario_oficial" TEXT,
    "instrucciones_generales_tutor" TEXT,
    "cancelada_at" TIMESTAMP(3),
    "cancelada_por_id" TEXT,
    "cancelada_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta_items" (
    "id" TEXT NOT NULL,
    "receta_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "medicamento_catalogo_id" TEXT,
    "nombre_snapshot" TEXT NOT NULL,
    "concentracion_snapshot" TEXT,
    "presentacion_snapshot" TEXT,
    "dosis_unidad" TEXT NOT NULL,
    "dosis_cantidad" DECIMAL(10,3) NOT NULL,
    "dosis_via" TEXT NOT NULL,
    "frecuencia_horas" DECIMAL(6,2) NOT NULL,
    "duracion_dias" INTEGER NOT NULL,
    "total_unidades_dispensar" DECIMAL(10,3),
    "instrucciones_administracion" TEXT,
    "alertas_aplicadas" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta_folio_counters" (
    "sucursal_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receta_folio_counters_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateIndex
CREATE INDEX "pacientes_nombre_apellido_paterno_idx" ON "pacientes"("nombre", "apellido_paterno");

-- CreateIndex
CREATE INDEX "pacientes_curp_idx" ON "pacientes"("curp");

-- CreateIndex
CREATE INDEX "pacientes_telefono_principal_idx" ON "pacientes"("telefono_principal");

-- CreateIndex
CREATE INDEX "pacientes_medico_asignado_id_idx" ON "pacientes"("medico_asignado_id");

-- CreateIndex
CREATE INDEX "pacientes_is_active_idx" ON "pacientes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_numero_expediente_key" ON "pacientes"("numero_expediente");

-- CreateIndex
CREATE UNIQUE INDEX "medicos_usuario_id_key" ON "medicos"("usuario_id");

-- CreateIndex
CREATE INDEX "medicos_is_active_idx" ON "medicos"("is_active");

-- CreateIndex
CREATE INDEX "agendas_medico_usuario_id_sucursal_id_is_active_idx" ON "agendas"("medico_usuario_id", "sucursal_id", "is_active");

-- CreateIndex
CREATE INDEX "agendas_fecha_especifica_idx" ON "agendas"("fecha_especifica");

-- CreateIndex
CREATE INDEX "agenda_bloqueos_medico_usuario_id_fecha_inicio_idx" ON "agenda_bloqueos"("medico_usuario_id", "fecha_inicio");

-- CreateIndex
CREATE INDEX "agenda_bloqueos_sucursal_id_fecha_inicio_idx" ON "agenda_bloqueos"("sucursal_id", "fecha_inicio");

-- CreateIndex
CREATE INDEX "motivos_cita_catalogo_is_active_idx" ON "motivos_cita_catalogo"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_cita_catalogo_nombre_vertical_key" ON "motivos_cita_catalogo"("nombre", "vertical");

-- CreateIndex
CREATE INDEX "citas_medico_usuario_id_fecha_programada_idx" ON "citas"("medico_usuario_id", "fecha_programada");

-- CreateIndex
CREATE INDEX "citas_paciente_id_fecha_programada_idx" ON "citas"("paciente_id", "fecha_programada");

-- CreateIndex
CREATE INDEX "citas_estado_fecha_programada_idx" ON "citas"("estado", "fecha_programada");

-- CreateIndex
CREATE UNIQUE INDEX "citas_sucursal_id_folio_key" ON "citas"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "diagnosticos_catalogo_nombre_es_idx" ON "diagnosticos_catalogo"("nombre_es");

-- CreateIndex
CREATE INDEX "diagnosticos_catalogo_aplica_humano_idx" ON "diagnosticos_catalogo"("aplica_humano");

-- CreateIndex
CREATE INDEX "diagnosticos_catalogo_aplica_vet_idx" ON "diagnosticos_catalogo"("aplica_vet");

-- CreateIndex
CREATE UNIQUE INDEX "diagnosticos_catalogo_codigo_cie10_key" ON "diagnosticos_catalogo"("codigo_cie10");

-- CreateIndex
CREATE INDEX "medicamentos_catalogo_nombre_comercial_idx" ON "medicamentos_catalogo"("nombre_comercial");

-- CreateIndex
CREATE INDEX "medicamentos_catalogo_principio_activo_idx" ON "medicamentos_catalogo"("principio_activo");

-- CreateIndex
CREATE INDEX "medicamentos_catalogo_clasificacion_cofepris_idx" ON "medicamentos_catalogo"("clasificacion_cofepris");

-- CreateIndex
CREATE UNIQUE INDEX "consultas_cita_id_key" ON "consultas"("cita_id");

-- CreateIndex
CREATE INDEX "consultas_paciente_id_fecha_consulta_idx" ON "consultas"("paciente_id", "fecha_consulta");

-- CreateIndex
CREATE INDEX "consultas_medico_usuario_id_fecha_consulta_idx" ON "consultas"("medico_usuario_id", "fecha_consulta");

-- CreateIndex
CREATE INDEX "consultas_estado_idx" ON "consultas"("estado");

-- CreateIndex
CREATE INDEX "consulta_signos_vitales_paciente_id_momento_idx" ON "consulta_signos_vitales"("paciente_id", "momento");

-- CreateIndex
CREATE UNIQUE INDEX "recetas_qr_validacion_token_key" ON "recetas"("qr_validacion_token");

-- CreateIndex
CREATE INDEX "recetas_paciente_id_fecha_emision_idx" ON "recetas"("paciente_id", "fecha_emision");

-- CreateIndex
CREATE INDEX "recetas_medico_usuario_id_fecha_emision_idx" ON "recetas"("medico_usuario_id", "fecha_emision");

-- CreateIndex
CREATE INDEX "recetas_estado_idx" ON "recetas"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "recetas_sucursal_id_folio_key" ON "recetas"("sucursal_id", "folio");

-- CreateIndex
CREATE INDEX "receta_items_medicamento_catalogo_id_idx" ON "receta_items"("medicamento_catalogo_id");

-- CreateIndex
CREATE UNIQUE INDEX "receta_items_receta_id_numero_key" ON "receta_items"("receta_id", "numero");

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_tutor_cliente_id_fkey" FOREIGN KEY ("tutor_cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_medico_asignado_id_fkey" FOREIGN KEY ("medico_asignado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicos" ADD CONSTRAINT "medicos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_medico_usuario_id_fkey" FOREIGN KEY ("medico_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_bloqueos" ADD CONSTRAINT "agenda_bloqueos_medico_usuario_id_fkey" FOREIGN KEY ("medico_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_bloqueos" ADD CONSTRAINT "agenda_bloqueos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_medico_usuario_id_fkey" FOREIGN KEY ("medico_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_motivo_cita_id_fkey" FOREIGN KEY ("motivo_cita_id") REFERENCES "motivos_cita_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_checkin_por_id_fkey" FOREIGN KEY ("checkin_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_folio_counters" ADD CONSTRAINT "cita_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_medico_usuario_id_fkey" FOREIGN KEY ("medico_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_enfermera_asistente_id_fkey" FOREIGN KEY ("enfermera_asistente_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_diagnostico_principal_id_fkey" FOREIGN KEY ("diagnostico_principal_id") REFERENCES "diagnosticos_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_firmada_por_medico_usuario_id_fkey" FOREIGN KEY ("firmada_por_medico_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_consulta_original_id_fkey" FOREIGN KEY ("consulta_original_id") REFERENCES "consultas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_signos_vitales" ADD CONSTRAINT "consulta_signos_vitales_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consultas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_signos_vitales" ADD CONSTRAINT "consulta_signos_vitales_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consultas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_medico_usuario_id_fkey" FOREIGN KEY ("medico_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_cancelada_por_id_fkey" FOREIGN KEY ("cancelada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "recetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_medicamento_catalogo_id_fkey" FOREIGN KEY ("medicamento_catalogo_id") REFERENCES "medicamentos_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_folio_counters" ADD CONSTRAINT "receta_folio_counters_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
