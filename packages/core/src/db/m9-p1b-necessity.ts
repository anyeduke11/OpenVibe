/**
 * `packages/core/src/db/m9-p1b-necessity.ts` —— M9 v1.6 **P1b.2 · 资源必要性由矩阵推导**
 * （`m9-dev-plan-2026-10.md` §6.3 的 P1b.2 ＋ `m9-dev-language-roadmap.md` §1.6.1 · **DL-48**）
 *
 * ## 它守的是什么
 *
 * 附件给的是一张 **NEC_RULE 矩阵**（三模式 × 六档 tier，18 格），不是逐条标注。
 * ⇒ 「这条资源在精通模式下是必学还是可跳过」**必须**由 `NEC_RULE[profile][tier]` 现算。
 *
 * ⚠️ **DL-48 是本版最容易被绕过的一条**：
 *   矩阵只有 18 格，肉眼扫得完；**89 条逐条就扫不完**。
 *   一旦有人「优化」成手写清单，它与附件的一致性就再也无法验证 ——
 *   两版之间漂移几行，**谁也看不出来**。
 *   ⇒ 本模块**没有任何「逐条清单」的位置**：
 *     - 必要性只有一条计算路径：`necessaryFor(profile, tier)`；
 *     - 它的入参**只有档位**，没有资源 id / 名称 ⇒ 结构上不可能逐条覆写；
 *     - 种子里**不许有**必要性字段（由字段闭集钉死，见 `m9-external-content-scan.ts`）。
 *
 * ## ⚠️ 矩阵的轴是 **tier**，不是展示分类（本轮实测纠正过一次）
 *
 * 附件的 `NEC_RULE` 是按 **tier** 分的：
 * `a` 最小必备 · `b` 核心主线 · `c` 补充进阶 · `d` 高级底层 · `e` 过时补充 · `v` AI 工具。
 *
 * ⚠️ **与「展示分类」（official/github/course/book/video/practice）是两套维度，不能混**：
 *   展示分类回答「资源是什么形态」，tier 回答「它在路线里排第几」。
 *   两者**恰好都是六项**，所以混起来在肉眼下很难发现 ——
 *   而按错的轴算出来的分布与 spec 记的数对不上（本轮实测：矩阵 × 展示分类算不出 53/36/0）。
 *   ⇒ 现在的矩阵表头写的是 tier，且**表头与数据行必须同时命中**才认这一格。
 *
 * ## 口径只留一处：矩阵从 spec 正文读出来
 *
 * ⚠️ **矩阵不写死在本文件里** —— 它**逐字抄自附件**，而仓内唯一留存的副本是 spec §1.6.1
 *   的那张表 ⇒ 本模块**解析 spec**，不另抄一份。
 *   （同 P1.11 的手法：抄成常量就是「又一份事实」，改了 spec 两边会悄悄分叉。）
 *
 *   ⇒ 三方相等由 `verifyNecessity` 断：
 *   ① **矩阵**（spec §1.6.1 的 NEC_RULE 表）—— 规则
 *   ② **实算分布**（矩阵 × 库里 89 条资源的 tier）—— 结果
 *   ③ **spec 记的分布**（§1.6.1 那行「三档分布（实测）」）—— 抄录
 *   任一改动都会让另外两方对不上 ⇒ 报红。
 *   （第三份「附件原文里的数」在仓内不存在 —— 那一层如实登记在 `lang_resources.json` 的 `_notes`。）
 *
 * ## 它是纯函数
 *
 * 不碰数据库、不碰网络 ⇒ 单测可以直接喂「改过的 spec 文本」当变异样本。
 */

/** 三种学习模式（§3.17 的全局枚举，不逐条存表）。 */
export type LangProfile = 'master' | 'familiar' | 'vibe'

/**
 * 资源档位（附件 `TIER` 的值域）。
 *
 * ⚠️ `v`（AI 工具）**只属于速成专区那 11 条** —— 它们不在附件的 `TIER` 映射里
 *   （那 87 键是主清单的），但矩阵的 v 列对它们生效。
 */
export type ResourceTier = 'a' | 'b' | 'c' | 'd' | 'e' | 'v'

/** 主清单里可能出现的档位（`v` 留给速成专区）。 */
export type MainResourceTier = Exclude<ResourceTier, 'v'>

/** 必要性三档。 */
export type Necessity = 'required' | 'recommended' | 'optional'

export const LANG_PROFILES: readonly LangProfile[] = ['master', 'familiar', 'vibe']
export const RESOURCE_TIERS: readonly ResourceTier[] = ['a', 'b', 'c', 'd', 'e', 'v']
export const MAIN_RESOURCE_TIERS: readonly MainResourceTier[] = ['a', 'b', 'c', 'd', 'e']

/** 档位的中文说明（附件的注释逐字照抄）。 */
export const TIER_LEGEND: Record<ResourceTier, string> = {
  a: '最小必备',
  b: '核心主线',
  c: '补充进阶',
  d: '高级底层',
  e: '过时补充',
  v: 'AI 工具',
}

/** 18 格矩阵：`profile → tier → 必要性`。 */
export type NecRule = Record<LangProfile, Record<ResourceTier, Necessity>>

/** 三档分布：`profile → 必要性 → 条数`。 */
export type NecDistribution = Record<LangProfile, Record<Necessity, number>>

/** 界面文案（§1.6.1 的三个中文档位）。⚠️ 只用于渲染，**不含任何条数**。 */
export const NECESSITY_LABEL: Record<Necessity, string> = {
  required: '必学',
  recommended: '推荐',
  optional: '可跳过',
}

const VALUE_BY_WORD: Record<string, Necessity> = {
  必学: 'required',
  推荐: 'recommended',
  可跳过: 'optional',
}

const PROFILE_BY_WORD: Record<string, LangProfile> = {
  精通: 'master',
  熟悉: 'familiar',
  速成: 'vibe',
}

/**
 * 取 spec §1.6.1 的正文（从该小节标题到下一个同级标题为止）。
 *
 * ⚠️ **必须截断** —— §1.6.1 之后还有十几张表，不截断的话「按形状扫数字」的读法
 *   会把别的表里的同形行也吃进来。
 */
export function specSection161(specText: string): string | null {
  const start = specText.indexOf('#### 1.6.1')
  if (start === -1) return null
  const rest = specText.slice(start)
  const next = rest.indexOf('\n#### ', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

/** 去掉 Markdown 的粗体标记（spec 表格里有一格是 `**必学**`）。 */
function stripBold(s: string): string {
  return s.replace(/\*/g, '').trim()
}

/**
 * 找 NEC_RULE 矩阵的表头行 —— 返回列的档位顺序。
 *
 * ⚠️ **表头必须命中 tier**（a/b/c/d/e/v）——
 *   旧版把列头写成展示分类（official/github/…），那不是矩阵的轴，
 *   按它算出来的分布与 spec 记的数对不上（本轮实测纠正）。
 */
function findNecHeader(lines: string[]): { index: number; tiers: ResourceTier[] } | null {
  for (let i = 0; i < lines.length; i += 1) {
    // ⚠️ **必须 stripBold + trim** —— 表格切出来的每格都带首尾空格
    const cells = (lines[i] ?? '').split('|').slice(1, -1).map((c) => stripBold(c))
    if (cells.length !== RESOURCE_TIERS.length + 1) continue
    if (cells[0] !== '模式') continue
    const tiers: ResourceTier[] = []
    let ok = true
    for (const cell of cells.slice(1)) {
      // ⚠️ **一格一个档位**（a/b/c/d/e/v）—— 旧版把列头写成展示分类（official/github/…），
      //   那不是矩阵的轴，按它算出来的分布与 spec 记的数对不上（本轮实测纠正）。
      const m = /^([a-ev])(?:\s|$)/.exec(cell)
      const t = m?.[1] as ResourceTier | undefined
      if (!t) {
        ok = false
        break
      }
      tiers.push(t)
    }
    if (!ok) continue
    if (tiers.length !== RESOURCE_TIERS.length) continue
    return { index: i, tiers }
  }
  return null
}

/**
 * 解析 spec §1.6.1 的 NEC_RULE 矩阵表。
 *
 * 表头形如：`| 模式 | a 最小必备 | b 核心主线 | c 补充进阶 | d 高级底层 | e 过时补充 | v AI 工具 |`
 * 数据行形如：`| **精通** \`master\` | 必学 | 必学 | 必学 | 推荐 | 推荐 | 推荐 |`
 *
 * ⚠️ **表头必须命中 tier**（`a`/`b`/`c`/`d`/`e`/`v`）——
 *   旧版把列头写成展示分类（official/github/…），那不是矩阵的轴，
 *   按它算出来的分布与 spec 记的数对不上（本轮实测纠正）。
 *
 * @returns 18 格矩阵；读不出来（表头缺失 / 行数不对 / 档位词不认识）返回 null。
 */
export function parseNecRule(specText: string): NecRule | null {
  const sec = specSection161(specText)
  if (sec === null) return null

  const lines = sec.split('\n')
  const header = findNecHeader(lines)
  if (header === null) return null
  const { index: headerIdx, tiers } = header

  const rule = {} as NecRule
  let filled = 0
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((c) => stripBold(c))
    if (cells.length !== tiers.length + 1) continue
    const m = /^(精通|熟悉|速成)\s+`?(master|familiar|vibe)`?$/.exec(cells[0] ?? '')
    if (!m) continue
    const profile = PROFILE_BY_WORD[m[1]!] as LangProfile
    const row = {} as Record<ResourceTier, Necessity>
    for (let i = 0; i < tiers.length; i += 1) {
      const word = cells[i + 1] ?? ''
      const nec = VALUE_BY_WORD[word]
      if (!nec) return null
      row[tiers[i]!] = nec
    }
    rule[profile] = row
    filled += 1
  }
  if (filled !== LANG_PROFILES.length) return null
  for (const profile of LANG_PROFILES) {
    for (const t of RESOURCE_TIERS) {
      if (!rule[profile][t]) return null
    }
  }
  return rule
}

/**
 * 解析 spec §1.6.1 记的三档分布。
 *
 * 原文形如：「**精通 必学 53 / 推荐 36 / 可跳过 0**；**熟悉 必学 25 / 推荐 28 / 可跳过 36**；…」
 *
 * ⚠️ **锚在「模式词 + 三档词」的整句形状上**，不是「第一个出现的数字」——
 *   同一段里三个模式的数连着出现，按位置取必错。
 */
export function parseSpecDistribution(specText: string): NecDistribution | null {
  const sec = specSection161(specText)
  if (sec === null) return null
  const re = /(精通|熟悉|速成)\s*必学\s*(\d+)\s*\/\s*推荐\s*(\d+)\s*\/\s*可跳过\s*(\d+)/g
  const out = {} as NecDistribution
  let filled = 0
  for (const m of sec.matchAll(re)) {
    const profile = PROFILE_BY_WORD[m[1]!] as LangProfile
    out[profile] = {
      required: Number(m[2]),
      recommended: Number(m[3]),
      optional: Number(m[4]),
    }
    filled += 1
  }
  if (filled !== LANG_PROFILES.length) return null
  return out
}

/** 矩阵 ＋ spec 记的分布（一次性读出来，脚本与单测共用）。 */
export interface SpecNec {
  rule: NecRule
  distribution: NecDistribution
}

/** 读 spec §1.6.1 的矩阵与三档分布；任一读不出返回 null。 */
export function parseSpecNecDistribution(specText: string): SpecNec | null {
  const rule = parseNecRule(specText)
  if (rule === null) return null
  const distribution = parseSpecDistribution(specText)
  if (distribution === null) return null
  return { rule, distribution }
}

/**
 * 按矩阵 × 档位现算三档分布。
 *
 * @param rows 每条资源只提供它的档位 —— ⚠️ **刻意不给 id / 名称**：
 *   这样「某条资源被单独改成可跳过」在结构上就无处可写（DL-48 的要点）。
 */
export function computeDistribution(
  rule: NecRule,
  rows: readonly { tier: ResourceTier }[],
): NecDistribution {
  const out = {} as NecDistribution
  for (const profile of LANG_PROFILES) {
    out[profile] = { required: 0, recommended: 0, optional: 0 }
  }
  for (const row of rows) {
    for (const profile of LANG_PROFILES) {
      const value = necessaryFor(rule, profile, row.tier)
      out[profile][value] += 1
    }
  }
  return out
}

/**
 * 必要性现算 —— **唯一的计算路径**。
 *
 * ⚠️ 入参只有「模式 + 档位」⇒ 没有「逐条覆写」的位置。
 *   矩阵缺格 ⇒ 抛错（不静默返回默认值 —— 静默兜底会让闸恒绿）。
 */
export function necessaryFor(
  rule: NecRule,
  profile: LangProfile,
  tier: ResourceTier,
): Necessity {
  const row = rule[profile]
  if (!row) throw new Error(`矩阵缺模式「${profile}」`)
  const nec = row[tier]
  if (!nec) throw new Error(`矩阵缺格子「${profile} × ${tier}」`)
  return nec
}

export type NecRuleViolationKind =
  | 'matrix-parse-failed'
  | 'distribution-parse-failed'
  | 'unknown-tier'
  | 'spec-mismatch'

export interface NecRuleViolation {
  where: string
  rule: NecRuleViolationKind
  detail: string
}

/**
 * 对账：矩阵（规则）× 实算分布（结果）↔ spec 记的分布（抄录）。
 *
 * ⚠️ **这是三方相等，不是两方** ——
 *   只断「实算 == spec」的话，两边同时被改就一起绿了；
 *   只断「实算 == 附件的数」的话（附件不在仓内）连参照物都没有。
 *   ⇒ 第三份参照（附件原文里的 53/36/0 等）由**单测**钉住，见
 *     `m9-p1b-resources.test.ts` 的 `ATTACHMENT_DISTRIBUTION`。
 */
export function verifyNecessity(args: {
  specText: string
  rows: readonly { tier: string }[]
}): NecRuleViolation[] {
  const out: NecRuleViolation[] = []
  const rule = parseNecRule(args.specText)
  if (rule === null) {
    out.push({
      where: 'spec §1.6.1 · NEC_RULE 矩阵',
      rule: 'matrix-parse-failed',
      detail: '读不出 18 格矩阵 ⇒ spec 被改到闸认不出了（**不许当成「没有这条规则」**）',
    })
    return out
  }
  const specDist = parseSpecDistribution(args.specText)
  if (specDist === null) {
    out.push({
      where: 'spec §1.6.1 · 三档分布',
      rule: 'distribution-parse-failed',
      detail: '读不出三档分布 ⇒ spec 被改到闸认不出了',
    })
    return out
  }

  const typed: { tier: ResourceTier }[] = []
  for (const r of args.rows) {
    if (!RESOURCE_TIERS.includes(r.tier as ResourceTier)) {
      out.push({
        where: `资源档位「${r.tier}」`,
        rule: 'unknown-tier',
        detail: `不在档位闭集内：${RESOURCE_TIERS.join(' / ')}`,
      })
      continue
    }
    typed.push({ tier: r.tier as ResourceTier })
  }
  if (out.length > 0) return out

  const actual = computeDistribution(rule, typed)
  for (const profile of LANG_PROFILES) {
    const a = actual[profile]
    const s = specDist[profile]
    if (a.required !== s.required || a.recommended !== s.recommended || a.optional !== s.optional) {
      out.push({
        where: `spec §1.6.1 · ${profile} 档分布`,
        rule: 'spec-mismatch',
        detail:
          `矩阵现算 ${String(a.required)}/${String(a.recommended)}/${String(a.optional)}，` +
          `spec 记 ${String(s.required)}/${String(s.recommended)}/${String(s.optional)}`,
      })
    }
  }
  return out
}
