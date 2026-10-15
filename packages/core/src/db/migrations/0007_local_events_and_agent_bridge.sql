-- ============ RF1-5 本地事件台账 ＋ M8 Agent 接入层（三表）============
-- owner 2026-10-14 裁①：台账表与 M8 三表在**同一次迁移**里建，即「一次建四表」。
-- 裁③/④ 连带：LOCAL_EVENT_KINDS 由 13 项扩至 **18 项**（13 台账 ＋ 5 M8），
-- 与三张 M8 表同笔落地 —— 分两次迁移会让「kind 已扩但表未建」这个中间态静默存在。
-- 判级 B（specs 的 FR／边界／验收条目面；非 design §7 契约面、非 §8 冻结面、非 golden）。

-- ---------- 1) local_events（台账本体 · local-event-ledger.md FR-1）----------
-- day 落列不现算，照 telemetry_events 的先例；不建 FTS（台账不做全文检索，别顺手加面）。
-- kind 的 CHECK 字面量**必须与 packages/shared/src/constants.ts 的 LOCAL_EVENT_KINDS
-- 逐字相同**，由 core-db 同族测试解析本文件比对（FR-1.4）——遥测那份同样的双源当前无人守，
-- 本项不得再落一个。
CREATE TABLE local_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN (
                  -- 台账 13 项（local-event-ledger.md FR-2.1：分析文十项 ＋ 3）
                  'asset_created', 'asset_updated', 'asset_deleted', 'asset_reflowed',
                  'checklist_item_checked', 'flow_template_run',
                  'injection_confirmed', 'injection_conflict_resolved', 'injection_failed',
                  'pack_composed', 'pack_exported',
                  'stage_advanced', 'stage_view_switched',
                  -- M8 5 项（m8-agent-bridge.md FR-5.1）
                  'agent_ingest_accepted', 'agent_ingest_rejected', 'agent_context_served',
                  'cli_agent_command_run', 'agent_bridge_installed'
                )),
  subject_type  TEXT,
  subject_id    TEXT,
  project_id    TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  day           TEXT NOT NULL
);
CREATE INDEX idx_local_events_kind_day ON local_events(kind, day);
CREATE INDEX idx_local_events_created_at ON local_events(created_at);

-- ---------- 2) agent_sessions（M8-B/C/D · m8-agent-bridge.md FR-1.3）----------
-- 本表是「这次会话聊了什么」的元数据，**不建 FTS**（要搜的正文在 dev_log_entries.body）。
-- external_session_id 是平台侧 id 的字符串，OpenVibe 不解析、不校验其格式
-- （各平台形态未知，强校验必误拒）。
CREATE TABLE agent_sessions (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  external_session_id TEXT NOT NULL,
  title               TEXT NOT NULL DEFAULT '',
  summary             TEXT NOT NULL DEFAULT '',
  started_at          TEXT,
  ended_at            TEXT,
  created_at          TEXT NOT NULL,
  UNIQUE (project_id, platform, external_session_id)
);

-- ---------- 3) agent_ingests（回流待确认队列 · m8-agent-bridge.md FR-1.2）----------
-- status 四态闭集写进 CHECK；**不得引入第五态**（「已过期」是 created_at + 时间窗的
-- 读侧判据，不是存储态）。
-- idempotency_key 的 UNIQUE 自带隐式索引，实现时**不再手工建一条重复索引**。
-- cwd 是上报方自报的绝对路径，只用于冲突判定与 Web 展示，不进台账 payload_json。
CREATE TABLE agent_ingests (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN (
                     'dev_log', 'session', 'requirement', 'task_status', 'check_state')),
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
CREATE INDEX idx_agent_ingests_project_status ON agent_ingests(project_id, status, created_at DESC);

-- ---------- 4) requirements（需求条目 · m8-agent-bridge.md FR-1.1a）----------
-- owner 裁④：本轮一并建。与 tasks **两表独立、无外键** —— 加 tasks.requirement_id 需
-- ALTER 0001_init.sql 的既有表，既有 spec 明确禁止就地扩列，故 tasks.requirement_id 是禁区。
-- source_session_id 用 ON DELETE SET NULL 而非 CASCADE：删会话不等于删需求。
CREATE TABLE requirements (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  detail            TEXT NOT NULL DEFAULT '',
  priority          TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0','P1','P2')),
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','confirmed','done','dropped')),
  source_session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_requirements_project_status ON requirements(project_id, status);
