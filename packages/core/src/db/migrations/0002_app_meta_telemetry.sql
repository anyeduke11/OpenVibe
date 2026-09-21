-- C-1 / C-2（dev-plan §2.4，2026-09-20 登记的 C 级变更）
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE telemetry_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event       TEXT NOT NULL CHECK (event IN ('pack_injected','flow_template_used','project_active')),
  value       TEXT NOT NULL DEFAULT '',
  day         TEXT NOT NULL,
  os          TEXT NOT NULL CHECK (os IN ('mac','linux','win')),
  app_version TEXT NOT NULL,
  queued_at   TEXT NOT NULL,
  sent_at     TEXT
);
CREATE INDEX idx_telemetry_pending ON telemetry_events(sent_at) WHERE sent_at IS NULL;
