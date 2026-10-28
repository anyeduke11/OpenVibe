/**
 * `scripts/m9-content-fingerprint.ts` —— M9 v1.6「**内容指纹**」
 * （`m9-dev-language-roadmap.md` §3.2 · DL-01 / DL-02 ＋ `m9-dev-plan-2026-10.md` §6.2）
 *
 * ## 它补的是什么
 *
 * 采集脚本里的验链是 **HEAD** —— 只验「**可达**」，不验「**内容未变**」。
 * ⇒ 一篇教程被改写了（标题没变、链接没变、还是 200），我们**察觉不到**。
 *
 * 本脚本把「内容未变」变成**可复算**的一条：取教程页的**正文区** ⇒ 归一化 ⇒ SHA-256，
 * 把摘要记进仓。仓里那一份是**某个日期的快照**；重跑就能知道「哪几篇变了、什么时候变的」。
 *
 * ## ⚠️ §3.2 的灰区 —— 如实登记，不藏
 *
 * spec §3.2 写的是「**只存链接不存正文**」。本脚本：
 *
 * - **读了**正文（不然算不出指纹）⇒ 触碰「正文抽取器」这条禁令；
 * - **没存**正文 ⇒ 仓里只有 **64 位十六进制摘要**。
 *
 * ⇒ 这落在「只存链接不存正文」与「可复算」两条之间的**灰区**，处置是：
 *   1. 脚本**显式登记**在 DL-02 扫描器的 `HASH_ONLY_SCRIPTS` 里（**不是偷偷绕开**）；
 *   2. 产物**仍在外部源派生层** ⇒ 受全部 JSON 规则约束；
 *   3. 产物的**字段闭集**只有 `url` / `sha256` / `bytes` ⇒ **正文没有字段可放**；
 *   4. 扫描器另有一条 **`sha256` 必须是 64 位十六进制**的规则
 *      ⇒ 就算有人把正文塞进 `sha256`，也不是 hex ⇒ 报红。
 *
 * ## 正文区怎么取（实测得来的）
 *
 * runoob 的教程页结构（实测）：
 * ```
 * <div class="article">
 *   <div class="previous-next-links">…</div>   ← 上一/下一篇
 *   <div class="article-heading-ad">…</div>    ← 广告
 *   <div class="article-body">                 ← ★ 正文区（h1 + 简介 + 各级小节 + 代码示例）
 *   </div>
 *   <div class="sidebar-box"><div class="responsive_ad1">…</div></div>  ← 广告与侧栏
 *   …评论…
 * </div>
 * ```
 * ⇒ 取 `class="article-body"` 的**配对** `</div>`（按嵌套深度数，不是第一个 `</div>`）。
 *
 * ⚠️ **实测：正文区里没有广告也没有评论**（118 篇全量查过；唯一的「噪声」是教程正文里
 *   自己的「下载」字样）。⇒ **不需要**维护一份噪声名单 ⇒ 也就不会因为广告轮换而永远红。
 *   验稳定性的办法：连跑两次比摘要，实测 **0 条差异**。
 *
 * ## 用法
 *
 * ```
 * pnpm m9:fingerprint              # 算指纹 + 与已入库对账 + 打印差异（退出码 0）
 * pnpm m9:fingerprint -- --check   # 有内容变化时退出码 1（供 CI 用）
 * pnpm m9:fingerprint -- --write   # 写回指纹文件（**写前备份 ＋ 差异快照**）
 * ```
 *
 * 退出码与采集脚本同一套：`0` 一致 · `1` 内容变了（该刷新）· `2` 不可判定（网络）。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardedWrite } from './m9-write-guard'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'devlog-evidence', 'M9-probe')
const OUT_FILE = 'runoob-content-fingerprints.json'

/** 出站白名单 —— 只有 runoob。 */
const ALLOWED_HOSTS = new Set(['www.runoob.com'])

/** 并发与超时。 */
const CONCURRENCY = 4
const TIMEOUT_MS = 20000

/** 正文区的容器（实测 runoob 的结构）。 */
const CONTENT_REGION_CLASS = 'article-body'

// ============================================================================
// 纯函数面（可测）
// ============================================================================

/**
 * 取出正文区 —— **配对**的 `</div>`，按嵌套深度数。
 *
 * ⚠️ **不能取第一个 `</div>`** —— 正文区里嵌套着 `article-intro` / `tutintro` /
 *   `example` / `example_code` 等多层 div ⇒ 第一个 `</div>` 会把正文砍掉一大半。
 *
 * @returns 正文区 HTML；页面里没有该容器时返回 null
 */
export function extractContentRegion(html: string): string | null {
  const m = new RegExp(`<div[^>]*class="[^"]*${CONTENT_REGION_CLASS}[^"]*"[^>]*>`, 'i').exec(html)
  if (!m) return null
  const start = m.index + m[0].length
  const tagRe = /<div\b[^>]*>|<\/div>/gi
  tagRe.lastIndex = start
  let depth = 1
  for (;;) {
    const t = tagRe.exec(html)
    if (!t) return null
    depth += t[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(start, t.index)
  }
}

/**
 * 归一化成纯文本 —— 指纹要的是「**内容**变了没」，不是「排版变了没」。
 *
 * 步骤：去 `<script>`/`<style>` 块 ⇒ 去标签 ⇒ 解 HTML 实体 ⇒ 折叠连续空白。
 */
export function normalizeContent(region: string): string {
  const noScript = region.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  const noStyle = noScript.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  const noTags = noStyle.replace(/<[^>]+>/g, ' ')
  const unescaped = noTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  return unescaped.replace(/\s+/g, ' ').trim()
}

/** 内容的 SHA-256（十六进制小写）。 */
export function contentDigest(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex')
}

/** 算一篇页面的指纹。 */
export function fingerprintOf(html: string): { sha256: string; bytes: number } | null {
  const region = extractContentRegion(html)
  if (region === null) return null
  const plain = normalizeContent(region)
  return { sha256: contentDigest(plain), bytes: Buffer.byteLength(plain, 'utf8') }
}

// ============================================================================
// 网络面
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
        headers: { accept: 'text/html', 'user-agent': 'openvibe-m9-fingerprint' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
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

// ============================================================================
// 采集与对账
// ============================================================================

export interface FingerprintItem {
  url: string
  sha256: string
  bytes: number
}

export interface FingerprintOutcome {
  url: string
  status: 'ok' | 'inconclusive' | 'broken'
  statusReason: string | null
  sha256: string | null
  bytes: number | null
  changed: boolean
}

/** 读已入库清单里登记的全部链接（runoob 两门 118 条）。 */
export function readInventoryUrls(): string[] {
  const files = ['runoob-python3-inventory.json', 'runoob-go-inventory.json']
  const urls: string[] = []
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8')) as {
      items?: Array<{ url: string }>
    }
    for (const it of parsed.items ?? []) urls.push(it.url)
  }
  return urls
}

function readCommitted(): FingerprintItem[] {
  const parsed = JSON.parse(readFileSync(join(OUT_DIR, OUT_FILE), 'utf8')) as {
    items?: FingerprintItem[]
  }
  return parsed.items ?? []
}

/** 算全部条目的指纹，并与已入库的对账。 */
export async function fingerprintAll(committed: FingerprintItem[]): Promise<FingerprintOutcome[]> {
  const urls = readInventoryUrls()
  const byUrl = new Map(committed.map((c) => [c.url, c]))
  const results: FingerprintOutcome[] = []
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor
      cursor += 1
      if (idx >= urls.length) return
      const url = urls[idx]!
      let html: string
      try {
        html = await fetchPage(url)
      } catch (err) {
        results.push({
          url,
          status: 'inconclusive',
          statusReason: err instanceof Error ? err.message : String(err),
          sha256: null,
          bytes: null,
          changed: false,
        })
        continue
      }
      const fp = fingerprintOf(html)
      if (fp === null) {
        results.push({
          url,
          status: 'broken',
          statusReason: '页面里找不到正文区容器（源站结构可能改了）',
          sha256: null,
          bytes: null,
          changed: false,
        })
        continue
      }
      const prev = byUrl.get(url)
      results.push({
        url,
        status: 'ok',
        statusReason: null,
        sha256: fp.sha256,
        bytes: fp.bytes,
        changed: prev !== undefined && prev.sha256 !== fp.sha256,
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))
  return results
}

export function renderFingerprintFile(
  items: FingerprintItem[],
  collectedAt: string,
): Record<string, unknown> {
  return {
    _readme:
      'runoob 两门教程的**内容指纹**。⚠️ **只存 SHA-256 摘要，一个字正文都没存**（spec §3.2）；' +
      '「只存链接不存正文」与「可复算」之间的灰区处置见 scripts/m9-content-fingerprint.ts 的文件头。',
    collected_at: collectedAt,
    collect_method:
      '由 scripts/m9-content-fingerprint.ts 计算：取每篇教程页的 <div class="article-body"> 正文区（按嵌套深度配对 </div>）' +
      ' ⇒ 去 script/style ⇒ 去标签 ⇒ 解实体 ⇒ 折叠空白 ⇒ SHA-256',
    counts: { total: items.length, unique_urls: new Set(items.map((i) => i.url)).size },
    items,
  }
}

export interface FingerprintVerdict {
  code: number
  label: string
  detail: string
  changedUrls: string[]
}

export function decideFingerprintExitCode(outcomes: FingerprintOutcome[]): FingerprintVerdict {
  const broken = outcomes.filter((o) => o.status === 'broken')
  const inconclusive = outcomes.filter((o) => o.status === 'inconclusive')
  const changed = outcomes.filter((o) => o.changed)
  if (broken.length > 0) {
    return {
      code: 1,
      label: '内容漂移',
      detail: `正文区取不到 ${String(broken.length)} 条（源站结构可能改了）`,
      changedUrls: [],
    }
  }
  if (inconclusive.length > 0) {
    return {
      code: 2,
      label: '不可判定',
      detail: `网络不可达 ${String(inconclusive.length)} 条，本次没比成`,
      changedUrls: [],
    }
  }
  if (changed.length > 0) {
    return {
      code: 1,
      label: '内容漂移',
      detail: `有 ${String(changed.length)} 篇教程的内容变了 ⇒ 已入库指纹过期，需刷新（pnpm m9:fingerprint -- --write）`,
      changedUrls: changed.map((o) => o.url),
    }
  }
  return { code: 0, label: '一致', detail: '全部教程内容与已入库指纹一致', changedUrls: [] }
}

async function main(argv: string[]): Promise<number> {
  const opts = {
    write: argv.includes('--write'),
    check: argv.includes('--check'),
    json: argv.includes('--json'),
  }
  const now = new Date()
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const collectedAt = now.toISOString().slice(0, 10)

  let committed: FingerprintItem[] = []
  try {
    committed = readCommitted()
  } catch {
    committed = []
  }
  const outcomes = await fingerprintAll(committed)
  const items: FingerprintItem[] = outcomes
    .filter((o) => o.status === 'ok' && o.sha256 !== null)
    .map((o) => ({ url: o.url, sha256: o.sha256!, bytes: o.bytes ?? 0 }))

  if (opts.write) {
    const res = guardedWrite({
      targetRel: `docs/devlog-evidence/M9-probe/${OUT_FILE}`,
      content: `${JSON.stringify(renderFingerprintFile(items, collectedAt), null, 2)}\n`,
      diff: {
        countChanged: items.length - committed.length,
        added: items
          .filter((i) => !committed.some((c) => c.url === i.url))
          .map((i) => ({ section: '', title: i.url, url: i.url })),
        removed: committed
          .filter((c) => !items.some((i) => i.url === c.url))
          .map((c) => ({ section: '', title: c.url, url: c.url })),
        urlChanged: [],
        titleChanged: [],
        sectionChanged: [],
        urlFormChanged: [],
        reordered: false,
      },
      beforeCount: committed.length,
      afterCount: items.length,
      stamp,
    })
    if (res.wrote) {
      process.stdout.write(`   ✓ 已写回 ${OUT_FILE}\n`)
      if (res.backupPath) process.stdout.write(`   · 备份：${res.backupPath}\n`)
      if (res.diffPath) process.stdout.write(`   · 差异快照：${res.diffPath}\n`)
    }
  }

  const verdict = decideFingerprintExitCode(outcomes)
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ verdict, outcomes }, null, 2)}\n`)
  } else {
    process.stdout.write(`── runoob 两门内容指纹（${String(items.length)} 条）\n`)
    for (const o of outcomes) {
      if (o.status === 'ok' && o.changed) {
        process.stdout.write(`   ~ 内容变了：${o.url}\n`)
      } else if (o.status !== 'ok') {
        process.stdout.write(
          `   ⚠️ ${o.url}：${o.status === 'inconclusive' ? '不可判定' : '正文区取不到'} —— ${o.statusReason ?? ''}\n`,
        )
      }
    }
    process.stdout.write(
      `\n判定：${verdict.label} —— ${verdict.detail}（退出码 ${String(verdict.code)}）\n`,
    )
  }
  return opts.check ? verdict.code : 0
}

if (process.argv[1] && basename(process.argv[1]).startsWith('m9-content-fingerprint')) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `[m9:fingerprint] 失败: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exitCode = 1
    })
}
