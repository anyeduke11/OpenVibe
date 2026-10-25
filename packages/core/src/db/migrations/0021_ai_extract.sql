-- 0021_ai_extract.sql（核心域 · v0.2.3 批次 D，spec v023-d-ai-extract.md FR-5/AN4）
-- 三件事：① agent_ingests 扩三个候选 kind（表重建——SQLite 不能 ALTER CHECK，0010/0012 先例）；
--         ② local_events 扩两个台账 kind（ai_extract_call / ai_discuss_call，同笔一次到位——
--            批次 E 的问答通道共用本迁移，免二次重建）；
--         ③ ai_extract_consent 表（逐项目出网同意，语义平移 lang_source_consent）。
--
-- ⚠️ 三个候选 kind 是**产品决定**（M8 纪律「扩列是产品决定」的正用）：
--    内部 AI（提取链）与外部 agent 走同一条 pending → 人工确认 → 分发管道。

-- ---------- 1) agent_ingests：kind 闭集 5 → 8 ----------
CREATE TABLE agent_ingests_v2 (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN (
                     'dev_log', 'session', 'requirement', 'task_status', 'check_state',
                     -- M10/D 批次：LLM 候选（内部 AI 产出按外部 agent 待遇，pending → 人工确认）
                     'term_candidate', 'prompt_candidate', 'playbook_candidate'
                   )),
  idempotency_key  TEXT NOT NULL UNIQUE,
  payload_json     TEXT NOT NULL,
  source_platform  TEXT NOT NULL,
  source_session_id TEXT,
  cwd              TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','published','rejected','conflict')),
  reject_reason    TEXT,
  created_at       TEXT NOT NULL,
  reviewed_at      TEXT
);

INSERT INTO agent_ingests_v2 (id, project_id, kind, idempotency_key, payload_json, source_platform, source_session_id, cwd, status, reject_reason, created_at, reviewed_at)
SELECT id, project_id, kind, idempotency_key, payload_json, source_platform, source_session_id, cwd, status, reject_reason, created_at, reviewed_at FROM agent_ingests;

DROP TABLE agent_ingests;
ALTER TABLE agent_ingests_v2 RENAME TO agent_ingests;
CREATE INDEX idx_agent_ingests_project_status ON agent_ingests(project_id, status, created_at DESC);

-- ---------- 2) local_events：kind 闭集 23 → 25 ----------
CREATE TABLE local_events_v4 (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN (
                  -- 台账 13 项（local-event-ledger.md FR-2.1）
                  'asset_created', 'asset_updated', 'asset_deleted', 'asset_reflowed',
                  'checklist_item_checked', 'flow_template_run',
                  'injection_confirmed', 'injection_conflict_resolved', 'injection_failed',
                  'pack_composed', 'pack_exported',
                  'stage_advanced', 'stage_view_switched',
                  -- M8 5 项（m8-agent-bridge.md FR-5.1）
                  'agent_ingest_accepted', 'agent_ingest_rejected', 'agent_context_served',
                  'cli_agent_command_run', 'agent_bridge_installed',
                  -- M3 AI 1 项（m3-terms-learning FR-9.1）
                  'ai_recommend_call',
                  -- M10/D 批次 2 项（提取 / 问答出网台账；payload 白名单 9 键，无正文容器）
                  'ai_extract_call', 'ai_discuss_call',
                  -- M9 4 项（m9-dev-language-roadmap.md §3.14/§3.16）
                  'lang_topic_findings', 'lang_source_consent', 'lang_source_shares', 'lang_resource_probe'
                )),
  subject_type  TEXT,
  subject_id    TEXT,
  project_id    TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  day           TEXT NOT NULL
);

INSERT INTO local_events_v4 (id, kind, subject_type, subject_id, project_id, payload_json, created_at, day)
SELECT id, kind, subject_type, subject_id, project_id, payload_json, created_at, day FROM local_events;

DROP TABLE local_events;
ALTER TABLE local_events_v4 RENAME TO local_events;
CREATE INDEX idx_local_events_kind_day ON local_events(kind, day);
CREATE INDEX idx_local_events_created_at ON local_events(created_at);

-- ---------- 3) ai_extract_consent：逐项目出网同意（语义平移 lang_source_consent） ----------
-- 清除 = 删行（DL-21：不留「曾记住」残影）；粒度限定本项目，防跨项目授权泄漏。
CREATE TABLE ai_extract_consent (
  project_id    TEXT PRIMARY KEY,
  remember_all  INTEGER NOT NULL DEFAULT 0 CHECK (remember_all IN (0,1)),
  remembered_at TEXT
);
