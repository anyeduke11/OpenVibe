-- 0025_agent_registry.sql（v0.3.0 FR-3.0-1 · agent 注册表最小只读版）
--
-- 背景：用户与 agent 都无法回答「这台机器上有哪些 agent 能被指挥、各自的旗标是什么」。
-- 竞品教训：iFlow 一年停服、goose/opencode 换 org ⇒ 注册表必须带健康检查与归档。
--
-- 命名空间：本表的 id 是 **CLI 命令名**（claude / codex / gemini …），
-- 与 `ADAPTER_IDS`（注入目标平台：claude-code / cursor / trae …）**不是同一命名空间**：
-- 前者回答「我能指挥谁」，后者回答「规则能注入到哪」。两者有同名项但语义不同，不得互相替代。
--
-- 为什么只读版：v0.3.0 派发线未裁定。本表只登记「谁在、旗标是什么、健不健康」，
-- 不实现运行/派发（`run()` 会触 design §8 冻结面，须 A 级）。故这里没有 runs 表、没有 dispatch 表。
--
-- 为什么归档用一列而不是删行：iFlow 已停服，但它的旗标映射仍是历史证据；
-- 删除会让「曾经登记过什么」永久丢失。archived=1 保留行、只在列表里降级展示。
CREATE TABLE agent_registry (
  -- CLI 命令名，稳定标识
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  -- 可执行命令名（用于 which 探测）；NULL = 未声明，健康检查判 unverified
  executable        TEXT,
  -- 四件必选契约中的三件旗标（退出码语义无需旗标）
  headless_flag     TEXT,
  resume_flag       TEXT,
  json_flag         TEXT,
  -- 能力协商声明：{"hooks":"yes|no|unknown","sandbox":…,"subagent":…,"sdk":…}
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  -- ok = 探测到可执行文件；missing = 探测不到；unverified = 未探测或无声明
  health            TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (health IN ('ok', 'missing', 'unverified')),
  archived          INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  -- C-19 配额字段（并入 FR-3.0-1，不另立）：NULL = 未设限额
  quota_limit       INTEGER,
  quota_cost        REAL,
  last_checked_at   TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_agent_registry_archived ON agent_registry (archived);
