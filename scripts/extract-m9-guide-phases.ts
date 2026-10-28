/**
 * extract-m9-guide-phases —— 从附件《Python 与 Go 系统学习指南》抽 **21 段分期路线**
 * （`m9-dev-plan-2026-10.md` §6.5 的 P1d.1 ＋ spec §3.17.1 · **DL-49**）
 *
 * ## 抽什么
 *
 * 附件的时间线在 `tl-block` 里：两种语言 × 三种模式 = 6 块，共 21 段。
 * 每段取六样：附件逐字标签、阶段名、耗时、要点列表、产出栏、语言与模式。
 *
 * ## ⚠️ 产出栏的三个前缀不许剥
 *
 * 「产出」是可交付物，「练习」是动作要求，而「跳过」是**本段明确不学什么**。
 * 剥掉前缀，界面就会把「本段不学并发」显示成「本段产出并发模式」。
 * ⇒ 整串逐字入库，一个前缀都不许动（DL-49 断的就是这个）。
 *
 * ## 用法
 *
 * ```
 * npx tsx scripts/extract-m9-guide-phases.ts <附件路径>          # 写入种子
 * npx tsx scripts/extract-m9-guide-phases.ts <附件路径> --check  # 只对账，不写
 * ```
 *
 * ⚠️ **附件路径走命令行参数，不落仓**（零本机路径）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseSpecPhaseRows,
  tallyOutcomePrefixes,
  type SpecPhaseRow,
} from '../packages/core/src/tooling/m9-p1d-spec'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEED_PATH = join(REPO_ROOT, 'packages/core/src/db/seeds/lang_profile_phases.json')
const SPEC_PATH = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')

/** 解 HTML 实体（附件里只有这几种）。 */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 去掉标签，保留文字（`<b>产出：</b>` ⇒ `产出：`）。 */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

interface RawPhase {
  profile: 'master' | 'familiar' | 'vibe'
  lang: 'python' | 'go'
  ord: number
  label: string
  title: string
  duration: string
  points: string[]
  outcome: string | null
}

/** 从 `tl-block` 的 class 读模式。 */
function profileOf(blockClass: string): RawPhase['profile'] | null {
  if (blockClass.includes('sh-master')) return 'master'
  if (blockClass.includes('sh-familiar')) return 'familiar'
  if (blockClass.includes('sh-vibe')) return 'vibe'
  return null
}

/** 抽 21 段。 */
function extractPhases(html: string): RawPhase[] {
  const blockStarts: { index: number; profile: RawPhase['profile'] }[] = []
  const blockRe = /<div class="tl-block ([^"]*)">/g
  for (const m of html.matchAll(blockRe)) {
    const profile = profileOf(m[1] ?? '')
    if (profile !== null) blockStarts.push({ index: m.index, profile })
  }
  // ⚠️ **速成块的语言要靠继承** —— 它的 `tl-dot` 没有 py/go 类（两门速成共用一个紫点），
  //   所以「按点认语言」认不出来 ⇒ 取**上一块**（精通/熟悉块）的语言。
  //   实测块序：Python 精通 → Python 熟悉 → Python 速成 → Go 精通 → Go 熟悉 → Go 速成。
  const blockLang: (RawPhase['lang'] | null)[] = []
  let carried: RawPhase['lang'] | null = null
  for (let b = 0; b < blockStarts.length; b += 1) {
    const start = blockStarts[b]!.index
    const end = b + 1 < blockStarts.length ? blockStarts[b + 1]!.index : html.length
    const block = html.slice(start, end)
    const dot = /tl-dot (py|go)/.exec(block)
    const own = dot === null ? null : dot[1] === 'py' ? 'python' : 'go'
    if (own !== null) carried = own
    blockLang.push(own ?? carried)
  }
  const phases: RawPhase[] = []
  for (let b = 0; b < blockStarts.length; b += 1) {
    // ⚠️ `?? null` 是为了把「越界」也归到 null 一支 ——
    //   `blockLang[b]` 在越界时是 `undefined`，而 `if (lang === null)` 收不掉 `undefined`。
    const lang = blockLang[b] ?? null
    if (lang === null) continue
    const start = blockStarts[b]!.index
    const end = b + 1 < blockStarts.length ? blockStarts[b + 1]!.index : html.length
    const block = html.slice(start, end)
    const itemRe = /<div class="tl-item">/g
    const itemStarts: number[] = []
    for (const m of block.matchAll(itemRe)) itemStarts.push(m.index)
    for (let i = 0; i < itemStarts.length; i += 1) {
      const s = itemStarts[i]!
      const e = i + 1 < itemStarts.length ? itemStarts[i + 1]! : block.length
      const item = block.slice(s, e)
      const label = /<div class="tl-time-d">([\s\S]*?)<\/div>/.exec(item)
      const name = /<span class="ph-name">([\s\S]*?)<\/span>/.exec(item)
      const weeks = /<span class="ph-weeks">([\s\S]*?)<\/span>/.exec(item)
      const ul = /<ul>([\s\S]*?)<\/ul>/.exec(item)
      const out = /<div class="out">([\s\S]*?)<\/div>\s*<\/div>/.exec(item)
      const points: string[] = []
      if (ul !== null) {
        for (const li of ul[1]!.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
          const text = stripTags(li[1] ?? '')
          if (text !== '') points.push(text)
        }
      }
      phases.push({
        profile: blockStarts[b]!.profile,
        lang,
        ord: 0,
        label: label === null ? '' : stripTags(label[1] ?? ''),
        title: name === null ? '' : stripTags(name[1] ?? ''),
        duration: weeks === null ? '' : stripTags(weeks[1] ?? ''),
        points,
        outcome: out === null ? null : stripTags(out[1] ?? ''),
      })
    }
  }
  // 段序：同一 (profile, lang) 内按出现顺序编号
  const counters = new Map<string, number>()
  for (const p of phases) {
    const key = `${p.profile}:${p.lang}`
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    p.ord = next
  }
  return phases
}

/** 与 spec §3.17.1 的 21 行逐格对账。 */
function compareWithSpec(phases: readonly RawPhase[], specRows: readonly SpecPhaseRow[]): string[] {
  const problems: string[] = []
  if (specRows.length !== phases.length) {
    problems.push(`spec 有 ${String(specRows.length)} 行，抽到 ${String(phases.length)} 段`)
    return problems
  }
  // spec 的行序 = 附件的块序（Python 三块 → Go 三块），逐行按 (lang, profile, ord) 配对
  const key = (l: string, p: string, o: number): string => `${l}:${p}:${String(o)}`
  const byKey = new Map<string, RawPhase>()
  for (const p of phases) byKey.set(key(p.lang, p.profile, p.ord), p)
  for (const row of specRows) {
    const got = byKey.get(key(row.lang, row.profile, row.ord))
    if (got === undefined) {
      problems.push(
        `spec 第 ${String(row.index)} 行（${row.lang}/${row.profile}/${String(row.ord)}）在附件里找不到`,
      )
      continue
    }
    if (got.label !== row.label) {
      problems.push(
        `第 ${String(row.index)} 行标签不同：附件「${got.label}」 vs spec「${row.label}」`,
      )
    }
    if (got.title !== row.title) {
      problems.push(
        `第 ${String(row.index)} 行阶段名不同：附件「${got.title}」 vs spec「${row.title}」`,
      )
    }
    if (got.duration !== row.duration) {
      problems.push(
        `第 ${String(row.index)} 行耗时不同：附件「${got.duration}」 vs spec「${row.duration}」`,
      )
    }
    if (got.outcome !== row.outcome) {
      problems.push(
        `第 ${String(row.index)} 行产出栏不同：附件「${got.outcome ?? '(空)'}」 vs spec「${row.outcome ?? '(空)'}」`,
      )
    }
  }
  return problems
}

function main(): void {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const attachment = args.find((a) => !a.startsWith('--'))
  if (attachment === undefined) {
    console.error('用法: extract-m9-guide-phases <附件路径> [--check]')
    process.exit(2)
  }
  const html = readFileSync(attachment, 'utf8')
  const phases = extractPhases(html)
  const specRows = parseSpecPhaseRows(readFileSync(SPEC_PATH, 'utf8'))

  const problems: string[] = []
  // ── 自检 ①：21 段 ──
  if (phases.length !== 21) problems.push(`抽到 ${String(phases.length)} 段，spec 写 21 段`)
  // ── 自检 ②：每语言每模式的段数 ──
  const expected: Record<string, number> = {
    'python:master': 5,
    'python:familiar': 3,
    'python:vibe': 3,
    'go:master': 4,
    'go:familiar': 3,
    'go:vibe': 3,
  }
  for (const [k, want] of Object.entries(expected)) {
    const got = phases.filter((p) => `${p.lang}:${p.profile}` === k).length
    if (got !== want) problems.push(`${k} 实测 ${String(got)} 段，spec 写 ${String(want)} 段`)
  }
  // ── 自检 ③：产出栏前缀分布（产出 10 · 练习 2 · 跳过 2 · 空 7）──
  const specTally = tallyOutcomePrefixes(specRows)
  if (specTally.产出 !== 10 || specTally.练习 !== 2 || specTally.跳过 !== 2 || specTally.空 !== 7) {
    problems.push(
      `spec 侧产出栏分布是 产出 ${String(specTally.产出)} · 练习 ${String(specTally.练习)} · 跳过 ${String(specTally.跳过)} · 空 ${String(specTally.空)}，与 10/2/2/7 不符`,
    )
  }
  const gotTally = { 产出: 0, 练习: 0, 跳过: 0, 空: 0 }
  for (const p of phases) {
    if (p.outcome === null) {
      gotTally.空 += 1
      continue
    }
    const prefix = p.outcome.split('：')[0]
    if (prefix === '产出' || prefix === '练习' || prefix === '跳过') gotTally[prefix] += 1
  }
  if (
    gotTally.产出 !== specTally.产出 ||
    gotTally.练习 !== specTally.练习 ||
    gotTally.跳过 !== specTally.跳过 ||
    gotTally.空 !== specTally.空
  ) {
    problems.push(
      `附件侧产出栏分布 产出 ${String(gotTally.产出)} · 练习 ${String(gotTally.练习)} · 跳过 ${String(gotTally.跳过)} · 空 ${String(gotTally.空)}，与 spec 侧不一致`,
    )
  }
  // ── 自检 ④：逐格等于 spec §3.17.1 ──
  problems.push(...compareWithSpec(phases, specRows))
  // ── 自检 ⑤：每段至少两条要点 ──
  for (const p of phases) {
    if (p.points.length < 2) {
      problems.push(
        `${p.lang}/${p.profile}/${String(p.ord)} 只有 ${String(p.points.length)} 条要点`,
      )
    }
  }

  if (problems.length > 0) {
    console.error('[extract-m9-guide-phases] 自检未过：')
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }

  const items = phases.map((p) => ({
    profile: p.profile,
    lang: p.lang,
    ord: p.ord,
    label: p.label,
    title: p.title,
    duration_label: p.duration,
    points: p.points,
    outcome: p.outcome,
  }))
  const payload = {
    _notes: {
      source: '附件《Python 与 Go 系统学习指南》的 tl-block 时间线（6 块 × 21 段）',
      collect_method:
        '按 tl-block 的 class 读模式（sh-master / sh-familiar / sh-vibe）、按 tl-dot 读语言（py / go），' +
        '逐段取 tl-time-d（标签）、ph-name（阶段名）、ph-weeks（耗时）、ul li（要点）、out（产出栏）。',
      outcome_prefixes:
        '产出 10 · 练习 2 · 跳过 2 · 空 7 —— **前缀逐字保留，一个都不许剥**（DL-49）。',
      empty_outcome:
        '7 段在附件里就没有产出栏（Python 精通第 5 段 ＋ 两门各 3 段速成）⇒ `outcome` 显式写 null，界面整行不渲染。',
      points_note:
        '每段 2–3 条要点，是附件 `ul li` 的逐字内容（§3.2：要点可入库，长文正文不入库）。',
    },
    collected_at: '2026-10-20',
    schemaVersion: 1,
    items,
  }
  const text = `${JSON.stringify(payload, null, 2)}\n`
  if (check) {
    const current = readFileSync(SEED_PATH, 'utf8')
    if (current !== text) {
      console.error('[extract-m9-guide-phases] 仓内种子与附件重抽的结果不一致')
      process.exit(1)
    }
    console.log('[extract-m9-guide-phases] 仓内种子与附件逐格一致（21 段）')
    return
  }
  writeFileSync(SEED_PATH, text)
  console.log(`[extract-m9-guide-phases] 已写 ${SEED_PATH}（${String(items.length)} 段）`)
}

main()
