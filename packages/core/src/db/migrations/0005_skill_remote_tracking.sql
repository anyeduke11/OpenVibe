-- DEV-0068：远程 skill 的更新检查。加两列（可空，本地条目为 NULL）：
--   remote_ref       溯源 key：github:owner/repo@branch[:path] / skillhub:slug
--   remote_tree_hash 树级指纹（内容无关）：GitHub = 目录内文件 (path, git blob sha) 拼接 sha256，
--                    SkillHub = 文件清单 (path, sha256) 按本地同公式（== dir_hash）。
-- 检查更新 = 远程重算树指纹与本地对比，GitHub 整仓一次 trees API、零内容下载。
ALTER TABLE skills ADD COLUMN remote_ref TEXT;
ALTER TABLE skills ADD COLUMN remote_tree_hash TEXT;
