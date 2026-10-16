// packages/core/src/inject/consistency —— sha 比对的**唯一**规则（service-layer.md FR-2）。
// 纯函数：不碰磁盘、不认传输、不退出进程；`readDisk` 由调用方注入。
//
// ## 为什么有这一个文件
//
// 同一判据（声明侧哈希 vs 磁盘实算哈希）此前在三处各写一遍：
// `planner.ts` 的 `diffPackLock`、`retirement.ts` 的 `planRetirement`、
// `apps/cli/src/pack-source.ts` 的 `verifyPack`。三处各自演进出了三套状态词
// （clean/drifted/missing、ABSENT/FOREIGN/IN_SYNC/DRIFT、modified[]），
// 而「缺文件算不算坏」「未受管的文件算不算坏」这两个真问题因此在边界上分了叉。
//
// 合一的只是**比对规则**：排序口径、缺失判定、managed 的处理集中在这里；
// 三个调用点各自把自己的状态映射回原有形态（FR-2.2：CLI 的文案、planRows 的行形态、
// --force 语义一字不变）。合一的不是用户词汇。

import { compareCodeUnit } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'

/**
 * 单一状态词表（FR-2.3 → spec §8.2 待裁②，owner 2026-10-14 已闭合取 (a)：
 * 沿用 `retirement.ts` 的四态，不另起一套中性词）。
 *
 * 顺序即 `counts` 的键序，`retirement.ts` 直接以此建表。
 */
export const CONSISTENCY_STATES = ['IN_SYNC', 'DRIFT', 'ABSENT', 'FOREIGN'] as const
export type ConsistencyState = (typeof CONSISTENCY_STATES)[number]

/** 声明侧的一条登记：谁声明了什么哈希、它是否受本包管辖 */
export interface DeclaredFile {
  path: string
  /** 期望哈希（lock 的 `entry.sha256` / manifest 的 `files[].sha256`） */
  sha256: string
  /**
   * 是否受管。**必填，且刻意不给默认值**：`managed === true` 就是「受管」的判据本身，
   * 字段缺失按未受管处理（既有 RT-07 的安全侧口径：被手删的 managed 不许悄悄变成受管）。
   * 所以想表达「受管」的调用方必须显式写 `true`，而不是靠省略字段蒙对。
   */
  managed: boolean
}

interface ConsistencyBase {
  path: string
  /** 声明侧的哈希，原样回传：调用方要拿它当 `drifted.expected`／退场凭据 */
  declaredSha256: string
  managed: boolean
  /** 路径首段是 `.openvibe` ⇒ 非包产物（lock 可被手改，这条不能依赖 lock 的自觉） */
  internal: boolean
}

/**
 * 一条比对结果。按 state 判别（discriminated union）：
 * 调方判到 `state !== 'ABSENT'` 时，`diskSha256` 静态收窄为 `string`，
 * 不必再补一次运行期判空。
 */
export type ConsistencyFile =
  | (ConsistencyBase & { state: 'IN_SYNC' | 'DRIFT' | 'FOREIGN'; diskSha256: string })
  | (ConsistencyBase & { state: 'ABSENT'; diskSha256: null })

/** 项目根下第一段是 .openvibe 即非包产物：lock 可被手改，这条不能依赖 lock 的自觉 */
function isOpenVibeInternal(relPath: string): boolean {
  const [first] = relPath.split(/[\\/]+/)
  return first === '.openvibe'
}

/**
 * 比对规则本体（FR-2.1：排序口径 / 缺失判定 / managed 的处理，逐字取既有语义）。
 *
 * 判据顺序固定为 **ABSENT → FOREIGN → IN_SYNC/DRIFT**：
 * 1. `readDisk` 返回 null ⇒ `ABSENT`。**先判缺失**，不看 managed —— managed=false 的登记项
 *    在盘上不存在时仍然是「缺」（既有 RT-04：磁盘不存在一律 ABSENT，managed 任意）。
 * 2. 未受管（`managed !== true`）或路径在 `.openvibe/` 下 ⇒ `FOREIGN`。
 *    这类条目「在盘上，但不是本包管辖的产物」，本包不据此下删除/写入结论
 *    （既有 RT-05/RT-06）。**注意判据在哈希之前**：未受管的条目不算 DRIFT。
 * 3. 其余按哈希分 `IN_SYNC`（磁盘 == 声明）与 `DRIFT`（磁盘 != 声明）。
 *
 * 排序按路径**码点序**（`compareCodeUnit`，不用 `localeCompare`——后者随 ICU 漂移）。
 * `declared` 不被修改：入参数组只读，排序在副本上做。
 *
 * `readDisk` 抛错原样上抛：读失败不是「文件不在」，调用方按各自的中止口径处理
 * （既有 RT-08）。本函数不吞、不转译成 ABSENT。
 *
 * @param declared 声明侧登记（lock 条目 / manifest 条目），由调用方负责把 `managed` 显式填好
 * @param readDisk 磁盘读取器；返回 `null` 表示文件不存在
 */
export function verifyAgainstLock(
  declared: readonly DeclaredFile[],
  readDisk: (relPath: string) => string | null,
): ConsistencyFile[] {
  return [...declared]
    .sort((a, b) => compareCodeUnit(a.path, b.path))
    .map((entry): ConsistencyFile => {
      const base: ConsistencyBase = {
        path: entry.path,
        declaredSha256: entry.sha256,
        managed: entry.managed,
        internal: isOpenVibeInternal(entry.path),
      }
      const content = readDisk(entry.path)
      if (content === null) return { ...base, state: 'ABSENT', diskSha256: null }
      const diskSha256 = fileSha256(content)
      if (!entry.managed || base.internal) return { ...base, state: 'FOREIGN', diskSha256 }
      return {
        ...base,
        state: diskSha256 === entry.sha256 ? 'IN_SYNC' : 'DRIFT',
        diskSha256,
      }
    })
}
