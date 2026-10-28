/**
 * `packages/core/src/db/m9-p1f-spec.ts` —— M9 v1.6 **P1f · spec §1.7 第 ② 条口径读取器**
 * （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §1.7 / §3.21 · **DL-40**）
 *
 * ## 它解决什么
 *
 * §1.7 第 ② 条那张表是 `lang_stage_tracks` 种子的**人类可读对照面**（DL-40）：
 * 阶段、周期、每门语言的轨道模式词，八格。
 * ⇒ 谁来读这八格，必须**只有一处**：
 * - `scripts/extract-m9-stage-tracks.ts` —— 从配套方案抽取时**自检**：对不上即中止；
 * - `packages/core/src/db/m9-p1f-*.test.ts` —— 单测**对账**：文档 ↔ 实跑。
 *
 * ⚠️ **两处各写一份解析是最坏的做法** —— 解析写错了，两边会**错得一模一样**，
 *   于是「文档 ↔ 实跑」这条闸变成同义反复，自己证自己（同 `m9-p1d-spec.ts` 的手法）。
 *
 * ## ⚠️ 归一化规则必须写死（因为源文档与 §1.7 的表**不是逐字相同**）
 *
 * 源文档（`Agent评测专家成才方案.html`）里是**完整句**：
 * 阶段名「阶段 0 · 基础与入场」、周期「第 1–3 个月 · 看懂舞台，拿到入场券」、
 * 轨道名「了解 · 速成（Vibe Coding）」。
 * §1.7 的表里是**摘要**：阶段名去掉「阶段 」前缀、周期只留月份区间、
 * 轨道名取粗体部分（模式词）。
 * ⇒ 两侧各走一遍**同一个**归一化函数再比：
 * - `normalizeStageName` —— 去掉「阶段」与所有空白；
 * - `normalizePeriod` —— 取第一个「·」之前的部分、去空白、「个月」→「月」；
 * - `normalizeModeWord` —— 去所有空白。
 */

/** §1.7 第 ② 条那张表的一格（一格 = 一个「阶段 × 语言」）。 */
export interface SpecTrackCell {
  /** 阶段序号（0–3） */
  stageId: number
  /** 阶段名（已归一化） */
  stageName: string
  /** 周期（已归一化） */
  period: string
  lang: 'python' | 'go'
  /** 轨道模式词（已归一化）；「无轨道」⇒ `null` */
  modeWord: string | null
}

/** §1.7 那张表里「本阶段没有该语言的轨道」的标记。 */
const NO_TRACK_MARK = '无轨道'

/**
 * 去掉粗体标记、「阶段」与所有空白。
 *
 * ⚠️ 粗体标记必须去掉：§1.7 的阶段格是 `**0 · 基础与入场**`，源文档是「阶段 0 · 基础与入场」。
 */
export function normalizeStageName(value: string): string {
  return value.replace(/\*\*/g, '').replace(/阶段/g, '').replace(/\s+/g, '')
}

/**
 * 取第一个「·」之前的部分、去空白、「个月」→「月」。
 *
 * ⚠️ 「个月」→「月」是必须的：源文档写「第 1–3 个月」，§1.7 写「第 1–3 月」。
 */
export function normalizePeriod(value: string): string {
  const head = value.split('·')[0] ?? value
  return head.replace(/\s+/g, '').replace(/个月/g, '月')
}

/** 去所有空白（模式词里有两个「·」与一个「→」，空白形态在两侧不一致）。 */
export function normalizeModeWord(value: string): string {
  return value.replace(/\s+/g, '')
}

/** 取 §1.7 的正文（从该小节标题到下一个同级标题为止）。 */
export function specSection17(specText: string): string | null {
  const start = specText.indexOf('### 1.7 ')
  if (start === -1) return null
  const rest = specText.slice(start)
  const next = rest.indexOf('\n### ', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

/** 取一个单元格里的粗体部分（`**速成**（…）` ⇒ `速成`）。 */
function boldPart(cell: string): string | null {
  const m = /\*\*(.+?)\*\*/.exec(cell)
  return m === null ? null : m[1]!.trim()
}

/**
 * 解析 §1.7 第 ② 条那张表 ⇒ **八格**。
 *
 * ⚠️ 八格 = 4 阶段 × 2 语言；阶段 0/1 的 Go 格是「无轨道」⇒ `modeWord === null`。
 *   **格子数 ≠ 落库行数**（落库 6 行）—— 判据 DL-40 的反证腿断的就是这个差别。
 */
export function parseSpecTrackCells(specText: string): SpecTrackCell[] {
  const section = specSection17(specText)
  if (section === null) return []
  const out: SpecTrackCell[] = []

  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.split('|').map((c) => c.trim())
    // 表头与分隔行不算数据行
    if (cells.length < 5) continue
    const stageCell = cells[1] ?? ''
    const periodCell = cells[2] ?? ''
    const stageMatch = /^(\d+)\s*·/.exec(stageCell.replace(/\*\*/g, '').trim())
    if (stageMatch === null) continue
    const stageId = Number(stageMatch[1])

    const pythonCell = cells[3] ?? ''
    const goCell = cells[4] ?? ''
    for (const [lang, cell] of [
      ['python', pythonCell],
      ['go', goCell],
    ] as const) {
      const bold = boldPart(cell)
      const modeWord =
        bold === null || bold.includes(NO_TRACK_MARK) ? null : normalizeModeWord(bold)
      out.push({
        stageId,
        stageName: normalizeStageName(stageCell),
        period: normalizePeriod(periodCell),
        lang,
        modeWord,
      })
    }
  }
  return out
}
