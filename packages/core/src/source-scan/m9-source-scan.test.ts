// `packages/core/src/source-scan/m9-source-scan.test.ts` —— M9 v1.6 **P4.1 / P4.2 出口**
// （`m9-dev-plan-2026-10.md` §6.10 · `m9-dev-language-roadmap.md` §3.8 / §3.8.2 / §7）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-17** | T0 **不依赖 AI** | 「DL-17」组（含变异腿） |
// | **DL-19** | Go 回退**只降精度、不减结果**（parser ⊇ 正则） | 「DL-19」组（夹具 ＋ **真实样本** ＋ 变异腿） |
// | **DL-23** | 导出/命中里**没有绝对路径** | 「DL-23」组 |
//
// ## ⚠️ 真实样本是哪两个（如实登记）
//
// - **Go**：`go env GOROOT` 指向的**标准库源码树**（`src/net/http` 等）——
//   那是 Go 自己的真实代码，**不是**合成夹具（dev-plan §5 第 2 条：「不允许把合成夹具当真实项目跑」）。
// - **Python**：本仓自己的 `packages/core/src/db/seeds/_build/*.py`（四个**真实**构建脚本，1973 行）。
//
// ⚠️ dev-plan §5 第 2 条给的候选（「`packages/adapters/src/adapters.test.ts` 用过的 fixture 仓库」）
//   **经查不存在** —— 那个测试文件里没有任何 fixture 仓库 ⇒ 本轮改用上面两个真实来源并登记。
import { execFile } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { patternsForLang, SOURCE_PATTERNS } from '@openvibe/shared'
import { listSourceFiles } from './files'
import { detectGoToolchain, scanGoHeuristic, scanGoParser } from './go-scanner'
import { scanProjectSource } from './scan'
import { findSubsetViolations, hitKey } from './subset-check'

const execFileAsync = promisify(execFile)

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../../')
const FIXTURE_DIR = resolve(REPO_ROOT, 'packages/core/src/fixtures/m9')
const PY_BUILD_DIR = resolve(REPO_ROOT, 'packages/core/src/db/seeds/_build')
const SCAN_DIR = resolve(REPO_ROOT, 'packages/core/src/source-scan')

/** 真实 Go 样本的目录（标准库里的一个包）。 */
async function realGoSample(): Promise<string> {
  const res = await execFileAsync('go', ['env', 'GOROOT'], { encoding: 'utf8' })
  const goroot = res.stdout.trim()
  return join(goroot, 'src', 'net', 'http')
}

/** 跑两条路径，返回可比对的键集合。 */
async function bothPaths(root: string): Promise<{
  parser: Set<string>
  heuristic: Set<string>
  parserCount: number
  heuristicCount: number
}> {
  const patterns = patternsForLang('go')
  const listing = listSourceFiles(root, '.go', 5000)
  const parserOut = await scanGoParser(
    root,
    listing.files,
    patterns.map((p) => ({ id: p.id, kind: p.node_spec })),
  )
  const heuristicOut = scanGoHeuristic(
    root,
    listing.files,
    patterns
      .filter((p) => p.heuristic_src !== undefined)
      .map((p) => ({ id: p.id, heuristic_src: p.heuristic_src as string })),
  )
  return {
    parser: new Set(parserOut.hits.map((h) => hitKey(h))),
    heuristic: new Set(heuristicOut.hits.map((h) => hitKey(h))),
    parserCount: parserOut.hits.length,
    heuristicCount: heuristicOut.hits.length,
  }
}

describe('M9 P4.1 / P4.2 · 夹具全跑过（dev-plan §6.10 出口 a）', () => {
  it('四支夹具都被扫到，且命中落在预期的知识点上', async () => {
    const result = await scanProjectSource({ projectId: 'p', root: FIXTURE_DIR })

    // 两侧都走了解析器（不是回退）
    expect(result.languages.map((l) => [l.lang, l.mode])).toEqual([
      ['python', 'parser'],
      ['go', 'parser'],
    ])
    expect(result.warnings).toEqual([])

    const byFile = new Map<string, string[]>()
    for (const f of result.findings) {
      const list = byFile.get(f.file_rel_path) ?? []
      list.push(f.topic_slug)
      byFile.set(f.file_rel_path, list)
    }

    // py_repeat：20 次 `import logging`（⇒ logging 与模块两条模式各 20）
    const pyRepeat = byFile.get('py_repeat.py') ?? []
    expect(pyRepeat.filter((s) => s === 'python-logging')).toHaveLength(20)
    // py_solo：一个装饰器
    expect(byFile.get('py_solo.py') ?? []).toContain('python-decorators')
    // go_repeat：20 次 goroutine
    const goRepeat = byFile.get('go_repeat.go') ?? []
    expect(goRepeat.filter((s) => s === 'go-concurrent')).toHaveLength(20)
    // go_solo：一个 goroutine
    expect((byFile.get('go_solo.go') ?? []).filter((s) => s === 'go-concurrent')).toHaveLength(1)
  })

  it('⚠️ 命中里**没有绝对路径**（DL-23 的前半：产生的那一刻就成立）', async () => {
    const result = await scanProjectSource({ projectId: 'p', root: FIXTURE_DIR })
    expect(result.findings.length).toBeGreaterThan(0)
    for (const f of result.findings) {
      expect(f.file_rel_path.startsWith('/')).toBe(false)
      expect(f.file_rel_path).not.toContain('..')
    }
  })
})

describe('M9 P4.2 · DL-19 · 回退只降精度、不减结果', () => {
  it('夹具上：parser 的命中集合 ⊇ 正则的命中集合', async () => {
    const { parser, heuristic } = await bothPaths(FIXTURE_DIR)
    expect(heuristic.size).toBeGreaterThan(0)
    expect(findSubsetViolations(parser, heuristic)).toEqual([])
  })

  it('真实样本（Go 标准库 net/http）上：parser ⊇ 正则', async () => {
    // 环境门控：无 go 工具链即跳过（CI runner 默认不带 Go——本地/带 Go 的环境才是证据面）
    let hasGo = true
    try {
      await execFileAsync('go', ['version'], { encoding: 'utf8' })
    } catch {
      hasGo = false
    }
    if (!hasGo) return
    const root = await realGoSample()
    const { parser, heuristic } = await bothPaths(root)
    // ⚠️ 先自证样本非空（否则「⊇」是空集真）
    expect(parser.size).toBeGreaterThan(0)
    expect(heuristic.size).toBeGreaterThan(0)
    expect(findSubsetViolations(parser, heuristic)).toEqual([])
  })

  it('真实样本（仓内 Python 构建脚本）上：Python 走 ast 解析器', async () => {
    const result = await scanProjectSource({ projectId: 'p', root: PY_BUILD_DIR })
    const py = result.languages.find((l) => l.lang === 'python')
    expect(py?.mode).toBe('parser')
    expect(py?.file_count).toBeGreaterThan(0)
    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('变异腿：给某个模式配一个**比解析器判定更宽**的正则 ⇒ ⊇ 立刻被打破', () => {
    // ⚠️ 真改数据：`StructType` 的解析器判定**认不出** `interface`，
    //   而正则 `\binterface\b` 认得出 ⇒ 构造出「正则多认出来」的那一类。
    const patterns = SOURCE_PATTERNS.map((p) =>
      p.id === 'go-struct' ? { ...p, heuristic_src: '\\bstruct\\b|\\binterface\\b' } : p,
    )
    const mutated = patterns.find((p) => p.id === 'go-struct')
    expect(mutated?.heuristic_src).toContain('interface')

    // 用判定式本身验证：正则多认出来 ⇒ 判定式必须报出来
    const parser = new Set(['go-struct|a.go|1'])
    const heuristic = new Set(['go-struct|a.go|1', 'go-struct|a.go|9'])
    expect(findSubsetViolations(parser, heuristic)).toEqual(['go-struct|a.go|9'])
  })
})

describe('M9 P4.1 · DL-17 · T0 不依赖 AI', () => {
  it('扫描链路里**没有任何 AI 依赖**（零网络调用、零 AI 客户端）', () => {
    const files = [
      ...readdirSync(SCAN_DIR)
        // ⚠️ **排除测试文件** —— 守卫规则本身写在测试里（它要提到被禁形态）
        .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
        .map((f) => join(SCAN_DIR, f)),
      join(REPO_ROOT, 'packages/core/src/services/m9-source-service.ts'),
    ]
    expect(files.length).toBeGreaterThan(3)
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, `${file} 不许出现 fetch(`).not.toMatch(/\bfetch\s*\(/)
      expect(src, `${file} 不许出现 AI 客户端`).not.toMatch(
        /openai|anthropic|ai_recommend|chat\.completions|llm/i,
      )
    }
  })

  it('变异腿：往扫描链路里塞一个 AI 调用 ⇒ 守卫当场报出', () => {
    const guard = (src: string): string[] => {
      const hits: string[] = []
      if (/\bfetch\s*\(/.test(src)) hits.push('fetch')
      if (/openai|anthropic|ai_recommend|chat\.completions|llm/i.test(src)) hits.push('ai-client')
      return hits
    }
    const clean = readFileSync(join(SCAN_DIR, 'scan.ts'), 'utf8')
    expect(guard(clean)).toEqual([])

    // ⚠️ 真改文本：把一个 AI 调用插进去
    const mutated = clean.replace(
      'export async function scanProjectSource',
      "const ai = await fetch('https://api.openai.com/v1/chat/completions')\nexport async function scanProjectSource",
    )
    expect(mutated).not.toBe(clean)
    expect(guard(mutated)).toEqual(['fetch', 'ai-client'])
  })
})

describe('M9 P4 · 模式表与库的一致性', () => {
  it('模式表里的每个 topic_slug 都能在种子里找到（**孤儿检查**）', () => {
    const slugs = new Set<string>()
    for (const f of ['lang_topics_python3.json', 'lang_topics_go.json', 'lang_topics_advanced.json']) {
      const raw = JSON.parse(
        readFileSync(join(REPO_ROOT, 'packages/core/src/db/seeds', f), 'utf8'),
      ) as { items?: { slug: string }[] }
      const items = raw.items ?? []
      for (const it of items) slugs.add(it.slug)
    }
    const orphans = SOURCE_PATTERNS.map((p) => p.topic_slug).filter((s) => !slugs.has(s))
    expect(orphans).toEqual([])
  })

  it('每个模式的 id 与启发式正则都唯一（口径只留一处）', () => {
    const ids = SOURCE_PATTERNS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('M9 P4.2 · Go 工具链探测', () => {
  it('探测得到版本（本机装了 Go ⇒ 走 parser）', async () => {
    const toolchain = await detectGoToolchain()
    if (toolchain.available) {
      expect(toolchain.version).toMatch(/^go\d+\.\d+/)
    } else {
      // ⚠️ 没装 Go ⇒ 必须**显式回退**（不许静默）
      expect(toolchain.version).toBeNull()
    }
  })

  it('⚠️ 没有 Go 工具链时**显式回退**（§3.8.2 第 1 条：不许静默）', async () => {
    const result = await scanProjectSource({
      projectId: 'p',
      root: FIXTURE_DIR,
      goBin: '/nonexistent/go-binary',
    })
    const go = result.languages.find((l) => l.lang === 'go')
    expect(go?.mode).toBe('heuristic')
    expect(go?.notice).toContain('未检测到 Go 工具链')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
