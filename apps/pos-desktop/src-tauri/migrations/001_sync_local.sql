-- Schema SQLite local del POS desktop (espejo de @gaespos/sync-client LocalStorage).
-- tauri-plugin-sql aplica estas migrations en orden al primer arranque.

-- Cola de operaciones pendientes de sync (push).
CREATE TABLE IF NOT EXISTS sync_queue (
  idempotency_key  TEXT PRIMARY KEY,
  entity_type      TEXT NOT NULL,
  entity_id_local  TEXT NOT NULL,
  entity_id_remoto TEXT,
  operation        TEXT NOT NULL,
  payload          TEXT NOT NULL,         -- JSON
  base_updated_at  TEXT,
  base_snapshot    TEXT,                  -- JSON
  local_updated_at TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TEXT,
  next_attempt_at  TEXT,
  last_error       TEXT,
  conflict         TEXT,                  -- JSON ConflictInfo
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, next_attempt_at);

-- Cache local de catálogos (pull). Una fila por (entity_type, id).
CREATE TABLE IF NOT EXISTS sync_cache (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  data        TEXT NOT NULL,             -- JSON del registro
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

-- Estado del cliente (último sync, device id).
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
