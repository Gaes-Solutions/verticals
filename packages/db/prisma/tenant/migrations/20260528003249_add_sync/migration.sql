-- CreateTable
CREATE TABLE "sync_processed_ops" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id_local" TEXT NOT NULL,
    "entity_id_remoto" TEXT,
    "status" TEXT NOT NULL,
    "result_snapshot" JSONB,
    "device_id" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_processed_ops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_tombstones" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_tombstones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_processed_ops_idempotency_key_key" ON "sync_processed_ops"("idempotency_key");

-- CreateIndex
CREATE INDEX "sync_processed_ops_entity_type_idx" ON "sync_processed_ops"("entity_type");

-- CreateIndex
CREATE INDEX "sync_processed_ops_processed_at_idx" ON "sync_processed_ops"("processed_at");

-- CreateIndex
CREATE INDEX "sync_tombstones_entity_type_deleted_at_idx" ON "sync_tombstones"("entity_type", "deleted_at");
