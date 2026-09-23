import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSeedDir } from './asset-roots'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * content/seed 相对布局解析（发布包内为 `dist/seed`，仓库内为根 `content/seed`，见 asset-roots）；
 * `OPENVIBE_SEED_DIR` 供打包/沙箱与测试覆盖。
 * 从 bootstrap.ts 抽出（T8b）：`POST /api/settings/reseed` 与首启组装要用同一个目录，
 * 留在 bootstrap 里会让 routes → bootstrap 形成反向依赖。
 */
export function defaultSeedDir(): string {
  return resolveSeedDir(HERE)
}
