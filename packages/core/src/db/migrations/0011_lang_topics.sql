-- ============ M9 v1.6 P1 · 知识点库与 DAG（m9-dev-language-roadmap.md §3.1 + §3.7）============
--
-- 目的：把规格 §3.1 的「§3.1 抬头 17 张表」里**前 6 张**（知识点拓扑）落库。
-- 这 6 张是 P1 的基础：P1b 在它们之上挂资源、P1d 派生模式、P2 推导掌握度、
-- P4 写源码命中。P1 之前不存在任何 `lang_*` 表（M9 完全是新域）。
--
-- ⚠️ 一次性建 6 张而不是拆 6 笔迁移 —— 与 0007 「台账 ＋ M8 三表 同次建」
-- 同源：拆笔会让「表已建但内容未入」这个中间态静默存在；且 P1.2/P1.3 的
-- runoob 84 + 34 条 seed 必须先有表才能 INSERT。
--
-- ⚠️ 本迁移**只为建新表**，不修改任何已有表。SQLite 不能 ALTER 已写好的 CHECK
-- 约束，但本迁移不修改任何已有表的约束 —— 没有那种代价。
-- P0 预声明的 4 个 LANG_EVENT_KINDS（lang_topic_findings / lang_source_consent /
-- lang_source_shares / lang_resource_probe）属于「台账」层，不在本迁移里。
-- 它们要等 P1b（资源层）写 0012 迁移时一起加到 local_events 的 CHECK。
--
-- ⚠️ 字段逐字取自规格 §3.1。规格没列出的字段**不主动加**（除了 §3.1 第 6 张表
-- `lang_topic_content` 的多态外键需要 `ref_kind` 鉴别列 —— 见该表注释）。

-- ---------- 1) lang_concepts：概念层（跨语言；§3.7 第一层）----------
--
-- 概念是术语库与语言层的共同挂接点。「函数」「闭包」「异常」这些跨语言共通概念
-- 写在这里，被两个 `lang_topics`（Python 函数、Go 函数）同时挂接。
-- 概念**不**带 lang 列 —— 它是语言无关的。
--
-- ⚠️ `content_level`（'headline'|'concept'|'full'）的词表与 `lang_topics.content_level` 同源，
--    但**写死在两个地方**是因为概念层有自己的种子节奏（与语言层独立更新）。
--    词表漂移由 `tests/m9-discipline.test.ts` 的 §3.1 双源一致性测试守护。
CREATE TABLE lang_concepts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  summary         TEXT    NOT NULL DEFAULT '',
  content_level   TEXT    NOT NULL DEFAULT 'headline' CHECK (content_level IN ('headline','concept','full')),
  updated_at      TEXT    NOT NULL
);
CREATE INDEX idx_lang_concepts_slug ON lang_concepts(slug);

-- ---------- 2) lang_concept_deltas：概念 × 语言的差异（§3.12）----------
--
-- 「Python 的闭包 vs Go 的闭包」「Go 的 error vs Python 的异常」—— 这种**只写差异**
-- 的内容落在这里，不重复共通部分。
--
-- ⚠️ `since_version` / `until_version` 是判据的输入（DL-24），不是元数据：
--    语言大版本变更时，脚本按版本区间挑出受影响的差异条目并提示复核。
--    Go 1.18 加泛型 ⇒ 「无泛型」那条差异被打上 `until_version='1.18'`，而不是删掉 ——
--    **删掉就丢了「以前为什么没有」这段历史**。
--
-- ⚠️ `aspect`（语法/错误模型/并发模型/类型系统/包管理）刻意**不**用 CHECK 约束：
--    词表以后会随新概念扩，SQLite 不能 ALTER CHECK，加 CHECK 等于给自己埋「建新表
--    复制数据换名」的代价。约束在 API 写入边界由 Zod 收口。
CREATE TABLE lang_concept_deltas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id      INTEGER NOT NULL REFERENCES lang_concepts(id) ON DELETE CASCADE,
  lang            TEXT    NOT NULL CHECK (lang IN ('python','go')),
  aspect          TEXT    NOT NULL,
  summary         TEXT    NOT NULL DEFAULT '',
  since_version   TEXT    NOT NULL,
  until_version   TEXT,
  supersedes      INTEGER REFERENCES lang_concept_deltas(id) ON DELETE SET NULL,
  UNIQUE (concept_id, lang, aspect, since_version)
);
CREATE INDEX idx_lang_concept_deltas_concept_lang ON lang_concept_deltas(concept_id, lang);

-- ---------- 3) lang_topic_content：概念层/语言层的三段内容（§3.7）----------
--
-- 同一份内容主体可挂在**概念**上（跨语言共通）也可挂在**知识点**上（语言专有）。
-- 规格 §3.1 写「topic_or_concept_id」是把两种放同一张表里 —— 这就是 SQL 上的多态外键。
--
-- ⚠️ 规格没列 `ref_kind` 鉴别列。**本迁移**主动加了它（CHECK 'topic' | 'concept'），
--    理由：多态外键必须有鉴别列，否则 INSERT 时无法知道这个 id 指向哪张表。
--    若维持「只挂概念」或「只挂知识点」任一单边，就破坏了 §3.7 的「二层结构」设计意图。
--    「ref_kind ＝ 鉴别列，不是规格字段」的取舍，已在 commit message 登记。
CREATE TABLE lang_topic_content (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_kind            TEXT    NOT NULL CHECK (ref_kind IN ('topic','concept')),
  ref_id              INTEGER NOT NULL,
  kind                TEXT    NOT NULL CHECK (kind IN ('steps','example','principle')),
  body_md             TEXT    NOT NULL,
  content_level       TEXT    NOT NULL DEFAULT 'headline' CHECK (content_level IN ('headline','concept','full')),
  updated_at          TEXT    NOT NULL
);
-- ⚠️ 不在外键上挂 REFERENCES：因为多态 —— SQLite 不支持「取决于另一列指向不同表」
-- 的外键。引用完整性由 §3.7 写入边界（Zod 校验 ref_kind 与 ref_id 匹配）收口。
-- 这种取舍在文档里有「写进注释而不是写进代码」的同款前例（§3.13），但这里**没**法用代码保证，
-- 所以**只能**写进注释。
CREATE INDEX idx_lang_topic_content_ref ON lang_topic_content(ref_kind, ref_id);

-- ---------- 4) lang_topics：语言 × 知识点（DAG 节点）----------
--
-- 这是 DL-12 关键的 `kind` 列的落处：**'language' | 'library'**。
-- 84 条 runoob 列表里库级占 36%（DL-13 的实测基准）—— 把它们也塞进线性学习路线
-- 就会污染「学完这站能独立做成什么」的能力分块（§3.6 的分站意义）。
-- `kind='library'` 的条目**不**进学习路线的 DAG 节点，**只**进「按需查阅」区。
-- 这条不变式由 §1.4 ＋ DL-12 + §3.5 共同守护。
--
-- ⚠️ `stage_id` 喂的是 §3.6 那张 8 站（runoob 自建，喂「学什么」）—— 与
--    `lang_profile_phases.ord`（附件分期，喂「什么时候学」）是**两套**，
--    故意不做映射（§3.6 / DL-50）。
CREATE TABLE lang_topics (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  lang                TEXT    NOT NULL CHECK (lang IN ('python','go')),
  slug                TEXT    NOT NULL,
  title               TEXT    NOT NULL,
  summary             TEXT    NOT NULL DEFAULT '',
  stage_id            INTEGER NOT NULL CHECK (stage_id BETWEEN 0 AND 7),
  ref_url             TEXT,
  ref_title           TEXT,
  source_kind         TEXT    NOT NULL DEFAULT 'runoob' CHECK (source_kind IN ('runoob','walter201230','xinliangnote','awesome_go','awesome_python_cn','owner_guide')),
  source_checked_at   TEXT,
  kind                TEXT    NOT NULL DEFAULT 'language' CHECK (kind IN ('language','library')),
  UNIQUE (lang, slug)
);
CREATE INDEX idx_lang_topics_lang_stage ON lang_topics(lang, stage_id);
CREATE INDEX idx_lang_topics_kind ON lang_topics(kind);

-- ---------- 5) lang_topic_edges：前置依赖（DAG 的边）----------
--
-- 两侧都在 lang_topics 内。CHECK 禁止自环（topic_id = prereq_topic_id）。
-- **环的检测**不是 SQLite 的事（SQLite 没法阻止「后来加一条边把图变成环」），
-- 是 §3.5 的运行时守卫（DL-04）的活。本迁移只防自环。
CREATE TABLE lang_topic_edges (
  topic_id            INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  prereq_topic_id     INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, prereq_topic_id),
  CHECK (topic_id <> prereq_topic_id)
);
CREATE INDEX idx_lang_topic_edges_prereq ON lang_topic_edges(prereq_topic_id);

-- ---------- 6) lang_topic_terms：知识点 ↔ 术语（多对多，刻意允许稀疏）----------
--
-- ⚠️ **不得反向写 terms 表**：那是 M3 的资产面，本表只做挂接。
-- 这一条不变式由 `lang_topic_terms` **没有** `terms` 写入 helper 来保证（API 边界）。
CREATE TABLE lang_topic_terms (
  topic_id            INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  term_id             INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, term_id)
);
CREATE INDEX idx_lang_topic_terms_term ON lang_topic_terms(term_id);
