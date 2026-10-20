/**
 * `packages/core/src/db/m9-p1b-spec.ts` —— M9 v1.6 **P1b · spec §1.6.1 口径读取器**
 * （`m9-dev-language-roadmap.md` §1.6.1 · 资源全量口径的**唯一出处**）
 *
 * ## 它解决什么
 *
 * §1.6.1 里的每一个数（逐类条数 / 89 / 11 / 100 / 87 个去重 URL / star 21 / fav 19 / old 10）
 * 都是**判据的参照物**。⇒ 谁来读这些数，必须**只有一处**：
 *
 * - `scripts/extract-m9-guide-resources.ts` —— 抽取时**自检**：对不上即中止。
 * - `packages/core/src/db/m9-p1b-resources.test.ts` —— 单测**对账**：文档 ↔ 实跑。
 *
 * ⚠️ **两处各写一份解析是最坏的做法** —— 解析写错了，两边会**错得一模一样**，
 *   于是「文档 ↔ 实跑」这条闸变成同义反复，自己证自己。
 *   ⇒ 本模块是**唯一**的解析实现，两处都从这里取。
 *
 * ⚠️ **解析必须锚死**（本仓的老教训）：
 *   - §1.6.1 之后还有十几张表 ⇒ **必须截断到该小节末尾**，否则别的表里的同形行会被吃进来；
 *   - 表里同名列有两种写法（`**主清单小计**` 与 `` `VIBE_TOOLS` ``）⇒ 两种都要认；
 *   - 「89 条资源只有 87 个去重 URL」这句话里**两个数都在**，不能只取其一。
 */

/** 逐类条数。 */
export interface SpecCategoryCount {
  python: number
  go: number
  total: number
}

/** §1.6.1 的全部口径数字。 */
export interface SpecResourceCounts {
  /** 六类逐类条数 */
  categories: Map<string, SpecCategoryCount>
  /** 主清单小计（89） */
  main: number
  /** VIBE_TOOLS（6） */
  tools: number
  /** VIBE_TUTS（5） */
  tuts: number
  /** 真实资源总数（100） */
  all: number
  /** 去重 URL 数（87） */
  uniqueUrls: number
  /** 有 star 的条数（21） */
  star: number
  /** 精选条数（19） */
  fav: number
  /** 标记为「内容偏旧」的条数（10） */
  old: number
  /** 被两条资源共用的 URL（2 个） */
  sharedUrls: string[]
}

/** 取 spec §1.6.1 的正文（从该小节标题到下一个同级标题为止）。 */
export function specSection161(specText: string): string | null {
  const start = specText.indexOf('#### 1.6.1')
  if (start === -1) return null
  const rest = specText.slice(start)
  const next = rest.indexOf('\n#### ', 1)
  return next === -1 ? rest : rest.slice(0, next)
}


/**
 * 读 §1.6.1 的全部口径数字。
 *
 * @returns 读不出来返回 null（**不许当成「没有这些数」** —— 文档被改到闸认不出，
 *   与数据真的错了是两种不同的事，必须分开报）。
 */
export function parseSpecResourceCounts(specText: string): SpecResourceCounts | null {
  const sec = specSection161(specText)
  if (sec === null) return null

  // ── 六类逐类条数 ──
  const categories = new Map<string, SpecCategoryCount>()
  const catRe = /^\|\s*`([a-z]+)`[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*\*\*(\d+)\*\*\s*\|/gm
  for (const m of sec.matchAll(catRe)) {
    categories.set(m[1]!, { python: Number(m[2]), go: Number(m[3]), total: Number(m[4]) })
  }
  if (categories.size === 0) return null

  // ── 表尾合计（标签有两种写法：**加粗** 与 `反引号`）──
  const grab = (label: string): number | null => {
    const m = new RegExp(
      `^\\|\\s*(?:\\*\\*${label}\\*\\*|\`${label}\`)[^|]*\\|[^|]*\\|[^|]*\\|\\s*\\*\\*(\\d+)\\*\\*`,
      'm',
    ).exec(sec)
    return m ? Number(m[1]) : null
  }
  const main = grab('主清单小计')
  const tools = grab('VIBE_TOOLS')
  const tuts = grab('VIBE_TUTS')
  const all = grab('真实资源总数')
  if (main === null || tools === null || tuts === null || all === null) return null

  // ── 「N 条资源只有 M 个去重 URL」—— **两个数都在一句里**，不能只取其一 ──
  const uniq = /(\d+)\s*条资源只有\s*(\d+)\s*个去重\s*URL/.exec(sec)
  if (!uniq) return null

  // ── 字段闭集那一段里的三个数 ──
  const starM = /`star`\s*星数（\*\*仅\s*(\d+)\s*条有\*\*）/.exec(sec)
  const favM = /`fav`\s*精选\s*\*\*(\d+)\s*条\*\*/.exec(sec)
  const oldM = /`old`「内容偏旧」标记，实测\s*\*\*(\d+)\s*条\*\*/.exec(sec)
  if (!starM || !favM || !oldM) return null

  // ── 被两条资源共用的 URL（表格里反引号包着的 https 地址）──
  const sharedUrls: string[] = []
  for (const line of sec.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const m = /`(https?:\/\/[^`]+)`/.exec(line)
    if (m) sharedUrls.push(m[1]!)
  }

  return {
    categories,
    main,
    tools,
    tuts,
    all,
    uniqueUrls: Number(uniq[2]),
    star: Number(starM[1]),
    fav: Number(favM[1]),
    old: Number(oldM[1]),
    sharedUrls,
  }
}
