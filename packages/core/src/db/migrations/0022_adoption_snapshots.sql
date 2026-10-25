-- 0022_adoption_snapshots.sql（核心域 · v0.2.3 批次 D，AN5 第二段）
-- 采纳率快照：每次「候选经人工裁决累计到窗口下限」落一行，支撑 QG1 的
-- 「连续 2 轮低于门槛」时间序列判定（此前 MVP 只有当前累计窗口的 belowThreshold）。
-- 快照由 reseed/m9 与 review 之外的快照动作触发（writeAdoptionSnapshot），
-- 只增不改；轮次号 = 同 kind 内自增。
CREATE TABLE adoption_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL CHECK (kind IN ('term_candidate','prompt_candidate','playbook_candidate')),
  round_no     INTEGER NOT NULL CHECK (round_no >= 1),
  published    INTEGER NOT NULL,
  rejected     INTEGER NOT NULL,
  rate         REAL CHECK (rate IS NULL OR (rate >= 0 AND rate <= 1)),
  below        INTEGER NOT NULL CHECK (below IN (0,1)),
  created_at   TEXT NOT NULL,
  UNIQUE (kind, round_no)
);
CREATE INDEX idx_adoption_snapshots_kind ON adoption_snapshots(kind, round_no DESC);
