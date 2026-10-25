-- 0019_lang_seed_hash.sql（lang 域 · v0.2.3 批次 C CS2 第一段）
-- 给 m9 播种器写入的内容表加 seed_hash：行级三态合并（seed-merge.ts）的前提。
-- 覆盖范围 = 播种器实际写入的 10 张表（0011–0013 域，逐一核对过 CREATE TABLE）。
--
-- 三态语义（mergeSeedRow 单源）：
--   stored seed_hash == 新行哈希                ⇒ 不变，跳过
--   stored 非空 且 hash(现内容) == stored        ⇒ 用户没动过 ⇒ 覆盖为新内容
--   stored 非空 且 hash(现内容) != stored        ⇒ 用户改过 ⇒ 永不覆盖
--   stored 为 NULL（本迁移前的老行）             ⇒ 一律按用户态对待：
--     内容与新种子逐字相同才补登 seed_hash，否则永不覆盖（老行零 clobber 风险）。
--
-- ⚠️ 本迁移**不回填**任何 seed_hash：老行的 NULL 就是「无凭据」标记，
--    回填 hash(现内容) 会把用户手改过的行伪造成「未改动」，reseed 时被静默覆盖。
--
-- 第一段只接 lang_topics（p1-seed-lang-topics）；其余 9 张表的播种器按
-- CS2 第二段迁（p1-5/p1-6/p1d-profiles 现为**无条件覆盖式 upsert**——reseed 即
-- 静默覆盖用户手改——它们的改造是行为变化，单独立段测）。
ALTER TABLE lang_topics ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_topic_edges ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_resources ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_vibe_resources ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_topic_resources ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_concepts ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_topic_content ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_concept_deltas ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_profile_phases ADD COLUMN seed_hash TEXT;
ALTER TABLE lang_topic_profiles ADD COLUMN seed_hash TEXT;
