-- ============ M1 提示词 ============
CREATE TABLE prompts (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description    TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  variables      TEXT NOT NULL DEFAULT '[]',
  tags           TEXT NOT NULL DEFAULT '[]',
  folder_path    TEXT NOT NULL DEFAULT '/',
  platform_marks TEXT NOT NULL DEFAULT '[]',
  use_as         TEXT NOT NULL DEFAULT 'reference' CHECK (use_as IN ('rule','reference')),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','deprecated')),
  seed_hash      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_prompts_status ON prompts(status);
CREATE INDEX idx_prompts_folder ON prompts(folder_path);

CREATE TABLE prompt_versions (
  id           TEXT PRIMARY KEY,
  prompt_id    TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version_no   INTEGER NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  changelog    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  UNIQUE (prompt_id, version_no)
);

-- ============ M2 Skill 台账 ============
CREATE TABLE skills (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL CHECK (source IN ('local','manual')),
  skill_dir         TEXT,
  latest_version_id TEXT,
  installed_targets TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE skill_versions (
  id            TEXT PRIMARY KEY,
  skill_id      TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  dir_hash      TEXT NOT NULL,
  file_count    INTEGER NOT NULL,
  scanned_at    TEXT NOT NULL,
  UNIQUE (skill_id, dir_hash)
);

-- ============ M3 术语 ============
CREATE TABLE terms (
  id               TEXT PRIMARY KEY,
  zh               TEXT,
  en               TEXT,
  aliases          TEXT NOT NULL DEFAULT '[]',
  definition       TEXT NOT NULL,
  example          TEXT NOT NULL DEFAULT '',
  related_term_ids TEXT NOT NULL DEFAULT '[]',
  source           TEXT NOT NULL DEFAULT 'manual',
  tags             TEXT NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active')),
  seed_hash        TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (zh IS NOT NULL OR en IS NOT NULL)
);

-- ============ M5 流程与项目 ============
CREATE TABLE flow_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('light','spec_driven','retro','custom')),
  stages     TEXT NOT NULL,
  builtin    INTEGER NOT NULL DEFAULT 0,
  seed_hash  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  local_path            TEXT,
  flow_template_id      TEXT REFERENCES flow_templates(id),
  stages_snapshot       TEXT NOT NULL,
  current_stage         TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  standard_pack_id      TEXT,
  standard_pack_version TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);

CREATE TABLE project_check_states (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE (project_id, stage_name, item_id)
);

CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  stage_name TEXT,
  status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  order_     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_tasks_project ON tasks(project_id, status, order_);

CREATE TABLE dev_log_entries (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('DEV','CHECK')),
  entry_no         INTEGER NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',
  related_files    TEXT NOT NULL DEFAULT '[]',
  evidence         TEXT,
  linked_asset_ids TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL,
  UNIQUE (project_id, type, entry_no)
);

-- ============ M6 标准包 ============
CREATE TABLE standard_packs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE CHECK (name GLOB '[a-z0-9-]*' AND length(name) BETWEEN 1 AND 64),
  description TEXT NOT NULL DEFAULT '',
  selection   TEXT NOT NULL,
  targets     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE pack_exports (
  id            TEXT PRIMARY KEY,
  pack_id       TEXT NOT NULL REFERENCES standard_packs(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('download','directory')),
  exported_at   TEXT NOT NULL,
  UNIQUE (pack_id, version)
);

CREATE TABLE injections (
  id           TEXT PRIMARY KEY,
  pack_id      TEXT,
  pack_version TEXT,
  project_path TEXT NOT NULL,
  injected_at  TEXT NOT NULL
);
CREATE INDEX idx_injections_time ON injections(injected_at DESC);

CREATE TABLE seed_registry (
  bundle       TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);

-- ============ FTS5 trigram（design §12 / dev-plan §2.3）============
CREATE VIRTUAL TABLE fts_prompts USING fts5(
  title, content, tags,
  content='prompts', content_rowid='rowid',
  tokenize='trigram'
);
CREATE TRIGGER prompts_fts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO fts_prompts(rowid, title, content, tags)
  VALUES (new.rowid, new.title, new.content, new.tags);
END;
CREATE TRIGGER prompts_fts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO fts_prompts(fts_prompts, rowid, title, content, tags)
  VALUES ('delete', old.rowid, old.title, old.content, old.tags);
END;
CREATE TRIGGER prompts_fts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO fts_prompts(fts_prompts, rowid, title, content, tags)
  VALUES ('delete', old.rowid, old.title, old.content, old.tags);
  INSERT INTO fts_prompts(rowid, title, content, tags)
  VALUES (new.rowid, new.title, new.content, new.tags);
END;

CREATE VIRTUAL TABLE fts_terms USING fts5(
  zh, en, aliases, definition,
  content='terms', content_rowid='rowid',
  tokenize='trigram'
);
CREATE TRIGGER terms_fts_ai AFTER INSERT ON terms BEGIN
  INSERT INTO fts_terms(rowid, zh, en, aliases, definition)
  VALUES (new.rowid, new.zh, new.en, new.aliases, new.definition);
END;
CREATE TRIGGER terms_fts_ad AFTER DELETE ON terms BEGIN
  INSERT INTO fts_terms(fts_terms, rowid, zh, en, aliases, definition)
  VALUES ('delete', old.rowid, old.zh, old.en, old.aliases, old.definition);
END;
CREATE TRIGGER terms_fts_au AFTER UPDATE ON terms BEGIN
  INSERT INTO fts_terms(fts_terms, rowid, zh, en, aliases, definition)
  VALUES ('delete', old.rowid, old.zh, old.en, old.aliases, old.definition);
  INSERT INTO fts_terms(rowid, zh, en, aliases, definition)
  VALUES (new.rowid, new.zh, new.en, new.aliases, new.definition);
END;
