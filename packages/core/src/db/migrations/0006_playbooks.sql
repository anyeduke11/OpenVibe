-- ============ M4 技巧库 ============
-- 逐形照 0001_init.sql 的 terms 表（m4 FR-2.1）：三段 JSON 列存字符串数组，
-- verified 存 INTEGER 0/1，status 两态闭集。FTS 影子表与三触发器**同迁移**——
-- 分开发布是静默失效（表建好了、检索恒空且无报错面，§6.7）。
CREATE TABLE playbooks (
  id                 TEXT PRIMARY KEY,
  scenario           TEXT NOT NULL,
  problem            TEXT NOT NULL,
  practice           TEXT NOT NULL,
  anti_practice      TEXT NOT NULL DEFAULT '',
  related_prompt_ids TEXT NOT NULL DEFAULT '[]',
  related_term_ids   TEXT NOT NULL DEFAULT '[]',
  related_skill_ids  TEXT NOT NULL DEFAULT '[]',
  verified           INTEGER NOT NULL DEFAULT 0,
  evidence           TEXT NOT NULL DEFAULT '[]',
  source             TEXT NOT NULL DEFAULT 'manual',
  tags               TEXT NOT NULL DEFAULT '[]',
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  seed_hash          TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE VIRTUAL TABLE fts_playbooks USING fts5(
  scenario, problem, practice, anti_practice, tags,
  content='playbooks', content_rowid='rowid',
  tokenize='trigram'
);
CREATE TRIGGER playbooks_fts_ai AFTER INSERT ON playbooks BEGIN
  INSERT INTO fts_playbooks(rowid, scenario, problem, practice, anti_practice, tags)
  VALUES (new.rowid, new.scenario, new.problem, new.practice, new.anti_practice, new.tags);
END;
CREATE TRIGGER playbooks_fts_ad AFTER DELETE ON playbooks BEGIN
  INSERT INTO fts_playbooks(fts_playbooks, rowid, scenario, problem, practice, anti_practice, tags)
  VALUES ('delete', old.rowid, old.scenario, old.problem, old.practice, old.anti_practice, old.tags);
END;
CREATE TRIGGER playbooks_fts_au AFTER UPDATE ON playbooks BEGIN
  INSERT INTO fts_playbooks(fts_playbooks, rowid, scenario, problem, practice, anti_practice, tags)
  VALUES ('delete', old.rowid, old.scenario, old.problem, old.practice, old.anti_practice, old.tags);
  INSERT INTO fts_playbooks(rowid, scenario, problem, practice, anti_practice, tags)
  VALUES (new.rowid, new.scenario, new.problem, new.practice, new.anti_practice, new.tags);
END;