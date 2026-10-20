-- ============ M9 v1.6 P1b · 资源层 ＋ 挂接（m9-dev-language-roadmap.md §3.1 资源 2 张 ＋ §3.14/§3.15/§3.16）============
--
-- 目的：把 owner 提供的《Python 与 Go 系统学习指南》里的 89 条学习资源 ＋ 11 条速成专区资源落库，
-- 并建「知识点 → 资源」的**单向**挂接表（P1b 的产出：种子 · 挂接表 · README 导出器 · 去重探测调度）。
--
-- ⚠️ 本迁移做四件事，顺序不可换：
--   ① 给 `lang_topics` 补 `content_level`（§3.11 要求，DL-31 的判据要遍历它）
--   ② 建 `lang_resources`（主清单 89 条）
--   ③ 建 `lang_vibe_resources`（速成专区 11 条）与 `lang_topic_resources`（挂接）
--   ④ **重建 `local_events`** —— 0011 留下的 P1b 义务：把 M9 预声明的 4 个 kind 装进 CHECK
--
-- ---------- ① lang_topics 补 content_level ----------
--
-- ⚠️ **为什么补这一列**（P1b 开工时才发现的规格缺口）：
--   §3.11 写明 `lang_topics.content_level ∈ {'point','full'}` ← 默认 'point'；
--   而 **DL-31 的判据正是遍历 `content_level='point'` 的 `lang_topics`**（「要点级条目至少有一条去处」）
--   ⇒ 缺这一列，DL-31 **无法字面表达**。
--   0011 建表时逐字照抄了 §3.1 的列清单，而 §3.1 那张表**当时漏了 content_level**（本轮一并订正）。
--   同族的先例：DL-12 的 `stage_id` 缺口（§7 附注①）—— **判据要的是数据，列清单漏了就是漏了**。
--
-- ⚠️ **为什么用 ADD COLUMN 而不是重建 lang_topics**：
--   SQLite 的 ADD COLUMN 支持带 CHECK 的列（只要默认值满足约束）⇒ 一条语句即可，
--   且**不重建 118 行知识点**（重建要复制数据、要重插索引，风险面大得多）。
--   默认值 'point' 与 §3.11 一致 ⇒ 既有 118 行全部合法（§3.11 说的「默认 'point'」正是这个意思）。

ALTER TABLE lang_topics ADD COLUMN content_level TEXT NOT NULL DEFAULT 'point' CHECK (content_level IN ('point','full'));

-- ---------- ② lang_resources：学习资源主清单（89 条 · §1.6 / §1.6.1）----------
--
-- ⚠️ **主键必须是 `(lang, name)` 而不是 `url`**（§1.6.1 的实测结论）：
--   89 条资源只有 **87 个去重 URL** —— `leetcode.cn` 与 `7days-golang` 各被两条资源共用
--   （同一站点在两门下上下文不同 / 一个当教程一个当项目库）。
--   按 url 建主键会**静默丢掉 2 条**（用户在 Go 语言下找不到刷题入口）⇒ DL-47 钉住这一点。
--
-- ⚠️ **字段逐字取自 §3.1 的列清单**，规格没列出的字段**不主动加**：
--   附件里的 `old`（内容偏旧，实测 10 条）**没有对应列** ⇒ 本轮**不落库**，
--   它的信息已由 `freshness`（时效说明）文案承载（实测那 10 条的文案都自陈了「旧/停更」），
--   登记在 `lang_resources.json` 的 `_notes` 里。
--
-- ⚠️ `verified_by` 的值域**只有 'owner_guide'**：§1.6 第 1 点写明「核实主体不是我」——
--   附件自述「所有链接于 2026-10-18 逐条检索核实」，而本模块**一条都没复核过**
--   ⇒ `source_checked_at` 恒 NULL（「没核过就不能写日期」），`verified_by` 只能是 owner_guide。
--   DL-29 的判据「改成 self ⇒ 红」由这个 CHECK 兜住。
--
-- ⚠️ **刻意没有 edges/parent/prereq 之类的列**（DL-27）：
--   89 条资源之间无依赖，加了就会诱使实现把它们接进 DAG ⇒ 89 个新的永久阻塞点。
CREATE TABLE lang_resources (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lang              TEXT    NOT NULL CHECK (lang IN ('python','go')),
  name              TEXT    NOT NULL,
  url               TEXT    NOT NULL,
  category          TEXT    NOT NULL CHECK (category IN ('official','github','course','book','video','practice')),
  -- §1.6.1 的 TIER 档位 —— **必要性矩阵的轴**（a 最小必备 / b 核心主线 / c 补充进阶 /
  -- d 高级底层 / e 过时补充）。⚠️ **刻意与 `category` 分开**：category 是筛选器用的
  -- 「资源是什么形态」，tier 是「它在路线里排第几」—— 两套维度恰好都六项，混起来肉眼看不出来。
  tier              TEXT    NOT NULL CHECK (tier IN ('a','b','c','d','e')),
  level_label       TEXT    NOT NULL CHECK (level_label IN ('0','1','2','3')),
  price             TEXT    NOT NULL CHECK (price IN ('free','paid','mix')),
  lang_label        TEXT    NOT NULL CHECK (lang_label IN ('zh','en','bi')),
  is_fav            INTEGER NOT NULL DEFAULT 0 CHECK (is_fav IN (0,1)),
  star              TEXT,
  summary           TEXT    NOT NULL DEFAULT '',
  freshness         TEXT    NOT NULL DEFAULT '',
  phase_id          INTEGER,
  verified_by       TEXT    NOT NULL DEFAULT 'owner_guide' CHECK (verified_by = 'owner_guide'),
  source_checked_at TEXT,
  -- §3.14 失效巡检四列（「核实过」是快照，不是结论）
  last_status_code  INTEGER,
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  alive             INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0,1)),
  last_checked_at   TEXT,
  UNIQUE (lang, name)
);
CREATE INDEX idx_lang_resources_lang ON lang_resources(lang);
CREATE INDEX idx_lang_resources_url ON lang_resources(url);
CREATE INDEX idx_lang_resources_category ON lang_resources(category);

-- ---------- ③ lang_vibe_resources：速成专区两组共 11 条（§1.7）----------
--
-- ⚠️ **刻意不带** 分类 / 费用 / 阶段 / 精选：
--   - **分类**：附件里这 11 条**确实没有**分类（它们是 AI 工具指引与工作流教程）⇒ 不编。
--   - **费用 / 阶段 / 精选**：附件里**是有的**，但按 **DL-41 刻意不落库**
--     （速成专区是平铺列表，筛选器对这张表不适用）⇒ 给了就等于给一张平铺表编筛选器。
-- ⚠️ 附件里另有 `d` 描述与 `f` 时效 —— **这两项落了**（表里有 summary / freshness 两列）；
--   （2026-10-20 订正：上一版说「这 11 条只有名称与 URL」是**照着 demo 副本**说的，
--   副本丢了那六个字段；附件原件里它们都在。）
--
-- ⚠️ **但失效巡检同样适用**（§3.21 末段）：Cursor / Windsurf / Qoder 的文档站改版频繁，
--   恰恰更该巡检 ⇒ 四列与主表同款。
CREATE TABLE lang_vibe_resources (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  "group"           TEXT    NOT NULL CHECK ("group" IN ('tools','tuts')),
  name              TEXT    NOT NULL,
  url               TEXT    NOT NULL,
  summary           TEXT    NOT NULL DEFAULT '',
  -- ⚠️ **tier 恒为 v（AI 工具）**，附件里这 11 条不在 `TIER` 映射里（那 87 键是主清单的）
  --   ⇒ 刻意**不建 tier 列**：整张表就是 v 这一档，建一列全是 'v' 的列没有信息量。
  freshness         TEXT    NOT NULL DEFAULT '',
  verified_by       TEXT    NOT NULL DEFAULT 'owner_guide' CHECK (verified_by = 'owner_guide'),
  source_checked_at TEXT,
  last_status_code  INTEGER,
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  alive             INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0,1)),
  last_checked_at   TEXT,
  UNIQUE ("group", name)
);
CREATE INDEX idx_lang_vibe_resources_group ON lang_vibe_resources("group");

-- ---------- ④ lang_topic_resources：知识点 → 资源（单向多对多 · §3.15）----------
--
-- ⚠️ **只有这一个方向**：资源不得反向认领知识点（§3.15）——
--   若允许反向，就会出现「一个 awesome-go 清单条目声称自己覆盖 40 个知识点」，
--   而 §1.5 已实测那类资源无序、无前置 ⇒ 反向认领等于让无序清单定义路线。
--
-- ⚠️ `role` 三档：primary 主去处 / backup 备选 / practice 练习平台。
--   DL-31 要求「要点级（content_level='point'）条目至少有一条去处」⇒ 靠 role 区分主次。
CREATE TABLE lang_topic_resources (
  topic_id    INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES lang_resources(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK (role IN ('primary','backup','practice')),
  PRIMARY KEY (topic_id, resource_id)
);
CREATE INDEX idx_lang_topic_resources_resource ON lang_topic_resources(resource_id);

-- ---------- ⑤ 重建 local_events：把 M9 的 4 个 kind 装进 CHECK（0011 留下的 P1b 义务）----------
--
-- ⚠️ 0011 的注释写着：「P0 预声明的 4 个 LANG_EVENT_KINDS … 要等 P1b（资源层）写 0012 迁移时
--   一起加到 local_events 的 CHECK。」—— **本迁移就是那笔 0012**。
--
-- ⚠️ **代价是重建整张表**：SQLite 不能 ALTER 一个 CHECK 约束
--   （`ALTER TABLE ... RENAME TO` 也不会改已写好的约束表达式），
--   唯一的办法是建新表 → 复制数据 → 删旧表 → 改名（同 0010 的做法）。
--
-- ⚠️ kind 的 CHECK 字面量**必须与 packages/shared/src/constants.ts 的 LOCAL_EVENT_KINDS
--   逐字相同且逐序相同**，由 core-db 同族测试解析本文件比对。
--
-- ⚠️ **顺序：新 kind 追加在最后**（M8 六项之后），不是插在中间 ——
--   CHECK 是有序字面量表，中插会让既有数据库的既有行与新字面量表错位；追加则历史行天然仍合法。
CREATE TABLE local_events_v3 (
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
                  -- M3 AI 1 项（m3-terms-learning FR-9.1）
                  'ai_recommend_call',
                  -- M9 4 项（m9-dev-language-roadmap.md §3.14/§3.16；P0 预声明，P1b 落地）
                  'lang_topic_findings', 'lang_source_consent', 'lang_source_shares', 'lang_resource_probe'
                )),
  subject_type  TEXT,
  subject_id    TEXT,
  project_id    TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  day           TEXT NOT NULL
);

INSERT INTO local_events_v3 (id, kind, subject_type, subject_id, project_id, payload_json, created_at, day)
SELECT id, kind, subject_type, subject_id, project_id, payload_json, created_at, day FROM local_events;

DROP TABLE local_events;
ALTER TABLE local_events_v3 RENAME TO local_events;

CREATE INDEX idx_local_events_kind_day ON local_events(kind, day);
CREATE INDEX idx_local_events_created_at ON local_events(created_at);
