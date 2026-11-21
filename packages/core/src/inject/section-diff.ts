/**
 * 段级差异（v0.2.3 批次 C RQ4，spec `v023-c-consolidation.md` FR-7，只读）。
 *
 * 把「包渲染文本」与「磁盘文本」按既有的注入标记切段对比：受管块
 * （`<!-- openvibe:pack=… begin … -->` … `<!-- openvibe:end -->`）与块外自由区。
 * **只产出报告，不改任何写入行为**：五状态判定仍按整文件 sha（planner 不动），
 * 本函数是 diff 报文的细化层——回答「这一行漂移，漂在受管块还是用户的自由区」。
 */

import { PACK_MARKER_END, PACK_MARKER_PREFIX, PACK_SECTION_MARKER_PREFIX } from '@openvibe/shared'

export interface SectionRegion {
  /**
   * 段名。v1 旧产物（无段级标记）保持两分法：`受管块` / `块外自由区`；
   * 有段级标记（D32 起）细分为：`壳头`（begin 标记 → 首个段标记，契约字节）、
   * `受管段·<节名>`（每个 `<!-- openvibe:section=… -->` 到下一标记/壳尾）、`块外自由区`。
   * 段名编进字符串而非新增字段——CLI 报文（index.ts）逐行打印 region，零形状变更。
   */
  region: string
  /** 包渲染侧行数 */
  expectedLines: number
  /** 磁盘侧行数 */
  actualLines: number
  status: 'same' | 'changed'
  /** 受管块缺失：包渲染有标记而磁盘没有（用户删了标记） */
  missing?: boolean
}

export interface SectionDiffResult {
  regions: SectionRegion[]
  /** 受管块是否有差异 */
  managedChanged: boolean
  /** 块外自由区是否有差异（自由区差异是用户的权利，报告但不建议覆盖） */
  freeChanged: boolean
}

interface Slices {
  before: string[]
  managed: string[] | null
  after: string[]
}

function slice(text: string): Slices {
  const lines = text.split('\n')
  const begin = lines.findIndex((l) => l.includes(PACK_MARKER_PREFIX))
  const end = begin >= 0 ? lines.findIndex((l, i) => i > begin && l.includes(PACK_MARKER_END)) : -1
  if (begin < 0 || end < 0) return { before: lines, managed: null, after: [] }
  return {
    before: lines.slice(0, begin),
    managed: lines.slice(begin, end + 1),
    after: lines.slice(end + 1),
  }
}

function regionOf(
  region: SectionRegion['region'],
  expectedLines: string[],
  actualLines: string[],
  missing = false,
): SectionRegion {
  const same = !missing && expectedLines.join('\n') === actualLines.join('\n')
  return {
    region,
    expectedLines: expectedLines.length,
    actualLines: actualLines.length,
    status: same ? 'same' : 'changed',
    ...(missing ? { missing } : {}),
  }
}

/**
 * 段级对比。任何一侧缺标记（磁盘文件被用户去壳）⇒ 受管块记 `missing`，
 * 全部行按块外自由区对待——报告如实，处置建议永远倒向保留本地。
 */
export function diffSections(expected: string, actual: string): SectionDiffResult {
  const e = slice(expected)
  const a = slice(actual)
  const regions: SectionRegion[] = []

  if (e.managed === null) {
    // 包渲染侧没有标记（不该发生，composer 恒写标记）——退化为整文件一段
    regions.push(regionOf('块外自由区', e.before, a.before))
    return {
      regions,
      managedChanged: false,
      freeChanged: regions.some((r) => r.status === 'changed'),
    }
  }

  if (a.managed === null) {
    regions.push(regionOf('受管块', e.managed, [], true))
    const free = [...a.before, ...a.after]
    regions.push(regionOf('块外自由区', [...e.before, ...e.after], free, false))
    return {
      regions,
      managedChanged: true,
      freeChanged: free.join('\n') !== [...e.before, ...e.after].join('\n'),
    }
  }

  regions.push(regionOf('块外自由区', [...e.before, ...e.after], [...a.before, ...a.after]))
  // D32（decisions ㊾）：壳内按段级标记细分。两侧段数一致（同一契约渲染）才逐段对齐；
  // 段数不一致（旧混新等异常态）退回整块一段，如实报告而非硬切错位。
  const eSecs = sliceSections(e.managed)
  const aSecs = sliceSections(a.managed)
  if (eSecs.length === aSecs.length && eSecs.length > 1) {
    for (const [i, es] of eSecs.entries()) {
      const as = aSecs[i]
      if (!as) continue
      regions.push(regionOf(es.name, es.lines, as.lines))
    }
  } else {
    regions.push(regionOf('受管块', e.managed, a.managed))
  }
  return {
    regions,
    managedChanged: regions.some((r) => r.region !== '块外自由区' && r.status === 'changed'),
    freeChanged: regions.some((r) => r.region === '块外自由区' && r.status === 'changed'),
  }
}

/**
 * 把受管块的行数组按段级标记切为若干段。首段是「壳头」（begin 标记行 → 首个段标记之前，
 * 含标题与引用块——契约字节，§7.3）；此后每个 `<!-- openvibe:section=… -->` 开启一段，
 * 段名取标记里的节名。无任何段标记 ⇒ 单段 `受管块`（v1 旧产物，行为与 D32 之前逐字节一致）。
 */
function sliceSections(lines: string[]): { name: string; lines: string[] }[] {
  const firstIdx = lines.findIndex((l) => l.includes(PACK_SECTION_MARKER_PREFIX))
  if (firstIdx < 0) return [{ name: '受管块', lines }]
  const out: { name: string; lines: string[] }[] = [
    { name: '壳头', lines: lines.slice(0, firstIdx) },
  ]
  for (let i = firstIdx; i < lines.length; i++) {
    const line = lines[i]
    // ⚠️ 只跳过越界的 undefined，**不得用 if (!line)**——空串是 falsy，会把受管段内的
    // 空行整行吞掉，段级明细就对「删空行」漂移失明（reviewer B 探针实证，DEV-0282）。
    if (line === undefined) continue
    const tail = out[out.length - 1]
    if (!tail) continue
    // 从 firstIdx 起每遇到段标记即开新段（首个段标记也在其列——它不属于壳头）
    if (line.includes(PACK_SECTION_MARKER_PREFIX)) {
      out.push({ name: `受管段·${sectionName(line)}`, lines: [line] })
    } else {
      tail.lines.push(line)
    }
  }
  return out
}

function sectionName(markerLine: string): string {
  const rest = markerLine.slice(
    markerLine.indexOf(PACK_SECTION_MARKER_PREFIX) + PACK_SECTION_MARKER_PREFIX.length,
  )
  const end = rest.indexOf('-->')
  return (end >= 0 ? rest.slice(0, end) : rest).trim() || '未名段'
}
