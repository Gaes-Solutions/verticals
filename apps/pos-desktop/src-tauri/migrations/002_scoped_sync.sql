CREATE TABLE IF NOT EXISTS pos_sync_queue (
 scope TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 operation_json TEXT NOT NULL CHECK(json_valid(operation_json)),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','syncing','synced','conflict','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 last_attempt_at TEXT, next_attempt_at TEXT, last_error TEXT,
 conflict_json TEXT CHECK(conflict_json IS NULL OR json_valid(conflict_json)),
 remote_id TEXT, created_at TEXT NOT NULL,
 PRIMARY KEY(scope,idempotency_key)
);
CREATE INDEX IF NOT EXISTS pos_sync_pending ON pos_sync_queue(scope,status,next_attempt_at,created_at);
CREATE TABLE IF NOT EXISTS pos_sync_cache (
 scope TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)), updated_at TEXT NOT NULL,
 PRIMARY KEY(scope,entity_type,entity_id)
);
CREATE TABLE IF NOT EXISTS pos_sync_meta (
 scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
 PRIMARY KEY(scope,key)
);
