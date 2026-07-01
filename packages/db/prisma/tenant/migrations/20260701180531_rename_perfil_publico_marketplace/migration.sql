-- Rename directo (preserva datos): is_perfil_publico_doctoralia → is_perfil_publico_marketplace
ALTER TABLE "medicos" RENAME COLUMN "is_perfil_publico_doctoralia" TO "is_perfil_publico_marketplace";
