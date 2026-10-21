/**
 * extract-m9-stage-tracks —— 从配套方案《Agent 评测专家成才方案》抽 **成长阶段 × 轨道** 表
 * （`m9-dev-plan-2026-10.md` §6.7 的 P1f.1 ＋ spec §1.7 第 ② 条 · **DL-40**）
 *
 * ## 抽什么
 *
 * 配套方案 §4「成长路线：四阶段可打卡训练（含 Python/Go 编程轨道）」里每个阶段对象带
 * 一个 `tracks` 数组，每条轨道取七样：
 * 阶段序号 · 阶段名 · 周期 · 语言 · 源 `mode` · 源 `modeName` · `goals`（要点列表）。
 *
 * ## ⚠️ **八格对照面 ⇒ 落库 6 行**
 *
 * 源文档阶段 0/1 **没有 Go 轨道**（`tracks` 里只有 Python 一条）⇒ 抽出来就是 6 行。
 * ⚠️ **不许给「无轨道」补一行再标 `required=0`** —— 「这个阶段没有 Go 轨道」
 *   是**关于阶段的结论**，不是一个可选项（spec §3.21 第 2 条 · DL-40 的反证腿）。
 *
 * ## ⚠️ 源文档里阶段 2 的 Python **自相矛盾**（`mode:"mas"` vs `modeName:"熟悉 → 精通"`）
 *
 * 本脚本**只照抄**，一个字都不替它决定：两个字段都逐字入库
 * （`source_mode` 与 `mode_name`），矛盾**留在数据里**。
 * ⇒ 本模块的取值（`profile` 列）由**装载器**按 §6.3 第 8 条的兜底规则现算
 *   （阶段 2 的 Python 取「熟悉」并**带标注**），**不在抽取阶段偷偷选一个**。
 *
 * ## 用法
 *
 * ```
 * npx tsx scripts/extract-m9-stage-tracks.ts <配套方案路径>          # 写入种子
 * npx tsx scripts/extract-m9-stage-tracks.ts <配套方案路径> --check  # 只对账，不写
 * ```
 *
 * ⚠️ **配套方案路径走命令行参数，不落仓**（零本机路径）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeModeWord,
  normalizePeriod,
  normalizeStageName,
  parseSpecTrackCells,
  type SpecTrackCell,
} from '../packages/core/src/db/m9-p1f-spec'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEED_PATH = join(REPO_ROOT, 'packages/core/src/db/seeds/lang_stage_tracks.json')
const SPEC_PATH = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')

/** 一条轨道（源文档逐字）。 */
export interface RawTrack {
  stage_id: number
  stage_name: string
  period: string
  lang: 'python' | 'go'
  source_mode: 'vibe' | 'fam' | 'mas'
  mode_name: string
  goals: string[]
}

/** 阶段头（`{id:0,color:…,name:…,period:…}`）。 */
interface RawStage {
  id: number
  name: string
  period: string
}

/**
 * 取 `tracks:[ … ]` 里的内容。
 *
 * ⚠️ **必须按方括号配对计数** —— `tracks` 数组里每条轨道还嵌着 `goals` 与 `links`
 *   两个数组，取第一个 `]` 会把轨道块**截断**在 `goals` 那里。
 */
function readTracksBlock(source: string, from: number): string {
  const start = source.indexOf('tracks:[', from)
  if (start === -1) return ''
  const open = source.indexOf('[', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const c = source[i]
    if (c === '[') depth += 1
    else if (c === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return source.slice(open + 1)
}

/** 抽阶段头。 */
function readStages(source: string): RawStage[] {
  const out: RawStage[] = []
  const re = /\{id:(\d+),color:"[^"]*",name:"([^"]*)",period:"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    out.push({ id: Number(m[1]), name: m[2]!, period: m[3]! })
  }
  return out
}

/** 抽轨道。 */
function readTracks(source: string, stages: RawStage[]): RawTrack[] {
  const out: RawTrack[] = []
  for (const stage of stages) {
    const block = readTracksBlock(source, source.indexOf(`id:${stage.id},color:`))
    // ⚠️ 源文件里 `modeName:"…"` 与 `goals:[` 之间**有换行和缩进** ⇒ 必须容许空白
    // ⚠️ `goals` 的内容里没有方括号 ⇒ 取到第一个 `]` 即止（不能让它吃到 links 数组）
    const re = /\{lang:"(\w+)",mode:"(\w+)",modeName:"([^"]*)",\s*goals:\[([^\]]*)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(block)) !== null) {
      const goals: string[] = []
      const gre = /"((?:[^"\\]|\\.)*)"/g
      let g: RegExpExecArray | null
      while ((g = gre.exec(m[4]!)) !== null) goals.push(g[1]!)
      out.push({
        stage_id: stage.id,
        stage_name: stage.name,
        period: stage.period,
        lang: m[1]!.toLowerCase() as 'python' | 'go',
        source_mode: m[2] as RawTrack['source_mode'],
        mode_name: m[3]!,
        goals,
      })
    }
  }
  return out
}

/**
 * 自检：六道。
 *
 * ⚠️ **每一道都是「源文档自己的形状」** —— 不是我们的愿望。抽错了形状就该中止。
 * ⚠️ **计数口径**：六道 = 阶段数 4 · 轨道行数 6 · 阶段 0/1 无 Go ·
 *   阶段 2/3 每语言各 1 条 · 每行 `goals` ≥ 2 条 · **阶段 2 的矛盾仍在**。
 */
function selfCheck(tracks: RawTrack[]): string[] {
  const problems: string[] = []
  const stages = [...new Set(tracks.map((t) => t.stage_id))].sort((a, b) => a - b)
  if (stages.length !== 4) problems.push(`阶段数 ${stages.length} ≠ 4`)
  if (tracks.length !== 6) problems.push(`轨道行数 ${tracks.length} ≠ 6（八格对照面，阶段 0/1 无 Go 轨道）`)

  for (const stageId of [0, 1]) {
    const go = tracks.filter((t) => t.stage_id === stageId && t.lang === 'go')
    if (go.length !== 0) problems.push(`阶段 ${stageId} 有 ${go.length} 条 Go 轨道（源文档没有该轨道）`)
  }
  for (const stageId of [2, 3]) {
    for (const lang of ['python', 'go'] as const) {
      const n = tracks.filter((t) => t.stage_id === stageId && t.lang === lang).length
      if (n !== 1) problems.push(`阶段 ${stageId} 的 ${lang} 轨道数 ${n} ≠ 1`)
    }
  }
  for (const t of tracks) {
    if (t.goals.length < 2) problems.push(`阶段 ${t.stage_id}/${t.lang} 的 goals 只有 ${t.goals.length} 条`)
  }
  // ⚠️ 阶段 2 的 Python 那个矛盾**必须还在**（若源文档改了，这里会红 ⇒ 要重新裁定）
  const s2 = tracks.find((t) => t.stage_id === 2 && t.lang === 'python')
  if (s2 === undefined) problems.push('阶段 2 的 Python 轨道没抽到')
  else if (s2.source_mode !== 'mas' || !s2.mode_name.includes('熟悉 → 精通')) {
    problems.push('阶段 2 的 Python 不再是「mode:mas + modeName:熟悉 → 精通」⇒ §6.3 第 8 条的前提变了')
  }
  return problems
}

/**
 * 与 spec §1.7 第 ② 条那张表**逐格对账**。
 *
 * ⚠️ **两侧各走同一个归一化**（见 `m9-p1f-spec.ts`）—— 源文档是完整句，§1.7 是摘要。
 */
function diffAgainstSpec(tracks: RawTrack[], cells: SpecTrackCell[]): string[] {
  const problems: string[] = []
  if (cells.length !== 8) {
    problems.push(`§1.7 第 ② 条解析出 ${cells.length} 格 ≠ 8`)
    return problems
  }
  for (const cell of cells) {
    const row = tracks.find((t) => t.stage_id === cell.stageId && t.lang === cell.lang)
    if (cell.modeWord === null) {
      // 「无轨道」⇒ 源文档与库里都**不得**有这一行
      if (row !== undefined) {
        problems.push(`§1.7 说阶段 ${cell.stageId} 的 ${cell.lang} 无轨道，源文档却有这一行`)
      }
      continue
    }
    if (row === undefined) {
      problems.push(`§1.7 有阶段 ${cell.stageId} 的 ${cell.lang} 轨道，源文档没有`)
      continue
    }
    if (normalizeStageName(row.stage_name) !== cell.stageName) {
      problems.push(
        `阶段 ${cell.stageId} 名称不一致：源「${row.stage_name}」≠ spec「${cell.stageName}」`,
      )
    }
    if (normalizePeriod(row.period) !== cell.period) {
      problems.push(
        `阶段 ${cell.stageId} 周期不一致：源「${row.period}」→ ${normalizePeriod(row.period)} ≠ spec ${cell.period}`,
      )
    }
    const sourceWord = normalizeModeWord(row.mode_name.split('（')[0] ?? row.mode_name)
    if (sourceWord !== cell.modeWord) {
      problems.push(
        `阶段 ${cell.stageId}/${cell.lang} 模式词不一致：源「${sourceWord}」≠ spec「${cell.modeWord}」`,
      )
    }
  }
  return problems
}

function buildSeed(tracks: RawTrack[]): string {
  const payload = {
    _notes: {
      source:
        '配套方案《Agent 评测专家成才方案》的 §4「成长路线：四阶段可打卡训练」的 tracks 数组',
      collect_method:
        '按阶段对象读 name/period，按 tracks 数组读 lang/mode/modeName/goals；八个字段逐字入库。',
      eight_cells_six_rows:
        '八格对照面（4 阶段 × 2 语言）⇒ 落库 6 行：阶段 0/1 的 Go 在源文档里没有该轨道，不建行。',
      stage2_contradiction:
        '阶段 2 的 Python 在源文档里是 mode:mas 而 modeName:熟悉 → 精通，两个字段都照抄，矛盾留在数据里。',
      profile_derivation:
        'profile/required/is_default 三列由装载器现算（不在种子里），口径只留一处。',
    },
    collected_at: '2026-10-21',
    schemaVersion: 1,
    items: tracks,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

function main(): void {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const sourcePath = args.find((a) => !a.startsWith('--'))
  if (sourcePath === undefined) {
    console.error('用法：npx tsx scripts/extract-m9-stage-tracks.ts <配套方案路径> [--check]')
    process.exit(2)
  }

  const source = readFileSync(sourcePath, 'utf8')
  const stages = readStages(source)
  const tracks = readTracks(source, stages)
  const specCells = parseSpecTrackCells(readFileSync(SPEC_PATH, 'utf8'))

  const problems = [...selfCheck(tracks), ...diffAgainstSpec(tracks, specCells)]
  if (problems.length > 0) {
    console.error('抽取自检未过：')
    for (const p of problems) console.error(`  · ${p}`)
    process.exit(1)
  }

  console.log(`抽取通过：${tracks.length} 行（八格对照面 · 阶段 0/1 无 Go 轨道）`)
  for (const t of tracks) {
    console.log(`  · 阶段 ${t.stage_id} ${t.lang} ${t.source_mode} ${t.mode_name}`)
  }

  if (checkOnly) {
    const current = readFileSync(SEED_PATH, 'utf8')
    if (current !== buildSeed(tracks)) {
      console.error('种子与源文档不一致（--check 模式不写盘）')
      process.exit(1)
    }
    console.log('种子与源文档逐字一致')
    return
  }
  writeFileSync(SEED_PATH, buildSeed(tracks))
  console.log(`已写入 ${SEED_PATH}`)
}

main()
