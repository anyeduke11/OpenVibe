/**
 * `packages/core/src/source-scan/scan.ts` —— **P4 的扫描编排**
 * （`m9-dev-language-roadmap.md` §3.8 / §3.8.2 / §3.10 · dev-plan §6.10 P4.1 / P4.2）
 *
 * ## 它做什么
 *
 * 把两门语言的两条路径编排成**一次扫描**：
 *
 * ```
 * 项目根 ──┬─ .py 文件 ──► python3 + ast ──────► confirmed（已确认）
 *          └─ .go 文件 ──► go/parser ──────────► confirmed（已确认）
 *                       └─（没 Go 工具链）► 正则 ─► possible（可能）
 * ```
 *
 * ## ⚠️ 三条不可越的线（§3.8）
 *
 * 1. **片段不出仓** —— 本文件**只产出命中位置与模式串**，**不产出源码正文**。
 *    源码正文只在 T1（用户勾选后）由 `m9-payload.ts` 装进出参。
 * 2. **路径不出网** —— 本文件产出的路径**一律相对项目根**（DL-23）。
 * 3. **T0 不依赖 AI** —— 本文件**不引用任何 AI 客户端**（DL-17）；
 *    「AI 不可用时 T0 照常工作」是**结构上的**（没有依赖可失败）。
 */
import {
  patternsForLang,
  type LangCode,
  type LangScanStatus,
  type ScanConfidence,
  type ScannerMode,
  type SourceFinding,
  type SourcePattern,
  type SourceScanResult,
} from '@openvibe/shared'
import { DEFAULT_MAX_FILES, listSourceFiles } from './files'
import { detectGoToolchain, scanGoHeuristic, scanGoParser } from './go-scanner'
import { parseNodeSpec, scanPython, SourceScanError } from './python-scanner'
import { resolvePatternText } from './pattern-text'

/** 扫描入参。 */
export interface ScanProjectOptions {
  /** 项目 id（进结果与落库） */
  projectId: string
  /** 项目根（**绝对路径**） */
  root: string
  /** Python 可执行文件（默认 `python3`） */
  pythonBin?: string
  /** Go 可执行文件（默认 `go`） */
  goBin?: string
  /** 文件数上限（默认 20000） */
  maxFiles?: number
  /** 扫描 id（默认取当前毫秒数） */
  scanId?: number
}

/** 一次命中的原始形态（两条路径共用）。 */
interface RawHit {
  spec_id: string
  file: string
  line: number
  col: number
  text: string
  line_text: string
}

/** 把原始命中变成对外的 `SourceFinding`（**模式串在这里定型**）。 */
function toFindings(
  hits: readonly RawHit[],
  patterns: readonly SourcePattern[],
  mode: ScannerMode,
): SourceFinding[] {
  const byId = new Map(patterns.map((p) => [p.id, p]))
  const out: SourceFinding[] = []
  for (const h of hits) {
    const pattern = byId.get(h.spec_id)
    if (pattern === undefined) continue
    out.push({
      pattern_id: pattern.id,
      pattern_name: pattern.pattern_name,
      topic_slug: pattern.topic_slug,
      file_rel_path: h.file,
      line: h.line,
      col: h.col,
      // ⚠️ **落库的必须是可 grep 的字面串**（DL-22）⇒ 在这里定型，不在别处
      matched_pattern: resolvePatternText(h.text, h.line_text, pattern.pattern_name),
      confidence: mode === 'parser' ? 'confirmed' : 'possible',
      scanner_mode: mode,
    })
  }
  return out
}

/** 排序（**排序在 JS 里做**；复合主键表不许 ORDER BY 的同款纪律）。 */
function sortFindings(findings: readonly SourceFinding[]): SourceFinding[] {
  return [...findings].sort(
    (a, b) =>
      a.file_rel_path.localeCompare(b.file_rel_path) ||
      a.line - b.line ||
      a.col - b.col ||
      a.pattern_id.localeCompare(b.pattern_id),
  )
}

/**
 * 扫一个项目。
 *
 * @param opts 入参
 */
export async function scanProjectSource(opts: ScanProjectOptions): Promise<SourceScanResult> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES
  const scanId = opts.scanId ?? Date.now()
  const warnings: string[] = []
  const languages: LangScanStatus[] = []
  let findings: SourceFinding[] = []

  // ───────────────────────── Python（`ast`，零回退）─────────────────────────
  const pyPatterns = patternsForLang('python')
  const pyListing = listSourceFiles(opts.root, '.py', maxFiles)
  if (pyListing.truncated) {
    warnings.push(`Python 文件数超过上限 ${String(maxFiles)}，本次只扫了前一批。`)
  }
  const pySpecs = pyPatterns.map((p) => {
    const { kind, cond } = parseNodeSpec(p.node_spec)
    return { id: p.id, kind, cond }
  })
  try {
    const out = await scanPython(opts.root, pyListing.files, pySpecs, opts.pythonBin ?? 'python3')
    const hits = out.hits as RawHit[]
    const pyFindings = toFindings(hits, pyPatterns, 'parser')
    findings = findings.concat(pyFindings)
    languages.push({
      lang: 'python',
      mode: 'parser',
      toolchain: `Python ${out.version}`,
      file_count: out.file_count,
      hit_count: pyFindings.length,
      notice: null,
    })
  } catch (err) {
    // ⚠️ **Python 没有合法的回退路径**（§3.8 只给 Go 定义了）⇒ 显式失败，不静默少扫
    const reason = err instanceof SourceScanError ? err.reason : 'python-failed'
    const notice =
      reason === 'python-not-found'
        ? '未找到 python3 —— Python 侧未扫描（识别可能不全）。'
        : `Python 侧扫描失败（${reason}）—— 该侧未扫描（识别可能不全）。`
    warnings.push(notice)
    languages.push({
      lang: 'python',
      mode: null,
      toolchain: null,
      file_count: 0,
      hit_count: 0,
      notice,
    })
  }

  // ───────────────────────── Go（双路径）─────────────────────────
  const goPatterns = patternsForLang('go')
  const goListing = listSourceFiles(opts.root, '.go', maxFiles)
  if (goListing.truncated) {
    warnings.push(`Go 文件数超过上限 ${String(maxFiles)}，本次只扫了前一批。`)
  }
  const goSpecs = goPatterns.map((p) => ({ id: p.id, kind: p.node_spec }))
  const heuristicSpecs = goPatterns
    .filter((p) => p.heuristic_src !== undefined)
    .map((p) => ({ id: p.id, heuristic_src: p.heuristic_src as string }))

  const toolchain = await detectGoToolchain(opts.goBin ?? 'go')
  let goMode: ScannerMode = 'heuristic'
  let goNotice: string | null = null
  let goHits: RawHit[] = []
  let goFileCount = 0
  let goVersion: string | null = null

  if (toolchain.available) {
    try {
      const out = await scanGoParser(opts.root, goListing.files, goSpecs, opts.goBin ?? 'go')
      goHits = out.hits as RawHit[]
      goFileCount = out.file_count
      goVersion = toolchain.version
      goMode = 'parser'
    } catch (err) {
      // ⚠️ **回退必须显式告知**（§3.8.2 第 1 条：不许静默回退）
      goNotice = `Go 解析器不可用（${err instanceof Error ? err.message : String(err)}）—— 已回退到启发式模式，识别可能不全。`
      warnings.push(goNotice)
    }
  } else {
    goNotice = '未检测到 Go 工具链 —— 已回退到启发式模式，识别可能不全。'
    warnings.push(goNotice)
  }

  if (goMode === 'heuristic') {
    const out = scanGoHeuristic(opts.root, goListing.files, heuristicSpecs)
    goHits = out.hits as RawHit[]
    goFileCount = out.file_count
    goVersion = null
  }

  const goFindings = toFindings(goHits, goPatterns, goMode)
  findings = findings.concat(goFindings)
  languages.push({
    lang: 'go',
    mode: goMode,
    toolchain: goVersion,
    file_count: goFileCount,
    hit_count: goFindings.length,
    notice: goNotice,
  })

  return {
    project_id: opts.projectId,
    scan_id: scanId,
    languages,
    findings: sortFindings(findings),
    warnings,
  }
}

/** 按语言取这次扫描走了哪条路（**给界面显示用**；两档不混）。 */
export function modeOf(result: SourceScanResult, lang: LangCode): ScannerMode | null {
  return result.languages.find((l) => l.lang === lang)?.mode ?? null
}

/** 命中按可信度分档（**confirmed 在前，possible 在后**；两档不混在一个列表里）。 */
export function splitByConfidence(findings: readonly SourceFinding[]): {
  confirmed: SourceFinding[]
  possible: SourceFinding[]
} {
  const confirmed: SourceFinding[] = []
  const possible: SourceFinding[] = []
  for (const f of findings) {
    if (f.confidence === ('confirmed' satisfies ScanConfidence)) confirmed.push(f)
    else possible.push(f)
  }
  return { confirmed, possible }
}
