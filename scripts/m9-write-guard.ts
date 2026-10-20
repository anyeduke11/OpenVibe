/**
 * `scripts/m9-write-guard.ts` —— 采集写回的**备份与差异快照**（两族采集脚本共用）
 *
 * ## 它补的是什么
 *
 * `--write` 此前是**直接覆盖**已入库清单：源站一改、脚本一跑，仓里的证据就被换掉，
 * 而「换掉之前发生了什么」**没有任何记录** ⇒ 写错了只能靠 git 翻历史，
 * 而 git 翻不出「当时源站长什么样、这次到底改了哪几条」。
 *
 * ⇒ 三件事：
 *
 * 1. **写前备份**：旧清单原样复制到 `_backup/<file>.<ts>.json`。
 * 2. **差异快照**：把「这次改了什么」逐条写进 `_backup/<file>.<ts>.diff.json`。
 * 3. **原子替换**：先写同目录临时文件再 `rename` ⇒ 中途失败不会留下半个 JSON。
 *
 * ## ⚠️ 为什么备份与快照**不落仓**
 *
 * - **备份**的用途是「写错了能立刻恢复」；长期历史由 git 负责。两份都留就是两份真相，
 *   而且备份与 git 的上一版内容**逐字相同** ⇒ 纯冗余。
 * - **差异快照**的读者是**写回当时的人**（看一眼「变了哪几条」再决定要不要留）。
 *   落仓的话，仓里会堆几十个「某天变了 3 条」的文件；同样的信息 git diff 已经有一份。
 *
 * ⇒ 两者都落在 `docs/devlog-evidence/M9-probe/_backup/`（已 gitignore）。
 *   **落仓的「事实」是清单本身**（含 `collected_at` 与 `collect_method` 的登记），
 *   那才是可复算的证据；备份与快照是**过程**，过程不进仓。
 *
 * ⚠️ 这条纪律同源于「不要往真实证据目录塞人造文件」——
 *   将来读仓的人会把 `_backup/` 里的东西当成实测，而它们只是某次写回的副产品。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 备份与差异快照的落点（相对仓库根）—— 工具产物区，不落仓。 */
export const BACKUP_DIR_REL = 'docs/devlog-evidence/M9-probe/_backup'

/** 与 `scripts/collect-m9-sources.ts` 的 `InventoryDiff` 同形（避免两族各写一份）。 */
export interface WriteDiff {
  countChanged: number
  added: Array<{ section: string; title: string; url: string }>
  removed: Array<{ section: string; title: string; url: string }>
  urlChanged: Array<{ before: string; after: string }>
  titleChanged: Array<{ url: string; before: string; after: string }>
  sectionChanged: Array<{ url: string; before: string; after: string }>
  urlFormChanged: Array<{ before: string; after: string }>
  reordered: boolean
}

export interface GuardedWriteResult {
  /** 是否真的写了盘 */
  wrote: boolean
  /** 备份文件的绝对路径（没写盘时为 null） */
  backupPath: string | null
  /** 差异快照的绝对路径（没写盘时为 null） */
  diffPath: string | null
  /** 人类可读的一句话结果 */
  reason: string
}

/** 差异是否为空（与采集脚本的 `diffIsEmpty` 同口径，这里独立一份以免两族互相依赖）。 */
export function writeDiffIsEmpty(diff: WriteDiff): boolean {
  return (
    diff.countChanged === 0 &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.urlChanged.length === 0 &&
    diff.titleChanged.length === 0 &&
    diff.sectionChanged.length === 0 &&
    diff.urlFormChanged.length === 0 &&
    !diff.reordered
  )
}

/** 把 `InventoryDiff` 的数组元素压成「段名 · 标题 · 链接」的扁平行（快照可读性用）。 */
function flattenItems(
  items: Array<{ section: string; title: string; url: string }>,
): Array<{ section: string; title: string; url: string }> {
  return items.map((i) => ({ section: i.section, title: i.title, url: i.url }))
}

/**
 * 带备份与差异快照的写回。
 *
 * @param targetRel 目标文件（相对仓库根）
 * @param content   新内容（完整文件文本）
 * @param diff      本次差异
 * @param beforeCount 写回前的条数
 * @param afterCount  写回后的条数
 * @param stamp     时间戳（用于文件名，由调用方给，保证可复现）
 */
export function guardedWrite(args: {
  targetRel: string
  content: string
  diff: WriteDiff
  beforeCount: number
  afterCount: number
  stamp: string
}): GuardedWriteResult {
  const targetAbs = join(REPO_ROOT, args.targetRel)
  const oldContent = existsSync(targetAbs) ? readFileSync(targetAbs, 'utf8') : null

  // 逐字相同 ⇒ 不写，也不产生备份（否则每次跑都多一份垃圾）
  if (oldContent === args.content) {
    return { wrote: false, backupPath: null, diffPath: null, reason: '内容逐字相同，未写盘' }
  }

  const backupDir = join(REPO_ROOT, BACKUP_DIR_REL)
  mkdirSync(backupDir, { recursive: true })
  const base = args.targetRel.split('/').pop() ?? 'inventory.json'
  const backupPath = join(backupDir, `${base}.${args.stamp}.json`)
  const diffPath = join(backupDir, `${base}.${args.stamp}.diff.json`)

  if (oldContent !== null) {
    writeFileSync(backupPath, oldContent, 'utf8')
  }

  const snapshot = {
    _readme:
      '采集写回的差异快照。⚠️ 只记「哪几条变了」（标题与链接），**不含任何外部正文**（spec §3.2）。' +
      '落在这里是因为它的读者是写回当时的人；落仓的事实是清单本身（git diff 里有同一份信息）。',
    snapshot_at: args.stamp,
    target: args.targetRel,
    before_count: args.beforeCount,
    after_count: args.afterCount,
    diff: {
      countChanged: args.diff.countChanged,
      added: flattenItems(args.diff.added),
      removed: flattenItems(args.diff.removed),
      urlChanged: args.diff.urlChanged,
      titleChanged: args.diff.titleChanged,
      sectionChanged: args.diff.sectionChanged,
      urlFormChanged: args.diff.urlFormChanged,
      reordered: args.diff.reordered,
    },
  }
  writeFileSync(diffPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  // 原子替换：同目录临时文件 → rename（同文件系统下 rename 是原子的）
  const tmp = `${targetAbs}.tmp`
  writeFileSync(tmp, args.content, 'utf8')
  renameSync(tmp, targetAbs)

  return {
    wrote: true,
    backupPath: oldContent === null ? null : backupPath,
    diffPath,
    reason:
      oldContent === null
        ? '目标文件此前不存在 ⇒ 直接写入（无备份）'
        : `已写回（备份与差异快照见 ${BACKUP_DIR_REL}）`,
  }
}

/** 写回失败时清掉残留的临时文件（避免留下半个 JSON 被误当成证据）。 */
export function cleanupTemp(targetRel: string): void {
  const tmp = join(REPO_ROOT, `${targetRel}.tmp`)
  if (existsSync(tmp)) rmSync(tmp, { force: true })
}
