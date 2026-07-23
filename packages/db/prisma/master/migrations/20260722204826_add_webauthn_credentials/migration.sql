-- Passkeys WebAuthn (login con huella/Face ID) para usuarios de tenant.
CREATE TABLE "webauthn_credentials" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT,
    "device_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");
CREATE INDEX "webauthn_credentials_tenant_slug_usuario_id_idx" ON "webauthn_credentials"("tenant_slug", "usuario_id");
