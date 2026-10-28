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
  | 'mapping'
  | 'stationFrom'
  | 'stationTo'
  | 'litRequiredCount'
  | 'totalStations'
  | 'remainingStations'
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
  if (plan.stationFrom !== expFrom)
    out.push(`起始站 ${String(plan.stationFrom)} ≠ 期望 ${String(expFrom)}`)
  if (plan.stationTo !== expTo) out.push(`末站 ${String(plan.stationTo)} ≠ 期望 ${String(expTo)}`)
  if (plan.litRequiredCount !== expected.length) {
    out.push(`已点亮必学条数 ${plan.litRequiredCount} ≠ 期望 ${expected.length}`)
  }

  // 「还剩几站」= 从当前站位那一站到最后一站（含当前那一站）
  const expRemaining =
    expFrom === null ? plan.totalStations : Math.max(0, plan.totalStations - expFrom + 1)
  if (plan.remainingStations !== expRemaining) {
    out.push(`还剩站数 ${plan.remainingStations} ≠ 期望 ${expRemaining}`)
  }

  return out
}

// ============================================================================
// ③ 口径只留一处：谓词在**代码**里只能出现一次
// ============================================================================

/** 词法段类型：代码 / 字符串字面量（含引号）/ 行注释 / 块注释。 */
type LexKind = 'code' | 'str' | 'line' | 'block'

/**
 * 单趟扫描：把源码切成「代码 / 字符串 / 注释」三类**连续段**。
 *
 * 这台状态机是 `stripComments` 与 `countCodeOccurrences` 的**唯一**判定处 ——
 * 「字符串里的 `//`（如 URL）算不算注释」「转义怎么跳」只在这里答一次。
 * 各写一份时只要有一处判断不同，「去注释后看得见的表名」与「数出来的次数」
 * 就会互相矛盾，而两边各自看都还合理。
 *
 * ⚠️ 引号本身归**字符串段**：代码段因此从不以引号开头，数代码时
 *   不会把 `'…'` 的起始位置当成一次代码命中（与原判据一致）。
 */
function lexSegments(source: string): { kind: LexKind; text: string }[] {
  const out: { kind: LexKind; text: string }[] = []
  let kind: LexKind = 'code'
  let start = 0
  let i = 0

  /** 把 `[start, end)` 落成一段；调用方先换 `kind` 的场合，先 flush 再换 */
  const flush = (end: number): void => {
    if (end > start) out.push({ kind, text: source.slice(start, end) })
    start = end
  }

  while (i < source.length) {
    const c = source[i]!
    const d = source[i + 1] ?? ''
    if (kind === 'code') {
      if (c === '/' && d === '/') {
        flush(i)
        kind = 'line'
        i += 2
        continue
      }
      if (c === '/' && d === '*') {
        flush(i)
        kind = 'block'
        i += 2
        continue
      }
      if (c === "'" || c === '"' || c === '`') {
        flush(i)
        kind = 'str'
        i += 1
        continue
      }
      i += 1
      continue
    }
    if (kind === 'str') {
      if (c === '\\') {
        i += 2 // 转义：连跳两个字符（`\'` 不结束字符串）
        continue
      }
      i += 1
      if (c === "'" || c === '"' || c === '`') {
        flush(i)
        kind = 'code'
      }
      continue
    }
    if (kind === 'line') {
      if (c === '\n') {
        i += 1
        flush(i)
        kind = 'code'
        continue
      }
      i += 1
      continue
    }
    // block
    if (c === '*' && d === '/') {
      i += 2
      flush(i)
      kind = 'code'
      continue
    }
    i += 1
  }
  flush(source.length)
  return out
}

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
 * 两者的**词法判定**共用 `lexSegments`（见上）；这里只决定「段怎么拼回去」。
 *
 * ⚠️ 注释段**只留换行**：行数不漂，按行断言的调用方才不误报。
 *
 * @param source 源码文本
 */
export function stripComments(source: string): string {
  let out = ''
  for (const seg of lexSegments(source)) {
    out += seg.kind === 'line' || seg.kind === 'block' ? seg.text.replace(/[^\n]/g, '') : seg.text
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
 * 词法判定共用 `lexSegments`（见上）；命中**不跨段** —— 段与段之间隔着字符串或注释，
 * 跨过去意味着片段本身一半是字符串/注释，那就不算「代码里写了几遍」。
 *
 * @param source 源码文本
 * @param needle 要数的片段
 */
export function countCodeOccurrences(source: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  for (const seg of lexSegments(source)) {
    if (seg.kind !== 'code') continue
    for (
      let at = seg.text.indexOf(needle);
      at !== -1;
      at = seg.text.indexOf(needle, at + needle.length)
    ) {
      count += 1
    }
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
