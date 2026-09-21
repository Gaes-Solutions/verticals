CREATE TABLE "sync_catalog_snapshots" (
 "id" TEXT PRIMARY KEY,
 "usuario_id" TEXT NOT NULL UNIQUE,
 "permissions_hash" TEXT NOT NULL,
 "server_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expires_at" TIMESTAMP(3) NOT NULL,
 "page_count" INTEGER NOT NULL
);
CREATE INDEX "sync_catalog_snapshots_expires_at_idx" ON "sync_catalog_snapshots"("expires_at");
CREATE TABLE "sync_catalog_pages" (
 "snapshot_id" TEXT NOT NULL REFERENCES "sync_catalog_snapshots"("id") ON DELETE CASCADE,
 "page_index" INTEGER NOT NULL,
 "payload" JSONB NOT NULL,
 PRIMARY KEY ("snapshot_id","page_index")
);
