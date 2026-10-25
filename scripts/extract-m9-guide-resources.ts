/**
 * `scripts/extract-m9-guide-resources.ts` —— M9 v1.6 **P1b.1 · 提取学习资源层**
 * （`m9-dev-plan-2026-10.md` §6.3 P1b.1 ＋ `m9-dev-language-roadmap.md` §1.6 / §1.6.1 / §1.7）
 *
 * ## 它做什么
 *
 * 把《Python 与 Go 系统学习指南》里的资源数据抽成两份种子：
 * - `packages/core/src/db/seeds/lang_resources.json` —— 主清单 89 条
 * - `packages/core/src/db/seeds/lang_vibe_resources.json` —— 速成专区 11 条
 *
 * ## ⚠️ 数据源：owner 的附件原件（路径走命令行，**不落仓**）
 *
 * 上游是 owner 提供的附件《Python 与 Go 系统学习指南.html》。它**不在本仓**，
 * 所以路径由命令行传入 —— 仓内**不许出现本机绝对路径**（DL-32 的同款纪律）。
 *
 * 仓内的 `docs/prototypes/开发能力-可交互Demo-20261018.html` 是同一份数据的**副本**，
 * 但它**丢了两样东西**（2026-10-20 实测）：
 * ① `TIER` 映射（URL → tier，87 键）—— **必要性矩阵的入参**，丢了就没法算必要性；
 * ② 速成专区 11 条的 `l/c/s/fav/d/f` 六个字段 —— 副本里只剩名称与 URL。
 * ⇒ 所以**副本不能当上游**，附件原件才是。
 *
 * ## ⚠️ tier 是必要性矩阵的轴（这轮订正的要点）
 *
 * 附件的 `NEC_RULE` 是按 **tier**（a 最小必备 / b 核心主线 / c 补充进阶 /
 * d 高级底层 / e 过时补充 / v AI 工具）分的，**不是**按展示分类
 * （official/github/course/book/video/practice）。两套维度**不能混**：
 * 展示分类回答「这是什么形态的资源」，tier 回答「它在路线里排第几」。
 *
 * ⇒ 按 tier × 矩阵现算，三档分布与 spec §1.6.1 记的数**逐项相等**（实测）。
 *
 * ## 为什么自检的数字从 spec 读，而不是抄成常量
 *
 * 抄成常量就是「又一份事实」：改了 spec 的口径，常量不会跟着变 ⇒ 两边悄悄分叉。
 * ⇒ 本脚本**从 spec §1.6.1 的表里读出条数**再与抽出来的数据对账
 * （与 `packages/core/src/db/m9-doc-numbers.ts` 同一手法）。
 *
 * 用法：`npx tsx scripts/extract-m9-guide-resources.ts <附件路径> [--check]`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSpecResourceCounts, parseSpecNecDistribution } from '@openvibe/core/tooling'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const SEED_DIR = join(REPO_ROOT, 'packages/core/src/db/seeds')

/** 从一段 JS 源码里取出 `const NAME =` 后面的那个字面量文本（按括号配平）。 */
function literalSource(src: string, name: string): string {
  const at = src.indexOf(`const ${name}`)
  if (at === -1) throw new Error(`附件里找不到 ${name}`)
  const eq = src.indexOf('=', at)
  let start = eq + 1
  while (start < src.length && /\s/.test(src[start] as string)) start += 1
  const open = src[start]
  if (open !== '{' && open !== '[') throw new Error(`${name} 的字面量不是对象或数组`)
  const close = open === '{' ? '}' : ']'
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === open) depth += 1
    else if (src[i] === close) {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error(`${name} 的括号没配平`)
}

/**
 * 求值一个字面量。
 *
 * ⚠️ 附件是 owner 自己的文件，取出来的是**纯数据字面量**（不含可执行语句）。
 */
function evalLiteral(text: string): unknown {
  return new Function(`return (${text})`)() as unknown
}

interface RawResource {
  n?: string
  u?: string
  /** ⚠️ 附件里资源是**按分类分组**的（`cat` 不在条目里，在外层的分组键上）⇒ 抽取时补上 */
  cat?: string
  /** 抽取时补上的语言（附件按 PY_DATA / GO_DATA 分文件） */
  lang?: string
  l?: string
  c?: string
  s?: string | number
  fav?: number
  star?: string
  d?: string
  f?: string
  old?: number
}

interface RawGuide {
  official?: RawResource[]
  github?: RawResource[]
  course?: RawResource[]
  book?: RawResource[]
  video?: RawResource[]
  practice?: RawResource[]
}

function main(): void {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const attachment = args.find((a) => !a.startsWith('--'))
  if (!attachment) {
    console.error('用法：npx tsx scripts/extract-m9-guide-resources.ts <附件 html 路径> [--check]')
    console.error('⚠️ 附件路径**不落仓**（仓内不许有本机绝对路径）。')
    process.exit(2)
  }

  const raw = readFileSync(attachment, 'utf8')
  const spec = readFileSync(SPEC_FILE, 'utf8')

  const guide = evalLiteral(literalSource(raw, 'PY_DATA')) as RawGuide
  const guideGo = evalLiteral(literalSource(raw, 'GO_DATA')) as RawGuide
  const tierMap = evalLiteral(literalSource(raw, 'TIER')) as Record<string, string>
  const vibeTools = evalLiteral(literalSource(raw, 'VIBE_TOOLS')) as RawResource[]
  const vibeTuts = evalLiteral(literalSource(raw, 'VIBE_TUTS')) as RawResource[]

  const CATS = ['official', 'github', 'course', 'book', 'video', 'practice'] as const
  const pick = (g: RawGuide, lang: string, cat: string): RawResource[] =>
    (g[cat as keyof RawGuide] ?? []).map((it) => ({ ...it, cat, lang }))

  const py = CATS.flatMap((c) => pick(guide, 'python', c))
  const go = CATS.flatMap((c) => pick(guideGo, 'go', c))

  // ── 自检 ①：条数与 spec §1.6.1 逐项相等 ──
  const counts = parseSpecResourceCounts(spec)
  if (counts === null) {
    console.error('❌ 读不出 spec §1.6.1 的口径数字（文档被改到闸认不出了）')
    process.exit(1)
  }
  const problems: string[] = []
  if (py.length + go.length !== counts.main) {
    problems.push(`主清单条数 ${String(py.length + go.length)} ≠ spec 的 ${String(counts.main)}`)
  }
  if (vibeTools.length !== counts.tools) {
    problems.push(`VIBE_TOOLS 条数 ${String(vibeTools.length)} ≠ spec 的 ${String(counts.tools)}`)
  }
  if (vibeTuts.length !== counts.tuts) {
    problems.push(`VIBE_TUTS 条数 ${String(vibeTuts.length)} ≠ spec 的 ${String(counts.tuts)}`)
  }
  if (py.length + go.length + vibeTools.length + vibeTuts.length !== counts.all) {
    problems.push(
      `真实总数 ${String(py.length + go.length + vibeTools.length + vibeTuts.length)} ≠ spec 的 ${String(counts.all)}`,
    )
  }

  // ── 自检 ②：六类逐类逐格相等 ──
  for (const [cat, want] of counts.categories) {
    const gotPy = py.filter((r) => r.cat === cat).length
    const gotGo = go.filter((r) => r.cat === cat).length
    if (gotPy !== want.python || gotGo !== want.go) {
      problems.push(
        `${cat}：实测 py ${String(gotPy)} / go ${String(gotGo)}，spec 写 ${String(want.python)} / ${String(want.go)}`,
      )
    }
  }

  // ── 自检 ③：TIER 映射 —— 87 键，覆盖全部 89 条资源（两个 URL 各被两条共用）──
  const all = [...py, ...go]
  const tierKeys = Object.keys(tierMap)
  if (tierKeys.length !== counts.uniqueUrls) {
    problems.push(`TIER 键 ${String(tierKeys.length)} 个，spec 写 ${String(counts.uniqueUrls)} 个`)
  }
  const missingTier = all.filter((r) => tierMap[r.u ?? ''] === undefined)
  if (missingTier.length > 0) {
    problems.push(`TIER 里没有的 URL ${String(missingTier.length)} 条：${missingTier.map((r) => r.n).join(' / ')}`)
  }
  const urlCount = new Map<string, number>()
  for (const r of all) urlCount.set(r.u ?? '', (urlCount.get(r.u ?? '') ?? 0) + 1)
  for (const [url, n] of urlCount) {
    if (n === 2 && tierMap[url] === undefined) problems.push(`共用的 ${url} 不在 TIER 里`)
  }

  // ── 自检 ④：star / fav / old 的条数（§1.6.1 的实测数字）──
  const starCount = all.filter((r) => typeof r.star === 'string' && r.star !== '').length
  if (starCount !== counts.star) {
    problems.push(`star 非空 ${String(starCount)} 条，spec 写 ${String(counts.star)} 条`)
  }
  const favCount = all.filter((r) => r.fav === 1).length
  if (favCount !== counts.fav) {
    problems.push(`fav ${String(favCount)} 条，spec 写 ${String(counts.fav)} 条`)
  }
  const oldMarked = all.filter((r) => r.old === 1)
  if (oldMarked.length !== counts.old) {
    problems.push(`old 标记 ${String(oldMarked.length)} 条，spec 写 ${String(counts.old)} 条`)
  }

  // ── 自检 ⑤：矩阵 × tier 分布 == spec 记的三档分布（DL-48 的三方相等）──
  const nec = parseSpecNecDistribution(spec)
  if (nec === null) {
    problems.push('读不出 spec §1.6.1 的 NEC_RULE 矩阵或三档分布')
  } else {
    const tierDist: Record<string, number> = {}
    for (const r of all) {
      const t = tierMap[r.u ?? ''] ?? ''
      tierDist[t] = (tierDist[t] ?? 0) + 1
    }
    for (const profile of ['master', 'familiar', 'vibe'] as const) {
      const got = { required: 0, recommended: 0, optional: 0 }
      for (const [t, n] of Object.entries(tierDist)) {
        const v = nec.rule[profile][t as keyof (typeof nec.rule)[typeof profile]]
        if (!v) {
          problems.push(`矩阵缺格子「${profile} × ${t}」`)
          continue
        }
        got[v] += n
      }
      const want = nec.distribution[profile]
      if (got.required !== want.required || got.recommended !== want.recommended || got.optional !== want.optional) {
        problems.push(
          `${profile} 档：矩阵 × tier 现算 ${String(got.required)}/${String(got.recommended)}/${String(got.optional)}，` +
            `spec 记 ${String(want.required)}/${String(want.recommended)}/${String(want.optional)}`,
        )
      }
    }
  }

  if (problems.length > 0) {
    console.error('❌ 抽取结果与 spec §1.6.1 对不上：')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }

  // ── 组装两份种子 ──
  const items = [
    ...py.map((r) => toItem(r, tierMap[r.u ?? ''] ?? '')),
    ...go.map((r) => toItem(r, tierMap[r.u ?? ''] ?? '')),
  ]
  const resourcesSeed = {
    schemaVersion: 1,
    collected_at: '2026-10-20',
    _notes: {
      provenance:
        '数据源：owner 提供的附件《Python 与 Go 系统学习指南》原件（路径走命令行，不落仓）。' +
        '⚠️ **附件原件不在本仓** ⇒ 本种子只能由该附件重建；仓内的 demo 原型是同一份数据的**副本**。',
      demo_copy_diff:
        '⚠️ **仓内 demo 副本丢了两样东西**（2026-10-20 实测）：' +
        '① `TIER` 映射（URL → tier，87 键）—— 必要性矩阵的入参；' +
        '② 速成专区 11 条的 `l/c/s/fav/d/f` 六个字段 —— 副本里只剩名称与 URL。' +
        '⇒ 副本不能当上游。副本与附件的**逐条字段实测零差异**（89 条全等）。',
      tier_axis:
        '⚠️ **必要性矩阵的轴是 `tier`，不是展示分类**：' +
        'tier ∈ {a 最小必备 · b 核心主线 · c 补充进阶 · d 高级底层 · e 过时补充}，' +
        'v AI 工具 是速成专区那 11 条的隐含档位。' +
        '展示分类（official/github/course/book/video/practice）回答「资源是什么形态」，' +
        'tier 回答「它在路线里排第几」—— **两套维度不能混**（本轮实测纠正过一次）。',
      tier_lookup:
        'tier 由附件的 `TIER` 映射按 **URL** 落（87 键）⇒ 两个共用 URL 的资源拿同一个 tier。',
      verified_by:
        "全部为 'owner_guide'：§1.6 第 1 点 —— 附件自述链接于 2026-10-18 逐条检索核实，" +
        '**核实主体是 owner 不是本模块** ⇒ `source_checked_at` 恒 NULL（没核过就不能写日期，DL-01 的资源侧语义）。',
      old_marked: oldMarked.map((r) => r.n ?? ''),
      old_note:
        '附件的 `old`（内容偏旧）实测 10 条，**§3.1 的列闭集里没有对应列** ⇒ 本表不落库；' +
        '它的信息已由 `freshness`（时效说明）文案承载（实测那 10 条的文案都自陈了偏旧）。',
      necessary_rule:
        '必要性**不在本文件里** —— 那是「三模式 × 六档 tier」矩阵现算的（DL-48：不得逐条手写）。',
    },
    items,
  }

  const vibeSeed = {
    schemaVersion: 1,
    collected_at: '2026-10-20',
    _notes: {
      provenance:
        '速成专区两组：VIBE_TOOLS 6 条 ＋ VIBE_TUTS 5 条（§1.7）。' +
        '⚠️ 同 lang_resources：**附件原件不在本仓**，路径走命令行。',
      tier_axis:
        '⚠️ 这 11 条的 tier 恒为 **v（AI 工具）** —— 附件里它们不在 `TIER` 映射里（那 87 键是主清单的）。' +
        '⇒ 矩阵的 v 列对它们生效：速成必学、精通与熟悉推荐。',
      no_dimensions:
        '⚠️ **刻意不带** 分类 / 费用 / 阶段 / 精选 —— 附件里这 11 条**没有分类**，' +
        '而费用/阶段/精选是**按 DL-41 刻意不落库**（附件有这四个维度，但速成专区是平铺列表，' +
        '筛选器对这张表不适用）。⚠️ 附件里另有 `d` 描述与 `f` 时效，**这两项落了**（表里有对应列）。',
      verified_by: "同主表：全部 'owner_guide'，`source_checked_at` 恒 NULL。",
    },
    items: [
      ...vibeTools.map((r) => toVibeItem(r, 'tools')),
      ...vibeTuts.map((r) => toVibeItem(r, 'tuts')),
    ],
  }

  const targets = [
    { file: join(SEED_DIR, 'lang_resources.json'), content: resourcesSeed },
    { file: join(SEED_DIR, 'lang_vibe_resources.json'), content: vibeSeed },
  ]
  for (const t of targets) {
    const text = `${JSON.stringify(t.content, null, 2)}\n`
    if (check) {
      const current = readFileSync(t.file, 'utf8')
      if (current !== text) {
        console.error(`❌ ${t.file} 与抽取结果不一致（先跑一次不带 --check 的）`)
        process.exit(1)
      }
      console.log(`  ✓ ${t.file.split('/').pop()} 一致`)
    } else {
      writeFileSync(t.file, text)
      console.log(`  ✓ 已写 ${t.file.split('/').pop()}`)
    }
  }
  console.log(
    `判定：${String(items.length)} 条主清单 ＋ ${String(vibeSeed.items.length)} 条速成专区 · ` +
      `与 spec §1.6.1 逐项一致（退出码 0）`,
  )
}

function toItem(r: RawResource, tier: string): Record<string, unknown> {
  return {
    lang: r.lang ?? '',
    name: r.n ?? '',
    url: r.u ?? '',
    category: r.cat ?? '',
    tier,
    level_label: String(r.s ?? ''),
    price: r.c ?? '',
    lang_label: r.l ?? '',
    is_fav: r.fav === 1 ? 1 : 0,
    star: typeof r.star === 'string' && r.star !== '' ? r.star : null,
    summary: r.d ?? '',
    freshness: r.f ?? '',
    phase_id: null,
    verified_by: 'owner_guide',
    source_checked_at: null,
  }
}

function toVibeItem(r: RawResource, group: string): Record<string, unknown> {
  return {
    group,
    name: r.n ?? '',
    url: r.u ?? '',
    summary: r.d ?? '',
    freshness: r.f ?? '',
    verified_by: 'owner_guide',
    source_checked_at: null,
  }
}

main()
