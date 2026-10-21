-- 0014_lang_stage_tracks.sql —— 成长阶段 × 语言 × 模式（§3.21 · DL-40）
--
-- ⚠️ **这是十七张表里的第十七张**（§3.1 的 `lang_stage_tracks` 从 v1.4 起就列在这儿，
--   但直到 P1f 才真正建表）⇒ **表数不因本迁移变化**。
--
-- ## 它记什么
--
-- 配套方案《Agent 评测专家成才方案》§4「成长路线：四阶段可打卡训练」里每个阶段的
-- `tracks` 数组：**八格对照面**（4 阶段 × 2 语言）⇒ **落库 6 行**
-- （阶段 0/1 的 Go 在源文档里没有该轨道 ⇒ 不建行）。
--
-- ⚠️ **「阶段 0/1 不建 Go 行」是结论，不是可选项**（§3.21 第 2 条 · DL-40 的反证腿）：
--   建了空行再标 `required=0`，那一行就会出现在筛选器里，而「这个阶段没有 Go 轨道」
--   是**关于阶段的结论**。
--
-- ## ⚠️ 为什么源字段与派生字段**分开存**
--
-- 源文档把阶段 2 的 Python 写成 `mode:"mas"`（等于精通）却把 `modeName` 写成
-- 「熟悉 → 精通」—— 两处必有一处不准（§6.3 第 8 条待裁）。
-- ⇒ `source_mode` 与 `mode_name` **都逐字存**，矛盾留在数据里；
--   `profile` 列是**本模块的取值**（阶段 2 取「熟悉」并带 `note` 标注）。
-- ⇒ 这样「源文档说的是什么」与「我们据此做了什么」**两件事各自可查**。
--
-- ## ⚠️ 主键是**复合键** (stage_id, lang)
--
-- ⇒ 查表**不许 ORDER BY**（本仓的 SQL 静态守卫只认单列唯一键作兜底排序键）⇒ 排序放 JS。
CREATE TABLE lang_stage_tracks (
  stage_id    INTEGER NOT NULL CHECK (stage_id BETWEEN 0 AND 3),
  lang        TEXT    NOT NULL CHECK (lang IN ('python','go')),
  -- 源文档 `mode` 逐字（'vibe' | 'fam' | 'mas' —— 源用缩写）
  source_mode TEXT    NOT NULL CHECK (source_mode IN ('vibe','fam','mas')),
  -- 源文档 `modeName` 逐字（如「熟悉 → 精通（写 checker / 流水线）」）
  mode_name   TEXT    NOT NULL,
  -- 本模块的三值模式（阶段 2 的 Python 按 §6.3 第 8 条兜底取 familiar ＋ note 标注）
  profile     TEXT    NOT NULL CHECK (profile IN ('master','familiar','vibe')),
  -- 源文档 `name` / `period` 逐字
  stage_name  TEXT    NOT NULL,
  period      TEXT    NOT NULL,
  -- 源文档 `goals` 要点（JSON 数组文本）
  goals       TEXT    NOT NULL CHECK (json_valid(goals)),
  -- 该模式下这条轨道是不是必学（源 `modeName` 含「选学」⇒ 0）
  required    INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  -- 是不是该阶段的默认落点（Python 主线 ⇒ 1；Go 选学 ⇒ 0）
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  -- 诚实标注（只有「源文档自相矛盾」那一条会有值）
  note        TEXT,
  PRIMARY KEY (stage_id, lang)
);
