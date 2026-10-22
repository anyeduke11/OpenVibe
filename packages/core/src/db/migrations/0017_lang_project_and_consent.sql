-- ============ 0017 · M9 多项目隔离 ＋ 出网台账细分（owner 2026-10-22 裁定）============
--
-- ⚠️ **零新增表**：表数仍是十七张（§3.1）。本迁移只给**两张既有表**各加一列。
--
-- ① `lang_topic_findings` 加 `project_id` ——
--    理由：原来命中只属**最近一次扫描**（§3.10 的字段清单里没有项目列），
--    ⇒ 扫项目 B 会覆盖项目 A 的命中，多项目用户根本没法同时看两个项目。
--    owner 2026-10-22 裁定「加项目列，并同步改 spec §3.10 的字段清单」。
--
-- ② `lang_source_shares` 加 `consent_detail` ——
--    理由：原来 `consent_source` 是二分（`explicit_tick` / `remembered`），
--    而「因为记住了而全勾」与「用户自己又全勾了一遍」**都记成 remembered**
--    ⇒ 事后审计分不清这两种情况。owner 2026-10-22 裁定「加一列区分」。
--
-- ⚠️ **0011 迁移纪律的例外**：该纪律要求「字段逐字取自规格」，
--    而这两列**规格里原本没有** ⇒ 本次**同时改规格**（§3.10 / §3.9），
--    不是「规格没写就自己加」。

-- ---------- ① lang_topic_findings：加项目列（§3.10 · owner 2026-10-22）----------
--
-- ⚠️ **可空**：历史行**不知道**属于哪个项目（建表时就没记）⇒ 迁移只能**尽量回填**：
--   库里**只有一个**项目时填它（那是唯一说得通的解释）；
--   有多个项目时**留空**（宁可说「不知道」，也不猜）⇒
--   读端按项目过滤时这些行**不出现**（它们是历史数据，不该算到任何项目头上）。
ALTER TABLE lang_topic_findings ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

UPDATE lang_topic_findings
   SET project_id = (SELECT id FROM projects ORDER BY id LIMIT 1)
 WHERE project_id IS NULL
   AND (SELECT COUNT(*) FROM projects) = 1;

CREATE INDEX idx_lang_topic_findings_project ON lang_topic_findings(project_id);

-- ---------- ② lang_source_shares：加授权来源细分（§3.9 · owner 2026-10-22）----------
--
-- ⚠️ **`consent_source` 保留**（二分不变）⇒ 既有判据与既有台账读法都不受影响；
--   新列承载**细分**：
--   - 'memory_applied'  —— 记忆起了作用（全发记忆 ＋ 发了全部 / 全不发记忆 ＋ 一条没发）
--   - 'user_reticked'   —— 记忆是「全发」，但**用户自己又全勾了一遍**（与服务端判定一致，
--                          但它依赖客户端「动过没有」的上报 ⇒ 台账里两个字段可交叉核对）
--   - 'user_partial'    —— 用户自己勾了一部分（不是记忆带过去的）
--   - 'no_memory'       —— 没有记忆，纯用户主动
--   - 'unknown'         —— **历史行**（本迁移之前写的行，分不出细分）
ALTER TABLE lang_source_shares
  ADD COLUMN consent_detail TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_detail IN ('memory_applied','user_reticked','user_partial','no_memory','unknown'));
