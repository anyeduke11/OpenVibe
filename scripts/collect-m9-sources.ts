/**
 * `scripts/collect-m9-sources.ts` —— M9 v1.6 **P1.9**（`m9-dev-plan-2026-10.md` §6.2 / §9）
 *
 * ## 它补的是 M9-P1 期的**最后一个交付物**
 *
 * §9 的 M9-P1 期交付物列是「迁移 · 种子 · `scripts/collect-m9-sources.ts` · 概念内容文件」。
 * 迁移（P1.1）、种子（P1.2/P1.3）、概念内容文件（P1.5/P1.6）都已落仓，
 * **只剩本脚本**——而它缺的不是「一个便利工具」，是 spec §3.2 那条硬约束的载体：
 *
 * > 「**可复算**：采集脚本须能一条命令复跑并输出差异」
 *
 * 没有它，「本仓没有一条出处缺 `source_checked_at`」只能靠**人**记得去核；
 * 有它，这句话变成一条命令。
 *
 * ## 它与 DL-02（正文零进仓）的关系
 *
 * DL-02 守的是**产物形态**（P1.8 落的扫描器：字段闭集 ＋ 目录闭集 ＋ 长度/散文/HTML 规则）。
 * 但产物形态守不住**入口**——入口就是本脚本。
 * ⇒ 本脚本**只取侧栏结构**（分段名 ＋ 条目标题 ＋ 链接），**不取正文**：
 *   侧栏里没有正文，正文在每篇教程页的正文区，本脚本从不请求那些页面。
 *   118 条链接的**全量 HEAD 验链**（HEAD 不返回正文）也在本脚本里跑，
 *   这正是已入库清单自己写的：「抽样非全量；全量验链须在采集脚本里跑（spec DL-01）」。
 *
 * ## 采集规则（全部来自已入库清单的 `collect_method` / `caveats`，不是现编的）
 *
 * 1. 抓索引页（`pageUrl`）⇒ **只取** `id="leftcolumn"` 到 `middle-column` 之间的侧栏
 *    —— ⚠️ 页内**不存在** right-column，按它切会一路读到文末并混入全站导航
 *    （实测踩过：条数从 84 虚增到 118）。
 * 2. 按 `<h2 class="left">` 切段；段名去掉语言前缀（`Python3 高级教程` ⇒ `高级教程`）；
 *    第一个 h2 之前的那段用默认段名 `基础教程`。
 *    ⚠️ **Go 侧栏只有一个分段** ⇒ 解析器不得假定分段结构存在。
 * 3. 取 `<a>` 的 `title` 与 `href`，**属性顺序不敏感**（源里两种顺序都出现过；
 *    按固定顺序写正则会漏一半，实测踩过：44/84）。
 * 4. 排除**绝对地址**的全站导航项。
 * 5. 标题归一：解 HTML 实体 ⇒ 排版连字符（U+2010–U+2015）转 ASCII `-`
 *    ⇒ 折叠连续空白 ⇒ 去首尾空白。
 * 6. 链接按**页面 URL** 解析（`new URL(href, pageUrl)`）——
 *    源里的 href 有根相对与页内相对两种形态，按页面 URL 解析两种都得到规范形态
 *    （按站点根解析会让页内相对的那 21 条落到不存在的路径上 ⇒ 404）。
 *
 * ## 用法
 *
 * ```
 * pnpm m9:collect                 # 抓取 + 与已入库清单对账 + 打印差异（退出码 0）
 * pnpm m9:collect -- --check      # 同上，但按判定给退出码（供 CI 用，见下）
 * pnpm m9:collect -- --write      # 用新采集结果覆盖已入库清单
 * pnpm m9:collect -- --offline --html-dir /tmp/m9html   # 不联网，对着本地 HTML 跑
 * pnpm m9:collect -- --source go  # 只跑一门
 * ```
 *
 * ## 退出码契约（CI 的闸就靠这三条）
 *
 * | 码 | 含义 | CI 怎么对待 |
 * |---|---|---|
 * | `0` | 一致：清单与源站逐条一致 | 绿 |
 * | `1` | **内容漂移**：源站变了清单没跟上，**或解析器失灵**（页面取到但一条都没解析出来） | **红 —— 我们该修** |
 * | `2` | **不可判定**：网络不可达 / 源站 5xx / 超时，本次没比成 | **黄 —— 不阻断** |
 *
 * ⚠️ **为什么必须有第 3 条**：若「取不到页面」与「内容变了」共用一个码，CI 会因
 *   第三方站点抖动而偶发红；人一旦为此给这道闸加 `continue-on-error`，**闸就等于没有闸**。
 *   ⇒ 把「环境不行」与「我们该修」分成两个码，这道闸才**能长期开着**。
 *   （判据在 `decideCheckExitCode`，是纯函数 ⇒ 不联网也能测。）
 *
 * ⚠️ **默认只报差异、不写盘** —— 源站本来就会变，「有差异」不等于「库里的错了」。
 *   差异分三类，报告里分别列出：`countChanged`（条数变了）/
 *   `added` / `removed`（条目增减）/ `titleChanged` / `sectionChanged` / `urlFormChanged`
 *   （同一页面的链接形态变了，如双斜杠）。
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardedWrite } from './m9-write-guard'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'devlog-evidence', 'M9-probe')

/** 出站白名单：只允许 runoob 索引页（照 `scripts/import-vibehub.ts` 的做法）。 */
const ALLOWED_HOSTS = new Set(['www.runoob.com'])
const FETCH_TIMEOUT_MS = 20_000
const PROBE_TIMEOUT_MS = 15_000
const PROBE_CONCURRENCY = 4

export interface SourceConfig {
  key: 'python3' | 'go'
  /** 清单文件的显示名（写进 `_readme`） */
  title: string
  /** 索引页 URL */
  pageUrl: string
  /** 链接解析用的站点根 */
  siteRoot: string
  /** 第一个分段（无 h2 时）的段名 */
  defaultSection: string
  /** 段名要剥掉的语言前缀 */
  sectionPrefix: RegExp
  /** 已入库清单文件名（相对 OUT_DIR） */
  inventoryFile: string
  /** §1.5 实测的条数（用于「条数变了」告警） */
  expectedTotal: number
}

export const SOURCES: SourceConfig[] = [
  {
    key: 'python3',
    title: 'runoob.com Python3 教程全量清单',
    pageUrl: 'https://www.runoob.com/python3/python3-tutorial.html',
    siteRoot: 'https://www.runoob.com',
    defaultSection: '基础教程',
    sectionPrefix: /^Python\s*3?\s*/,
    inventoryFile: 'runoob-python3-inventory.json',
    expectedTotal: 84,
  },
  {
    key: 'go',
    title: 'runoob.com Go 教程全量清单',
    pageUrl: 'https://www.runoob.com/go/go-tutorial.html',
    siteRoot: 'https://www.runoob.com',
    defaultSection: '基础教程',
    sectionPrefix: /^Go\s*/,
    inventoryFile: 'runoob-go-inventory.json',
    expectedTotal: 34,
  },
]

export interface CollectedItem {
  ordinal: number
  section: string
  title: string
  url: string
}

// ============================================================================
// 纯函数面（可测）
// ============================================================================

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  horbar: '―',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
}

/** 解 HTML 实体（命名的 ＋ 数字的 ＋ 十六进制的）。 */
export function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m
  })
}

/**
 * 标题归一：解实体 ⇒ 排版连字符转 ASCII ⇒ 折叠空白 ⇒ 去首尾。
 *
 * ⚠️ 源里的标题带**两处**噪声（已入库清单就是按这个口径归一的）：
 *   ① 连续空格（`Python3  数据类型转换`）② 排版连字符（`&#8211;` ⇒ `–` ⇒ `-`）。
 */
export function normalizeTitle(raw: string): string {
  return decodeEntities(raw)
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 链接按**页面 URL** 解析（`new URL(href, pageUrl)`）。
 *
 * ⚠️ **必须按页面 URL，不能按站点根** —— 这是 P1.9 实跑抓出来的真缺陷：
 *   源里的 href 有两种形态：**根相对**（`/python3/python3-tutorial.html`）与
 *   **页内相对**（`python3-intro.html`）。按站点根解析时，页内相对的那 21 条
 *   会被解析成 `https://www.runoob.com/python3-intro.html` ⇒ **404**（实测）。
 *   按页面 URL 解析才是对的：页内相对 ⇒ `https://www.runoob.com/python3/python3-intro.html` ⇒ 200。
 *   ⚠️ 已入库的 Python 清单正是按站点根解析的 ⇒ 那 21 条是**坏链**，
 *      本轮由本脚本的**全量 HEAD 验链**报出来（63/84 通过 ⇒ 21 条 404）。
 */
export function resolveItemUrl(href: string, pageUrl: string): string {
  return new URL(href, pageUrl).href
}

/**
 * 段名：剥 HTML 标签 ⇒ 去语言前缀（`Python3 高级教程` ⇒ `高级教程`）。
 *
 * ⚠️ **源里的 h2 正文带标签**：`<h2 class="left"><span class="left_h2">Python3</span> 高级教程</h2>`
 *   ⇒ 不剥标签的话段名会变成 `<span class="left_h2">Python3</span> 高级教程`。
 */
export function normalizeSection(raw: string, cfg: SourceConfig): string {
  const text = normalizeTitle(raw.replace(/<[^>]+>/g, ' '))
  const stripped = text.replace(cfg.sectionPrefix, '').trim()
  return stripped === '' ? cfg.defaultSection : stripped
}

/**
 * 解析侧栏 → 条目清单。
 *
 * @param pageHtml 索引页整页 HTML
 * @param cfg 来源配置
 */
export function parseSidebar(pageHtml: string, cfg: SourceConfig): CollectedItem[] {
  const start = pageHtml.indexOf('id="leftcolumn"')
  if (start < 0) throw new Error(`页面里找不到侧栏起点 id="leftcolumn"：${cfg.pageUrl}`)
  const end = pageHtml.indexOf('middle-column', start)
  const sidebar = pageHtml.slice(start, end < 0 ? pageHtml.length : end)

  // 按 <h2 class="left"> 切段；第一块是「第一个 h2 之前」的那段
  const chunks = sidebar.split(/<h2[^>]*class="left"[^>]*>/i)
  const sections: Array<{ name: string; body: string }> = [
    { name: cfg.defaultSection, body: chunks[0] ?? '' },
  ]
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i] ?? ''
    const closeAt = chunk.indexOf('</h2>')
    const head = closeAt < 0 ? chunk : chunk.slice(0, closeAt)
    const body = closeAt < 0 ? '' : chunk.slice(closeAt + 5)
    sections.push({ name: normalizeSection(head, cfg), body })
  }

  const items: CollectedItem[] = []
  for (const sec of sections) {
    for (const m of sec.body.matchAll(/<a\s([^>]*)>/gi)) {
      const attrs = m[1] ?? ''
      const rawTitle = /\btitle="([^"]*)"/i.exec(attrs)?.[1]
      const rawHref = /\bhref="([^"]*)"/i.exec(attrs)?.[1]
      if (rawTitle === undefined || rawHref === undefined) continue
      // ⚠️ 排除绝对地址的全站导航项（源里混有过）
      if (/^(https?:)?\/\//i.test(rawHref.trim())) continue
      const title = normalizeTitle(rawTitle)
      if (title === '') continue
      items.push({
        ordinal: items.length + 1,
        section: sec.name,
        title,
        url: resolveItemUrl(rawHref.trim(), cfg.pageUrl),
      })
    }
  }
  return items
}

/**
 * 链接形态归一（折叠重复斜杠）—— 用来区分「同页不同形态」与「真的换页了」。
 *
 * ⚠️ **不能连协议那两条斜杠一起折叠**（首版就踩了）：
 *   `https://www.runoob.com//go/a.html` 直接 `replace(/\/{2,}/g, '/')`
 *   会变成 `https:/www.runoob.com/go/a.html` ⇒ 协议被吃掉，键不再是合法 URL。
 *   ⇒ 只折叠**协议之后**的重复斜杠。
 */
export function urlFormKey(url: string): string {
  const scheme = /^(https?:)\/\//i.exec(url)?.[0]
  if (!scheme) return url.replace(/\/{2,}/g, '/')
  return scheme + url.slice(scheme.length).replace(/\/{2,}/g, '/')
}

export interface InventoryDiff {
  /** 条数变化（正数=源站多了，负数=源站少了） */
  countChanged: number
  /** 源站有、库里没有 */
  added: CollectedItem[]
  /** 库里有、源站没有 */
  removed: CollectedItem[]
  /** 同一页面的链接换了地址（不是形态变了） */
  urlChanged: Array<{ before: string; after: string }>
  /** 同一页面的标题变了 */
  titleChanged: Array<{ url: string; before: string; after: string }>
  /** 同一页面的段名变了 */
  sectionChanged: Array<{ url: string; before: string; after: string }>
  /** 同一页面的链接形态变了（如双斜杠 ⇒ 单斜杠） */
  urlFormChanged: Array<{ before: string; after: string }>
  /** 两侧的条目顺序不同 */
  reordered: boolean
}

/** 条目的语义身份（段名 + 标题）—— 与链接形态无关，用来判「同一页面」。 */
export function itemIdentity(item: CollectedItem): string {
  return `${item.section} ${item.title}`
}

/**
 * 对账两批条目 —— **配对分两轮**，否则「链接变了」会被误报成「一条没了 ＋ 一条多了」。
 *
 *   第一轮按 URL（形态归一）配上 ⇒ 剩下的第二轮按**语义身份**（段名 ＋ 标题）配
 *   ⇒ 配上的记为 `urlChanged`（同一页面，链接换了地址），配不上的才是真增减。
 *   实例：已入库的 Python 清单有 21 条按站点根解析的坏链 ⇒ 链接与源站不同，
 *   但页面是同一批 —— 不做第二轮配对会误报成 21 增 21 减。
 */
export function diffInventory(committed: CollectedItem[], fresh: CollectedItem[]): InventoryDiff {
  const diff: InventoryDiff = {
    countChanged: fresh.length - committed.length,
    added: [],
    removed: [],
    urlChanged: [],
    titleChanged: [],
    sectionChanged: [],
    urlFormChanged: [],
    reordered: false,
  }
  const pairs: Array<{ before: CollectedItem; after: CollectedItem }> = []
  const usedFresh = new Set<CollectedItem>()

  // ── 第一轮：URL ＋ 标题 都相同 ⇒ 同一条目（含**同 URL 不同标题**的那类） ──
  const freshByExact = new Map<string, CollectedItem[]>()
  for (const f of fresh) {
    const key = `${urlFormKey(f.url)}\u0000${f.title}`
    const arr = freshByExact.get(key) ?? []
    arr.push(f)
    freshByExact.set(key, arr)
  }
  const leftoverCommitted: CollectedItem[] = []
  for (const c of committed) {
    const key = `${urlFormKey(c.url)}\u0000${c.title}`
    const arr = freshByExact.get(key)
    const f = arr?.shift()
    if (f) {
      pairs.push({ before: c, after: f })
      usedFresh.add(f)
    } else {
      leftoverCommitted.push(c)
    }
  }

  // ── 第二轮：URL 相同 ⇒ 同一页面，标题变了 ──
  const freshByUrl = new Map<string, CollectedItem[]>()
  for (const f of fresh) {
    if (usedFresh.has(f)) continue
    const arr = freshByUrl.get(urlFormKey(f.url)) ?? []
    arr.push(f)
    freshByUrl.set(urlFormKey(f.url), arr)
  }
  const leftover2: CollectedItem[] = []
  for (const c of leftoverCommitted) {
    const f = freshByUrl.get(urlFormKey(c.url))?.shift()
    if (f) {
      pairs.push({ before: c, after: f })
      usedFresh.add(f)
    } else {
      leftover2.push(c)
    }
  }

  // ── 第三轮：语义身份（段名 ＋ 标题）相同 ⇒ 同一页面，链接换了地址 ──
  const freshByIdentity = new Map<string, CollectedItem[]>()
  for (const f of fresh) {
    if (usedFresh.has(f)) continue
    const arr = freshByIdentity.get(itemIdentity(f)) ?? []
    arr.push(f)
    freshByIdentity.set(itemIdentity(f), arr)
  }
  for (const c of leftover2) {
    const f = freshByIdentity.get(itemIdentity(c))?.shift()
    if (f) {
      pairs.push({ before: c, after: f })
      usedFresh.add(f)
      diff.urlChanged.push({ before: c.url, after: f.url })
    } else {
      diff.removed.push(c)
    }
  }
  for (const f of fresh) {
    if (!usedFresh.has(f)) diff.added.push(f)
  }

  for (const { before, after } of pairs) {
    if (before.title !== after.title) {
      diff.titleChanged.push({ url: after.url, before: before.title, after: after.title })
    }
    if (before.section !== after.section) {
      diff.sectionChanged.push({ url: after.url, before: before.section, after: after.section })
    }
    if (before.url !== after.url && urlFormKey(before.url) === urlFormKey(after.url)) {
      diff.urlFormChanged.push({ before: before.url, after: after.url })
    }
  }

  const committedOrder = committed.map((it) => itemIdentity(it)).join('\n')
  const freshOrder = fresh.map((it) => itemIdentity(it)).join('\n')
  diff.reordered = committedOrder !== freshOrder
  return diff
}

/** 差异是否「空」（用于 `--check` 的退出码）。 */
export function diffIsEmpty(diff: InventoryDiff): boolean {
  return (
    diff.countChanged === 0 &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.urlChanged.length === 0 &&
    diff.titleChanged.length === 0 &&
    diff.sectionChanged.length === 0 &&
    diff.urlFormChanged.length === 0 &&
    !diff.reordered
  )
}

/** 分段计数。 */
export function countSections(items: CollectedItem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of items) out[it.section] = (out[it.section] ?? 0) + 1
  return out
}

// ============================================================================
// 采集期踩过的坑（写进清单的 `caveats`，让规则随产物一起被复现）
// ============================================================================

const CAVEATS: Record<'python3' | 'go', string[]> = {
  python3: [
    '源页面侧栏边界是 <div class="col middle-column">，页内**不存在** right-column —— 按 right-column 切会一路读到文末并混入全站导航（实测踩过，切出的条目数从 84 虚增到 118）',
    '侧栏 <a> 的 title/href 属性顺序不固定，按固定顺序写正则会漏一半（实测踩过：44/84）',
    '源里混有绝对 URL 的全站导航项，采集须显式排除',
  ],
  go: [
    '⚠️ Go 侧栏**只有一个分段**（基础教程 34 条），而 Python3 分「基础/高级」两段 ⇒ 解析器不得假定分段结构存在',
    'Go 页同样**不存在** right-column 分隔符；可用的结束标记是 <div class="col middle-column">',
  ],
}

const COLLECT_METHOD =
  '由 scripts/collect-m9-sources.ts 采集：抓索引页 → 切 <div class="design" id="leftcolumn"> ' +
  '→ 按 <h2 class="left"> 切段 → 取 <a> 的 title/href（属性顺序不敏感）' +
  '→ 排除绝对地址的全站导航项 → 标题归一（解实体 ＋ 连字符转 ASCII ＋ 折叠空白）' +
  '→ 链接按站点根解析'

export interface LinkProbeResult {
  method: string
  result: string
  failed: Array<{ url: string; status: number | null; error: string | null }>
}

/** 全量 HEAD 验链（HEAD 不返回正文 ⇒ 不违反 §3.2）。 */
export async function probeLinks(
  urls: string[],
  concurrency = PROBE_CONCURRENCY,
): Promise<LinkProbeResult> {
  const failed: LinkProbeResult['failed'] = []
  let ok = 0
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor
      cursor += 1
      if (idx >= urls.length) return
      const url = urls[idx]!
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        if (res.ok) ok += 1
        else failed.push({ url, status: res.status, error: null })
      } catch (err) {
        failed.push({ url, status: null, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
  return {
    method: `HEAD 全量 ${String(urls.length)} 条，${String(concurrency)} 并发，${String(PROBE_TIMEOUT_MS / 1000)}s 超时`,
    result: `${String(ok)}/${String(urls.length)} 返回 2xx`,
    failed,
  }
}

// ============================================================================
// CLI
// ============================================================================

async function fetchPage(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`出站白名单拦截: ${url}`)
  }
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
      return await res.text()
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw new Error(
    `重试 3 次仍失败: ${url}（${lastErr instanceof Error ? lastErr.message : String(lastErr)}）`,
  )
}

function readCommitted(file: string): { items: CollectedItem[]; meta: Record<string, unknown> } {
  const raw = readFileSync(join(OUT_DIR, file), 'utf8')
  const parsed = JSON.parse(raw) as { items?: CollectedItem[] } & Record<string, unknown>
  return { items: parsed.items ?? [], meta: parsed }
}

function renderInventory(
  cfg: SourceConfig,
  items: CollectedItem[],
  probe: LinkProbeResult | null,
): Record<string, unknown> {
  const sections = countSections(items)
  const meta: Record<string, unknown> = {
    _readme: `${cfg.title}。⚠️ 只存标题与 URL，正文一个字未取（spec §3.2 FR-2 版权与漂移约束）。`,
    source: cfg.pageUrl,
    collected_at: new Date().toISOString().slice(0, 10),
    collect_method: COLLECT_METHOD,
    counts: { total: items.length, sections },
    caveats: CAVEATS[cfg.key],
  }
  if (probe) {
    meta['link_probe'] = {
      method: probe.method,
      result: probe.result,
      caveat:
        probe.failed.length === 0
          ? '全量验链通过'
          : `${String(probe.failed.length)} 条未通过，见 failed`,
      ...(probe.failed.length > 0 ? { failed: probe.failed } : {}),
    }
  }
  meta['items'] = items
  return meta
}

function renderDiff(cfg: SourceConfig, diff: InventoryDiff): string {
  const lines: string[] = []
  lines.push(`── ${cfg.key} · ${cfg.pageUrl}`)
  lines.push(`   条数：库 ${String(cfg.expectedTotal)} → 源 ${String(cfg.expectedTotal + diff.countChanged)}（差 ${String(diff.countChanged)}）`)
  if (diff.added.length > 0) {
    lines.push(`   源站新增 ${String(diff.added.length)} 条：`)
    for (const it of diff.added.slice(0, 10)) lines.push(`     + ${it.section} · ${it.title} · ${it.url}`)
  }
  if (diff.removed.length > 0) {
    lines.push(`   源站消失 ${String(diff.removed.length)} 条：`)
    for (const it of diff.removed.slice(0, 10)) lines.push(`     - ${it.section} · ${it.title} · ${it.url}`)
  }
  if (diff.urlChanged.length > 0) {
    lines.push(`   链接换了地址 ${String(diff.urlChanged.length)} 条：`)
    for (const d of diff.urlChanged.slice(0, 10)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.titleChanged.length > 0) {
    lines.push(`   标题变了 ${String(diff.titleChanged.length)} 条：`)
    for (const d of diff.titleChanged.slice(0, 10)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.sectionChanged.length > 0) {
    lines.push(`   段名变了 ${String(diff.sectionChanged.length)} 条：`)
    for (const d of diff.sectionChanged.slice(0, 10)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.urlFormChanged.length > 0) {
    lines.push(`   链接形态变了 ${String(diff.urlFormChanged.length)} 条：`)
    for (const d of diff.urlFormChanged.slice(0, 5)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.reordered) lines.push('   ⚠️ 两侧的条目顺序不同')
  if (diffIsEmpty(diff)) lines.push('   ✓ 与已入库清单逐条一致')
  return lines.join('\n')
}

export interface CollectOptions {
  write: boolean
  check: boolean
  json: boolean
  offline: boolean
  htmlDir: string | null
  only: string | null
  /** 写回用的时间戳（备份与差异快照的文件名里带它） */
  stamp: string
}

/**
 * 单门的采集结果状态 —— **三层，不是「成功/失败」两层**。
 *
 * ⚠️ **为什么必须分层**：本脚本要当 CI 的闸，而「失败」有两种**相反的性质**：
 *   ① `inconclusive`（网络不可达 / 源站 5xx / 超时）—— **是环境的问题，不是我们的回归**。
 *      若让它红，CI 会因第三方站点抖动而偶发红；人一旦因此给这道闸加 `continue-on-error`，
 *      **闸就被关掉了，等于没有闸**。⇒ 单独一层，退出码 2。
 *   ② `broken`（页面取到了，但**一条都没解析出来**）—— **是我们的问题**：源站改版 ⇒
 *      解析器失灵。此时报「84 条被删除」是误导（实际是解析不出来，不是被删了）
 *      ⇒ 单独一层，退出码 1，且报「解析器失灵」。
 *   ③ `ok` —— 采集成功；差异要么有要么没有，有则是真漂移，退出码 1。
 */
export type CollectStatus = 'ok' | 'inconclusive' | 'broken'

export interface CollectOutcome {
  source: string
  status: CollectStatus
  /** status ≠ 'ok' 时的原因（人类可读，直接进 CI 日志） */
  statusReason: string | null
  diff: InventoryDiff
  freshCount: number
  wrote: boolean
  /** 写回时的备份路径（没写盘时为 null） */
  backupPath: string | null
  /** 写回时的差异快照路径（没写盘时为 null） */
  diffPath: string | null
  probe: LinkProbeResult | null
}

/** 空差异（不可判定时用它占位 —— 语义是「没比，不是比过了没差异」）。 */
export function emptyDiff(): InventoryDiff {
  return {
    countChanged: 0,
    added: [],
    removed: [],
    urlChanged: [],
    titleChanged: [],
    sectionChanged: [],
    urlFormChanged: [],
    reordered: false,
  }
}

/**
 * `--check` 的退出码判定 —— **纯函数**，不联网也能测。
 *
 * 退出码契约（CI 靠它区分「红」与「黄」）：
 *   - `0` 一致：清单与源站逐条一致
 *   - `1` 内容漂移：**我们**该修 —— 源站变了清单没跟上，或解析器失灵
 *   - `2` 不可判定：**环境**的问题 —— 网络/源站不可达，本次没比成
 *
 * ⚠️ **「差异优先于不可判定」**：一个源不可达、另一个源有差异 ⇒ 退出码仍是 1
 *   （有差异那门是真的可判定的漂移，不能被另一门的网络故障掩盖）。
 */
export interface CheckVerdict {
  code: number
  label: '一致' | '内容漂移' | '不可判定'
  detail: string
}

export function decideCheckExitCode(outcomes: CollectOutcome[]): CheckVerdict {
  const broken = outcomes.filter((o) => o.status === 'broken')
  const inconclusive = outcomes.filter((o) => o.status === 'inconclusive')
  const drifted = outcomes.filter((o) => o.status === 'ok' && !diffIsEmpty(o.diff))
  if (broken.length > 0 || drifted.length > 0) {
    const parts: string[] = []
    if (broken.length > 0) {
      parts.push(
        `采集器失灵 ${broken.map((o) => `${o.source}（${o.statusReason ?? '未知原因'}）`).join('、')}`,
      )
    }
    if (drifted.length > 0) {
      parts.push(`清单与源站不一致 ${drifted.map((o) => o.source).join('、')}`)
    }
    return { code: 1, label: '内容漂移', detail: parts.join('；') }
  }
  if (inconclusive.length > 0) {
    return {
      code: 2,
      label: '不可判定',
      detail: `网络/源站不可达 ${inconclusive
        .map((o) => `${o.source}（${o.statusReason ?? '未知原因'}）`)
        .join('、')}`,
    }
  }
  return { code: 0, label: '一致', detail: '与已入库清单逐条一致' }
}

export async function collectSources(opts: CollectOptions): Promise<CollectOutcome[]> {
  const outcomes: CollectOutcome[] = []
  for (const cfg of SOURCES) {
    if (opts.only !== null && cfg.key !== opts.only) continue
    // ⚠️ **逐门捕获，不让异常冒到顶层** ——
    //   顶层 catch 只能给「1」，会把「网络挂了」和「内容漂移」混成同一个码，
    //   CI 就没法区分「我们该修」与「环境不行」。
    //   ⇒ 分两次捕获：**取页面**失败 = 环境问题（不可判定）；
    //     **解析/读本地清单**失败 = 我们的问题（解析器失灵 / 仓里的清单坏了）。
    let pageHtml: string
    try {
      pageHtml = opts.offline
        ? readFileSync(join(opts.htmlDir ?? '', `${cfg.key}.html`), 'utf8')
        : await fetchPage(cfg.pageUrl)
    } catch (err) {
      outcomes.push({
        source: cfg.key,
        status: 'inconclusive',
        statusReason: err instanceof Error ? err.message : String(err),
        diff: emptyDiff(),
        freshCount: 0,
        wrote: false,
        backupPath: null,
        diffPath: null,
        probe: null,
      })
      continue
    }
    // ⚠️ **一条都没解析出来 ≠ 源站删光了 84 条** ——
    //   这是「页面取到了但解析器认不出侧栏」，属**我们**的问题（源站改版），
    //   必须单独报，否则会被读成「源站把内容删了」。
    let fresh: CollectedItem[]
    try {
      fresh = parseSidebar(pageHtml, cfg)
    } catch (err) {
      outcomes.push({
        source: cfg.key,
        status: 'broken',
        statusReason: `侧栏解析失败 —— ${err instanceof Error ? err.message : String(err)}（源站结构可能改了，解析器需更新；**不是**「源站删了条目」）`,
        diff: emptyDiff(),
        freshCount: 0,
        wrote: false,
        backupPath: null,
        diffPath: null,
        probe: null,
      })
      continue
    }
    if (fresh.length === 0) {
      outcomes.push({
        source: cfg.key,
        status: 'broken',
        statusReason:
          '页面取到了，但侧栏解析出 0 条 ⇒ 源站结构可能改了，解析器需更新（**不是**「源站删了条目」）',
        diff: emptyDiff(),
        freshCount: 0,
        wrote: false,
        backupPath: null,
        diffPath: null,
        probe: null,
      })
      continue
    }
    let committed: { items: CollectedItem[]; meta: Record<string, unknown> }
    try {
      committed = readCommitted(cfg.inventoryFile)
    } catch (err) {
      outcomes.push({
        source: cfg.key,
        status: 'broken',
        statusReason: `读不了已入库清单 ${cfg.inventoryFile} —— ${err instanceof Error ? err.message : String(err)}（仓里的文件坏了或不在）`,
        diff: emptyDiff(),
        freshCount: fresh.length,
        wrote: false,
        backupPath: null,
        diffPath: null,
        probe: null,
      })
      continue
    }
    const diff = diffInventory(committed.items, fresh)
    const probe = opts.offline ? null : await probeLinks(fresh.map((it) => it.url))
    let wrote = false
    let backupPath: string | null = null
    let diffPath: string | null = null
    if (opts.write) {
      const meta = renderInventory(cfg, fresh, probe)
      // ⚠️ **写回走守卫**：先备份旧清单 ＋ 写差异快照 ＋ 原子替换。
      //   此前是**直接覆盖** ⇒ 源站一改、脚本一跑，仓里的证据就被换掉，
      //   而「换掉之前发生了什么」没有任何记录。
      const res = guardedWrite({
        targetRel: `docs/devlog-evidence/M9-probe/${cfg.inventoryFile}`,
        content: `${JSON.stringify(meta, null, 2)}\n`,
        diff: {
          countChanged: diff.countChanged,
          added: diff.added,
          removed: diff.removed,
          urlChanged: diff.urlChanged,
          titleChanged: diff.titleChanged,
          sectionChanged: diff.sectionChanged,
          urlFormChanged: diff.urlFormChanged,
          reordered: diff.reordered,
        },
        beforeCount: committed.items.length,
        afterCount: fresh.length,
        stamp: opts.stamp,
      })
      wrote = res.wrote
      backupPath = res.backupPath
      diffPath = res.diffPath
    }
    outcomes.push({
      source: cfg.key,
      status: 'ok',
      statusReason: null,
      diff,
      freshCount: fresh.length,
      wrote,
      backupPath,
      diffPath,
      probe,
    })
  }
  return outcomes
}

async function main(argv: string[]): Promise<number> {
  const opts: CollectOptions = {
    write: argv.includes('--write'),
    check: argv.includes('--check'),
    json: argv.includes('--json'),
    offline: argv.includes('--offline'),
    htmlDir: argv.includes('--html-dir') ? argv[argv.indexOf('--html-dir') + 1] ?? null : null,
    only: argv.includes('--source') ? argv[argv.indexOf('--source') + 1] ?? null : null,
    stamp: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
  }
  const outcomes = await collectSources(opts)
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(outcomes, null, 2)}\n`)
  } else {
    for (const o of outcomes) {
      const cfg = SOURCES.find((s) => s.key === o.source)!
      if (o.status === 'ok') {
        process.stdout.write(`${renderDiff(cfg, o.diff)}\n`)
        if (o.probe) {
          process.stdout.write(
            `   验链：${o.probe.result}（${o.probe.method}）${o.probe.failed.length > 0 ? ` · ${String(o.probe.failed.length)} 条未通过` : ''}\n`,
          )
        }
        if (o.wrote) {
          process.stdout.write(`   ✓ 已写回 ${cfg.inventoryFile}\n`)
          if (o.backupPath) process.stdout.write(`   · 备份：${o.backupPath}\n`)
          if (o.diffPath) process.stdout.write(`   · 差异快照：${o.diffPath}\n`)
        }
      } else {
        // 不可判定 / 解析器失灵：**不打印差异**（那会是空差异，误导成「一致」）
        process.stdout.write(
          `   ⚠️ ${cfg.title}：${o.status === 'inconclusive' ? '不可判定' : '解析器失灵'} —— ${o.statusReason ?? '未知原因'}\n`,
        )
      }
    }
  }
  const verdict = decideCheckExitCode(
    outcomes.map((o) => ({
      ...o,
      // ⚠️ **刚写回过的源按「已一致」算** —— `--write` 的前提就是「有差异」，
      //   写完之后差异已经消解 ⇒ 再报「内容漂移」是拿写回前的状态说事。
      diff: o.wrote ? emptyDiff() : o.diff,
    })),
  )
  if (!opts.json) {
    process.stdout.write(
      `\n判定：${verdict.label} —— ${verdict.detail}（退出码 ${String(verdict.code)}）\n`,
    )
  }
  return opts.check ? verdict.code : 0
}

if (process.argv[1] && basename(process.argv[1]).startsWith('collect-m9-sources')) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `[m9:collect] 失败: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exitCode = 1
    })
}
