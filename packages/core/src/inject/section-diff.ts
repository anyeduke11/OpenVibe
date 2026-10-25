/**
 * 段级差异（v0.2.3 批次 C RQ4，spec `v023-c-consolidation.md` FR-7，只读）。
 *
 * 把「包渲染文本」与「磁盘文本」按既有的注入标记切段对比：受管块
 * （`<!-- openvibe:pack=… begin … -->` … `<!-- openvibe:end -->`）与块外自由区。
 * **只产出报告，不改任何写入行为**：五状态判定仍按整文件 sha（planner 不动），
 * 本函数是 diff 报文的细化层——回答「这一行漂移，漂在受管块还是用户的自由区」。
 */

const BEGIN_PREFIX = '<!-- openvibe:pack='
const END_MARKER = '<!-- openvibe:end -->'

export interface SectionRegion {
  /** 段名：受管块 / 块外自由区 */
  region: '受管块' | '块外自由区'
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
  const begin = lines.findIndex((l) => l.includes(BEGIN_PREFIX))
  const end = begin >= 0 ? lines.findIndex((l, i) => i > begin && l.includes(END_MARKER)) : -1
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
  const same =
    !missing && expectedLines.join('\n') === actualLines.join('\n')
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
    return { regions, managedChanged: true, freeChanged: free.join('\n') !== [...e.before, ...e.after].join('\n') }
  }

  regions.push(regionOf('块外自由区', [...e.before, ...e.after], [...a.before, ...a.after]))
  regions.push(regionOf('受管块', e.managed, a.managed))
  return {
    regions,
    managedChanged: regions.some((r) => r.region === '受管块' && r.status === 'changed'),
    freeChanged: regions.some((r) => r.region === '块外自由区' && r.status === 'changed'),
  }
}
