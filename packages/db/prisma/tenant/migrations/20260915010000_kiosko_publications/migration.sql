CREATE TABLE "kiosko_media_publications" (
 "id" TEXT NOT NULL PRIMARY KEY, "asset_id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "created_by" TEXT NOT NULL,
 "title" TEXT NOT NULL, "branch_ids" TEXT[] NOT NULL, "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL,
 "priority" INTEGER NOT NULL DEFAULT 0, "image_duration_ms" INTEGER NOT NULL DEFAULT 6000,
 "status" TEXT NOT NULL DEFAULT 'published', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "kiosko_media_publications_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "kiosko_media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "kiosko_media_publications_tenant_id_status_ends_at_idx" ON "kiosko_media_publications"("tenant_id", "status", "ends_at");
ALTER TABLE "kiosko_media_uploads" DROP CONSTRAINT "kiosko_media_uploads_status_check";
ALTER TABLE "kiosko_media_uploads" ADD CONSTRAINT "kiosko_media_uploads_status_check" CHECK ("status" IN ('uploading','validating','ready','rejected','expired','deleted'));
ALTER TABLE "kiosko_media_uploads" DROP CONSTRAINT "kiosko_media_uploads_release_check";
ALTER TABLE "kiosko_media_uploads" ADD CONSTRAINT "kiosko_media_uploads_release_check" CHECK ("storage_released_at" IS NULL OR "status" IN ('expired','rejected','deleted'));
