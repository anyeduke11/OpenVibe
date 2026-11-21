#!/usr/bin/env node
/**
 * scripts/snapshot-ui.mjs —— 维护 `styles.ts` / `layout.tsx` 的全文快照与源码哈希（DEV-0220 / DEV-0222）。
 *
 * ## 它维护两样东西
 *
 * | 产物 | 作用 | 谁消费 |
 * |---|---|---|
 * | `tests/styles-ts.snapshot.txt` / `tests/layout-tsx.snapshot.txt` | 全文快照：任何改动即红 | `tests/btn-display.test.ts` 的快照闸 |
 * | `tests/ui-source-hashes.json` | 源码哈希清单：**产物是否对应当前源码** | `scripts/verify-topbar-cdp.mjs` 的产物自检 |
 *
 * ## 为什么哈希清单也要（DEV-0222 第 1 项）
 *
 * 快照闸管的是**源码**有没有被改；产物自检原本只管**引用**有没有缺失。
 * 两者都拦不住「源码改了、但 dist 还是上一次构建的」—— 那时引用齐全、源码闸也未跑，
 * 脚本会**测到旧产物**并给出看起来合理的结论（本轮踩过：旧产物布局恰好是对的 ⇒ 报「全绿」）。
 *
 * 故把「源码的哈希」落成一份**受版本控制**的清单：`dist` 是 gitignored 的，
 * 指纹不能落在 dist 里（那样并行会话一构建就被覆盖，且提交不上去）；
 * 落在仓内才能跟着提交走，才能作为「这份产物是按哪版源码构建的」的凭据。
 *
 * ## 用法
 *
 * ```sh
 * pnpm ui:snapshot          # 重新生成快照 + 刷新哈希清单
 * pnpm ui:snapshot --check  # 只比对不写（不一致即非零退出）
 * ```
 *
 * ⚠️ 与 `barrel:snapshot` 同构：闸是强闸，重新生成等于「显式审阅并签字」。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTargets } from './ui-snapshot-targets.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

/**
 * 核对清单（唯一出处）—— `tests/ui-snapshot-targets.json`。
 *
 * ⚠️ **读取与结构校验都在 `scripts/ui-snapshot-targets.mjs`**（DEV-0224 收尾第 2 项）：
 *   两个脚本共用同一份校验，避免「结构再变时漏改一处、一侧静默失配」。
 *   本脚本按 `snapshots` 维护全文快照、按 `hashes` 维护哈希；
 *   `scripts/verify-topbar-cdp.mjs` 按 `hashes` 判断「产物是否按当前源码构建」、
 *   按 `invariantDirs` 校验「受监视目录的源码是否都登记了」。
 *   新增「单一出处」文件时**只改 JSON**，两个脚本同时生效。
 */
const { snapshots: SNAPSHOTS, hashes: HASH_FILES } = readTargets(import.meta.url)

/** 源码哈希清单落点（受版本控制；`verify-topbar-cdp` 读它做「产物 vs 源码」自检） */
const HASH_MANIFEST = 'tests/ui-source-hashes.json'

/**
 * 取文件内容的 sha256 **前 16 位**。
 *
 * ⚠️ 16 位是**刻意取舍**：2^64 分之一的碰撞概率实际不可能，而报错文案要给人读 ——
 *   全 64 位会把「两个哈希不一致」那行撑成一屏。要更强就把 slice 改成 64（代价仅可读性）。
 */
function hashOf(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex').slice(0, 16)
}

const checkOnly = process.argv.includes('--check')

let dirty = 0
for (const t of SNAPSHOTS) {
  const srcPath = join(REPO, ...t.src.split('/'))
  const snapPath = join(REPO, ...t.snap.split('/'))
  const live = readFileSync(srcPath, 'utf8')
  const snap = readFileSync(snapPath, 'utf8')
  if (live === snap) {
    console.log(`✓ ${t.snap} 与 ${t.src} 一致`)
    continue
  }
  dirty++
  if (checkOnly) {
    console.log(`✗ ${t.snap} 与 ${t.src} 不一致（跑 pnpm ui:snapshot 重新生成）`)
  } else {
    copyFileSync(srcPath, snapPath)
    console.log(`↻ ${t.snap} 已按 ${t.src} 重新生成`)
  }
}

// 哈希清单：按当前源码重算。⚠️ 与快照不同，**始终按当前源文件刷新** ——
//   快照失配时 `--check` 要报「源码改了」，此时哈希也必须反映新源码，
//   否则「刷新后一致、再跑又失配」会绕成死循环。
const manifestPath = join(REPO, ...HASH_MANIFEST.split('/'))
const hashes = {}
for (const src of HASH_FILES) {
  hashes[src] = hashOf(join(REPO, ...src.split('/')))
}
const prevManifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : ''
const nextManifest = `${JSON.stringify(hashes, null, 2)}\n`
if (prevManifest === nextManifest) {
  console.log(`✓ ${HASH_MANIFEST} 与当前源码一致`)
} else {
  dirty++
  if (checkOnly) {
    console.log(`✗ ${HASH_MANIFEST} 与当前源码不一致（跑 pnpm ui:snapshot 刷新）`)
  } else {
    writeFileSync(manifestPath, nextManifest)
    console.log(`↻ ${HASH_MANIFEST} 已按当前源码刷新`)
  }
}

if (dirty > 0) process.exitCode = 1
