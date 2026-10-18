-- ============ M3 术语库学习化 P5 · AI 调用留痕的台账 kind（m3-terms-learning FR-9）============
-- 目的：让**不可复算**的东西可追责（FR-9 开篇）—— 基线层是纯函数，AI 层不是，
-- 同一份项目两次跑 AI 给的候选可能不同，没有留痕就分不清「回归」与「噪声」。
--
-- ⚠️ **本迁移只为扩 CHECK 闭集，代价是重建整张表**。SQLite 不能 ALTER 一个
-- CHECK 约束（`ALTER TABLE ... RENAME TO` 也不会改已写好的约束表达式），
-- 唯一的办法是建新表 → 复制数据 → 删旧表 → 改名。这是 FR-9.2 写明的代价，
-- 也是 §8 待裁第 8 条「若 M8 后续还要扩 kind，先合本笔」的由来：
-- 重建一次的成本应当一次付清，而不是每加一个 kind 付一遍。
--
-- ⚠️ kind 的 CHECK 字面量**必须与 packages/shared/src/constants.ts 的
-- LOCAL_EVENT_KINDS 逐字相同且逐序相同**，由 core-db 同族测试解析本文件比对（FR-1.4）。
-- 那条守卫原先只读 0007，扩项后会误判红 ⇒ 已改为「扫描全部迁移、取最后一次定义」，
-- 但**判据本身没有放松**：仍然是「当前 CHECK ≡ 常量」，多一处少一处都红。
--
-- ⚠️ 顺序：新 kind 追加在 **M8 五项之后**，而不是插在中间。CHECK 是有序字面量表，
--   中插会让既有数据库的既有行与新字面量表错位；追加则历史行天然仍合法。

CREATE TABLE local_events_v2 (
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
                  'cli_agent_command_run', 'agent_bridge_installed',
                  -- M3 AI 1 项（m3-terms-learning FR-9.1）；⚠️ 声明态，写入点属 P4
                  'ai_recommend_call'
                )),
  subject_type  TEXT,
  subject_id    TEXT,
  project_id    TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  day           TEXT NOT NULL
);

INSERT INTO local_events_v2 (id, kind, subject_type, subject_id, project_id, payload_json, created_at, day)
SELECT id, kind, subject_type, subject_id, project_id, payload_json, created_at, day FROM local_events;

DROP TABLE local_events;
ALTER TABLE local_events_v2 RENAME TO local_events;

CREATE INDEX idx_local_events_kind_day ON local_events(kind, day);
CREATE INDEX idx_local_events_created_at ON local_events(created_at);
