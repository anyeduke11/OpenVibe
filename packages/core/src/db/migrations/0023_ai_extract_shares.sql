-- 0023_ai_extract_shares.sql（核心域 · v0.2.3 批次 D 收尾，spec FR-7.2 补齐）
-- 提取出网审计行（对齐 M9 lang_source_shares 的模式：出网事实落在专用表，
-- 台账 9 键白名单不动——审计粒度需要 consent 来源与计数，塞台账会破坏「无正文容器」的最小面）。
-- 授权来源由服务端推导（deriveExtractConsent：记忆内容 + 本次是否显式确认），不采信客户端分类。
CREATE TABLE ai_extract_shares (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      TEXT NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  candidate_count INTEGER NOT NULL,
  passed_count    INTEGER NOT NULL,
  dropped_count   INTEGER NOT NULL,
  -- 二分来源（对齐 lang_source_shares.consent_source）：显式勾选 / 记忆生效
  consent_source  TEXT NOT NULL CHECK (consent_source IN ('explicit_tick','remembered')),
  -- 四值细分：首次显式确认 / 记忆生效 / 记忆在场仍显式确认 / 不可判（防御值）
  consent_detail  TEXT NOT NULL CHECK (consent_detail IN ('no_memory','memory_applied','user_reticked','unknown')),
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_ai_extract_shares_day ON ai_extract_shares(created_at DESC, project_id);
