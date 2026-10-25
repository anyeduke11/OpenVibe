-- 0020_lang_topic_content_key.sql（lang 域 · v0.2.3 批次 C CS2 第二段）
-- 裁定①（owner 2026-10-24「进入C批次」指令授权，spec v023-c FR-2 第二段设计预研表）：
-- lang_topic_content 以逻辑键 (ref_kind, ref_id, kind) 建唯一索引——
-- mergeSeedRow 的 SELECT-then-INSERT/UPDATE 在应用层用这个键；唯一索引把完整性
-- 收口到库层（防其他写路径造出同键双行，让 .get() 静默歧义）。
--
-- ⚠️ 建索引前必须先去重：历史上该表没有唯一键，同键多行不能假设不存在
--    （保留 rowid 最大的一行 = 最近一次写入），否则 CREATE UNIQUE INDEX 直接失败。
DELETE FROM lang_topic_content
 WHERE rowid NOT IN (
   SELECT MAX(rowid) FROM lang_topic_content GROUP BY ref_kind, ref_id, kind
 );
CREATE UNIQUE INDEX uq_lang_topic_content_ref ON lang_topic_content (ref_kind, ref_id, kind);
