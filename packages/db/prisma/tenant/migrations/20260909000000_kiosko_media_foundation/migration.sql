CREATE TABLE "kiosko_media_assets" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "created_by" TEXT NOT NULL,
 "storage_key" TEXT NOT NULL UNIQUE, "declared_mime" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'uploading' CHECK ("status" IN ('uploading','validating','ready','rejected','expired','archived')),
 "verified_metadata" JSONB,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "kiosko_media_uploads" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "created_by" TEXT NOT NULL,
 "request_key" TEXT NOT NULL,"request_hash" TEXT NOT NULL,
 "asset_id" TEXT NOT NULL UNIQUE REFERENCES "kiosko_media_assets"("id") ON DELETE RESTRICT,
 "declared_bytes" INTEGER NOT NULL CHECK ("declared_bytes">0 AND "declared_bytes"<=52428800),
 "status" TEXT NOT NULL DEFAULT 'uploading' CHECK ("status" IN ('uploading','validating','expired')),
 "expires_at" TIMESTAMP(3) NOT NULL,"inspection_requested_at" TIMESTAMP(3),"storage_released_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "kiosko_media_uploads_release_check" CHECK ("storage_released_at" IS NULL OR "status"='expired')
);
CREATE UNIQUE INDEX "kiosko_media_uploads_created_by_request_key_key" ON "kiosko_media_uploads"("created_by","request_key");
CREATE INDEX "kiosko_media_uploads_tenant_id_status_expires_at_idx" ON "kiosko_media_uploads"("tenant_id","status","expires_at");
