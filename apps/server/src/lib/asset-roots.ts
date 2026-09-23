import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 资源根解析（T9a-1）：Web 产物与 seed 文件在两种布局下各有一套相对路径。
 *
 * - 发布布局：`openvibe-cli` 是 esbuild 单文件包，bootstrap 与 seed-dir 的 `import.meta.url`
 *   打包后同指 `<pkg>/dist/cli.js`，于是 HERE=`<pkg>/dist`，产物就摆在 `dist/web` 与 `dist/seed`。
 * - 仓库布局：dev 态两处的 HERE 深度不同（bootstrap 在 `apps/server/src`、seed-dir 在
 *   `apps/server/src/lib`），候选路径按调用方各自传入的 HERE 计算，保持与 T8 之前逐字一致。
 *
 * 两边都不存在时返回仓库候选：`setupStatic` 与 `GET /api/settings` 的「未找到产物」警告
 * 要如实打出真正找过的路径，而不是发布包里的一个幻位。
 */

const WEB_PUBLISHED = (here: string) => join(here, 'web')
const SEED_PUBLISHED = (here: string) => join(here, 'seed')
const WEB_REPO = (here: string) => join(here, '..', '..', 'web', 'dist')
const SEED_REPO = (here: string) => join(here, '..', '..', '..', '..', 'content', 'seed')

function resolve(explicit: string | undefined, published: string, repo: string): string {
  if (explicit) return explicit
  if (existsSync(published)) return published
  return repo
}

export function resolveWebRoot(here: string): string {
  return resolve(process.env.OPENVIBE_WEB_ROOT, WEB_PUBLISHED(here), WEB_REPO(here))
}

export function resolveSeedDir(here: string): string {
  return resolve(process.env.OPENVIBE_SEED_DIR, SEED_PUBLISHED(here), SEED_REPO(here))
}
