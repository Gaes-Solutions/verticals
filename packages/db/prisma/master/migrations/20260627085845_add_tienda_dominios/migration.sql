-- CreateTable
CREATE TABLE "tienda_dominios" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tienda_dominios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tienda_dominios_host_key" ON "tienda_dominios"("host");

-- CreateIndex
CREATE INDEX "tienda_dominios_tenant_slug_idx" ON "tienda_dominios"("tenant_slug");
