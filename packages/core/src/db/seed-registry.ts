import type { SqliteDatabase } from './index'

/**
 * seed_registry 的唯一登记语句（v0.2.3 批次 C CS3）。
 *
 * 此前这条 upsert 在 seed.ts 与 6 个 m9 播种器里**逐字复制 8 处/7 文件**——改一次登记表
 * 结构要动 7 个文件。现在口径只留这一处：所有播种通道（主通道 seed.ts + m9 各播种器）
 * 统一经 `seedRegistryUpsert` 登记。语义不变：同 bundle 幂等，content_hash 与 imported_at
 * 随最近一次播种推进（不参与跳过逻辑，纯诊断用途——各行自述同款）。
 */
const SEED_REGISTRY_UPSERT_SQL =
  `INSERT INTO seed_registry (bundle, content_hash, imported_at) VALUES (?, ?, ?)
   ON CONFLICT(bundle) DO UPDATE SET content_hash = excluded.content_hash, imported_at = excluded.imported_at`

export function seedRegistryUpsert(
  db: SqliteDatabase,
  bundle: string,
  contentHash: string,
  importedAt: string,
): void {
  db.prepare(SEED_REGISTRY_UPSERT_SQL).run(bundle, contentHash, importedAt)
}
