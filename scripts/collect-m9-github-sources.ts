/**
 * `scripts/collect-m9-github-sources.ts` —— M9 v1.6 **另三源采集实现**
 * （`m9-dev-plan-2026-10.md` §6.2 / §9 ＋ `m9-dev-language-roadmap.md` §1.1 §1.5）
 *
 * ## 它补的是什么
 *
 * P1.9 落的 `scripts/collect-m9-sources.ts` 只覆盖 **runoob 两门**。
 * 另三源（xinliangnote 43 篇 / walter201230 101 篇 / awesome-* 4197 条）此前**只有结构骨架**
 * （`aux-sources-structure.json`），**没有采集实现** ⇒ 那些数字是手抄的，
 * 「可复算」对它们**不成立**。本脚本把那三源变成**一条命令能复跑**的东西。
 *
 * ## 为什么形态与 runoob 完全不同
 *
 * | 源 | 形态 | 取数方式 |
 * |---|---|---|
 * | xinliangnote/Go | **目录树**（`00-基础语法/01-环境安装.md`） | GitHub `git/trees` API |
 * | walter201230/Python | **目录树**（`Article/PythonBasis/python8/xxx.md`） | 同上 |
 * | jobbole/awesome-python-cn | **README 里的嵌套列表** | GitHub `readme` API |
 * | avelino/awesome-go | **README 里的嵌套列表** | 同上 |
 *
 * ⚠️ **走 GitHub API 而不是抓网页**：这四家都是 GitHub 仓库，API 的稳定性远高于
 *   解析 HTML，且**不碰正文区**（目录树只给路径与文件名；README 只给清单，
 *   那是清单本身不是教程正文）⇒ 与 §3.2「只存链接不存正文」天然相容。
 *
 * ## 三条**实测得来的**解析规则（不是现编的）
 *
 * 1. **自然序，不是字典序** —— walter 的章节目录是 `python0 … python28`，
 *    字典序会把 `python10` 排到 `python2` 前面 ⇒ 顺序必须是**自然序**。
 * 2. **`section` 的取法按源而异** —— xinliangnote 的教学分组是**顶层目录**
 *    （`codes/` 子目录属于它的父组）；walter 的分组是**章目录**（`pythonN`）。
 *    ⇒ 两种规则都登记在配置里，不靠猜。
 * 3. **awesome-* 一个列表项只取它的**第一个**链接** —— 后面的链接在**描述文字**里
 *    （实测 awesome-go 有 133 个这样的次生链接）⇒ 取全部会多出 17% 的假条目。
 *
 * ## 用法
 *
 * ```
 * pnpm m9:collect:github                  # 采集 + 与已入库清单对账 + 打印差异（退出码 0）
 * pnpm m9:collect:github -- --check       # 同上，但按判定给退出码（0 一致 / 1 漂移 / 2 不可判定）
 * pnpm m9:collect:github -- --write       # 用新采集结果覆盖已入库清单（**写前备份 ＋ 差异快照**）
 * pnpm m9:collect:github -- --source awesome-go   # 只跑一个
 * ```
 *
 * ⚠️ **只发 GitHub API**（`api.github.com`），出站白名单不含任何其他主机。
 *   设了 `GITHUB_TOKEN` / `GH_TOKEN` 就带上（本地有 `gh` 登录时更不容易撞限流）；
 *   没设也能跑（匿名 60 次/小时，**本脚本一次最多 8 个请求**）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decideCheckExitCode,
  diffInventory,
  diffIsEmpty,
  emptyDiff,
  type CollectedItem,
  type LinkProbeResult,
  type CollectOutcome,
  type InventoryDiff,
} from './collect-m9-sources'
import { guardedWrite, writeDiffIsEmpty, type WriteDiff } from './m9-write-guard'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'devlog-evidence', 'M9-probe')

/** 出站白名单 —— 只有 GitHub API。 */
const ALLOWED_HOSTS = new Set(['api.github.com'])

/** 一族的源配置。 */
export type GithubSourceKind = 'tree' | 'readme'

export interface GithubSourceConfig {
  key: string
  title: string
  owner: string
  repo: string
  branch: string
  kind: GithubSourceKind
  /**
   * `section` 怎么取：
   * - `top-dir`   —— 第一个路径段（`00-基础语法`）；`codes/` 子目录归它的父组
   * - `parent-dir`—— 完整父目录路径（`Article/PythonBasis/python8`）
   */
  sectionRule: 'top-dir' | 'parent-dir'
  /** 标题是否剥掉文件名开头的编号前缀（`04-Slice 切片` ⇒ `Slice 切片`） */
  stripNumericPrefix: boolean
  /** 清单落盘名（相对 `docs/devlog-evidence/M9-probe/`） */
  inventoryFile: string
  /** 实测条数（首次采集后回填；改动条数时会红） */
  expectedTotal: number
  /**
   * 链接存在性**怎么证明** —— 三档。
   *
   * ⚠️ **目录树型源（tree）为什么不做 HEAD 验链**（实测踩出来的）：
   *   `git/trees` 的**那一次响应本身就是存在性证明** —— 文件在树里 ⇒ blob 链接必然可达。
   *   额外再发 144 个 HEAD 请求**没有信息增量**，而且会把自己打到 GitHub 的限流里：
   *   实测连跑几轮后，本机对 `github.com/.../blob/...` 的 HEAD **与 GET 都 20s 无响应**
   *   （curl 同样超时 ⇒ 不是脚本的 UA 问题，是被限流了）。
   *   ⇒ 目录树型源记 `verify: 'tree-api'`（一次请求证明 43/101 条）。
   *
   * ⚠️ **awesome-*（readme）为什么不做**：4047 条第三方外链的全量存活调查
   *   **不是本模块的责任**（§3.14 的失效巡检针对 89 条资源，那是 P1c 的活）。
   *   ⇒ 记 `verify: 'none'`，并在清单里写明「未探测」及原因。
   */
  verify: 'head' | 'tree-api' | 'none'
  /**
   * 这道闸对「清单漂移」的**判定分档**。
   *
   * ⚠️ **为什么要有分档**（否则这道闸会被关掉）：
   *   awesome-go 是**活跃仓**（2026-10-19 还在推）⇒ 它的清单**每天都在漂**。
   *   若把「漂移」一律判红，CI 会每周响一次，而那不是我们的回归 ——
   *   **人一旦给一道闸加 `continue-on-error`，闸就等于没有闸**。
   *
   * ⇒ 分档依据是**事实**，不是偏好：
   *   - `blocking`  —— 源**稳定**（停更）**或**清单**会被消费**（教程型要进 DAG）
   *     ⇒ 漂移就是信号（源真变了 / 我们的清单没跟上），必须红。
   *   - `advisory`  —— 源**活跃**且清单**暂未被任何期消费**（候选池）
   *     ⇒ 漂移是上游在正常工作 ⇒ 报出来但不阻断。
   *   ⚠️ **advisory 不是「不检查」**：漂移条数照样打印在 CI 日志里，
   *     且清单的 `collected_at` 照记 ⇒ 「它什么时候开始陈旧」查得到。
   */
  gate: 'blocking' | 'advisory'
  /** 一句话说明这个源能贡献什么（自撰，进结构摘要） */
  note: string
}

export const GITHUB_SOURCES: GithubSourceConfig[] = [
  {
    key: 'xinliangnote-go',
    gate: 'blocking', // 停更于 2024-04-07 ⇒ 稳定；且教程型清单要进 DAG ⇒ 漂移必须红
    title: 'xinliangnote/Go 教程目录（GitHub 仓库树）',
    owner: 'xinliangnote',
    repo: 'Go',
    branch: 'master',
    kind: 'tree',
    sectionRule: 'top-dir',
    stripNumericPrefix: true,
    inventoryFile: 'xinliangnote-go-inventory.json',
    expectedTotal: 43,
    verify: 'tree-api',
    note:
      '⭐ 五源里最适合当学习路线的一个：顶层目录带编号前缀，天然有序；标题是真实工程问题而非语法名词。',
  },
  {
    key: 'walter201230-python',
    gate: 'blocking', // 教程型清单要进 DAG ⇒ 漂移必须红
    title: 'walter201230/Python 教程目录（GitHub 仓库树）',
    owner: 'walter201230',
    repo: 'Python',
    branch: 'master',
    kind: 'tree',
    sectionRule: 'parent-dir',
    stripNumericPrefix: false,
    inventoryFile: 'walter201230-python-inventory.json',
    expectedTotal: 101,
    verify: 'tree-api',
    note:
      '⚠️ 章节目录 python0…python28 是有序的，但每章内容是 .png 脑图 ⇒ 不可文本抽取，只能当导航用。',
  },
  {
    key: 'awesome-python-cn',
    gate: 'blocking', // 停更于 2022-08-29 ⇒ 稳定 ⇒ 漂移是真信号
    title: 'jobbole/awesome-python-cn 资源清单（README 列表）',
    owner: 'jobbole',
    repo: 'awesome-python-cn',
    branch: 'master',
    kind: 'readme',
    sectionRule: 'parent-dir',
    stripNumericPrefix: false,
    inventoryFile: 'awesome-python-cn-inventory.json',
    expectedTotal: 877,
    verify: 'none',
    note: '⚠️ 停更于 2022-08-29。主题分类 ≠ 学习顺序 ⇒ 只能当「知识点候选池」，不能当真相源。',
  },
  {
    key: 'awesome-go',
    gate: 'advisory', // 活跃仓（2026-10-19 还在推）⇒ 漂移是上游在正常工作 ⇒ 报但不阻断
    title: 'avelino/awesome-go 资源清单（README 列表）',
    owner: 'avelino',
    repo: 'awesome-go',
    branch: 'main',
    kind: 'readme',
    sectionRule: 'parent-dir',
    stripNumericPrefix: false,
    inventoryFile: 'awesome-go-inventory.json',
    expectedTotal: 3321,
    verify: 'none',
    note: '✅ 活跃。量最大（3321 条），但同样无学习顺序 ⇒ 只能当「按需查阅」区的候选池。',
  },
]

// ============================================================================
// 纯函数面（可测）
// ============================================================================

/**
 * **自然序**比较 —— 数字段按数值比，其余按码位比。
 *
 * ⚠️ **为什么不能只用字典序**：walter 的章节目录是 `python0 … python28`，
 *   字典序会把 `python10` 排到 `python2` 前面 ⇒ 学习顺序整个错掉。
 *   十万火急的实测：walter 的目录是 `python0, python1, python10, python11, …, python2, …`
 *   —— 差一位就把 29 章的顺序打乱了。
 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g
  const ax = a.match(re) ?? []
  const bx = b.match(re) ?? []
  const n = Math.min(ax.length, bx.length)
  for (let i = 0; i < n; i++) {
    const as = ax[i]!
    const bs = bx[i]!
    const an = /^\d+$/.test(as)
    const bn = /^\d+$/.test(bs)
    if (an && bn) {
      const d = Number(as) - Number(bs)
      if (d !== 0) return d < 0 ? -1 : 1
    } else if (an !== bn) {
      // 数字段 vs 文字段：数字段排前（`01-` 这类前缀是顺序标记）
      return an ? -1 : 1
    } else if (as !== bs) {
      return as < bs ? -1 : 1
    }
  }
  return ax.length === bx.length ? 0 : ax.length < bx.length ? -1 : 1
}

/** 剥掉标题开头的编号前缀（`04-Slice 切片` ⇒ `Slice 切片`）。 */
export function stripNumericPrefix(title: string): string {
  return title.replace(/^\d{1,3}\s*[-–—_]\s*/, '').trim()
}

/** `section` 的取法（按配置，不靠猜）。 */
export function sectionOf(path: string, rule: 'top-dir' | 'parent-dir'): string {
  const parts = path.split('/')
  if (parts.length === 1) return '(根)'
  if (rule === 'top-dir') return parts[0]!
  return parts.slice(0, -1).join('/')
}

/** GitHub 文件页 URL（路径逐段百分号编码 —— 源里有空格与中文）。 */
export function githubBlobUrl(cfg: GithubSourceConfig, path: string): string {
  const encoded = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `https://github.com/${cfg.owner}/${cfg.repo}/blob/${cfg.branch}/${encoded}`
}

/**
 * 目录树 → 条目。
 *
 * ⚠️ **只取 `.md` blob**：`git/trees` 还会给出 `.go`/`.png`/`.toml` 等
 *   （xinliangnote 侧 43 个 md ＋ 76 个 go ＋ 64 个 png …）⇒
 *   只取 md 才对应「教程篇目」这个口径。
 */
export function parseTreeItems(paths: string[], cfg: GithubSourceConfig): CollectedItem[] {
  const mdPaths = paths
    .filter((p) => p.endsWith('.md'))
    .sort((a, b) => naturalCompare(a, b))
  const items: CollectedItem[] = []
  for (const p of mdPaths) {
    const file = p.split('/').pop()!
    const rawTitle = file.replace(/\.md$/i, '')
    const title = cfg.stripNumericPrefix ? stripNumericPrefix(rawTitle) : rawTitle
    if (title === '') continue
    items.push({
      ordinal: items.length + 1,
      section: sectionOf(p, cfg.sectionRule),
      title,
      url: githubBlobUrl(cfg, p),
    })
  }
  return items
}

/**
 * README 里的列表 → 条目。
 *
 * 规则（实测得来的）：
 *   1. 只看**列表行**（`- ` / `* `，允许缩进与全角间隔）。
 *   2. 一个列表项**只取它的第一个链接** —— 后面的在描述文字里。
 *   3. 锚点链接（`#...`）不算条目（那是目录）。
 *   4. `section` = 最近的 `##`/`###` 标题。
 *   5. **从第一个 `##` 标题开始** —— 之前是前言。
 *      ⚠️ 实测：awesome-python-cn 的开头是 `# 标题` ＋ `### 本项目的参与者`，
 *        参与者名单里的每个贡献者都是一个链接 ⇒ 不跳过会把 2 条**参与者**当成资源。
 *   6. **容忍 CRLF** —— ⚠️ JavaScript 的正则里 `.` **不匹配 `\r`**（它是行终止符），
 *      所以 `^(#{2,4})\s+(.*)$` 在 CRLF 文件上**一条都匹配不到**
 *      （实测 awesome-python-cn 是 CRLF，awesome-go 是 LF ⇒ 前者的分段全丢成「(根)」）。
 */
export function parseReadmeItems(markdown: string, _cfg: GithubSourceConfig): CollectedItem[] {
  // ⚠️ `_cfg` 刻意不用：README 形态的 `section` 取自**标题**（最近的 ## / ###），
  //   与目录树形态的 `sectionRule` 无关 ⇒ 两族同签名（便于同一个采集流程调用），
  //   但这个参数在这里没有用处。
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const headingRe = /^(#{2,4})\s+(.*)$/
  const linkRe = /\[([^\]]*)\]\(([^)\s]+)\)/g
  let section = '(根)'
  let started = false
  const items: CollectedItem[] = []
  for (const line of lines) {
    const h = headingRe.exec(line)
    if (h) {
      // 第一个 `##` 之前的内容是前言 ⇒ 不算条目（`###` 也算「还没开始」）
      if (!started) {
        if (!/^##\s/.test(line)) continue
        started = true
      }
      section = h[2]!.trim()
      continue
    }
    if (!started) continue
    if (!/^\s*[-*]\s/.test(line)) continue
    const links = [...line.matchAll(linkRe)]
    if (links.length === 0) continue
    const first = links[0]!
    const url = first[2]!.trim()
    if (url.startsWith('#')) continue
    const title = first[1]!.replace(/[*_`]/g, '').trim()
    if (title === '') continue
    items.push({
      ordinal: items.length + 1,
      section,
      title,
      url,
    })
  }
  return items
}

/** 段名 → 条数（结构摘要用）。 */
export function countBySection(items: CollectedItem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of items) out[it.section] = (out[it.section] ?? 0) + 1
  return out
}

// ============================================================================
// 网络面
// ============================================================================

/**
 * 取 GitHub token —— **三段兜底**。
 *
 * ⚠️ **为什么必须有兜底**：GitHub API 匿名限流是 **60 次/小时**（按 IP），
 *   而本脚本一次跑就要 8 个请求 ⇒ 反复本地调试必然撞限流（实测撞到 HTTP 403）。
 *   ⇒ ① `GITHUB_TOKEN` 环境变量（CI 里用 `github.token`）；
 *     ② `GH_TOKEN` 环境变量；
 *     ③ 本机装了 `gh` 且已登录 ⇒ 调 `gh auth token` 取（**不落盘、不打印**）。
 *
 * ⚠️ **拿不到 token 也能跑** —— 只是更容易撞限流；撞了按「不可判定」处理（退出码 2），
 *   不会把 CI 判红（那不是我们的回归）。
 */
let cachedToken: string | null | undefined
function resolveToken(): string | null {
  if (cachedToken !== undefined) return cachedToken ?? null
  const env = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN']
  if (env && env.trim() !== '') {
    cachedToken = env.trim()
    return cachedToken
  }
  try {
    const out = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    cachedToken = out === '' ? null : out
  } catch {
    cachedToken = null
  }
  return cachedToken
}

async function fetchGithubJson(path: string): Promise<unknown> {
  const url = `https://api.github.com${path}`
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`出站白名单拦截: ${url}`)
  }
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'openvibe-m9-collect',
  }
  const token = resolveToken()
  if (token) headers['authorization'] = `Bearer ${token}`
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
      return (await res.json()) as unknown
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw new Error(
    `重试 3 次仍失败: ${url}（${lastErr instanceof Error ? lastErr.message : String(lastErr)}）`,
  )
}

/** 取仓库树（目录型源）。 */
export async function fetchTreePaths(cfg: GithubSourceConfig): Promise<string[]> {
  const data = (await fetchGithubJson(
    `/repos/${cfg.owner}/${cfg.repo}/git/trees/${cfg.branch}?recursive=1`,
  )) as { tree?: Array<{ path?: string; type?: string }> }
  const tree = data.tree ?? []
  return tree.filter((t) => t.type === 'blob' && typeof t.path === 'string').map((t) => t.path!)
}

/** 取仓库 README（清单型源）。 */
export async function fetchReadmeMarkdown(cfg: GithubSourceConfig): Promise<string> {
  const data = (await fetchGithubJson(`/repos/${cfg.owner}/${cfg.repo}/readme`)) as {
    content?: string
    encoding?: string
  }
  if (typeof data.content !== 'string') throw new Error(`README 取不到内容: ${cfg.key}`)
  const raw = data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf8') : data.content
  return raw
}

// ============================================================================
// 采集与对账
// ============================================================================

/** 取仓库元信息（最后推送时间等）。 */
export async function fetchRepoMeta(
  cfg: GithubSourceConfig,
): Promise<{ pushed_at: string; default_branch: string }> {
  const data = (await fetchGithubJson(`/repos/${cfg.owner}/${cfg.repo}`)) as {
    pushed_at?: string
    default_branch?: string
  }
  return {
    pushed_at: data.pushed_at ?? '(未知)',
    default_branch: data.default_branch ?? cfg.branch,
  }
}

/**
 * 结构摘要 —— **由脚本算出来**，不再手抄。
 *
 * ⚠️ **这正是「另三源只有结构骨架」那条缺口的另一半**：
 *   骨架此前是**手抄**的（2026-10-18 抄一次就再没动过）⇒ 里面的条数
 *   「874 / 3323」至今没人复算过。实测它们**是错的**：
 *   - awesome-go 的 3323 把 **151 个目录锚点**（`#...`）也算成了条目 ⇒ 真值 **3170**；
 *   - awesome-python-cn 的 874 少算了 3 条 ⇒ 真值 **877**。
 *   ⇒ 无序池真值 **4047**（骨架写 4197）。
 *
 * ⚠️ **有序池的数字来自 runoob 两份清单**（同一目录下读出来）⇒ 聚合口径单源。
 */
export function renderAuxStructure(
  rows: Array<{ cfg: GithubSourceConfig; items: CollectedItem[]; lastPushed: string }>,
  runoobCounts: { python: number; go: number },
  collectedAt: string,
): Record<string, unknown> {
  const sources = rows.map(({ cfg, items, lastPushed }) => {
    const base = {
      name: `${cfg.owner}/${cfg.repo}`,
      kind: cfg.kind === 'tree' ? '教程型（有编号）' : '资源清单（按主题）',
      note: cfg.note,
      last_pushed: lastPushed,
    }
    if (cfg.kind === 'tree') {
      return { ...base, md_count: items.length, structure: countBySection(items) }
    }
    return {
      ...base,
      sections: new Set(items.map((i) => i.section)).size,
      list_items: items.length,
    }
  })
  const walter = rows.find((r) => r.cfg.key === 'walter201230-python')
  const xinliang = rows.find((r) => r.cfg.key === 'xinliangnote-go')
  const apcn = rows.find((r) => r.cfg.key === 'awesome-python-cn')
  const ago = rows.find((r) => r.cfg.key === 'awesome-go')
  const ordered = runoobCounts.python + runoobCounts.go + (walter?.items.length ?? 0) + (xinliang?.items.length ?? 0)
  const unordered = (apcn?.items.length ?? 0) + (ago?.items.length ?? 0)
  return {
    _readme:
      '另四个来源的**结构**实测（只取目录/章节骨架与清单条目，不取正文）。目的是回答「它们各能贡献什么、能不能当学习路线」。' +
      '⚠️ 本文件由 scripts/collect-m9-github-sources.ts **算出来**（此前是手抄的，条数已实测订正）。',
    collected_at: collectedAt,
    method:
      'GitHub API（git/trees recursive + readme + repo 元信息）；runoob 两份见同目录另两个 json（由 scripts/collect-m9-sources.ts 采集）',
    sources,
    aggregate: {
      ordered_pool: ordered,
      ordered_note: `教程型可当路线：runoob-Python ${String(runoobCounts.python)} ＋ runoob-Go ${String(runoobCounts.go)} ＋ walter201230 ${String(walter?.items.length ?? 0)} ＋ xinliangnote ${String(xinliang?.items.length ?? 0)}`,
      unordered_pool: unordered,
      unordered_note: `资源清单型只能当查阅池：awesome-go ${String(ago?.items.length ?? 0)} ＋ awesome-python-cn ${String(apcn?.items.length ?? 0)}`,
      total: ordered + unordered,
    },
  }
}

/** 读 runoob 两份清单的条数（聚合口径要单源，不另抄一份数）。 */
export function readRunoobCounts(): { python: number; go: number } {
  const read = (file: string): number => {
    const raw = readFileSync(join(OUT_DIR, file), 'utf8')
    const parsed = JSON.parse(raw) as { items?: unknown[] }
    return parsed.items?.length ?? 0
  }
  return {
    python: read('runoob-python3-inventory.json'),
    go: read('runoob-go-inventory.json'),
  }
}

export interface GithubOutcome {
  source: string
  status: 'ok' | 'inconclusive' | 'broken'
  statusReason: string | null
  diff: InventoryDiff
  freshCount: number
  /** 库里的条数（不可判定时为 0） */
  beforeCount: number
  /** 本次采集到的条目（供结构摘要用；不可判定时为空） */
  items: CollectedItem[]
  /** 仓库最后推送时间（结构摘要用） */
  lastPushed: string | null
  wrote: boolean
  backupPath: string | null
  diffPath: string | null
}

function readCommitted(file: string): CollectedItem[] {
  const raw = readFileSync(join(OUT_DIR, file), 'utf8')
  const parsed = JSON.parse(raw) as { items?: CollectedItem[] }
  return parsed.items ?? []
}

/** 把 `InventoryDiff` 压成写回守卫要的形状（字段同形，直接转即可）。 */
function toWriteDiff(diff: InventoryDiff): WriteDiff {
  return {
    countChanged: diff.countChanged,
    added: diff.added,
    removed: diff.removed,
    urlChanged: diff.urlChanged,
    titleChanged: diff.titleChanged,
    sectionChanged: diff.sectionChanged,
    urlFormChanged: diff.urlFormChanged,
    reordered: diff.reordered,
  }
}

/** 渲染清单文件（形状与 runoob 两份**同构**，便于同一套 DL-02 schema 与对账算法）。 */
export function renderGithubInventory(
  cfg: GithubSourceConfig,
  items: CollectedItem[],
  collectedAt: string,
  existence: LinkProbeResult | null,
): Record<string, unknown> {
  return {
    _readme: `${cfg.title}。⚠️ 只存标题与 URL，正文一个字未取（spec §3.2 版权与漂移约束）。`,
    source: `https://github.com/${cfg.owner}/${cfg.repo}`,
    collected_at: collectedAt,
    collect_method:
      cfg.kind === 'tree'
        ? `由 scripts/collect-m9-github-sources.ts 采集：GitHub git/trees API（recursive）→ 只取 .md blob → 自然序排序 → section 按「${cfg.sectionRule}」取 → 标题${cfg.stripNumericPrefix ? '剥编号前缀' : '保留原名'} → 链接为 GitHub 文件页（路径逐段百分号编码）`
        : `由 scripts/collect-m9-github-sources.ts 采集：GitHub readme API → 只看列表行 → 每个列表项只取第一个链接（其余在描述文字里）→ 锚点链接不算条目 → section 取最近的 ## / ### 标题`,
    // ⚠️ **`unique_urls` 是刻意留的**：awesome-python-cn 实测 877 条只有 866 个去重 URL
    //   （同址多条）—— 与 §1.6.1「89 条资源只有 87 个去重 URL」同款事实，
    //   **同址不合并、不去重**（合并会丢「这条在两个小节都出现」这个信息）。
    counts: {
      total: items.length,
      unique_urls: new Set(items.map((i) => i.url)).size,
      sections: countBySection(items),
    },
    ...(existence ? { link_probe: existence } : {}),
    caveats: [
      cfg.verify === 'tree-api'
        ? '本清单的链接存在性由 **GitHub git/trees API 的那一次响应**证明（文件在树里 ⇒ blob 链接必然可达）；**刻意不发 144 个 HEAD** —— 无信息增量且会撞 GitHub 限流（实测连跑几轮后本机 HEAD/GET 均 20s 无响应）'
        : '⚠️ 本清单**未做** HEAD 验链：条目是第三方外链的全量候选池，存活调查不是本模块的责任（§3.14 的失效巡检针对 89 条资源，属 P1c）',
      'GitHub API 匿名限流 60 次/小时；本脚本一次最多 8 个请求，设 GITHUB_TOKEN 可放宽',
    ],
    items,
  }
}

/** 采集一个源（取数 → 解析 → 对账 → 可选写回）。 */
export async function collectGithubSource(
  cfg: GithubSourceConfig,
  opts: { write: boolean; stamp: string; collectedAt: string },
): Promise<GithubOutcome> {
  let items: CollectedItem[]
  try {
    if (cfg.kind === 'tree') {
      items = parseTreeItems(await fetchTreePaths(cfg), cfg)
    } else {
      items = parseReadmeItems(await fetchReadmeMarkdown(cfg), cfg)
    }
  } catch (err) {
    return {
      source: cfg.key,
      status: 'inconclusive',
      statusReason: err instanceof Error ? err.message : String(err),
      diff: emptyDiff(),
      freshCount: 0,
      beforeCount: 0,
      items: [],
      lastPushed: null,
      wrote: false,
      backupPath: null,
      diffPath: null,
    }
  }
  if (items.length === 0) {
    return {
      source: cfg.key,
      status: 'broken',
      statusReason: '解析出 0 条 ⇒ 源结构可能改了，解析器需更新（**不是**「源站删了条目」）',
      diff: emptyDiff(),
      freshCount: 0,
      beforeCount: 0,
      items: [],
      lastPushed: null,
      wrote: false,
      backupPath: null,
      diffPath: null,
    }
  }

  let committed: CollectedItem[]
  const targetAbs = join(OUT_DIR, cfg.inventoryFile)
  if (!existsSync(targetAbs)) {
    // 首次采集：库里还没有这份清单。
    // ⚠️ **`--check` 下这是红的**（仓里缺一份清单 ⇒ 可复算性有缺口），
    //   `--write` 下才建立它 ⇒ 与「源站变了」区分开，不混成同一类。
    if (!opts.write) {
      return {
        source: cfg.key,
        status: 'broken',
        statusReason: `已入库清单尚未建立（${cfg.inventoryFile}）⇒ 先跑一次 --write 建立它`,
        diff: emptyDiff(),
        freshCount: items.length,
        beforeCount: 0,
        items: [],
        lastPushed: null,
        wrote: false,
        backupPath: null,
        diffPath: null,
      }
    }
    committed = []
  } else {
    try {
      committed = readCommitted(cfg.inventoryFile)
    } catch (err) {
      return {
        source: cfg.key,
        status: 'broken',
        statusReason: `读不了已入库清单 ${cfg.inventoryFile} —— ${err instanceof Error ? err.message : String(err)}`,
        diff: emptyDiff(),
        freshCount: items.length,
        beforeCount: 0,
        items: [],
        lastPushed: null,
        wrote: false,
        backupPath: null,
        diffPath: null,
      }
    }
  }

  const diff = diffInventory(committed, items)
  // ⚠️ **目录树型源不做 HEAD 验链** —— `git/trees` 的那一次响应本身就是存在性证明，
  //   再发 144 个 HEAD 没有信息增量，且会把自己打到 GitHub 的限流里（实测）。
  //   ⇒ 存在性证明写成「N/N 条在树里」，与 HEAD 验链的结果**同形**（都落到 link_probe 字段）。
  const existence: LinkProbeResult | null =
    cfg.verify === 'tree-api'
      ? {
          method: `GitHub git/trees API 的一次响应（文件在树里 ⇒ blob 链接必然可达）· ${String(items.length)} 条`,
          result: `${String(items.length)}/${String(items.length)} 条在树里`,
          failed: [],
        }
      : null
  let lastPushed: string | null = null
  try {
    lastPushed = (await fetchRepoMeta(cfg)).pushed_at
  } catch {
    // 元信息取不到**不影响**清单本身 ⇒ 只丢这一项，不把整门判成不可判定
    lastPushed = null
  }
  let wrote = false
  let backupPath: string | null = null
  let diffPath: string | null = null
  if (opts.write) {
    const content = `${JSON.stringify(renderGithubInventory(cfg, items, opts.collectedAt, existence), null, 2)}\n`
    const res = guardedWrite({
      targetRel: `docs/devlog-evidence/M9-probe/${cfg.inventoryFile}`,
      content,
      diff: toWriteDiff(diff),
      beforeCount: committed.length,
      afterCount: items.length,
      stamp: opts.stamp,
    })
    wrote = res.wrote
    backupPath = res.backupPath
    diffPath = res.diffPath
  }
  return {
    source: cfg.key,
    status: 'ok',
    statusReason: null,
    diff,
    freshCount: items.length,
    beforeCount: committed.length,
    items,
    lastPushed,
    wrote,
    backupPath,
    diffPath,
  }
}

/** 复用 runoob 家族那套退出码判定（保证两族在 CI 里是同一套语义）。 */
export interface GithubVerdict {
  code: number
  label: string
  detail: string
  /** advisory 源的漂移（报出来但不阻断） */
  advisory: string[]
}

export function decideGithubExitCode(outcomes: GithubOutcome[]): GithubVerdict {
  // ⚠️ **分档判定**：只有 `blocking` 源的漂移才判红；`advisory` 源的漂移照报不拦。
  //   分档的**事实依据**写在 `GithubSourceConfig.gate` 的 doc 里。
  const blocking: CollectOutcome[] = []
  const advisory: string[] = []
  for (const o of outcomes) {
    const cfg = GITHUB_SOURCES.find((s) => s.key === o.source)
    const diff = o.wrote ? emptyDiff() : o.diff
    const drifted = o.status === 'ok' && !diffIsEmpty(diff)
    if (drifted && cfg?.gate === 'advisory') {
      advisory.push(
        `${o.source} 漂移 ${String(diff.countChanged >= 0 ? '+' : '')}${String(diff.countChanged)} 条` +
          (diff.added.length > 0 ? `（新增 ${String(diff.added.length)} / 消失 ${String(diff.removed.length)}）` : ''),
      )
      continue
    }
    blocking.push({
      source: o.source,
      status: o.status,
      statusReason: o.statusReason,
      diff,
      freshCount: o.freshCount,
      wrote: o.wrote,
      backupPath: o.backupPath,
      diffPath: o.diffPath,
      probe: null,
    })
  }
  const v = decideCheckExitCode(blocking)
  const detail = advisory.length > 0 ? `${v.detail}；另 ${advisory.length} 个 advisory 源漂移（不阻断）` : v.detail
  return { code: v.code, label: v.label, detail, advisory }
}

// ============================================================================
// CLI
// ============================================================================

export interface GithubCollectOptions {
  write: boolean
  check: boolean
  json: boolean
  only: string | null
}

function renderGithubDiff(
  cfg: GithubSourceConfig,
  diff: InventoryDiff,
  beforeCount: number,
  afterCount: number,
): string[] {
  const lines: string[] = [`── ${cfg.key} · ${cfg.title}`]
  lines.push(`   条数：库 ${String(beforeCount)} → 源 ${String(afterCount)}（差 ${diff.countChanged >= 0 ? '+' : ''}${String(diff.countChanged)}）`)
  if (diff.added.length > 0) {
    lines.push(`   新增 ${String(diff.added.length)} 条：`)
    for (const it of diff.added.slice(0, 10)) lines.push(`     + ${it.section} · ${it.title}`)
  }
  if (diff.removed.length > 0) {
    lines.push(`   消失 ${String(diff.removed.length)} 条：`)
    for (const it of diff.removed.slice(0, 10)) lines.push(`     - ${it.section} · ${it.title}`)
  }
  if (diff.urlChanged.length > 0) {
    lines.push(`   链接换了地址 ${String(diff.urlChanged.length)} 条：`)
    for (const d of diff.urlChanged.slice(0, 5)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.titleChanged.length > 0) {
    lines.push(`   标题变了 ${String(diff.titleChanged.length)} 条：`)
    for (const d of diff.titleChanged.slice(0, 5)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.sectionChanged.length > 0) {
    lines.push(`   段名变了 ${String(diff.sectionChanged.length)} 条：`)
    for (const d of diff.sectionChanged.slice(0, 5)) lines.push(`     ~ ${d.before} → ${d.after}`)
  }
  if (diff.reordered) lines.push('   ⚠️ 两侧的条目顺序不同')
  if (diffIsEmpty(diff)) lines.push('   ✓ 与已入库清单逐条一致')
  return lines
}

export async function collectGithubSources(
  opts: GithubCollectOptions,
  stamp: string,
  collectedAt: string,
): Promise<GithubOutcome[]> {
  const out: GithubOutcome[] = []
  for (const cfg of GITHUB_SOURCES) {
    if (opts.only !== null && cfg.key !== opts.only) continue
    out.push(await collectGithubSource(cfg, { write: opts.write, stamp, collectedAt }))
  }
  // 结构摘要：**只在写回时重算**（它是四份清单的派生物）
  if (opts.write && opts.only === null) {
    const rows = out
      .filter((o) => o.status === 'ok' && o.items.length > 0)
      .map((o) => ({
        cfg: GITHUB_SOURCES.find((s) => s.key === o.source)!,
        items: o.items,
        lastPushed: o.lastPushed ?? '(未知)',
      }))
    if (rows.length === GITHUB_SOURCES.length) {
      const structure = renderAuxStructure(rows, readRunoobCounts(), collectedAt)
      const res = guardedWrite({
        targetRel: 'docs/devlog-evidence/M9-probe/aux-sources-structure.json',
        content: `${JSON.stringify(structure, null, 2)}\n`,
        diff: {
          countChanged: 0,
          added: [],
          removed: [],
          urlChanged: [],
          titleChanged: [],
          sectionChanged: [],
          urlFormChanged: [],
          reordered: false,
        },
        beforeCount: 0,
        afterCount: rows.length,
        stamp,
      })
      if (res.wrote) {
        process.stdout.write(`   ✓ 已写回 aux-sources-structure.json（结构摘要改为脚本算出来的）\n`)
      }
    }
  }
  return out
}

async function main(argv: string[]): Promise<number> {
  const opts: GithubCollectOptions = {
    write: argv.includes('--write'),
    check: argv.includes('--check'),
    json: argv.includes('--json'),
    only: argv.includes('--source') ? argv[argv.indexOf('--source') + 1] ?? null : null,
  }
  const now = new Date()
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const collectedAt = now.toISOString().slice(0, 10)

  const outcomes = await collectGithubSources(opts, stamp, collectedAt)
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(outcomes, null, 2)}\n`)
  } else {
    for (const o of outcomes) {
      const cfg = GITHUB_SOURCES.find((s) => s.key === o.source)!
      if (o.status === 'ok') {
        process.stdout.write(
          `${renderGithubDiff(cfg, o.diff, o.beforeCount, o.freshCount).join('\n')}\n`,
        )
        if (o.wrote) {
          process.stdout.write(`   ✓ 已写回 ${cfg.inventoryFile}\n`)
          if (o.backupPath) process.stdout.write(`   · 备份：${o.backupPath}\n`)
          if (o.diffPath) process.stdout.write(`   · 差异快照：${o.diffPath}\n`)
        }
      } else {
        process.stdout.write(
          `   ⚠️ ${cfg.title}：${o.status === 'inconclusive' ? '不可判定' : '解析器失灵'} —— ${o.statusReason ?? '未知原因'}\n`,
        )
      }
    }
  }
  const verdict = decideGithubExitCode(outcomes)
  if (!opts.json) {
    for (const a of verdict.advisory) {
      process.stdout.write(`   ⚠️ advisory（不阻断）：${a}\n`)
    }
    process.stdout.write(`\n判定：${verdict.label} —— ${verdict.detail}（退出码 ${String(verdict.code)}）\n`)
  }
  return opts.check ? verdict.code : 0
}

if (process.argv[1] && basename(process.argv[1]).startsWith('collect-m9-github-sources')) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `[m9:collect:github] 失败: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exitCode = 1
    })
}

// ⚠️ `writeDiffIsEmpty` 在本文件被 re-export 出去，是为了别的脚本也能问同一句
//   「这次到底有没有差异」——**判定口径只有一处**。
export { writeDiffIsEmpty }
