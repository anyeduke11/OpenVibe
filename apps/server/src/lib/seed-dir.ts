import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * content/seed 相对仓库布局；`OPENVIBE_SEED_DIR` 供打包/沙箱与测试覆盖。
 * 从 bootstrap.ts 抽出（T8b）：`POST /api/settings/reseed` 与首启组装要用同一个目录，
 * 留在 bootstrap 里会让 routes → bootstrap 形成反向依赖。
 */
export function defaultSeedDir(): string {
  return process.env.OPENVIBE_SEED_DIR ?? join(HERE, '..', '..', '..', '..', 'content', 'seed')
}
