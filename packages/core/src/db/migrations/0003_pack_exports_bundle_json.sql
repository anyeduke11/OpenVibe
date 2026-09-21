-- T6d（dev-plan §3.8 bundle 通道，owner 裁定 2026-09-21）：
-- 导出实例连同 bundle 全文入库，使「删源资产后仍可整包再下载」（m6a §7.5）与
-- GET /api/packs/:id/exports/:exportId/bundle 不依赖磁盘目录存在。
ALTER TABLE pack_exports ADD COLUMN bundle_json TEXT NOT NULL DEFAULT '';
