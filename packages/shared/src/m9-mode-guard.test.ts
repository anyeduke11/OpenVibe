// `packages/shared/src/m9-mode-guard.test.ts` —— M9 v1.6 **P1e 的守卫与入口形态**
// （`m9-dev-language-roadmap.md` §3.18 / §3.19 / §3.20 · **DL-37 / DL-38 / DL-39**）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-37** | 转档计划必须与逐条映射**集合相等**（不是计数相等） | 「DL-37」组 |
// | **§3.18 第 2 条** | 映射是查表，不是维护 | 「查表不是维护」组 |
// | **DL-38** | 精通/熟悉**折叠**（不是隐藏） | 「入口形态」组 |
// | **§3.20 第 3 条** | 反查口径只留一处 | 「口径只留一处」组 |
//
// ⚠️ **本层是纯函数层**（不碰 DB、不碰网络）⇒ 变异样本可以直接喂「改过的源码文本」��
//   需要真实库数据的那些断言在 `packages/core/src/db/m9-p1e-mode-interaction.test.ts`。
import { describe, expect, it } from 'vitest'
import {
  computeTransferPlan,
  modeEntryPlan,
  resourceModeLabel,
  RESOURCE_MODE_LABELS,
  type TopicProfileLite,
  type TopicStageLite,
  type TransferMappingEntry,
  type TransferPlan,
} from './m9-mode-interaction'
import type { LangProfile } from './m9-modes'
import {
  countCodeOccurrences,
  findHardcodedSlugLiterals,
  findTransferPlanViolations,
  stripComments,
} from './m9-mode-guard'

// ---------------------------------------------------------------------------
// 夹具（真实 slug · 取自仓内 lang_topics 种子，2026-10-20 实测）
// ---------------------------------------------------------------------------

const TOPICS: TopicStageLite[] = [
  { id: 101, lang: 'python', slug: 'python3-basic-syntax', stage_id: 0, kind: 'language' },
  { id: 102, lang: 'python', slug: 'python3-data-type', stage_id: 1, kind: 'language' },
  { id: 103, lang: 'python', slug: 'python3-class', stage_id: 2, kind: 'language' },
  { id: 201, lang: 'go', slug: 'go-program-structure', stage_id: 0, kind: 'language' },
  { id: 301, lang: 'python', slug: 'python3-tutorial', stage_id: 0, kind: 'library' },
]

const PROFILES: TopicProfileLite[] = [
  { topic_id: 101, profile: 'vibe', required: 1, rank: 1, est_minutes: 8 },
  { topic_id: 102, profile: 'vibe', required: 1, rank: 2, est_minutes: 9 },
  { topic_id: 103, profile: 'vibe', required: 0, rank: 3, est_minutes: null },
  { topic_id: 201, profile: 'vibe', required: 1, rank: 4, est_minutes: 7 },
  { topic_id: 101, profile: 'master', required: 1, rank: 1, est_minutes: null },
  { topic_id: 102, profile: 'master', required: 1, rank: 2, est_minutes: null },
  { topic_id: 103, profile: 'master', required: 1, rank: 3, est_minutes: null },
  { topic_id: 201, profile: 'master', required: 1, rank: 4, est_minutes: null },
]

const EXPECTED: TransferMappingEntry[] = [
  { topicId: 101, slug: 'python3-basic-syntax', stationNo: 1 },
  { topicId: 102, slug: 'python3-data-type', stationNo: 2 },
]

function planFor(lit: ReadonlySet<number>): TransferPlan {
  return computeTransferPlan({
    profile: 'vibe',
    lang: 'python',
    litTopicIds: lit,
    topics: TOPICS,
    profiles: PROFILES,
  })
}

// ---------------------------------------------------------------------------

describe('M9 P1e · DL-37 转档计划的闸', () => {
  it('① 正向：逐条映射集合相等 ⇒ 零违规', () => {
    const plan = planFor(new Set([101, 102]))
    expect(findTransferPlanViolations(plan, EXPECTED)).toEqual([])
    expect(plan.totalStations).toBe(3)
    expect(plan.remainingStations).toBe(3)
  })

  it('② 变异腿：抽掉任意一条映射 ⇒ 闸必报违规（逐条抽）', () => {
    const plan = planFor(new Set([101, 102]))
    for (const victim of plan.mapping) {
      const broken = { ...plan, mapping: plan.mapping.filter((m) => m !== victim) }
      expect(findTransferPlanViolations(broken, EXPECTED).length).toBeGreaterThan(0)
    }
  })

  it('③ 变异腿：**计数相等但成员错位**也必须被抓到（总数对 ≠ 拆分对）', () => {
    const plan = planFor(new Set([101, 102]))
    // 把第 2 条换成第 3 站的一条：条数一样、集合不同
    const shifted: TransferMappingEntry[] = [
      { topicId: 101, slug: 'python3-basic-syntax', stationNo: 1 },
      { topicId: 103, slug: 'python3-class', stationNo: 3 },
    ]
    const broken = { ...plan, mapping: shifted }
    expect(broken.mapping).toHaveLength(plan.mapping.length)
    expect(findTransferPlanViolations(broken, EXPECTED).length).toBeGreaterThan(0)
  })

  it('④ 一条都没点亮 ⇒ 站区间为 null、还剩 = 总站数（不许 0）', () => {
    const plan = planFor(new Set())
    expect(plan.stationFrom).toBeNull()
    expect(plan.stationTo).toBeNull()
    expect(plan.remainingStations).toBe(3)
    expect(findTransferPlanViolations(plan, [])).toEqual([])
  })
})

describe('M9 P1e · §3.18 第 2 条 · 映射是查表，不是维护', () => {
  it('① 源码里零硬编码 slug（判据取自真实 slug 集合，不靠人眼扫）', () => {
    const slugs = new Set(TOPICS.map((t) => t.slug))
    const src = `
      const STATION_OF = { byTopicId: (id) => id }
      export const x = 1
    `
    expect(findHardcodedSlugLiterals(src, slugs)).toEqual([])
  })

  it('② 变异腿：塞一条硬编码 slug ⇒ 闸必报（真改代码的样本）', () => {
    const slugs = new Set(TOPICS.map((t) => t.slug))
    const mutated = `
      const STATION_OF = { 'python3-basic-syntax': 1 }
    `
    expect(findHardcodedSlugLiterals(mutated, slugs)).toEqual(['python3-basic-syntax'])
  })

  it('③ 枚举与文案不会误伤（只有真实 slug 才算硬编码对照表）', () => {
    const slugs = new Set(TOPICS.map((t) => t.slug))
    const src = `
      export const LANG_PROFILES = ['master', 'familiar', 'vibe']
      export const LABEL = '本模式必学'
    `
    expect(findHardcodedSlugLiterals(src, slugs)).toEqual([])
  })
})

describe('M9 P1e · DL-38 入口形态（折叠 ≠ 隐藏）', () => {
  it('① 提问屏与速成落点屏 ⇒ 精通/熟悉折叠成一行', () => {
    expect(modeEntryPlan(null)).toEqual({ collapsedDeepModes: true, showMasterRoutes: false })
    expect(modeEntryPlan('vibe')).toEqual({ collapsedDeepModes: true, showMasterRoutes: false })
  })

  it('② 精通落点屏 ⇒ 展开两门语言的精通路线对比（不折叠）', () => {
    expect(modeEntryPlan('master')).toEqual({ collapsedDeepModes: false, showMasterRoutes: true })
  })

  it('③ 变异腿：把「折叠」写成「隐藏」⇒ 入口形态必须变（否则 §3.19 第 4 条没有兜底）', () => {
    const real = modeEntryPlan('vibe')
    const hidden = { collapsedDeepModes: false, showMasterRoutes: false }
    expect(real.collapsedDeepModes).toBe(true)
    expect(hidden.collapsedDeepModes).toBe(false)
    expect(hidden).not.toEqual(real)
  })
})

describe('M9 P1e · §3.20 第 3 条 · 反查口径只留一处', () => {
  it('① `countCodeOccurrences` 数的是**代码**，注释里那句不算', () => {
    const src = `
      // 注释里写着 required === 1 这句话本身
      /* 块注释里也写着 required === 1 */
      const f = (r) => r.required === 1
    `
    expect(countCodeOccurrences(src, 'required === 1')).toBe(1)
  })

  it('② 变异腿：再写一遍判定式 ⇒ 计数变 2（闸必须红）', () => {
    const src = `
      const f = (r) => r.required === 1
    `
    const mutated = `${src}\nconst g = (r) => r.required === 1\n`
    expect(countCodeOccurrences(src, 'required === 1')).toBe(1)
    expect(countCodeOccurrences(mutated, 'required === 1')).toBe(2)
  })

  it('③ `stripComments` 去掉注释但**保留字符串**（表名必须被看见）', () => {
    const src = `
      // 注释里提了 lang_topic_state
      const q = "INSERT INTO lang_topic_state"
    `
    const stripped = stripComments(src)
    expect(stripped).not.toContain('注释里提了')
    expect(stripped).toContain('lang_topic_state')
  })

  it('④ 资源标记只有两档，且随必学集合反查（DL-39 的判定式）', () => {
    expect(RESOURCE_MODE_LABELS).toEqual(['本模式必学', '仅扩展阅读'])
    expect(resourceModeLabel('vibe', [101, 103], PROFILES)).toBe('本模式必学')
    expect(resourceModeLabel('vibe', [103], PROFILES)).toBe('仅扩展阅读')
    // ⚠️ 「熟悉必学但精通不必学」不存在 ⇒ 换到熟悉模式不会翻出第三档
    const familiar: LangProfile = 'familiar'
    expect(resourceModeLabel(familiar, [103], PROFILES)).toBe('仅扩展阅读')
  })

  // ── 病态 needle（片段自身跨段）────────────────────────────────────────
  //
  // ⚠️ **这一组钉的是「两台状态机合并成一台后，口径收窄了」这件事**：
  //   needle 里带引号或注释符时，它的后半截落在字符串/注释里 ⇒ 片段本身一半不是代码
  //   ⇒ 不算「代码里写了几遍」。
  //   旧实现（stripComments 与 countCodeOccurrences 各一台状态机）会把它算成命中
  //   ⇒ 这几条在实现改回旧口径时必红。
  //   口径与函数文档一致（「注释与字符串不算」），所以收窄方向是**修正**而非回退。

  it('⑤ needle 跨「代码→字符串」边界 ⇒ 不算代码命中', () => {
    const src = `const a = 'x' === 1`
    expect(countCodeOccurrences(src, "= 'x'")).toBe(0)
    // 反证：只取代码段内的片段仍数得到 ⇒ 这条不是恒 0
    expect(countCodeOccurrences(src, 'a =')).toBe(1)
  })

  it('⑥ needle 跨「代码→注释」边界 ⇒ 不算代码命中', () => {
    const src = `const a = 1 // 1`
    expect(countCodeOccurrences(src, '1 // 1')).toBe(0)
    // 反证：只取代码段内的片段仍数得到
    expect(countCodeOccurrences(src, 'a = 1')).toBe(1)
  })

  it('⑦ 两个函数的差异是刻意的：stripComments 看得见字符串，countCodeOccurrences 看不见', () => {
    const src = `const q = "INSERT INTO lang_topic_state"`
    // stripComments 保留字符串 ⇒ 表名必须被看见（剔了就等于把真违规放过去）
    expect(stripComments(src)).toContain('lang_topic_state')
    // countCodeOccurrences 剔字符串 ⇒ 字符串里的片段不算「代码里写了几遍」
    expect(countCodeOccurrences(src, 'lang_topic_state')).toBe(0)
  })

  it('⑧ 字符串里的 `//`（如 URL）不算注释 ⇒ 注释不误删', () => {
    const src = `const url = 'https://example.com/a'`
    expect(stripComments(src)).toContain('https://example.com/a')
  })

  it('⑨ stripComments 只删注释内容、不删行 ⇒ 按行断言的调用方不误报', () => {
    const src = `const a = 1
// 一行注释
const b = 2
/* 块
注释 */
const c = 3`
    expect(stripComments(src).split('\n')).toHaveLength(src.split('\n').length)
  })
})
