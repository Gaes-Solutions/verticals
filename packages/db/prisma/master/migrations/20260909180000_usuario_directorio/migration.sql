-- Índice de correo → tenant para iniciar sesión sin pedir el slug del negocio.
-- Aditiva: crea una tabla nueva, no toca ninguna existente.
CREATE TABLE "usuario_directorio" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_directorio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usuario_directorio_email_idx" ON "usuario_directorio"("email");

CREATE UNIQUE INDEX "usuario_directorio_email_tenant_id_key" ON "usuario_directorio"("email", "tenant_id");

ALTER TABLE "usuario_directorio" ADD CONSTRAINT "usuario_directorio_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
