CREATE TABLE "venta_attempts" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "key" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "request_hash" TEXT NOT NULL,
 "venta_id" TEXT NOT NULL,
 "result" JSONB NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "venta_attempts_usuario_id_key_key" ON "venta_attempts"("usuario_id", "key");
CREATE UNIQUE INDEX "venta_attempts_venta_id_key" ON "venta_attempts"("venta_id");
