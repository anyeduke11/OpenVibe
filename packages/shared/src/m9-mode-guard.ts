// `packages/shared/src/m9-mode-guard.ts` —— M9 v1.6 **P1e 的两道守卫**
// （`m9-dev-language-roadmap.md` §3.18 / §3.20 · **DL-37 / DL-39**）
//
// ## 它是什么
//
// 两道**否定式**判据的检查器 —— 而否定式判据天然没有正向痕迹：
// 少写一条映射、或者偷偷维护一张对照表，代码照常编译、界面照常显示，
// 只有专门那条检查会红 ⇒ **检查器与它的变异腿必须成对存在**。
//
// | 守卫 | 拦的是 | 判据出处 |
// |---|---|---|
// | `findTransferPlanViolations` | 转档映射**不等于**「已点亮速成必学 → 精通站位」 | DL-37 |
// | `findHardcodedSlugLiterals` | 转档里**维护**了一张「速成 → 精通」对照表 | §3.18 第 2 条 |
//
// ⚠️ **本文件刻意与被扫对象分开** —— `findHardcodedSlugLiterals` 扫的是
//   `m9-mode-interaction.ts` 的源码文本，若两者同文件，守卫会检出自己的正则字面量。
import type { TransferMappingEntry, TransferPlan } from './m9-mode-interaction'

// ============================================================================
// ① DL-37：转档映射必须逐条相等
// ============================================================================

/** 检查器只需要计划里的这几项（传 `TransferPlan` 的子集即可）。 */
export type TransferPlanView = Pick<
  TransferPlan,
  'mapping' | 'stationFrom' | 'stationTo' | 'litRequiredCount' | 'totalStations' | 'remainingStations'
>

/**
 * 断「界面显示的站区间 == 逐条映射结果」（DL-37）。
 *
 * ⚠️ **集合相等，不是计数相等** —— 计数相等但成员错位是这一类判据最常见的漏网形态
 *   （总数对得上、拆分错一格）。⇒ 这里比的是**成员集合**。
 *
 * @param plan 实现算出来的计划
 * @param expected 期望的逐条映射（独立复算得到）
 * @returns 违规说明；空数组 = 通过
 */
export function findTransferPlanViolations(
  plan: TransferPlanView,
  expected: readonly TransferMappingEntry[],
): string[] {
  const out: string[] = []
  const key = (m: TransferMappingEntry): string => `${m.topicId}|${m.slug}|${m.stationNo}`

  const got = new Set(plan.mapping.map(key))
  const want = new Set(expected.map(key))
  for (const k of want) {
    if (!got.has(k)) out.push(`缺一条映射：${k}`)
  }
  for (const k of got) {
    if (!want.has(k)) out.push(`多一条映射：${k}`)
  }

  const expFrom = expected.length === 0 ? null : Math.min(...expected.map((m) => m.stationNo))
  const expTo = expected.length === 0 ? null : Math.max(...expected.map((m) => m.stationNo))
  if (plan.stationFrom !== expFrom) out.push(`起始站 ${String(plan.stationFrom)} ≠ 期望 ${String(expFrom)}`)
  if (plan.stationTo !== expTo) out.push(`末站 ${String(plan.stationTo)} ≠ 期望 ${String(expTo)}`)
  if (plan.litRequiredCount !== expected.length) {
    out.push(`已点亮必学条数 ${plan.litRequiredCount} ≠ 期望 ${expected.length}`)
  }

  // 「还剩几站」= 从当前站位那一站到最后一站（含当前那一站）
  const expRemaining = expFrom === null ? plan.totalStations : Math.max(0, plan.totalStations - expFrom + 1)
  if (plan.remainingStations !== expRemaining) {
    out.push(`还剩站数 ${plan.remainingStations} ≠ 期望 ${expRemaining}`)
  }

  return out
}

// ============================================================================
// ③ 口径只留一处：谓词在**代码**里只能出现一次
// ============================================================================

/**
 * 去掉源码里的**注释**，**保留字符串字面量**。
 *
 * ## 为什么与 `countCodeOccurrences` 分成两个
 *
 * `countCodeOccurrences` 连字符串一起剔（数的是「代码里写了几遍判定式」）；
 * 而「不得出现某个标识符」这类判据需要**反过来** ——
 * 一句 `db.prepare('INSERT INTO lang_topic_state')` 里的表名**必须**被看见，
 * 剔了字符串就等于把真正的违规放过去了。
 *
 * ⚠️ 字符串里的 `//`（如 URL）**不算注释** ⇒ 状态机必须同时认字符串。
 *
 * @param source 源码文本
 */
export function stripComments(source: string): string {
  let out = ''
  let i = 0
  let state: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'bt' = 'code'

  while (i < source.length) {
    const c = source[i]!
    const d = source[i + 1] ?? ''
    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line'
        i += 2
        continue
      }
      if (c === '/' && d === '*') {
        state = 'block'
        i += 2
        continue
      }
      if (c === "'") state = 'sq'
      else if (c === '"') state = 'dq'
      else if (c === '`') state = 'bt'
      out += c
      i += 1
      continue
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += c
      }
      i += 1
      continue
    }
    if (state === 'block') {
      if (c === '*' && d === '/') {
        state = 'code'
        i += 2
        continue
      }
      if (c === '\n') out += c
      i += 1
      continue
    }
    // 字符串字面量：原样保留，跳过转义
    if (c === '\\') {
      out += source.slice(i, i + 2)
      i += 2
      continue
    }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'bt' && c === '`')) {
      state = 'code'
    }
    out += c
    i += 1
  }
  return out
}

/**
 * 数一个片段在源码的**代码部分**里出现了几次（注释与字符串字面量不算）。
 *
 * ## 为什么必须去注释
 *
 * ⚠️ 本模块与被扫模块的注释里都写着 `required === 1` 这句话本身 ——
 *   按原文数会多出一两处，**数出来的不是「写了几遍判定式」而是「写了几遍这句话」**。
 *   ⇒ 必须先把注释与字符串剔掉，数剩下的才是代码。
 *
 * @param source 源码文本
 * @param needle 要数的片段
 */
export function countCodeOccurrences(source: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let i = 0
  /** 当前所处的词法状态 */
  let state: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'bt' = 'code'

  while (i < source.length) {
    const c = source[i]!
    const d = source[i + 1] ?? ''
    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line'
        i += 2
        continue
      }
      if (c === '/' && d === '*') {
        state = 'block'
        i += 2
        continue
      }
      if (c === "'") {
        state = 'sq'
        i += 1
        continue
      }
      if (c === '"') {
        state = 'dq'
        i += 1
        continue
      }
      if (c === '`') {
        state = 'bt'
        i += 1
        continue
      }
      if (source.startsWith(needle, i)) {
        count += 1
        i += needle.length
        continue
      }
      i += 1
      continue
    }
    if (state === 'line') {
      if (c === '\n') state = 'code'
      i += 1
      continue
    }
    if (state === 'block') {
      if (c === '*' && d === '/') {
        state = 'code'
        i += 2
        continue
      }
      i += 1
      continue
    }
    // 字符串字面量：跳过转义
    if (c === '\\') {
      i += 2
      continue
    }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'bt' && c === '`')) {
      state = 'code'
    }
    i += 1
  }
  return count
}

// ============================================================================
// ② §3.18 第 2 条：映射是查表，不是维护
// ============================================================================

/** 从源码文本里抽出引号包裹的字符串字面量（`'…'` / `"…"` / `` `…` ``）。 */
function extractStringLiterals(source: string): string[] {
  const out: string[] = []
  const re = /(['"`])([^'"`\n]{1,120})\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.push(m[2]!)
  return out
}

/**
 * 拦「手写对照表」：源码里出现了**真实知识点 slug** 的字面量。
 *
 * ⚠️ **判据取自真实数据，不靠人眼扫**：传进来的 `knownSlugs` 是库里 `lang_topics.slug`
 *   的全集 ⇒ 任何写死的 `'py-deps'` / `'go-runtime'` 都会被点名，
 *   而 `'master'` / `'本模式必学'` 这类枚举与文案不会误伤。
 *
 * §3.18 的原话：「**不新建表、不新建映射表** —— 一张「速成→精通对照表」等着人手工维护，
 * 而手工维护的对照表第一个月就会和知识点改动脱节。」
 *
 * @param source 被扫的源码文本
 * @param knownSlugs 库里真实存在的知识点 slug 全集
 */
export function findHardcodedSlugLiterals(
  source: string,
  knownSlugs: ReadonlySet<string>,
): string[] {
  const hits = new Set<string>()
  for (const lit of extractStringLiterals(source)) {
    if (knownSlugs.has(lit)) hits.add(lit)
  }
  return [...hits].sort()
}
