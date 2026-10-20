// `tests/m9-collect-github.test.ts` —— M9 v1.6 **另三源采集实现**的出口
// （`m9-dev-plan-2026-10.md` §6.2 / §9 ＋ `m9-dev-language-roadmap.md` §1.1 §1.5）
//
// 此前 `scripts/collect-m9-sources.ts` 只覆盖 runoob 两门；另三源
// （xinliangnote 43 篇 / walter201230 101 篇 / awesome-* 4047 条）**只有结构骨架**，
// 而骨架还是**手抄**的 ⇒ 里面的条数从没被复算过（实测两处都是错的，见下）。
// 本文件断的是「那三源现在**一条命令能复跑**」这件事。
//
// 断五组事：
//   ① **自然序**（walter 的 `python0…python28` —— 字典序会把 python10 排到 python2 前）
//   ② **目录树解析**（只取 .md / section 规则 / 剥编号前缀 / URL 百分号编码）
//   ③ **README 解析**（CRLF 容忍 / 每个列表项只取第一个链接 / 锚点不算 / 前言不算）
//   ④ **真文件核对**（四份清单的条数、分段、URL 唯一性、字段闭集）
//   ⑤ **退出码语义**（与 runoob 家族同一套：0 一致 / 1 漂移 / 2 不可判定）
//
// ⚠️ **单测不联网** —— 真跑由 `pnpm m9:collect:github` 负责；单测只断纯函数面
//    与已入库产物的形状，否则 CI 会依赖 GitHub 的可用性。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  GITHUB_SOURCES,
  countBySection,
  decideGithubExitCode,
  naturalCompare,
  parseReadmeItems,
  parseTreeItems,
  sectionOf,
  stripNumericPrefix,
  type GithubOutcome,
} from '../scripts/collect-m9-github-sources'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const PROBE_DIR = join(REPO_ROOT, 'docs', 'devlog-evidence', 'M9-probe')

const XL = GITHUB_SOURCES.find((s) => s.key === 'xinliangnote-go')!
const WALTER = GITHUB_SOURCES.find((s) => s.key === 'walter201230-python')!
const APCN = GITHUB_SOURCES.find((s) => s.key === 'awesome-python-cn')!
const AGO = GITHUB_SOURCES.find((s) => s.key === 'awesome-go')!

function loadInventory(key: string): {
  items: Array<{ ordinal: number; section: string; title: string; url: string }>
  counts: { total: number; unique_urls: number; sections: Record<string, number> }
  caveats: string[]
  collected_at: string
} {
  const cfg = GITHUB_SOURCES.find((s) => s.key === key)!
  return JSON.parse(readFileSync(join(PROBE_DIR, cfg.inventoryFile), 'utf8'))
}

describe('M9 另三源 · 自然序（字典序会把章节排乱）', () => {
  it('① 数字段按数值比：python2 < python10（字典序会反过来）', () => {
    expect(naturalCompare('python2', 'python10')).toBeLessThan(0)
    expect(naturalCompare('python10', 'python2')).toBeGreaterThan(0)
  })

  it('② 整串排序后，walter 的章节目录必须是 python0…python28 的自然序', () => {
    const dirs = Array.from({ length: 29 }, (_, i) => `Article/PythonBasis/python${String(i)}`)
    const sorted = [...dirs].sort(naturalCompare)
    expect(sorted[0]).toBe('Article/PythonBasis/python0')
    expect(sorted[1]).toBe('Article/PythonBasis/python1')
    expect(sorted[2]).toBe('Article/PythonBasis/python2')
    expect(sorted[10]).toBe('Article/PythonBasis/python10')
    expect(sorted[28]).toBe('Article/PythonBasis/python28')
  })

  it('③ 前缀数字段不同时，数字段排前（`01-` 是顺序标记）', () => {
    expect(naturalCompare('01-环境安装', '基础语法')).toBeLessThan(0)
  })
})

describe('M9 另三源 · 目录树解析（GitHub git/trees）', () => {
  it('① 只取 .md blob（.go/.png/.toml 一律不取）', () => {
    const items = parseTreeItems(
      [
        '00-基础语法/01-环境安装.md',
        '00-基础语法/main.go',
        '00-基础语法/diagram.png',
        '00-基础语法/go.mod',
        'README.md',
      ],
      XL,
    )
    expect(items.map((i) => i.title)).toEqual(['环境安装', 'README'])
  })

  it('② section 按「顶层目录」取（`codes/` 子目录归它的父组）', () => {
    const items = parseTreeItems(
      ['00-基础语法/01-环境安装.md', '00-基础语法/codes/demo.go.md', '01-Gin框架/01-路由.md'],
      XL,
    )
    expect(items[0]!.section).toBe('00-基础语法')
    expect(items[1]!.section).toBe('00-基础语法')
    expect(items[2]!.section).toBe('01-Gin框架')
  })

  it('③ 标题剥掉编号前缀（`04-Slice 切片` ⇒ `Slice 切片`）', () => {
    expect(stripNumericPrefix('04-Slice 切片')).toBe('Slice 切片')
    expect(stripNumericPrefix('01-环境安装')).toBe('环境安装')
    expect(stripNumericPrefix('WhyStudyPython')).toBe('WhyStudyPython')
  })

  it('④ 根目录的文件的 section 是「(根)」', () => {
    expect(sectionOf('README.md', 'top-dir')).toBe('(根)')
    expect(sectionOf('a/b/c.md', 'parent-dir')).toBe('a/b')
  })

  it('⑤ URL 逐段百分号编码（源路径有空格与中文）', () => {
    const items = parseTreeItems(['00-基础语法/04-Slice 切片.md'], XL)
    const url = items[0]!.url
    expect(url).toContain('00-%E5%9F%BA%E7%A1%80%E8%AF%AD%E6%B3%95')
    expect(url).toContain('04-Slice%20%E5%88%87%E7%89%87.md')
    expect(url.startsWith('https://github.com/xinliangnote/Go/blob/master/')).toBe(true)
  })

  it('⑥ walter 侧用「父目录」规则 ⇒ section 是章节目录', () => {
    const items = parseTreeItems(['Article/PythonBasis/python8/xxx.md'], WALTER)
    expect(items[0]!.section).toBe('Article/PythonBasis/python8')
  })
})

describe('M9 另三源 · README 解析（清单型源）', () => {
  it('① **CRLF 文件也能抓到分段**（JS 的 `.` 不匹配 `\\r` ⇒ 曾经一条都抓不到）', () => {
    const crlf = '## 资源列表\r\n### 环境管理\r\n- [pyenv](https://example.invalid/a)\r\n'
    const items = parseReadmeItems(crlf, APCN)
    expect(items).toHaveLength(1)
    expect(items[0]!.section).toBe('环境管理')
  })

  it('② 一个列表项只取**第一个**链接（后面的在描述文字里）', () => {
    const md = '## S\n- [PynamoDB](https://example.invalid/a)：[Amazon DynamoDB](https://example.invalid/b) 的一个 Python 风格接口。\n'
    const items = parseReadmeItems(md, APCN)
    expect(items).toHaveLength(1)
    expect(items[0]!.url).toBe('https://example.invalid/a')
  })

  it('③ 锚点链接（目录）不算条目', () => {
    const md = '## Contents\n- [Actor Model](#actor-model)\n## 真实小节\n- [Ergo](https://example.invalid/e)\n'
    const items = parseReadmeItems(md, AGO)
    expect(items).toHaveLength(1)
    expect(items[0]!.url).toBe('https://example.invalid/e')
  })

  it('④ **第一个 `##` 之前是前言**，不算条目（参与者名单会被误当资源）', () => {
    const md =
      '# 大标题\n### 本项目的参与者\n- 维护者：[某团队](https://example.invalid/p)\n' +
      '## 资源列表\n### 环境管理\n- [pyenv](https://example.invalid/a)\n'
    const items = parseReadmeItems(md, APCN)
    expect(items).toHaveLength(1)
    expect(items[0]!.url).toBe('https://example.invalid/a')
  })

  it('⑤ 标题里的 markdown 记号被剥掉', () => {
    const md = '## S\n- [**Ergo**](https://example.invalid/e)\n'
    expect(parseReadmeItems(md, AGO)[0]!.title).toBe('Ergo')
  })
})

describe('M9 另三源 · 已入库产物核对（真文件）', () => {
  it('① 四份清单都在仓内', () => {
    for (const cfg of GITHUB_SOURCES) {
      expect(existsSync(join(PROBE_DIR, cfg.inventoryFile)), cfg.inventoryFile).toBe(true)
    }
  })

  it('② 条数与实测值一致（**这些数字此前是手抄的，两处都是错的**）', () => {
    // xinliangnote 43 / walter 101 —— 与旧骨架一致
    expect(loadInventory('xinliangnote-go').items).toHaveLength(43)
    expect(loadInventory('walter201230-python').items).toHaveLength(101)
    // ⚠️ 旧骨架写 awesome-python-cn 874 / awesome-go 3323。
    //   实测：874 少算 3（真值 877）；3323 **多算 153**（把 151 个目录锚点当成了条目，真值 3170）。
    expect(loadInventory('awesome-python-cn').items).toHaveLength(877)
    expect(loadInventory('awesome-go').items).toHaveLength(3170)
  })

  it('③ 无序池真值 4047（旧骨架写 4197 ⇒ 多了 150）', () => {
    const apcn = loadInventory('awesome-python-cn').items.length
    const ago = loadInventory('awesome-go').items.length
    expect(apcn + ago).toBe(4047)
  })

  it('④ URL 唯一性：**三份全唯一，awesome-python-cn 有 11 条同址**（同款事实，不合并）', () => {
    for (const key of ['xinliangnote-go', 'walter201230-python', 'awesome-go']) {
      const urls = loadInventory(key).items.map((i) => i.url)
      expect(new Set(urls).size, key).toBe(urls.length)
    }
    // ⚠️ awesome-python-cn 实测 877 条只有 866 个去重 URL ⇒ 同址 11 条。
    //   **刻意不合并**（与 §1.6.1「89 条资源 87 个去重 URL」同款处置：
    //   同一地址在两个小节出现是有信息的，合并会把它抹掉）。
    const apcn = loadInventory('awesome-python-cn')
    expect(apcn.items).toHaveLength(877)
    expect(new Set(apcn.items.map((i) => i.url)).size).toBe(866)
    expect(apcn.counts.unique_urls).toBe(866)
  })

  it('⑤ 分段非空，且条数与分段计数自洽', () => {
    for (const cfg of GITHUB_SOURCES) {
      const inv = loadInventory(cfg.key)
      const bySection = countBySection(inv.items)
      expect(Object.keys(bySection).length, cfg.key).toBeGreaterThan(1)
      const sum = Object.values(bySection).reduce((a, b) => a + b, 0)
      expect(sum, cfg.key).toBe(inv.items.length)
    }
  })

  it('⑥ awesome-go 的 URL 确实有超过 80 字符的（长度规则分两档的现实依据）', () => {
    const maxLen = Math.max(...loadInventory('awesome-go').items.map((i) => i.url.length))
    expect(maxLen).toBeGreaterThan(80)
  })

  it('⑦ 未做验链的两份清单，caveats 里写明了「未做」与原因', () => {
    for (const key of ['awesome-python-cn', 'awesome-go']) {
      const inv = loadInventory(key)
      expect(inv.caveats.join(' '), key).toContain('未做')
    }
  })

  it('⑦-b 目录树型源的 link_probe 记的是「N/N 条在树里」而不是「N/N 返回 2xx」', () => {
    for (const key of ['xinliangnote-go', 'walter201230-python']) {
      const inv = loadInventory(key) as unknown as {
        link_probe?: { method: string; result: string; failed: unknown[] }
      }
      expect(inv.link_probe, key).toBeTruthy()
      expect(inv.link_probe!.result, key).toMatch(/^\d+\/\d+ 条在树里$/)
      expect(inv.link_probe!.failed, key).toEqual([])
    }
  })

  it('⑧ 目录树型源的链接存在性由 **git/trees 的那一次响应**证明（不发 144 个 HEAD）', () => {
    for (const key of ['xinliangnote-go', 'walter201230-python']) {
      const inv = loadInventory(key)
      expect(inv.caveats.join(' '), key).toContain('git/trees')
      expect(inv.caveats.join(' '), key).toContain('限流')
    }
  })
})

describe('M9 另三源 · 退出码语义（与 runoob 家族同一套）', () => {
  const base = (over: Partial<GithubOutcome> = {}): GithubOutcome => ({
    source: 'awesome-go',
    status: 'ok',
    statusReason: null,
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
    freshCount: 3170,
    beforeCount: 3170,
    items: [],
    lastPushed: null,
    wrote: false,
    backupPath: null,
    diffPath: null,
    ...over,
  })

  it('① 全 ok 且无差异 ⇒ 0', () => {
    expect(decideGithubExitCode([base()]).code).toBe(0)
  })

  it('② **blocking 源**有差异 ⇒ 1（内容漂移）', () => {
    const d = base({ source: 'walter201230-python' })
    d.diff.countChanged = 3
    expect(decideGithubExitCode([d]).code).toBe(1)
  })

  it('③ 不可判定 ⇒ 2（不是 1）', () => {
    const o = base({ status: 'inconclusive', statusReason: '网络不通' })
    expect(decideGithubExitCode([o]).code).toBe(2)
  })

  it('④ **advisory 源的漂移不阻断，blocking 源的漂移阻断**', () => {
    const drifted = base()
    drifted.diff.countChanged = 5
    // awesome-go 是 advisory
    const v = decideGithubExitCode([drifted])
    expect(v.code).toBe(0)
    expect(v.advisory.join(' ')).toContain('awesome-go')
    // walter201230-python 是 blocking
    const walter = base({ source: 'walter201230-python' })
    walter.diff.countChanged = 5
    const v2 = decideGithubExitCode([walter])
    expect(v2.code).toBe(1)
  })

  it('⑤ 刚写回过的源按「已一致」算（写回前有差异是写回的前提）', () => {
    const o = base({ wrote: true })
    o.diff.countChanged = 3
    expect(decideGithubExitCode([o]).code).toBe(0)
  })
})
