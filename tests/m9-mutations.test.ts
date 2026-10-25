// `tests/m9-mutations.test.ts` —— M9 v1.6 **§11 配套检查器 · 变异腿**
// （`docs/specs/m9-dev-plan-2026-10.md` §11.2 · **DL-44 / DL-45 / DL-46 / DL-26 / DL-47~50**）
//
// ## 它是什么
//
// §11.2 说「15 条变异腿已就位（`/tmp/m9mut16.py`），本计划 W1 一并落仓」。
// ⚠️ **`/tmp` 里的东西重启就没了** —— 实测那两个脚本（`m9check16.py` / `m9mut16.py`）
//   **早已不在** ⇒ 计划里「本轮脚本已就位」这句话**只活了一轮**。
//   ⇒ 本文件是**重写**的，且这次直接落仓。
//
// ## ⚠️ 反向判据必须自证
//
// 规格一致性这组判据**天然没有正向痕迹**（规格自洽就一直绿）⇒
// 「闸能红」这件事**只能靠变异腿证明**。
// ⇒ 本文件的每一条腿都是**真改 spec 文本**（不是喂一个假样本），
//   然后断言**闸组**里至少有一道当场报出违规。
//
// ## 闸组 = 新检查器 ＋ 既有 P1b/P1d 的 spec 文本解析器
//
// ⚠️ **不重写既有解析器**（`parseSpecPhaseRows` / `tallyOutcomePrefixes` /
//   `checkNoMappingStatements` / `parseSpecNecDistribution` / `parseSpecResourceCounts`）——
//   两处各写一份解析，两边会**错得一模一样**，闸就成了同义反复。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSpecConsistency } from './support/m9-spec-consistency'
import {
  checkNoMappingStatements,
  parseSpecPhaseRows,
  tallyOutcomePrefixes,
} from '../packages/core/src/tooling/m9-p1d-spec'
import {
  computeDistribution,
  parseSpecNecDistribution,
  type LangProfile,
  type ResourceTier,
} from '../packages/core/src/tooling/m9-p1b-necessity'
import { parseSpecResourceCounts } from '../packages/core/src/tooling/m9-p1b-spec'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SEEDS = join(REPO, 'packages', 'core', 'src', 'db', 'seeds')
const SPEC_TEXT = readFileSync(join(REPO, 'docs', 'specs', 'm9-dev-language-roadmap.md'), 'utf8')

interface SeedItem {
  profile: string
  lang: string
  ord: number
  label: string
  title: string
  duration_label: string
  outcome?: string | null
}
interface PhaseSeed {
  items: SeedItem[]
}
interface ResourceSeedItem {
  category: string
  tier: ResourceTier
}
interface ResourceSeed {
  items: ResourceSeedItem[]
}
interface VibeSeedItem {
  group: string
}
interface VibeSeed {
  items: VibeSeedItem[]
}

const PHASE_SEED = JSON.parse(readFileSync(join(SEEDS, 'lang_profile_phases.json'), 'utf8')) as PhaseSeed
const RES_SEED = JSON.parse(readFileSync(join(SEEDS, 'lang_resources.json'), 'utf8')) as ResourceSeed
const VIBE_SEED = JSON.parse(readFileSync(join(SEEDS, 'lang_vibe_resources.json'), 'utf8')) as VibeSeed

// ============================================================================
// 闸组
// ============================================================================

/** 一道闸：吃 spec 文本，报违规列表。 */
interface Gate {
  name: string
  run: (text: string) => string[]
}

const GATES: Gate[] = [
  {
    name: 'spec-consistency',
    run: (t) =>
      checkSpecConsistency(t).map((x) => `[${x.rule}] ${x.where} — ${x.detail}`),
  },
  {
    name: 'DL-49 分期 21 段逐格',
    run: (t) => {
      const problems: string[] = []
      const rows = parseSpecPhaseRows(t)
      if (rows.length !== PHASE_SEED.items.length) {
        problems.push(`段数 ${rows.length} ≠ 种子 ${PHASE_SEED.items.length}`)
      }
      for (let i = 0; i < Math.min(rows.length, PHASE_SEED.items.length); i += 1) {
        const r = rows[i]!
        const s = PHASE_SEED.items[i]!
        if (r.profile !== s.profile || r.lang !== s.lang || r.ord !== s.ord) {
          problems.push(`第 ${i + 1} 段 profile/lang/ord 不符`)
        }
        if (r.label !== s.label) problems.push(`第 ${i + 1} 段 label 不符`)
        if (r.title !== s.title) problems.push(`第 ${i + 1} 段 title 不符`)
        if (r.duration !== s.duration_label) problems.push(`第 ${i + 1} 段 duration 不符`)
        if (r.outcome !== (s.outcome ?? null)) problems.push(`第 ${i + 1} 段 outcome 不符`)
      }
      return problems
    },
  },
  {
    name: 'DL-49 产出栏前缀分布',
    run: (t) => {
      const problems: string[] = []
      const tally = tallyOutcomePrefixes(parseSpecPhaseRows(t))
      let produced = 0
      let practiced = 0
      let skipped = 0
      let empty = 0
      for (const s of PHASE_SEED.items) {
        if (s.outcome === null || s.outcome === undefined) {
          empty += 1
          continue
        }
        const p = s.outcome.split('：')[0]
        if (p === '产出') produced += 1
        else if (p === '练习') practiced += 1
        else if (p === '跳过') skipped += 1
      }
      if (tally.产出 !== produced) problems.push(`产出 ${tally.产出} ≠ 种子 ${produced}`)
      if (tally.练习 !== practiced) problems.push(`练习 ${tally.练习} ≠ 种子 ${practiced}`)
      if (tally.跳过 !== skipped) problems.push(`跳过 ${tally.跳过} ≠ 种子 ${skipped}`)
      if (tally.空 !== empty) problems.push(`空 ${tally.空} ≠ 种子 ${empty}`)
      return problems
    },
  },
  {
    name: 'DL-50 不映射声明',
    run: (t) => checkNoMappingStatements(t).problems,
  },
  {
    name: 'DL-48 矩阵 × 分布',
    run: (t) => {
      const spec = parseSpecNecDistribution(t)
      if (!spec) return ['§1.6.1 的矩阵或分布读不出来']
      const problems: string[] = []
      const computed = computeDistribution(
        spec.rule,
        RES_SEED.items.map((r) => ({ tier: r.tier })),
      )
      for (const profile of ['master', 'familiar', 'vibe'] as LangProfile[]) {
        const a = spec.distribution[profile]
        const b = computed[profile]
        if (a.required !== b.required || a.recommended !== b.recommended || a.optional !== b.optional) {
          problems.push(
            `${profile} 档位分布与「矩阵 × 种子 tier 现算」不符：spec ${a.required}/${a.recommended}/${a.optional}，现算 ${b.required}/${b.recommended}/${b.optional}`,
          )
        }
      }
      return problems
    },
  },
  {
    name: 'DL-47 资源条数',
    run: (t) => {
      const spec = parseSpecResourceCounts(t)
      if (!spec) return ['§1.6.1 的资源条数读不出来']
      const problems: string[] = []
      const byCat = new Map<string, number>()
      for (const r of RES_SEED.items) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1)
      for (const [cat, c] of spec.categories) {
        const actual = byCat.get(cat) ?? 0
        if (actual !== c.total) {
          problems.push(`分类 ${cat}：spec 写 ${c.total} 条，种子 ${actual} 条`)
        }
        // ⚠️ **行内自洽**（python + go = 合计）—— 只比总量的话，
        //   「把 Go 那一格改了而合计没改」是抓不到的。
        if (c.python + c.go !== c.total) {
          problems.push(`分类 ${cat}：python ${c.python} + go ${c.go} ≠ 合计 ${c.total}`)
        }
      }
      if (spec.main !== RES_SEED.items.length) {
        problems.push(`主清单小计 ${spec.main} ≠ 种子 ${RES_SEED.items.length}`)
      }
      const tools = VIBE_SEED.items.filter((i) => i.group === 'tools').length
      const tuts = VIBE_SEED.items.filter((i) => i.group === 'tuts').length
      if (spec.tools !== tools) problems.push(`VIBE_TOOLS ${spec.tools} ≠ 种子 ${tools}`)
      if (spec.tuts !== tuts) problems.push(`VIBE_TUTS ${spec.tuts} ≠ 种子 ${tuts}`)
      if (spec.all !== spec.main + spec.tools + spec.tuts) {
        problems.push(`真实资源总数 ${spec.all} ≠ ${spec.main} + ${spec.tools} + ${spec.tuts}`)
      }
      return problems
    },
  },
]

// ============================================================================
// 变异腿
// ============================================================================

interface Mutation {
  /** 腿的名字 */
  name: string
  /** 预期抓到它的闸（**只要求它在里面**，不要求只有它） */
  expectGate: string
  /** 真改文本 */
  apply: (text: string) => string
}

function replaceOnce(oldText: string, newText: string): (t: string) => string {
  return (t) => {
    if (!t.includes(oldText)) {
      throw new Error(`变异锚点不存在：${oldText.slice(0, 40)}`)
    }
    return t.replace(oldText, newText)
  }
}

/**
 * 只在某个小节**内部**替换（全部出现处）。
 *
 * ⚠️ 为什么需要它：§3.6 里「不做逐格映射」这句话出现了**两次**
 *   （裁定要点 ＋ 「为什么不做逐格映射」的说明）⇒ 只改一处的话，
 *   `checkNoMappingStatements` 仍然读得到那句话 ⇒ **闸不会红**，
 *   那条腿就证明不了任何东西（实测踩到过：M18 第一版就是这么空转的）。
 */
function replaceInSection(heading: string, oldText: string, newText: string): (t: string) => string {
  return (t) => {
    const lines = t.split('\n')
    const from = lines.findIndex((l) => l.trim().startsWith(heading))
    if (from < 0) throw new Error(`找不到小节：${heading}`)
    const level = (lines[from]!.trim().match(/^#+/) ?? ['#'])[0]!.length
    let to = lines.length
    for (let i = from + 1; i < lines.length; i += 1) {
      const m = (lines[i] ?? '').trim().match(/^(#{2,4})\s/)
      if (m && m[1]!.length <= level) {
        to = i
        break
      }
    }
    const sec = lines.slice(from, to).join('\n')
    if (!sec.includes(oldText)) throw new Error(`小节里找不到锚点：${oldText.slice(0, 40)}`)
    const replaced = sec.split(oldText).join(newText)
    return [...lines.slice(0, from), ...replaced.split('\n'), ...lines.slice(to)].join('\n')
  }
}

const MUTATIONS: Mutation[] = [
  // ── A 组：DL-44 §0 速览 ↔ 正文 ───────────────────────────────────────────
  {
    name: 'M1 §0 的人日改 39（与 §9 逐期求和 38 不符）',
    expectGate: 'spec-consistency',
    apply: replaceOnce('**十一期 · ≈38 人日**', '**十一期 · ≈39 人日**'),
  },
  {
    name: 'M2 §0 的表数改十六（与 §3.1 代码块 17 张不符）',
    expectGate: 'spec-consistency',
    apply: replaceOnce('**十七张新表**', '**十六张新表**'),
  },
  {
    name: 'M3 §0 的判据数改四十九（与 §7 的 50 条不符）',
    expectGate: 'spec-consistency',
    apply: replaceOnce('**五十条判据**', '**四十九条判据**'),
  },
  {
    name: 'M4 §0 的期数改十（与 §9 的 11 期不符）',
    expectGate: 'spec-consistency',
    apply: replaceOnce('**十一期 · ≈38 人日**', '**十期 · ≈38 人日**'),
  },
  {
    name: 'M5 §0 的待裁数改八条（与 §6.3 台账 9 条不符）',
    expectGate: 'spec-consistency',
    apply: replaceOnce('**九条待裁**', '**八条待裁**'),
  },
  {
    name: 'M6 §0 的增强数改十三条（与 §3.0 的 14 条不符）',
    expectGate: 'spec-consistency',
    apply: replaceOnce('**十四条**（v0.5 起 5 条', '**十三条**（v0.5 起 5 条'),
  },
  {
    name: 'M7 §0 的分组口径整体错位一格（**总数 17 对得上，分解不对**）',
    expectGate: 'spec-consistency',
    apply: replaceOnce(
      '（知识点 7 · 源码与记忆 4 · 资源 2 · 模式与阶段 3 ＋ 语言差异 1）',
      '（知识点 8 · 源码与记忆 3 · 资源 2 · 模式与阶段 3 ＋ 语言差异 1）',
    ),
  },

  // ── B 组：DL-44 兜底 + DL-26 ─────────────────────────────────────────────
  {
    name: 'M8 §3.1 抬头分组里的表名改错（成员错位，**总数仍对**）',
    expectGate: 'spec-consistency',
    apply: replaceOnce(
      '`lang_resources` `lang_vibe_resources`）',
      '`lang_resources` `lang_vibe_resource`）',
    ),
  },
  {
    name: 'M9 §3.1 代码块删掉一张表（表数变 16）',
    expectGate: 'spec-consistency',
    apply: (t) =>
      t.replace(
        /^lang_concept_deltas .*\n/m,
        '',
      ),
  },

  // ── C 组：DL-45 ─────────────────────────────────────────────────────────
  {
    name: 'M10 删掉 §10.2 里 DL-43 的登记行（但 §7 仍标「界面形态已跑」）',
    expectGate: 'spec-consistency',
    apply: (t) => t.replace(/^\| 三种 `#mode-\*` 深链.*\n/m, ''),
  },
  {
    name: 'M11 把 DL-05 的档位改成「界面形态已跑」（§10.2 没有它的登记行）',
    expectGate: 'spec-consistency',
    apply: (t) => {
      const lines = t.split('\n')
      const i = lines.findIndex((l) => l.startsWith('| **DL-05** |'))
      if (i < 0) throw new Error('找不到 DL-05 那行')
      const cells = lines[i]!.split('|')
      const at = cells.length - 2
      cells[at] = ' 界面形态已跑 '
      lines[i] = cells.join('|')
      return lines.join('\n')
    },
  },

  // ── D 组：DL-46 ─────────────────────────────────────────────────────────
  {
    name: 'M12 §6.3 第 8 条不再标 ⛔（依赖链说它在第 6 条之后）',
    expectGate: 'spec-consistency',
    apply: replaceOnce(
      '| ⛔ **P1f**（阶段 2 的推荐档；',
      '| **P1f**（阶段 2 的推荐档；',
    ),
  },
  {
    name: 'M13 §9 的 P1f 行依赖去掉 P1d（台账仍写「卡住 P1f」）',
    expectGate: 'spec-consistency',
    apply: replaceOnce(
      '| **DL-40 DL-41 DL-42 DL-43** | P1d P1e | 3 |',
      '| **DL-40 DL-41 DL-42 DL-43** | P1e | 3 |',
    ),
  },

  // ── E 组：既有闸（DL-47~50）─────────────────────────────────────────────
  {
    name: 'M14 §1.6.1 资源表把 official 的 Go 改成 8（行内 6+8 ≠ 合计 13）',
    expectGate: 'DL-47 资源条数',
    apply: replaceOnce(
      '| `official` 官方文档 | 6 | 7 | **13** |',
      '| `official` 官方文档 | 6 | 8 | **13** |',
    ),
  },
  {
    name: 'M15 §1.6.1 的分布把精通「可跳过」改成 1（矩阵里精通没有这一档）',
    expectGate: 'DL-48 矩阵 × 分布',
    apply: replaceOnce(
      '**精通 必学 53 / 推荐 36 / 可跳过 0**',
      '**精通 必学 53 / 推荐 36 / 可跳过 1**',
    ),
  },
  {
    name: 'M16 §3.17.1 删掉第 21 段（21 段变 20 段）',
    expectGate: 'DL-49 分期 21 段逐格',
    apply: (t) => t.replace(/^\| \*\*21\*\* \| Go \| 速成 .*\n/m, ''),
  },
  {
    name: 'M17 §3.17.1 把「跳过：」润色成「产出：」（**方向完全相反**的那种润色）',
    expectGate: 'DL-49 分期 21 段逐格',
    apply: replaceOnce(
      '跳过：goroutine 深入模式、pprof、反射、cgo、gRPC 与微服务框架（高级阶段再补）',
      '产出：goroutine 深入模式、pprof、反射、cgo、gRPC 与微服务框架（高级阶段再补）',
    ),
  },
  {
    name: 'M18 §3.6 删掉「不做逐格映射」那句（两套阶段并存的裁定不见了）',
    expectGate: 'DL-50 不映射声明',
    // ⚠️ **小节内全部出现处都要改** —— §3.6 里那句话出现两次，
    //   只改一处的话 `checkNoMappingStatements` 照样读得到 ⇒ 闸不会红。
    apply: replaceInSection('### 3.6 ', '不做逐格映射', '各管一段'),
  },

  // ── F 组：表格结构 ──────────────────────────────────────────────────────
  {
    name: 'M19 §6.3 第 8 条那一行多切一格（表格静默变形）',
    expectGate: 'spec-consistency',
    apply: replaceOnce(
      '| ⛔ **P1f**（阶段 2 的推荐档；',
      '| ⛔ **P1f**（阶段 2 的推荐档；| ',
    ),
  },
]

// ============================================================================

describe('M9 §11.2 · 变异腿（每条都要把闸组顶红）', () => {
  it('① 基线：未变异的 spec 上**整组闸全绿**（否则腿红得没有意义）', () => {
    const all: string[] = []
    for (const g of GATES) {
      const problems = g.run(SPEC_TEXT)
      expect(problems, `闸「${g.name}」在真 spec 上报了：\n${problems.join('\n')}`).toEqual([])
    }
    expect(all).toEqual([])
  })

  it('② 闸组非空且每道闸都真读到了东西（防止「什么都没读所以什么都没报」）', () => {
    expect(GATES.length).toBeGreaterThanOrEqual(6)
    // 每道闸在「喂一段空文本」时都该**报出点什么**（要么违规，要么读不出来）
    for (const g of GATES) {
      const problems = g.run('')
      expect(problems.length, `闸「${g.name}」喂空文本居然没报 ⇒ 它什么都没读`).toBeGreaterThan(0)
    }
  })

  for (const m of MUTATIONS) {
    it(`③ ${m.name} ⇒ 闸组必须红（预期由「${m.expectGate}」抓到）`, () => {
      const mutated = m.apply(SPEC_TEXT)
      // ⚠️ **变异必须真的改了文本** —— 否则这条腿是空转的（改了等于没改）
      expect(mutated, '这条变异没有真的改到文本').not.toBe(SPEC_TEXT)

      const hits: { gate: string; problems: string[] }[] = []
      for (const g of GATES) {
        const problems = g.run(mutated)
        if (problems.length > 0) hits.push({ gate: g.name, problems })
      }
      expect(
        hits.length,
        `变异后**整组闸都没红** ⇒ 这条腿证明不了任何东西（闸组：${GATES.map((g) => g.name).join(' / ')}）`,
      ).toBeGreaterThan(0)

      const names = hits.map((h) => h.gate)
      expect(
        names,
        `预期由「${m.expectGate}」抓到，实际抓到：${names.join(' / ')}\n${hits
          .map((h) => `  [${h.gate}] ${h.problems.slice(0, 2).join('；')}`)
          .join('\n')}`,
      ).toContain(m.expectGate)
    })
  }
})
