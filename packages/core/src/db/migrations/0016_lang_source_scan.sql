-- ============ 0016 · M9 源码扫描层（P4）============
--
-- 三张表，**全部是 §3.1 十七张里的那三张**（不是新增表）⇒ 表数仍 17。
-- 逐列取自 §3.9 / §3.10，**不主动加列**（0011 迁移纪律）。
--
-- ⚠️ `lang_topic_findings` 是**扫描结果**，不是源码正文：
--    它只存「哪个文件、第几行、命中了什么模式」——
--    **一个字节的源码正文都不进库**（§3.8 三条线第 1 条 · FR-9.3）。
--
-- ⚠️ `file_rel_path` 是**相对路径**（相对项目根）：§3.10 明写「⚠️ 相对路径，
--    不含绝对路径（FR-7.2）」—— 存绝对路径的话，导出的文件会被用户随手转发，
--    连带泄露本机用户名（禁列扫描器的「本机用户名」规则会报）。
--
-- ⚠️ `scan_id` **没有对应的表**（§3.10 列了它，但 §3.1 的十七张里没有「扫描」表）
--    ⇒ 它是**分组键**（一次扫描一个值），**不建外键**。
--    用扫描时刻的毫秒数 ⇒ 天然可排序、可区分两次扫描。

-- ---------- ① lang_topic_findings：一次扫描的每条命中（§3.10）----------
CREATE TABLE lang_topic_findings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id         INTEGER NOT NULL,
  topic_id        INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  file_rel_path   TEXT    NOT NULL,
  line            INTEGER NOT NULL,
  col             INTEGER NOT NULL,
  matched_pattern TEXT    NOT NULL,
  -- 'confirmed'（解析器确认）| 'possible'（启发式）—— §3.8.2 第 2 条：两档不混
  confidence      TEXT    NOT NULL CHECK (confidence IN ('confirmed','possible')),
  -- 'parser' | 'heuristic' —— §3.8.2 第 1 条：路径必须显式可见
  scanner_mode    TEXT    NOT NULL CHECK (scanner_mode IN ('parser','heuristic'))
);
CREATE INDEX idx_lang_topic_findings_scan ON lang_topic_findings(scan_id);
CREATE INDEX idx_lang_topic_findings_topic ON lang_topic_findings(topic_id);

-- ---------- ② lang_source_consent：「本项目记住我的选择」（§3.9）----------
--
-- ⚠️ 粒度限定「本项目」：全局记忆会让一个项目的授权泄漏到另一个项目。
-- ⚠️ `remember_all` 是**布尔**（`remember_all boolean`）：只记「全发 / 全不发」两种，
--    **不记逐条选择** —— 逐条记忆会把「上次勾了这条」当成「这次也勾了」，
--    而用户真正想记住的只有「别再问」。
CREATE TABLE lang_source_consent (
  project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  remember_all  INTEGER NOT NULL DEFAULT 0 CHECK (remember_all IN (0,1)),
  remembered_at TEXT    NOT NULL
);

-- ---------- ③ lang_source_shares：每一次出网的计数（§3.9）----------
--
-- ⚠️ **只存计数与指纹，不存片段内容**（FR-9.3）；
-- ⚠️ **不存文件路径**（FR-7.2 ＋ FR-9.3 双重）⇒ 这张表连「哪个文件」都没有。
-- ⚠️ `consent_source` 是**关键列**：用户「当次勾的」与「因为记住了而默认勾的」
--    必须能分开统计 —— 否则「可审计」退化成「有个计数」，出事时分不清是主动授权
--    还是被记忆带过去的（§3.9 末段）。
CREATE TABLE lang_source_shares (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  topic_id_count INTEGER NOT NULL,
  snippet_count  INTEGER NOT NULL,
  created_at     TEXT    NOT NULL,
  consent_source TEXT    NOT NULL CHECK (consent_source IN ('explicit_tick','remembered'))
);
CREATE INDEX idx_lang_source_shares_project ON lang_source_shares(project_id, created_at);
