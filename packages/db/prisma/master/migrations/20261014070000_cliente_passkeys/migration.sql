CREATE TABLE "cliente_passkeys" (
 "id" TEXT NOT NULL,
 "tenant_slug" TEXT NOT NULL,
 "cliente_id" TEXT NOT NULL,
 "rp_id" TEXT NOT NULL,
 "credential_id" TEXT NOT NULL,
 "public_key" TEXT NOT NULL,
 "counter" BIGINT NOT NULL DEFAULT 0,
 "transports" TEXT,
 "device_name" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "last_used_at" TIMESTAMP(3),
 CONSTRAINT "cliente_passkeys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cliente_passkeys_credential_id_key" ON "cliente_passkeys"("credential_id");
CREATE INDEX "cliente_passkeys_tenant_slug_cliente_id_rp_id_idx" ON "cliente_passkeys"("tenant_slug", "cliente_id", "rp_id");
