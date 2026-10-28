// `packages/core/src/db/m9-concept-deltas.ts` —— M9 v1.6 P1.6（`m9-dev-plan-2026-10.md` §6.2）
//
// 语言差异层的**纯函数面**：版本比较 ＋ 区间相交判定 ＋ 当前生效条目的解析。
// DL-24 的判定逻辑全在这里，所以单测能对它发断言，而不必去碰数据库。
//
// spec §3.12 的关键设计：
//   - `since_version`：自哪个版本起成立
//   - `until_version` NULLABLE：已废弃时填版本（**两条可共存**）
//   - `supersedes` NULLABLE：新条目指向它取代的旧条目
//
//   "Go 1.18 加泛型 ⇒「无泛型」那条差异被打上 `until_version='1.18'`，而不是删掉
//    —— 删掉就丢了「以前为什么没有」这段历史。"
//
// ⚠️ **为什么 until_version 必须真的参与判定**（DL-24 变异腿的根据）：
//   一条差异的**生效区间**是 [since_version, until_version)；
//   语言从 v_old 变到 v_new 时，受影响的条目 = **生效区间与 [v_old, v_new] 相交**。
//   区间相交需要**两端**：
//     start <= v_new  且  (until 为空 或 until >= v_old)
//   若把 until_version 过滤漏掉（当成"永远不过期"），**早已过期的条目会被误报**
//   —— 例如 Go 1.18 那条泛型差异（until='1.18'）在 1.19→1.20 的变更里本该消失，
//   漏了过滤它会被报出来。⇒ 判据里必须同时用上两个字段，否则变异腿不会红。
//
// ⚠️ **两门语言各自版本线**（§3.12 末段）：Python 一年一版、Go 半年一版 ⇒
//   所有判定函数都以 `lang` 为第一道过滤，**绝不合并两条时间线**。

/** §3.12 的 aspect 词表（差异面）。迁移 0011 刻意没加 CHECK，承诺在写入边界收口 —— 这里就是那个边界。 */
export const DELTA_ASPECTS = ['语法', '错误模型', '并发模型', '类型系统', '包管理'] as const

export type DeltaAspect = (typeof DELTA_ASPECTS)[number]

export interface ConceptDelta {
  id: number
  concept_id: number
  lang: 'python' | 'go'
  aspect: string
  summary: string
  since_version: string
  until_version: string | null
  supersedes: number | null
}

/**
 * 把版本串解析成数字段数组。
 *
 * "1.18" → [1, 18]；"3.9" → [3, 9]；"3.10" → [3, 10]。
 * ⚠️ **用数字比较而不是字符串比较** —— 字符串比较会把 "3.10" 判成小于 "3.9"
 *    （因为 '1' < '9'），那会让 Python 3.10 的边界判错。
 */
export function parseVersion(v: string): number[] {
  return v
    .trim()
    .split('.')
    .map((seg) => {
      const n = Number.parseInt(seg, 10)
      return Number.isNaN(n) ? 0 : n
    })
}

/**
 * 比较两个**已解析**的版本数组。返回 -1 / 0 / 1。
 * 段数不同时，短的前面补 0（[1,18] 与 [1,18,0] 相等）。
 */
export function compareParsed(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

/**
 * 比较两个版本。返回 -1 / 0 / 1。
 *
 * 接受**版本串**或**已解析的数组** —— 内部判定多处拿到的是 `parseVersion` 的结果，
 * 强行拼回字符串再解析一次既慢又容易在拼接处出错（"1.18" vs "1.18.0"）。
 *
 * 段数不同时，短的前面补 0（"1.18" 与 "1.18.0" 相等）。
 */
export function compareVersions(a: string | number[], b: string | number[]): number {
  const av = typeof a === 'string' ? parseVersion(a) : a
  const bv = typeof b === 'string' ? parseVersion(b) : b
  return compareParsed(av, bv)
}

/** 差额的生效区间。`end` 为 null 表示"至今仍生效"（直到版本未填）。 */
export function deltaInterval(delta: { since_version: string; until_version: string | null }): {
  start: number[]
  end: number[] | null
} {
  return {
    start: parseVersion(delta.since_version),
    end: delta.until_version === null ? null : parseVersion(delta.until_version),
  }
}

/**
 * DL-24 的核心判定：这条差异是否因 `fromVersion → toVersion` 这次版本变更而**受影响**。
 *
 * 判定 = 生效区间与变更区间相交：
 *   - `since_version <= toVersion`（条目的起点不晚于变更终点）
 *   - 且 `until_version` 为空 或 `until_version >= fromVersion`（条目在变更起点时还没过期）
 *
 * ⚠️ **第二个条件就是 until_version 的用处**。漏掉它（当作永远不过期）会让
 *    **早已过期的条目被误报** —— DL-24 变异腿抓的就是这个。
 *
 * @param fromVersion 变更前版本
 * @param toVersion 变更后版本
 */
export function isAffectedBy(
  delta: { since_version: string; until_version: string | null },
  fromVersion: string,
  toVersion: string,
): boolean {
  // 变更区间本身必须是正向的
  if (compareVersions(fromVersion, toVersion) > 0) return false
  const { start, end } = deltaInterval(delta)
  // 条目起点晚于变更终点 ⇒ 区间不相交
  if (compareVersions(start, toVersion) > 0) return false
  // 条目在变更起点之前就过期了 ⇒ 区间不相交
  // ⚠️ **这一行是 until_version 唯一的用处** —— 删掉它，变异腿不会红。
  if (end !== null && compareVersions(end, fromVersion) < 0) return false
  return true
}

/**
 * DL-24 的对外形态：语言从 `fromVersion` 变到 `toVersion` 时，受影响的差异条目。
 *
 * ⚠️ **先按 lang 过滤**（§3.12：两门语言各自版本线，不合并）。
 */
export function affectedDeltas(
  deltas: ConceptDelta[],
  lang: 'python' | 'go',
  fromVersion: string,
  toVersion: string,
): ConceptDelta[] {
  return deltas.filter((d) => d.lang === lang && isAffectedBy(d, fromVersion, toVersion))
}

/**
 * 给定语言与版本，返回**当前生效**的差异条目。
 *
 * 生效 = `since_version <= version` 且（`until_version` 为空 或 `until_version > version`）。
 * ⚠️ 边界是**左闭右开**：[since, until) —— until_version 等于当前版本时**已不生效**
 *    （那正是"Go 1.18 起没有泛型了"的分界）。
 */
export function currentDeltas(
  deltas: ConceptDelta[],
  lang: 'python' | 'go',
  version: string,
): ConceptDelta[] {
  return deltas.filter((d) => {
    if (d.lang !== lang) return false
    if (compareVersions(d.since_version, version) > 0) return false
    if (d.until_version !== null && compareVersions(d.until_version, version) <= 0) return false
    return true
  })
}

/**
 * 解析 `supersedes` 链：给定一条差异，返回它**取代**的那条（若链上有）。
 *
 * ⚠️ 链可能断（被取代的条目不存在）⇒ 返回 null 而不是抛 —— 断链是数据问题，
 *    由 seed loader 的 warnings 登记，不该让查询崩掉。
 */
export function resolveSuperseded(
  deltas: ConceptDelta[],
  delta: ConceptDelta,
): ConceptDelta | null {
  if (delta.supersedes === null) return null
  return deltas.find((d) => d.id === delta.supersedes) ?? null
}

/** 反向：给定一条差异，返回**取代了它**的那些条目。 */
export function resolveSuperseding(deltas: ConceptDelta[], delta: ConceptDelta): ConceptDelta[] {
  return deltas.filter((d) => d.supersedes === delta.id)
}
