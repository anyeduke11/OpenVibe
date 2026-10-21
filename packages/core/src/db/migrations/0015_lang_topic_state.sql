-- 0015_lang_topic_state.sql —— 掌握度推导结果（§3.1 的 `lang_topic_state` · §3.3 / §3.13 · DL-25）
--
-- ⚠️ **这张表在 §3.1 的十七张里早就有名字**（v1.2 起就列在「知识点 7」那一组），
--   但直到 P2 才真正建表 ⇒ **表数不因本迁移变化**（§3.1 仍十七张，DL-26 复算仍 17）。
--
-- ## 它记什么
--
-- **证据**，不是分数。§3.1 的原话：「存的是**证据**不是分数 —— 分数换算法后要能重算」。
-- ⇒ 每一行是「某个知识点在某个项目里的一条证据」，外加**推导出来的状态**。
-- ⇒ 换算法 ⇒ 删掉重算即可，不需要迁移历史分数。
--
-- ⚠️ **列逐字取自 §3.1**（规格没列出的字段不主动加）：
--   topic_id, project_id, state, evidence_kind, evidence_ref, computed_at
--
-- ## ⚠️ 为什么**没有 count 列**
--
-- §3.1 明写六列，**没有**次数列 ⇒ 次数是**入参侧**的事，不落库。
-- ⇒ 「同一段源码重复命中 20 次」在库里就是**一行**（同一出处），
--   而不是二十行 —— 这正是 §3.13「重复命中只增加确定性不增加掌握度」的存储形状。
--
-- ## ⚠️ 主键是**复合键** (topic_id, project_id, evidence_kind, evidence_ref)
--
-- 四个键合起来才唯一：同一个知识点在同一个项目里，「同一种类的同一个出处」只能有一条。
-- ⇒ 查表**不许 ORDER BY**（本仓的 SQL 静态守卫只认单列唯一键作兜底排序键）⇒ 排序放 JS。
--
-- ⚠️ `state` 在每一行上**冗余**重复存：状态是「(知识点, 项目)」级别的量，
--   而表的主键是「证据」级别的 ⇒ 一个知识点的多行带着同一个状态。
--   这是刻意的 —— 读一行就能知道结论，不必再聚合一次。
--
-- ## ⚠️ `computed_at` 是**这份状态的参照日**
--
-- 状态是「截至某个时刻算出来的」⇒ 参照日必须与状态**存在同一行里**，
-- 不放在别处 —— 放别处就要人工保证两处一致，一处就天生一致。
--
-- ## ⚠️ `state` 的取值域是三态，**存英文**
--
-- §3.13 明写 `active` / `mastered` 是入库值 ⇒ 中文只出现在文案层（§3.5）。
--   而 `unused` 是三态的第三档（「未触及」的入库写法，界面一律写「本项目未涉及」）。
--
-- ## ⚠️ 外键：项目侧指向 `projects(id)`，知识点侧指向 `lang_topics(id)`
--
-- 两个方向都 `ON DELETE CASCADE` —— 项目删了，掌握度行没有存在意义；
-- 知识点删了（它被重算重排过），它的状态行也一并消失。
CREATE TABLE lang_topic_state (
  topic_id      INTEGER NOT NULL REFERENCES lang_topics(id) ON DELETE CASCADE,
  project_id    TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 三态（§3.3）：unused / active / mastered
  state         TEXT    NOT NULL CHECK (state IN ('unused','active','mastered')),
  -- 证据种类（§3.1 的取值域，闭集）
  evidence_kind TEXT    NOT NULL CHECK (evidence_kind IN ('checklist','skill','task','source_hit')),
  -- 证据出处（勾选项 / 技能名 / 任务 id / 源码相对路径）
  evidence_ref  TEXT    NOT NULL,
  -- 这份状态的参照日（与状态同行 ⇒ 天生对齐）
  computed_at   TEXT    NOT NULL,
  PRIMARY KEY (topic_id, project_id, evidence_kind, evidence_ref)
);
CREATE INDEX idx_lang_topic_state_project ON lang_topic_state(project_id, topic_id);
