CREATE TABLE IF NOT EXISTS pos_catalog_pages (
 scope TEXT NOT NULL,
 snapshot_id TEXT NOT NULL,
 page_index INTEGER NOT NULL CHECK(page_index >= 0),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(scope,snapshot_id,page_index)
);
