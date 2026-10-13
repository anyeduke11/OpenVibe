import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  openDatabase,
  TermsRepo,
  type SqliteDatabase,
} from '@openvibe/core'
import type { TermCreateInput } from '@openvibe/shared'

/**
 * vibe-hub.org 术语导入（DEV-0075）：把 vibe-hub.org「Vibe Coding 术语图鉴」全量词条
 * 结构化纳入术语库——8 大主题 × 子分类作为 tags（结构浏览），tagline/description 作定义，
 * usage（场景/该用/别用）与 boundary 作示例，distinctions/related/prereq/next 课时链接
 * 解析为 related_term_ids 双向关联（知识图谱）。
 *
 * 数据源：站点公开 agent API（/.well-known/vibehub.json 清单 → /api/agent/v1/lessons/{id}），
 * 词条 id = sitemap 里的单段路径 slug。
 *
 * 出站约束：仅 https、host 固定白名单（vibe-hub.org）、单请求 15s 超时、失败重试 2 次。
 *
 * 用法：
 *   npx tsx scripts/import-vibehub.ts --db ~/.openvibe/data/openvibe.db [--dry-run] [--limit N]
 */

const SITE = 'https://vibe-hub.org'
const API = `${SITE}/api/agent/v1`
const CONCURRENCY = 6
const TIMEOUT_MS = 15_000
/** 站点上非词条路径（sitemap 里会出现） */
const NON_TERM_PATHS = new Set(['', 'en', 'practice', 'courses', 'anti-ai-flavor', 'changelog', 'vibehub-skill'])
/**
 * 标签别名表（改名韧性，DEV-0077）：vibe-hub 站方改子分类名时，在这里加一条
 * `{ "站方新名": "规范路线组名" }`（规范组名见 packages/shared/src/roadmap.ts），
 * 导入即自动归位；未命中别名也未命中路线组的标签会打印报告。
 */
const ALIAS_FILE = join(process.cwd(), 'content', 'term-tag-aliases.json')

interface Args {
  db: string
  dryRun: boolean
  limit?: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (key: string): string | undefined => {
    const i = argv.indexOf(`--${key}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const db = get('db')
  if (db === undefined || db === '') {
    console.error('用法：npx tsx scripts/import-vibehub.ts --db <sqlite 路径> [--dry-run] [--limit N]')
    process.exit(2)
  }
  const limitRaw = get('limit')
  return {
    db,
    dryRun: argv.includes('--dry-run'),
    limit: limitRaw === undefined ? undefined : Number(limitRaw),
  }
}

async function fetchText(url: string): Promise<string> {
  if (new URL(url).protocol !== 'https:' || new URL(url).hostname !== 'vibe-hub.org') {
    throw new Error(`出站白名单拦截: ${url}`)
  }
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw new Error(`重试 3 次仍失败: ${url}（${lastErr instanceof Error ? lastErr.message : String(lastErr)}）`)
}

async function fetchJson<T>(url: string): Promise<T> {
  const raw = await fetchText(url)
  const payload = JSON.parse(raw) as { data?: T }
  if (payload.data === undefined) throw new Error(`响应缺 data: ${url}`)
  return payload.data
}

interface Lesson {
  id: string
  title: string
  secondaryTitle: string | null
  category: string
  macroCategory: string
  tagline: string
  aliases?: string[]
  description?: string
  explanation?: string
  distinctions?: { label: string; explanation: string; target?: { id: string; title: string } }[]
  usage?: { use?: string[]; avoid?: string[]; scenarios?: string[] }
  boundary?: string | null
  relatedLessons?: { id?: string; title?: string }[]
  nextLessons?: { id?: string; title?: string }[]
  prerequisiteLessons?: { id?: string; title?: string }[]
}

/** sitemap → 词条 slug 清单（单段路径，排除已知非词条与 /en 镜像） */
function slugsFromSitemap(xml: string): string[] {
  const slugs = new Set<string>()
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1]
    if (url === undefined) continue
    if (url.includes('/en') || !url.startsWith(`${SITE}/`)) continue
    const path = url.slice(SITE.length + 1).replace(/\/$/, '')
    if (path.includes('/')) continue // topics/... 等多段路径
    if (NON_TERM_PATHS.has(path)) continue
    slugs.add(path)
  }
  return [...slugs].sort()
}

async function mapWithConcurrency<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (item === undefined) continue
      results[index] = await fn(item)
    }
  })
  await Promise.all(workers)
  return results
}

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8')
const clip = (s: string, max: number): string =>
  bytes(s) <= max ? s : s.slice(0, Math.max(0, max - 1)) + '…'

/** 路线组的全集（roadmap.ts 的组名平铺）；别名表的目标必须是其中之一 */
const ROADMAP_GROUPS: ReadonlySet<string> = new Set([
  '基础概念', '方法论', '工具平台', '质量工程', '协作流程', '风险陷阱', '提示工程', '数据与存储',
  '网页基础', '按钮与链接', '表单', '内容展示', '弹窗与提示', '导航', '官网区块', '页面布局',
  'CSS 布局', '文字', '外观', '动画', '鼠标',
  '网络与地址', '接口与数据', '数据库', '后端开发', '账号与权限', '上线与排错',
  '用户与需求', '产品规划', '数据与验证', '测试',
  '开发工具', '技术栈', '编程语言', '前端框架', 'CSS 与组件',
  'AI 基础', '上下文', '请求与输出', 'Agent 与工具', '连接与配置', '规则与扩展', '权限与运行', '性能与成本',
  'Git', '设计风格',
])

function loadTagAliases(): Record<string, string> {
  if (!existsSync(ALIAS_FILE)) return {}
  try {
    const parsed = JSON.parse(readFileSync(ALIAS_FILE, 'utf8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [raw, canonical] of Object.entries(parsed)) {
      if (typeof canonical === 'string' && ROADMAP_GROUPS.has(canonical)) out[raw] = canonical
    }
    return out
  } catch {
    console.log('    ⚠ 别名表解析失败，忽略（content/term-tag-aliases.json）')
    return {}
  }
}

function lessonToInput(l: Lesson, aliases: Record<string, string>, unknownTags: Set<string>): TermCreateInput {
  const defParts = [l.tagline, l.description, l.explanation].filter(
    (x): x is string => typeof x === 'string' && x.trim() !== '',
  )
  const definition = clip(defParts.join('\n\n'), 4 * 1024)

  const exParts: string[] = []
  const usage = l.usage ?? {}
  if (usage.scenarios?.length) exParts.push(`典型场景：${usage.scenarios.join('；')}`)
  if (usage.use?.length) exParts.push(`该用：${usage.use.join('；')}`)
  if (usage.avoid?.length) exParts.push(`别用：${usage.avoid.join('；')}`)
  if (l.boundary && l.boundary.trim() !== '') exParts.push(`边界：${l.boundary}`)
  for (const d of l.distinctions ?? []) {
    if (d.label && d.explanation) exParts.push(`对比 ${d.label}：${d.explanation}`)
  }
  const example = clip(exParts.join('\n'), 2 * 1024)

  // 标签归一：原始 tags 先过别名表；仍不在路线组的标签计入「未识别」报告（词条照常导入，
  // 只是标签不命中路线视图的站/组——用页内「归组」或补别名表后重导修正）
  const rawTags = [l.macroCategory, l.category].filter((t) => typeof t === 'string' && t.trim() !== '')
  const tags = rawTags
    .map((t) => aliases[t] ?? t)
    .filter((t) => {
      if (ROADMAP_GROUPS.has(t)) return true
      unknownTags.add(t)
      return false
    })

  return {
    zh: clip(l.title, 100),
    en: l.secondaryTitle ? clip(l.secondaryTitle, 100) : undefined,
    aliases: (l.aliases ?? []).filter((a) => a.trim() !== ''),
    definition,
    example,
    relatedTermIds: [],
    source: 'vibe-hub',
    tags,
    status: 'active',
  }
}

/** 目标引用（distinctions/related/next/prereq）→ 其他词条名（用于关联解析） */
function lessonTargets(l: Lesson): { id?: string; title?: string }[] {
  const out: { id?: string; title?: string }[] = []
  for (const d of l.distinctions ?? []) if (d.target) out.push(d.target)
  for (const group of [l.relatedLessons, l.nextLessons, l.prerequisiteLessons]) {
    for (const t of group ?? []) if (t) out.push(t)
  }
  return out
}

async function main() {
  const args = parseArgs()
  if (!existsSync(args.db)) {
    console.error(`DB 不存在: ${args.db}`)
    process.exit(2)
  }
  const db: SqliteDatabase = openDatabase(args.db)
  const repo = new TermsRepo(db)

  console.log(`[1/4] 拉取 sitemap …`)
  const sitemap = await fetchText(`${SITE}/sitemap.xml`)
  const allSlugs = slugsFromSitemap(sitemap)
  const slugs = args.limit === undefined ? allSlugs : allSlugs.slice(0, args.limit)
  console.log(`    词条 slug ${String(allSlugs.length)} 个${args.limit === undefined ? '' : `（本次取前 ${String(slugs.length)}）`}`)

  console.log(`[2/4] 拉取 lesson 详情（并发 ${String(CONCURRENCY)}）…`)
  const lessons: Lesson[] = []
  const failed: string[] = []
  await mapWithConcurrency(slugs, CONCURRENCY, async (slug) => {
    try {
      lessons.push(await fetchJson<Lesson>(`${API}/lessons/${encodeURIComponent(slug)}`))
    } catch (e) {
      failed.push(`${slug}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  console.log(`    详情 ${String(lessons.length)} 成功 / ${String(failed.length)} 失败`)
  if (failed.length > 0) failed.slice(0, 5).forEach((f) => console.log(`    失败样例 ${f}`))

  console.log(`[3/4] 去重与映射 …`)
  const existing = repo.list()
  const existingKeys = new Set<string>()
  for (const t of existing) {
    if (t.zh) existingKeys.add(`zh:${t.zh.toLowerCase()}`)
    if (t.en) existingKeys.add(`en:${t.en.toLowerCase()}`)
  }
  const tagAliases = loadTagAliases()
  const unknownTags = new Set<string>()
  const seenNew = new Set<string>()
  const pending: { slug: string; input: TermCreateInput; lesson: Lesson }[] = []
  let dupCount = 0
  for (const lesson of lessons) {
    const zhKey = `zh:${lesson.title.toLowerCase()}`
    const enKey = lesson.secondaryTitle ? `en:${lesson.secondaryTitle.toLowerCase()}` : null
    if (existingKeys.has(zhKey) || (enKey !== null && existingKeys.has(enKey)) || seenNew.has(zhKey)) {
      dupCount += 1
      continue
    }
    seenNew.add(zhKey)
    pending.push({ slug: lesson.id, input: lessonToInput(lesson, tagAliases, unknownTags), lesson })
  }
  console.log(`    新词条 ${String(pending.length)}，与现有 ${String(existing.length)} 条去重命中 ${String(dupCount)}`)
  if (unknownTags.size > 0) {
    console.log(
      `    ⚠ 未识别标签 ${String(unknownTags.size)} 个（词条已导入但不命中学习路线，页内可归组；或加入 ${ALIAS_FILE} 后重导）：`,
    )
    ;[...unknownTags].slice(0, 10).forEach((t) => console.log(`      - ${t}`))
  }

  if (args.dryRun) {
    pending.slice(0, 8).forEach((p) => {
      console.log(`  · ${p.input.zh}（${p.input.en ?? '—'}）[${(p.input.tags ?? []).join('/')}] def=${String(bytes(p.input.definition))}B`)
    })
    console.log(`  dry-run 结束，未写库。`)
    return
  }

  console.log(`[4/4] 写库与知识关联 …`)
  const slugToId = new Map<string, string>()
  const titleToId = new Map<string, string>()
  for (const t of existing) {
    if (t.zh) titleToId.set(t.zh, t.id)
    if (t.en) titleToId.set(t.en, t.id)
  }
  let created = 0
  for (const p of pending) {
    const out = repo.create(p.input)
    slugToId.set(p.slug, out.id)
    titleToId.set(out.zh ?? p.input.en ?? p.slug, out.id)
    created += 1
  }

  // 知识关联：distinctions/related/next/prereq → 双向 related_term_ids
  let links = 0
  for (const p of pending) {
    const selfId = slugToId.get(p.slug)
    if (selfId === undefined) continue
    for (const target of lessonTargets(p.lesson)) {
      let targetId: string | undefined
      if (target.id !== undefined) {
        targetId = slugToId.get(target.id) ?? titleToId.get(target.title ?? '')
      } else if (target.title !== undefined) {
        targetId = titleToId.get(target.title)
      }
      if (targetId === undefined || targetId === selfId) continue
      const a = repo.get(selfId)
      const b = repo.get(targetId)
      if (a === null || b === null) continue
      if (a.relatedTermIds.includes(targetId)) continue
      repo.update(selfId, { relatedTermIds: [...a.relatedTermIds, targetId] })
      repo.update(targetId, { relatedTermIds: [...b.relatedTermIds, selfId] })
      links += 1
    }
  }

  console.log(
    `完成：新建 ${String(created)} 词条（source=vibe-hub, status=active）· 双向关联 ${String(links)} 条 · 去重跳过 ${String(dupCount)} · 拉取失败 ${String(failed.length)}`,
  )
  db.close()
}

await main()
