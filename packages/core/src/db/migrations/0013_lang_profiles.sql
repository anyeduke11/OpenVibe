-- ============ M9 v1.6 P1d · 三模式层（m9-dev-language-roadmap.md §3.17 / §3.17.1 · DL-33~36 / DL-49）============
--
-- 目的：把「精通 / 熟悉 / 速成」三模式落成两张表：
--   ① `lang_profile_phases`  —— 模式 × 语言 × 段（**21 段照抄附件**）
--   ② `lang_topic_profiles`   —— 知识点 × 模式（depth / required / rank / est_minutes）
--
-- ⚠️ 本迁移做两件事，顺序不可换：
--   ① 建 `lang_profile_phases`（§3.17 的模式时间线）
--   ② 建 `lang_topic_profiles`（§3.17 的「知识点 × 模式」那一份）
--
-- ---------- ① lang_profile_phases：模式 × 语言 × 段（21 段）----------
--
-- ⚠️ **唯一键是 `(profile, lang, ord)`，不能假定精通段 ⊇ 熟悉段**（§3.17.1 第 1 条）：
--   Python 精通 5 段 vs 熟悉 3 段，而两者的段内容**并不互为子集**
--   （精通的「阶段 3 · 方向实战」在熟悉路线里没有对应段）⇒ 段表按三张独立时间线存。
--
-- ⚠️ **产出栏整串逐字入库，一个前缀都不许剥**（§3.17.1 第 4 条 · DL-49）：
--   「产出」＝可交付物、「练习」＝动作要求、「跳过」＝**本段明确不学什么**。
--   三者若归一，界面就会把「本段不学并发」显示成「本段产出并发模式」—— 方向完全相反。
--
-- ⚠️ **`outcome` 必须可空**（§3.17.1 第 5 条）：实测 **21 段里只有 14 段带这一栏，7 段没有**
--   （Python 精通阶段 4「长期持续」＋ 两门各 3 段速成）⇒ 种子**显式写 NULL**，
--   界面在为空时整行不渲染，不许填「继续学习」这类自撰文案充数。
--
-- ⚠️ **`duration_label` 是字符串列而不是区间列**（§3.17.1 第 3 条）：
--   「长期」是一个合法耗时值（Python 精通阶段 4），它不是空值也不是 bug；
--   若建成 weeks_start / weeks_end 两个整数列，这一行就得写 NULL，而 NULL 与「未知」不可区分。
--
-- ⚠️ **附件逐字标签 `label` 是本轮补的列**（2026-10-20 订正）：
--   §3.17 的列清单当时只写了 title / duration_label / points[] / outcome，
--   而 §3.17.1 那张对照表有「附件逐字标签」一列、DL-49 断的也是「段序、**标签**、阶段名、耗时逐格相等」
--   ⇒ 列清单漏了它。规格已同步订正（先订正规格，再落列 —— 同 `content_level` 的先例）。
--
-- ⚠️ **`points` 存 JSON 数组文本**（SQLite 没有数组类型）：
--   每一项是附件 `ul li` 的逐字要点（§3.2：要点可入库，长文正文不入库）。
--   CHECK 用 json_valid 兜住「它必须是合法 JSON」—— 不然一个手滑就会写进一段散文。
CREATE TABLE lang_profile_phases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  profile        TEXT    NOT NULL CHECK (profile IN ('master','familiar','vibe')),
  lang           TEXT    NOT NULL CHECK (lang IN ('python','go')),
  ord            INTEGER NOT NULL CHECK (ord >= 1),
  -- 附件逐字标签（如「阶段 0 · 约 0.5 周」「Day 2–3 · 最小知识」）
  label          TEXT    NOT NULL,
  -- 阶段名（如「环境与准备」）
  title          TEXT    NOT NULL,
  -- 耗时（「0.5 周」「长期」——「长期」是合法值，不是空值）
  duration_label TEXT    NOT NULL,
  -- 每段 2–3 条要点（附件 ul li 的逐字内容，JSON 数组）
  points         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(points)),
  -- 产出栏**整串**（含「产出：」「练习：」「跳过：」前缀）；附件无此栏 ⇒ NULL
  outcome        TEXT,
  UNIQUE (profile, lang, ord)
);
CREATE INDEX idx_lang_profile_phases_profile ON lang_profile_phases(profile, lang, ord);

-- ---------- ② lang_topic_profiles：知识点 × 模式（§3.17）----------
--
-- ⚠️ **「模式只改三件事」**（§3.17）：学哪些（required）· 先学哪个（rank）· 看到多深（depth）。
--   **模式不得影响掌握度口径**（DL-34）—— 这张表里的任何一列都不得进 `computeState()` 的入参。
--
-- ⚠️ **没有 profile 列进 `lang_topics`**（§3.1）：模式是**视图属性**，不是知识点的固有属性 ——
--   同一个知识点在精通里是「完整」、在速成里是「一句话要点」，那不是它变了，是你看它的方式变了。
--
-- ⚠️ **`est_minutes` 只在速成模式给**（§3.17 第 3 条 · DL-36）：
--   「3–7 天」若没有每条要花多久，它就是一句营销话术而不是计划；
--   而精通与熟悉的时间基线由**路线分期**承担，逐条估分钟是伪造精度 ⇒ 那两个模式恒为 NULL。
--
-- ⚠️ **主键是复合的**（topic_id + profile）⇒ 查这个表时**不许写 ORDER BY**：
--   两列单独都不唯一，而仓级的排序守卫只认单列唯一键作兜底 ⇒ **排序放 JS**。
CREATE TABLE lang_topic_profiles (
  topic_id     INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  profile      TEXT    NOT NULL CHECK (profile IN ('master','familiar','vibe')),
  -- 详情页展示到哪一层（**展示层**，不是新的内容形态）
  depth        TEXT    NOT NULL CHECK (depth IN ('headline','concept','full')),
  -- 该模式下是否必学
  required     INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
  -- 该模式下的主线顺序
  rank         INTEGER NOT NULL CHECK (rank >= 1),
  -- 只在速成模式给（「看懂并能提问」的时间，不含练习与做项目）
  est_minutes  INTEGER CHECK (est_minutes IS NULL OR est_minutes > 0),
  PRIMARY KEY (topic_id, profile)
);
CREATE INDEX idx_lang_topic_profiles_profile ON lang_topic_profiles(profile, required);
