// `tests/m9-collect.test.ts` —— M9 v1.6 **P1.9** 出口
// （`m9-dev-plan-2026-10.md` §6.2 / §9 ＋ `m9-dev-language-roadmap.md` §3.2 / DL-01 / DL-02）
//
// P1.9 补的是 **M9-P1 期的最后一个交付物**：`scripts/collect-m9-sources.ts`。
// §9 的 M9-P1 交付物列是「迁移 · 种子 · 本脚本 · 概念内容文件」——前三样里只缺它。
//
// 它承载的是 spec §3.2 的硬约束：
//   「**可复算**：采集脚本须能一条命令复跑并输出差异」
// 没有它，「本仓没有一条出处缺 `source_checked_at`」只能靠**人**记得去核。
//
// 断四组事：
//   ① **解析面**（合成 HTML 夹具，⚠️ **夹具是合成的，不是抄来的** ——
//      抄源页面进仓本身就是 DL-02 违规）
//   ② **对账面**（同一批数据 ⇒ 差异为空；各类变更 ⇒ 各自被报出，不误报）
//   ③ **已入库清单面**（真文件：条数按 §1.5 实测、链接形态规范、取证日期齐）
//   ④ **交付物存在性**（§9 明列的脚本必须在仓内）
//
// ⚠️ **单测不联网** —— 真跑由 `pnpm m9:collect` 负责；单测只断纯函数面，
//    否则 CI 会依赖第三方站点可用性。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SOURCES,
  collectSources,
  countSections,
  decodeEntities,
  decideCheckExitCode,
  diffInventory,
  diffIsEmpty,
  emptyDiff,
  itemIdentity,
  normalizeSection,
  normalizeTitle,
  parseSidebar,
  resolveItemUrl,
  urlFormKey,
  type CollectedItem,
  type CollectOutcome,
  type SourceConfig,
} from '../scripts/collect-m9-sources'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const PROBE_DIR = join(REPO_ROOT, 'docs', 'devlog-evidence', 'M9-probe')

const PY = SOURCES.find((s) => s.key === 'python3')!
const GO = SOURCES.find((s) => s.key === 'go')!

/**
 * 合成侧栏 HTML —— 形状照源站，**内容全是编的**。
 *
 * ⚠️ 这个夹具**不来自 runoob**（抄页面进仓就是 DL-02 违规）⇒ 全部字段手写，
 *   但刻意复刻源站真实存在的四种形态：
 *   ① 属性顺序不固定（`title` 在前 / `href` 在前）
 *   ② href 有根相对与页内相对两种
 *   ③ 标题里有连续空格与 HTML 实体（含排版连字符）
 *   ④ 段标题的正文带 HTML 标签
 */
function fakeSidebar(opts: { withAdvanced?: boolean; absoluteNav?: boolean } = {}): string {
  const advanced = opts.withAdvanced === true
  const nav =
    opts.absoluteNav === true
      ? '<a target="_top" title="首页" href="https://www.runoob.com/">首页</a>'
      : ''
  return [
    '<html><body>',
    '<div class="design" id="leftcolumn">',
    '<a target="_top" data-p="par" title="合成条目一" href="/python3/one.html">x</a>',
    '<a target="_top" title="合成条目二" href="two.html">y</a>',
    '<a target="_top" title="合成  条目三 &#8211; 带实体" href="/python3/three.html">z</a>',
    nav,
    ...(advanced
      ? [
          '<h2 class="left"><span class="left_h2">Python3</span> 高级教程</h2>',
          '<a target="_top" title="合成条目四" href="/python3/four.html">w</a>',
        ]
      : []),
    '</div>',
    '<div class="col middle-column">',
    '<a target="_top" title="正文区的链接" href="/python3/should-not-be-collected.html">n</a>',
    '</div>',
    '</body></html>',
  ].join('\n')
}

describe('M9 P1.9 · 采集脚本的解析面（合成夹具）', () => {
  it('① 只取侧栏：leftcolumn 到 middle-column 之间，不吃后面的全站导航', () => {
    const items = parseSidebar(fakeSidebar(), PY)
    expect(items.map((it) => it.title)).toEqual([
      '合成条目一',
      '合成条目二',
      // 原文是「合成␣␣条目三 &#8211; 带实体」⇒ 归一后：折叠空白 ＋ 连字符转 ASCII
      '合成 条目三 - 带实体',
    ])
    // middle-column 之后那条**不得**被收进来
    expect(items.some((it) => it.url.includes('should-not-be-collected'))).toBe(false)
  })

  it('② 绝对地址的全站导航项被排除', () => {
    const without = parseSidebar(fakeSidebar(), PY)
    const withNav = parseSidebar(fakeSidebar({ absoluteNav: true }), PY)
    expect(withNav.length).toBe(without.length)
    expect(withNav.some((it) => it.title === '首页')).toBe(false)
  })

  it('③ 属性顺序不敏感：title 在前与 href 在前都要取到', () => {
    const items = parseSidebar(fakeSidebar(), PY)
    expect(items.map((it) => it.ordinal)).toEqual([1, 2, 3])
    expect(items[0]?.url).toBe('https://www.runoob.com/python3/one.html')
  })

  it('④ 标题归一：解实体 ＋ 排版连字符转 ASCII ＋ 折叠连续空白', () => {
    expect(decodeEntities('a &#8211; b &amp; c')).toBe('a – b & c')
    expect(normalizeTitle('合成  条目三 &#8211; 带实体')).toBe('合成 条目三 - 带实体')
    expect(normalizeTitle('  Python  __name__  ')).toBe('Python __name__')
  })

  it('⑤ 链接按**页面 URL** 解析：页内相对 ⇒ 落到页面目录下（不是站点根）', () => {
    const items = parseSidebar(fakeSidebar(), PY)
    // 页内相对 href（two.html）⇒ /python3/two.html
    expect(items[1]?.url).toBe('https://www.runoob.com/python3/two.html')
    // ⚠️ 这条是本轮实测踩出来的：按站点根解析会得到不存在的路径（404）
    expect(resolveItemUrl('two.html', PY.pageUrl)).toBe('https://www.runoob.com/python3/two.html')
    expect(resolveItemUrl('two.html', 'https://www.runoob.com')).toBe(
      'https://www.runoob.com/two.html',
    )
  })

  it('⑥ 段名：剥 HTML 标签 ＋ 去语言前缀；无 h2 时用默认段名', () => {
    const withAdvanced = parseSidebar(fakeSidebar({ withAdvanced: true }), PY)
    expect(withAdvanced.map((it) => it.section)).toEqual([
      '基础教程',
      '基础教程',
      '基础教程',
      '高级教程',
    ])
    expect(normalizeSection('<span class="left_h2">Python3</span> 高级教程', PY)).toBe('高级教程')
    // Go 侧只有一个分段 ⇒ 解析器不得假定分段结构存在
    const goOnly = parseSidebar(fakeSidebar(), GO)
    expect(goOnly.every((it) => it.section === '基础教程')).toBe(true)
  })
})

describe('M9 P1.9 · 对账面（差异必须被报出且不误报）', () => {
  const base: CollectedItem[] = [
    { ordinal: 1, section: '基础教程', title: '甲', url: 'https://www.runoob.com/python3/a.html' },
    { ordinal: 2, section: '基础教程', title: '乙', url: 'https://www.runoob.com/python3/b.html' },
  ]

  it('① 同一批数据 ⇒ 差异为空', () => {
    const diff = diffInventory(
      base,
      base.map((it) => ({ ...it })),
    )
    expect(diffIsEmpty(diff)).toBe(true)
    expect(diff.countChanged).toBe(0)
  })

  it('② 变异：改标题 ⇒ titleChanged（不误报成增删）', () => {
    const fresh = base.map((it) => (it.title === '甲' ? { ...it, title: '甲改' } : { ...it }))
    const diff = diffInventory(base, fresh)
    expect(diff.titleChanged.length).toBe(1)
    expect(diff.added.length).toBe(0)
    expect(diff.removed.length).toBe(0)
  })

  it('③ 变异：换链接地址（同一页面）⇒ urlChanged（不误报成增删）', () => {
    const fresh = base.map((it) =>
      it.title === '甲' ? { ...it, url: 'https://www.runoob.com/python3/a2.html' } : { ...it },
    )
    const diff = diffInventory(base, fresh)
    expect(diff.urlChanged.length).toBe(1)
    expect(diff.added.length).toBe(0)
    expect(diff.removed.length).toBe(0)
  })

  it('④ 变异：链接形态变了（双斜杠 ⇒ 单斜杠）⇒ urlFormChanged', () => {
    const fresh = base.map((it) =>
      it.title === '甲' ? { ...it, url: 'https://www.runoob.com//python3/a.html' } : { ...it },
    )
    const diff = diffInventory(base, fresh)
    expect(diff.urlFormChanged.length).toBe(1)
    expect(diff.added.length).toBe(0)
    expect(diff.removed.length).toBe(0)
  })

  it('⑤ 变异：加一条 / 删一条 ⇒ added / removed 各自被报出', () => {
    const added = diffInventory(base, [
      ...base,
      {
        ordinal: 3,
        section: '基础教程',
        title: '丙',
        url: 'https://www.runoob.com/python3/c.html',
      },
    ])
    expect(added.added.length).toBe(1)
    expect(added.countChanged).toBe(1)
    const removed = diffInventory(base, base.slice(0, 1))
    expect(removed.removed.length).toBe(1)
    expect(removed.countChanged).toBe(-1)
  })

  it('⑥ 变异：顺序换了 ⇒ reordered', () => {
    const diff = diffInventory(base, [base[1]!, base[0]!])
    expect(diff.reordered).toBe(true)
    expect(diffIsEmpty(diff)).toBe(false)
  })

  it('⑦ 同 URL 不同标题的两条（Go 侧的真碰撞）不误报成「标题变了」', () => {
    // 已入库的 Go 清单里第 4 与第 34 条同 URL 不同标题 ⇒ 按 URL 单键配对会错配
    const committed: CollectedItem[] = [
      {
        ordinal: 1,
        section: '基础教程',
        title: '工具',
        url: 'https://www.runoob.com/go/vscode.html',
      },
      {
        ordinal: 2,
        section: '基础教程',
        title: '用 VSCode 开发',
        url: 'https://www.runoob.com/go/vscode.html',
      },
    ]
    const diff = diffInventory(
      committed,
      committed.map((it) => ({ ...it })),
    )
    expect(diff.titleChanged.length).toBe(0)
    expect(diffIsEmpty(diff)).toBe(true)
  })

  it('⑧ 身份与形态归一是纯函数', () => {
    expect(itemIdentity({ ordinal: 1, section: '基础', title: '甲', url: 'https://x/a' })).toBe(
      '基础 甲',
    )
    expect(urlFormKey('https://www.runoob.com//go/a.html')).toBe('https://www.runoob.com/go/a.html')
  })
})

describe('M9 P1.9 · 已入库清单面（真文件）', () => {
  const py = JSON.parse(readFileSync(join(PROBE_DIR, 'runoob-python3-inventory.json'), 'utf8')) as {
    items: CollectedItem[]
    counts: { total: number; sections: Record<string, number> }
    collected_at: string
    link_probe?: { result: string }
    collect_method: string
  }
  const go = JSON.parse(readFileSync(join(PROBE_DIR, 'runoob-go-inventory.json'), 'utf8')) as {
    items: CollectedItem[]
    counts: { total: number; sections: Record<string, number> }
    collected_at: string
    link_probe?: { result: string }
    collect_method: string
  }

  it('① 条数按 §1.5 实测：Python 84 ＋ Go 34', () => {
    expect(py.items.length).toBe(84)
    expect(go.items.length).toBe(34)
    expect(py.counts.total).toBe(84)
    expect(go.counts.total).toBe(34)
  })

  it('② 分段计数与条目一致（Python 基础 40 ＋ 高级 44；Go 基础 34）', () => {
    expect(countSections(py.items)).toEqual({ 基础教程: 40, 高级教程: 44 })
    expect(countSections(go.items)).toEqual({ 基础教程: 34 })
  })

  it('③ 链接形态规范：无重复斜杠，且以源站根开头', () => {
    for (const it of [...py.items, ...go.items]) {
      expect(it.url, `链接形态不规范: ${it.url}`).not.toMatch(/:\/\/[^/]*\/\//)
      expect(it.url.startsWith('https://www.runoob.com/')).toBe(true)
    }
  })

  it('④ 取证日期齐（每条出处都带取证日 —— DL-01 的形态要求）', () => {
    for (const inv of [py, go]) {
      expect(inv.collected_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('⑤ 采集方法已登记为「由脚本采集」（§3.2 的可复算纪律有载体）', () => {
    for (const inv of [py, go]) {
      expect(inv.collect_method).toContain('scripts/collect-m9-sources.ts')
    }
  })

  it('⑥ 两门都做了**全量**验链（不是抽样）', () => {
    expect(py.link_probe?.result).toBe('84/84 返回 2xx')
    expect(go.link_probe?.result).toBe('34/34 返回 2xx')
  })
})

describe('M9 P1.9 · 交付物存在性（§9 的 M9-P1 交付物列）', () => {
  it('scripts/collect-m9-sources.ts 在仓内', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts', 'collect-m9-sources.ts'))).toBe(true)
  })

  it('两个来源配置齐（Python3 与 Go），且指向源站索引页', () => {
    expect(SOURCES.map((s) => s.key).sort()).toEqual(['go', 'python3'])
    for (const s of SOURCES) {
      expect(s.pageUrl.startsWith('https://www.runoob.com/')).toBe(true)
      expect(s.expectedTotal).toBeGreaterThan(0)
    }
  })

  it('解析器只取结构、不取正文：页面里没有正文区内容也能跑通', () => {
    // 一个只有侧栏、没有正文区的页面 ⇒ 解析器仍然给出条目
    const minimal = '<div id="leftcolumn"><a title="甲" href="/a.html">x</a></div>'
    const cfg: SourceConfig = { ...PY }
    expect(parseSidebar(minimal, cfg).length).toBe(1)
  })
})

// ============================================================================
// CI 闸面 —— 退出码分层
// ============================================================================

describe('M9 P1.9·CI · 退出码分层（「可复算」要当闸，就得能区分红与黄）', () => {
  const okOutcome = (over: Partial<CollectOutcome> = {}): CollectOutcome => ({
    source: 'python3',
    status: 'ok',
    statusReason: null,
    diff: emptyDiff(),
    freshCount: 84,
    wrote: false,
    backupPath: null,
    diffPath: null,
    probe: null,
    ...over,
  })

  it('① 全 ok 且无差异 ⇒ 0（一致）', () => {
    const v = decideCheckExitCode([okOutcome(), okOutcome({ source: 'go' })])
    expect(v.code).toBe(0)
    expect(v.label).toBe('一致')
  })

  it('② ok 且有差异 ⇒ 1（内容漂移）—— 这是我们要红的', () => {
    const drifted = okOutcome({
      diff: { ...emptyDiff(), countChanged: 3, added: [] },
    })
    const v = decideCheckExitCode([drifted])
    expect(v.code).toBe(1)
    expect(v.label).toBe('内容漂移')
  })

  it('③ broken ⇒ 1，且报「采集器失灵」—— 不是环境问题，是我们该修', () => {
    const v = decideCheckExitCode([
      okOutcome({ source: 'python3', status: 'broken', statusReason: '侧栏解析失败' }),
    ])
    expect(v.code).toBe(1)
    expect(v.label).toBe('内容漂移')
    expect(v.detail).toContain('采集器失灵')
    // 原因要带出来 —— 不然读者只看到「坏了」不知道坏在哪
    expect(v.detail).toContain('侧栏解析失败')
  })

  it('④ 全 inconclusive ⇒ 2（不可判定），**不是 1**', () => {
    const v = decideCheckExitCode([
      okOutcome({ status: 'inconclusive', statusReason: 'ENOTFOUND' }),
    ])
    expect(v.code).toBe(2)
    expect(v.label).toBe('不可判定')
  })

  it('⑤ 差异优先于不可判定：一门挂了、另一门有差异 ⇒ 仍是 1', () => {
    const v = decideCheckExitCode([
      okOutcome({ source: 'python3', status: 'inconclusive', statusReason: '超时' }),
      okOutcome({ source: 'go', diff: { ...emptyDiff(), countChanged: -1 } }),
    ])
    expect(v.code).toBe(1)
  })

  // ⚠️ **变异腿**：把 broken 误并进 inconclusive，这道闸就退化成「永远不红」——
  //   所以必须有一支腿证明 broken 那层**真的在做事**。
  it('⑥ 变异腿：把 broken 归进 inconclusive ⇒ 退出码从 1 掉到 2 ⇒ 那层不是摆设', () => {
    const broken = okOutcome({ status: 'broken', statusReason: '解析失败' })
    const asInconclusive = { ...broken, status: 'inconclusive' as const }
    expect(decideCheckExitCode([broken]).code).toBe(1)
    expect(decideCheckExitCode([asInconclusive]).code).toBe(2)
  })

  it('⑦ 变异腿：把 inconclusive 误并进「内容漂移」⇒ 站点一抖动就红仓 ⇒ 那层也不是摆设', () => {
    const inconclusive = okOutcome({ status: 'inconclusive', statusReason: '超时' })
    const asDrift = { ...inconclusive, status: 'broken' as const }
    expect(decideCheckExitCode([inconclusive]).code).toBe(2)
    expect(decideCheckExitCode([asDrift]).code).toBe(1)
  })
})

describe('M9 P1.9·CI · 真跑面（--offline 临时目录，不联网）', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'm9-collect-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const base = {
    write: false,
    check: true,
    json: false,
    offline: true,
    only: 'python3',
    stamp: '2026-10-20T00-00-00',
  } as const

  it('① 侧栏标记没了 ⇒ broken，**不是**「84 条被删除」', async () => {
    writeFileSync(join(dir, 'python3.html'), '<html><body><p>没有侧栏</p></body></html>')
    const outcomes = await collectSources({ ...base, htmlDir: dir })
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]!.status).toBe('broken')
    expect(outcomes[0]!.statusReason).toContain('解析')
    // **关键**：不是「差异」（那会被读成源站删了内容）
    expect(diffIsEmpty(outcomes[0]!.diff)).toBe(true)
    expect(decideCheckExitCode(outcomes).code).toBe(1)
  })

  it('② 侧栏在但一条都解析不出 ⇒ broken（空条目 ≠ 源站删光）', async () => {
    writeFileSync(
      join(dir, 'python3.html'),
      '<div id="leftcolumn"></div><div class="middle-column"></div>',
    )
    const outcomes = await collectSources({ ...base, htmlDir: dir })
    expect(outcomes[0]!.status).toBe('broken')
    expect(outcomes[0]!.freshCount).toBe(0)
    expect(decideCheckExitCode(outcomes).code).toBe(1)
  })

  it('③ HTML 文件不存在 ⇒ inconclusive（环境问题，退出码 2）', async () => {
    const outcomes = await collectSources({ ...base, htmlDir: dir })
    expect(outcomes[0]!.status).toBe('inconclusive')
    expect(decideCheckExitCode(outcomes).code).toBe(2)
  })

  it('④ 侧栏正常 ⇒ ok，退出码 0（此时才会去对账）', async () => {
    writeFileSync(
      join(dir, 'python3.html'),
      '<div id="leftcolumn"><a title="甲" href="/a.html">x</a></div><div class="middle-column"></div>',
    )
    const outcomes = await collectSources({ ...base, htmlDir: dir })
    expect(outcomes[0]!.status).toBe('ok')
    expect(outcomes[0]!.freshCount).toBe(1)
    // 1 条 vs 库里 84 条 ⇒ 是漂移（1），但**状态本身**是 ok —— 两者别混
    expect(decideCheckExitCode(outcomes).code).toBe(1)
  })
})
