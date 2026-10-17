-- ============ M3 术语库学习化 · terms 三列（m3-terms-learning FR-1）============
-- owner 2026-10-18 裁定：**领域是第三个维度**，与 level/starter 同为「受控词表的枚举」，
-- 不是自由标签 ⇒ 落独立列，而不是继续留在 tags[0]。理由与 FR-3.2 一致：
-- tags[0] 是用户可增删的自由标签，删一次标签领域就跟着变，按领域做的筛选与分区
-- 将不可复现；把三维都落成列，筛选/排序才有稳定的谓词。
--
-- level/starter 取默认值 L2/0 而非 NULL（FR-1.3）：库里已有用户自建词条
-- （source='manual'）没有分类依据；给默认值等于「按中位处理」，而给 NULL 会让
-- 每个读取点都写一遍兜底 —— 默认值写进 DDL 只需一处。
--
-- ⚠️ level/starter 带 CHECK、domain **刻意不带 CHECK**，这是有代价的取舍：
--   · level/starter 的词表由本仓自产（content/seed/term-levels.json），写入前已收敛，
--     CHECK 是廉价护栏；
--   · domain 的词表来自 vibe-hub 上游的 tags[0]，是**外部可漂移**的数据。SQLite 不能
--     ALTER 一个 CHECK 约束，给它加 CHECK 意味着上游一加新领域，本仓就得「建新表、
--     复制数据、换名」（FR-9.2 为扩 kind 付的正是这份代价）。改为在 **API 写入边界**
--     由 Zod 的 z.enum(TERM_DOMAINS) 收口，读侧 TermOut.domain 宽容返回原字符串，
--     界面把词表外的值归入「未归类」。
--
-- 判级 B（响应形状 additive 变化，与 m3 v1.1 加 pinyin 同级）。

-- level 的 CHECK 字面量**必须与 packages/shared/src/constants.ts 的 TERM_LEVELS 逐字相同**，
-- 由 core-db 同族测试解析本文件比对 —— 与 0007 的 kind 同一套守卫，不得再落一个双源。
ALTER TABLE terms ADD COLUMN level TEXT NOT NULL DEFAULT 'L2' CHECK (level IN ('L1','L2','L3'));
ALTER TABLE terms ADD COLUMN starter INTEGER NOT NULL DEFAULT 0 CHECK (starter IN (0,1));

-- 可空，且不设 DEFAULT：未归类是合法状态（用户自建词条、上游新领域），不编造默认值。
ALTER TABLE terms ADD COLUMN domain TEXT;
