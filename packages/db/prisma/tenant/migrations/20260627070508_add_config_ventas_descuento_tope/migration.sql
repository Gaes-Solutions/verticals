-- CreateTable
CREATE TABLE "config_ventas" (
    "id" TEXT NOT NULL,
    "descuento_maximo_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_ventas_pkey" PRIMARY KEY ("id")
);
