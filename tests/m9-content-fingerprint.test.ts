// `tests/m9-content-fingerprint.test.ts` —— M9 v1.6「内容指纹」的出口
// （`m9-dev-language-roadmap.md` §3.2 · DL-01 / DL-02 ＋ `m9-dev-plan-2026-10.md` §6.2）
//
// 采集脚本里的验链是 **HEAD** —— 只验「可达」，不验「内容未变」。
// 本文件断的是「内容未变」这条**可复算**：取正文区 ⇒ 归一化 ⇒ SHA-256 ⇒ 记进仓。
//
// ⚠️ 断五组事：
//   ① **正文区取法**（按嵌套深度配对 `</div>`；取第一个会砍掉一大半正文）
//   ② **归一化**（去 script/style、去标签、解实体、折叠空白 ⇒ 排版变了不算内容变了）
//   ③ **指纹语义**（内容变 ⇒ 摘要变；只改空白 ⇒ 摘要不变；无正文区 ⇒ 取不到）
//   ④ **已入库产物**（118 条 · 摘要全是 64 位十六进制 · URL 与清单一致）
//   ⑤ **§3.2 灰区的补偿控制**（hash-only 豁免是**显式登记**的，且有三条兜底）
//
// ⚠️ **单测不联网** —— 真跑由 `pnpm m9:fingerprint` 负责。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  contentDigest,
  decideFingerprintExitCode,
  extractContentRegion,
  fingerprintOf,
  normalizeContent,
  type FingerprintOutcome,
} from '../scripts/m9-content-fingerprint'
import {
  EXTERNAL_FILE_SCHEMAS,
  HASH_ONLY_PRODUCTS,
  HASH_ONLY_SCRIPTS,
  scanExternalJson,
  scanExternalScript,
} from '../packages/core/src/db/m9-external-content-scan'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const PROBE_DIR = join(REPO_ROOT, 'docs', 'devlog-evidence', 'M9-probe')
const FINGERPRINT_FILE = 'docs/devlog-evidence/M9-probe/runoob-content-fingerprints.json'

// ============================================================================
// ① 正文区取法
// ============================================================================

describe('M9 内容指纹 · 正文区取法', () => {
  it('① 按嵌套深度配对 `</div>`（取第一个会砍掉一大半正文）', () => {
    const html =
      '<div class="article-body">' +
      '<div class="article-intro"><h1>标题</h1></div>' +
      '<div class="example"><div class="example_code">代码</div></div>' +
      '</div>' +
      '<div class="sidebar-box">广告</div>'
    const region = extractContentRegion(html)
    expect(region).not.toBeNull()
    expect(region).toContain('标题')
    expect(region).toContain('代码')
    // 侧栏（正文区外）不该被带进来
    expect(region).not.toContain('广告')
  })

  it('② 页面里没有正文区容器 ⇒ 返回 null（不瞎猜一个区域）', () => {
    expect(extractContentRegion('<html><body><p>没有正文区</p></body></html>')).toBeNull()
  })

  it('③ 容器类名是包含关系（`class="article-body x"` 也认）', () => {
    const html = '<div class="foo article-body bar">正文</div>'
    expect(extractContentRegion(html)).toBe('正文')
  })
})

// ============================================================================
// ② 归一化
// ============================================================================

describe('M9 内容指纹 · 归一化', () => {
  it('① 去 script / style 块', () => {
    const out = normalizeContent('<script>var a=1</script><style>.x{}</style>正文')
    expect(out).toBe('正文')
  })

  it('② 去标签并解实体', () => {
    expect(normalizeContent('<p>a &amp; b &lt;c&gt; &nbsp;d</p>')).toBe('a & b <c> d')
  })

  it('③ 折叠连续空白（排版变了不算内容变了）', () => {
    expect(normalizeContent('a\n\n   b\t\tc')).toBe('a b c')
  })
})

// ============================================================================
// ③ 指纹语义
// ============================================================================

describe('M9 内容指纹 · 指纹语义', () => {
  const page = (body: string): string =>
    `<div class="article-body"><div class="article-intro">${body}</div></div>`

  it('① 内容变了 ⇒ 摘要变', () => {
    const a = fingerprintOf(page('<p>旧内容</p>'))!
    const b = fingerprintOf(page('<p>新内容</p>'))!
    expect(a.sha256).not.toBe(b.sha256)
  })

  it('② 只改排版（空白/标签）⇒ 摘要不变', () => {
    const a = fingerprintOf(page('<p>hello world</p>'))!
    const b = fingerprintOf(page('<div>\n  <p>hello   world</p>\n</div>'))!
    expect(a.sha256).toBe(b.sha256)
  })

  it('③ 没有正文区 ⇒ 取不到（不是「空内容的摘要」）', () => {
    expect(fingerprintOf('<html><body>x</body></html>')).toBeNull()
  })

  it('④ 摘要是 64 位十六进制', () => {
    const fp = fingerprintOf(page('<p>内容</p>'))!
    expect(fp.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(fp.sha256).toBe(contentDigest(normalizeContent('<p>内容</p>')))
  })
})

// ============================================================================
// ④ 已入库产物
// ============================================================================

describe('M9 内容指纹 · 已入库产物', () => {
  const load = (): {
    collected_at: string
    counts: { total: number; unique_urls: number }
    items: Array<{ url: string; sha256: string; bytes: number }>
  } => JSON.parse(readFileSync(join(REPO_ROOT, FINGERPRINT_FILE), 'utf8'))

  it('① 118 条（runoob 两门全部）', () => {
    expect(load().items).toHaveLength(118)
  })

  it('② 摘要全是 64 位十六进制（**没有一个字节是正文**）', () => {
    for (const it of load().items) {
      expect(it.sha256, it.url).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('③ URL 与已入库清单逐条一致（指纹的是清单里的链接，不是另找的）', () => {
    const inv: string[] = []
    for (const f of ['runoob-python3-inventory.json', 'runoob-go-inventory.json']) {
      const parsed = JSON.parse(readFileSync(join(PROBE_DIR, f), 'utf8')) as {
        items?: Array<{ url: string }>
      }
      for (const it of parsed.items ?? []) inv.push(it.url)
    }
    const fp = load().items.map((i) => i.url)
    expect(fp).toHaveLength(inv.length)
    expect(new Set(fp).size).toBe(new Set(inv).size)
    for (const u of inv) expect(fp, u).toContain(u)
  })

  it('④ 有取证日期（每份出处都带日期）', () => {
    expect(load().collected_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ============================================================================
// ⑤ §3.2 灰区的补偿控制
// ============================================================================

describe('M9 内容指纹 · §3.2 灰区的补偿控制', () => {
  it('① 豁免是**显式登记**的（名单单源，不是偷偷绕开）', () => {
    expect(HASH_ONLY_SCRIPTS).toContain('scripts/m9-content-fingerprint.ts')
    // 而产物也必须登记（否则它根本不在扫描面里）
    expect(Object.keys(HASH_ONLY_PRODUCTS)).toContain(FINGERPRINT_FILE)
  })

  it('② **反证**：不是 hash-only 的脚本里出现正文抽取器 ⇒ 照样报红', () => {
    const hits = scanExternalScript(
      'scripts/某普通采集脚本.ts',
      "const x = doc.querySelector('p').textContent\n",
    )
    expect(
      hits.some((h) => h.rule === 'body-scraper'),
      '普通脚本的正文抽取器没被报出',
    ).toBe(true)
  })

  it('③ 补偿控制之一：`sha256` 字段必须是 64 位十六进制（塞正文进去会红）', () => {
    const bad = JSON.stringify({
      items: [{ url: 'https://x.invalid/a', sha256: '这是一段正文不是摘要'.repeat(4), bytes: 10 }],
    })
    const hits = scanExternalJson(FINGERPRINT_FILE, bad)
    expect(
      hits.some((h) => h.rule === 'hash-not-hex'),
      '非 hex 的摘要没被报出',
    ).toBe(true)
  })

  it('④ 补偿控制之二：字段闭集 ⇒ **正文没有字段可放**', () => {
    const schema = EXTERNAL_FILE_SCHEMAS[FINGERPRINT_FILE]!
    expect(schema.itemKeys).toEqual(['bytes', 'sha256', 'url'])
    const bad = JSON.stringify({
      items: [{ url: 'https://x.invalid/a', sha256: 'a'.repeat(64), bytes: 1, body_md: '正文' }],
    })
    const hits = scanExternalJson(FINGERPRINT_FILE, bad)
    expect(
      hits.some((h) => h.rule === 'unknown-field'),
      '多出来的正文字段没被报出',
    ).toBe(true)
  })

  it('⑤ 补偿控制之三：产物**仍在扫描面内**（真的被扫，不是登记了就算）', () => {
    const real = readFileSync(join(REPO_ROOT, FINGERPRINT_FILE), 'utf8')
    const hits = scanExternalJson(FINGERPRINT_FILE, real)
    expect(hits.map((h) => `${h.rule} ${h.detail}`)).toEqual([])
  })
})

// ============================================================================
// 退出码语义
// ============================================================================

describe('M9 内容指纹 · 退出码语义', () => {
  const ok = (over: Partial<FingerprintOutcome> = {}): FingerprintOutcome => ({
    url: 'https://www.runoob.com/python3/python3-intro.html',
    status: 'ok',
    statusReason: null,
    sha256: 'a'.repeat(64),
    bytes: 100,
    changed: false,
    ...over,
  })

  it('① 全部未变 ⇒ 0（一致）', () => {
    expect(decideFingerprintExitCode([ok(), ok({ url: 'b' })]).code).toBe(0)
  })

  it('② 有内容变了 ⇒ 1（内容漂移），并给出刷新命令', () => {
    const v = decideFingerprintExitCode([ok({ changed: true })])
    expect(v.code).toBe(1)
    expect(v.detail).toContain('刷新')
    expect(v.changedUrls).toHaveLength(1)
  })

  it('③ 正文区取不到 ⇒ 1（源站结构变了，我们该修）', () => {
    const v = decideFingerprintExitCode([ok({ status: 'broken', statusReason: '取不到' })])
    expect(v.code).toBe(1)
  })

  it('④ 网络不可达 ⇒ 2（不可判定，不是 1）', () => {
    const v = decideFingerprintExitCode([ok({ status: 'inconclusive', statusReason: '超时' })])
    expect(v.code).toBe(2)
  })
})
