-- ============ 0018 · M9 出网台账：按 provider / 模型分组 ＋ 用量计数============
--
-- ⚠️ **零新增表**（仍十七张）—— 本迁移只给 `lang_source_shares` **加三列**。
--
-- ## 为什么加这三列
--
-- `lang_source_shares` 是「每一次出网的计数」（§3.9）⇒ 它回答的是
-- 「**出了几次网、发了多少片段、授权从哪来**」。
--
-- ⚠️ **但它答不了「哪一家 provider 答的」** —— 而 provider 一旦可多份
--   （多份配置并存，owner 2026-10-22 增强 2），「这次解读是哪一家做的」
--   就是**复盘的第一问题**（哪一家更准？哪一家更贵？）。
-- ⇒ 加 `provider` / `model` 两列 ⇒ 台账可按它们分组（§3.9 末段的分组口径）。
--
-- ⚠️ **用量只落「计数」**（DL-16 同族）：token 数是**数字**，不是内容 ⇒
--   它进台账不违反「片段不得进台账」。
--
-- ## ⚠️ 三列的语义（逐字，别改口径）
--
-- | 列 | 含义 | 历史行 |
-- |---|---|---|
-- | `provider` | provider 标识（**空串** = 未知 / 配之前就出的网） | `''` |
-- | `model` | 模型标识（**空串** = 未知） | `''` |
-- | `usage_total_tokens` | 这一次用的 token 合计（`NULL` = runner 没给用量） | `NULL` |
--
-- ⚠️ **`provider` / `model` 是空串而不是 `NULL`** —— 与 `consent_detail` 的
--   「历史行用 `'unknown'`」不同款：这两个字段**没有闭集**（用户自己写什么就存什么）
--   ⇒ 空串就够表意「没有」，不必再发明一个 `unknown` 值。
--
-- ⚠️ **为什么允许空串**：provider 配置**随时会改** ⇒ 改了之后的老行
--   自然没有「当时的 provider 标识」⇒ 老行只能是空的 ⇒
--   分组视图必须**如实显示「未知」那一组**，不许悄悄并进当前那家。

ALTER TABLE lang_source_shares
  ADD COLUMN provider TEXT NOT NULL DEFAULT '';

ALTER TABLE lang_source_shares
  ADD COLUMN model TEXT NOT NULL DEFAULT '';

ALTER TABLE lang_source_shares
  ADD COLUMN usage_total_tokens INTEGER NULL;

-- ⚠️ **分组查询要按 provider / model 走** ⇒ 给它一个索引
--   （台账按项目 + 时间查已有索引；分组是另一个访问形状）。
CREATE INDEX idx_lang_source_shares_provider ON lang_source_shares(provider, created_at);
