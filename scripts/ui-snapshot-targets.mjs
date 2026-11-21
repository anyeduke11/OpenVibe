/**
 * scripts/ui-snapshot-targets.mjs —— 共享清单 `tests/ui-snapshot-targets.json` 的**唯一读取口**（DEV-0224 收尾第 2 项）。
 *
 * ## 为什么抽出来
 *
 * `snapshot-ui.mjs` 与 `verify-topbar-cdp.mjs` 都要读这份清单。DEV-0224 曾把读取逻辑各写一份，
 * 理由是「`scripts/` 下无 `lib/` 惯例、两者校验内容不同」。但本轮把**校验抽成函数**后，
 * 两处的校验内容其实**完全一样**（都要求 `snapshots` / `hashes` / `invariantDirs` 是数组），
 * 各写一份就成了「两份代码、无机制保证同步」—— 结构再变时漏改一处，一侧会静默失配。
 *
 * ## 用法
 *
 * ```js
 * import { readTargets } from './ui-snapshot-targets.mjs'
 * const { snapshots, hashes, invariantDirs } = readTargets(import.meta.url)
 * ```
 *
 * `readTargets` 读失败或结构不对时**自己 `process.exit(2)`**（与参数错误同档），
 * 不再抛堆栈 —— 清单坏了的场合，排查者需要的是「哪个文件、什么结构不对」。
 *
 * ⚠️ **不要在调用方另写 `JSON.parse(readFileSync(...))`**：那正是本模块要收口的重复。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 清单路径（相对仓根） */
const TARGETS_REL = 'tests/ui-snapshot-targets.json'

/**
 * 受监视目录 = `hashes` 里每份文件的**父目录**（DEV-0226 收尾第 2 项）。
 *
 * ⚠️ 不手写 `invariantDirs` 段：手写时 `apps/web/src` 与 `components/ui` 重复登记，
 *   且目录改名/移动要记得同步两处 —— 漏一处就静默失配。推导出来后，
 *   新增 `hashes` 条目会自动带上它的父目录，判据跟着清单走。
 */
function deriveInvariantDirs(hashes) {
  const dirs = new Set()
  for (const rel of hashes) dirs.add(dirname(rel))
  return [...dirs].sort()
}

/**
 * 读共享清单并校验结构。
 *
 * @param {string} [fromUrl] 调用方模块 URL（默认本模块）—— 用于定位仓根。
 *   传 `import.meta.url` 即可，本函数会按「调用方在 `scripts/` 下」上溯一级。
 *   ⚠️ 不传（或传了不指向 `scripts/` 的值）会报可读错误并 exit 2 —— 仓根会算到别处，
 *      `tests/ui-snapshot-targets.json` 根本读不到，而报错信息会指向一个不存在的路径。
 * @returns {{ snapshots: Array<{src: string, snap: string}>, hashes: string[], invariantDirs: string[] }}
 */
export function readTargets(fromUrl = import.meta.url) {
  const callerDir = dirname(fileURLToPath(fromUrl))
  if (basename(callerDir) !== 'scripts') {
    console.error(
      `fromUrl 指向的目录不是 scripts/：${callerDir}\n` +
        `  ⇒ 仓根按「scripts/ 的上一级」推算，传别的路径会读到错误的清单位置。\n` +
        `    调用方请传 import.meta.url（且调用方位于 scripts/ 下）。`,
    )
    process.exit(2)
  }
  const repoRoot = resolve(callerDir, '..')
  const abs = join(repoRoot, ...TARGETS_REL.split('/'))
  let raw
  try {
    raw = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (err) {
    console.error(`清单读不懂（JSON 解析失败）：${abs}\n  ${err.message}`)
    process.exit(2)
  }
  if (!Array.isArray(raw.snapshots) || !Array.isArray(raw.hashes)) {
    console.error(`清单结构不对：${abs} —— "snapshots" 与 "hashes" 都必须是数组`)
    process.exit(2)
  }
  const badSnap = raw.snapshots.find(
    (t) => typeof t?.src !== 'string' || typeof t?.snap !== 'string',
  )
  if (badSnap) {
    console.error(`清单结构不对：snapshots 有条目缺 src/snap —— ${JSON.stringify(badSnap)}`)
    process.exit(2)
  }
  if (raw.hashes.some((h) => typeof h !== 'string')) {
    console.error(`清单结构不对：hashes 混入了非字符串条目`)
    process.exit(2)
  }
  if (raw.invariantDirs !== undefined) {
    console.error(
      `清单结构不对：${abs} 有 "invariantDirs" 段 —— 该段已改为从 "hashes" 推导，请删除`,
    )
    process.exit(2)
  }
  const invariantDirs = deriveInvariantDirs(raw.hashes)
  return {
    snapshots: raw.snapshots,
    hashes: raw.hashes,
    invariantDirs,
  }
}
