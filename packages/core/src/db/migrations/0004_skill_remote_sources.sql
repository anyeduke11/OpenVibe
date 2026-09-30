-- DEV-0067：skill 台账新增远程源 github / skillhub。
-- SQLite 不能 ALTER CHECK 约束，按官方 12 步流程重建表；
-- runner 会在迁移执行期间临时关闭外键（否则 DROP TABLE 的隐式 DELETE 会经
-- ON DELETE CASCADE 级联清空 skill_versions）。行按原 id 全量平移，引用不断。
CREATE TABLE skills_new (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL CHECK (source IN ('local','manual','github','skillhub')),
  skill_dir         TEXT,
  latest_version_id TEXT,
  installed_targets TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

INSERT INTO skills_new (id, name, description, source, skill_dir, latest_version_id,
                        installed_targets, created_at, updated_at)
  SELECT id, name, description, source, skill_dir, latest_version_id,
         installed_targets, created_at, updated_at
    FROM skills;

DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;
