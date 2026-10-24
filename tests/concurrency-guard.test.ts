import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectRollbackMarkers,
  detectStagedWorktreeDrift,
  dropPreexistingMarkers,
  firstDifferenceLine,
  judgeDrift,
  runGuard,
  type DriftFacts,
  type MarkerHit,
  type StagedBlob,
} from '../scripts/concurrency-guard'
import { DEFAULT_MARKERS } from '../scripts/ownership-check'

/**
 * `scripts/concurrency-guard.ts` 的判据测试（2026-10-24）。
 *
 * ## 本文件的第一条纪律：不含任何标志字面量
 *
 * 护栏的规则 B 会在**已暂存内容**里搜回退标志。若本文件把标志字面量原样写进源码，
 * 它自己就会被护栏判成「把回退态提交」⇒ 判据测试反而让闸永远红。
 *
 * ⇒ 本文件的所有标志字面量都**由标志正则派生**（`literalOf`），一个都不手写。
 * 这样「标志能抓到真实回退」这条判据测得到，而本文件自身不含标志 ⇒ 闸不自伤。
 */

/** 从标志正则派生「一定会命中它的字面量」——正则源码去掉转义即可 */
const literalOf = (re: RegExp): string => re.source.replace(/\\(.)/g, '$1')

/** 取第一个标志的字面量（判据只关心「有标志能命中」，不关心是哪一个） */
const SOME_MARKER = literalOf(DEFAULT_MARKERS[0]!)

const facts = (over: Partial<DriftFacts> & { path: string }): DriftFacts => ({
  indexContent: '第一行\n第二行\n',
  worktreeContent: '第一行\n第二行\n',
  worktreeOnlyLines: 0,
  stagedOnlyLines: 0,
  ...over,
})

/* ------------------------------------------------------------------ 规则 A · 纯函数 */

describe('concurrency-guard · 规则 A：暂存与工作树分歧', () => {
  it('两边逐字相同 ⇒ 无漂移（不报任何一条）', () => {
    expect(judgeDrift([facts({ path: 'a.md' })])).toEqual([])
  })

  it('工作树多出内容 ⇒ 记一条，并给出未纳入行数与首个不一致行', () => {
    const r = judgeDrift([
      facts({
        path: 'DEV_LOG.md',
        indexContent: '第一行\n第二行\n',
        worktreeContent: '第一行\n第二行\n第三行（别人的在编内容）\n',
        worktreeOnlyLines: 1,
        stagedOnlyLines: 0,
      }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]!.path).toBe('DEV_LOG.md')
    expect(r[0]!.worktreeOnlyLines).toBe(1)
    expect(r[0]!.stagedOnlyLines).toBe(0)
    expect(r[0]!.firstDiffLine).toBe(3)
    expect(r[0]!.worktreeExcerpt).toContain('别人的在编内容')
    expect(r[0]!.worktreeMissing).toBe(false)
  })

  it('index 比工作树新（磁盘比提交旧）⇒ 同样记一条，方向体现在计数上', () => {
    const r = judgeDrift([
      facts({
        path: 'a.md',
        indexContent: '第一行\n第二行\n',
        worktreeContent: '第一行\n',
        worktreeOnlyLines: 0,
        stagedOnlyLines: 1,
      }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]!.worktreeOnlyLines).toBe(0)
    expect(r[0]!.stagedOnlyLines).toBe(1)
  })

  it('工作树已无此文件 ⇒ 记一条并标出 worktreeMissing', () => {
    const r = judgeDrift([facts({ path: 'gone.md', worktreeContent: null })])
    expect(r).toHaveLength(1)
    expect(r[0]!.worktreeMissing).toBe(true)
    expect(r[0]!.worktreeExcerpt).toContain('工作树已无此文件')
  })

  it('git 视角下两边等价（计数为 0）⇒ 不报（行尾/属性过滤差异不该误伤）', () => {
    const r = judgeDrift([
      facts({
        path: 'crlf.md',
        indexContent: '第一行\n',
        worktreeContent: '第一行\r\n',
        worktreeOnlyLines: 0,
        stagedOnlyLines: 0,
      }),
    ])
    expect(r).toEqual([])
  })

  it('首个不一致行：短的是长的前缀 ⇒ 差异落在短的那行之后', () => {
    expect(firstDifferenceLine(['a', 'b'], ['a', 'b', 'c'])).toBe(3)
    expect(firstDifferenceLine(['a', 'b', 'c'], ['a', 'b'])).toBe(3)
    expect(firstDifferenceLine(['a', 'x'], ['a', 'y'])).toBe(2)
  })
})

/* ------------------------------------------------------------------ 规则 B · 纯函数 */

describe('concurrency-guard · 规则 B：回退特征', () => {
  it('已暂存内容命中标志 ⇒ 报出行号、标志字面量与原文', () => {
    const hits = detectRollbackMarkers([
      { path: 'docs/specs/x.md', content: `第一行\n状态：${SOME_MARKER}\n第三行\n` },
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]!.path).toBe('docs/specs/x.md')
    expect(hits[0]!.line).toBe(2)
    expect(hits[0]!.marker).toBe(SOME_MARKER)
    expect(hits[0]!.excerpt).toContain(SOME_MARKER)
  })

  it('内容里没有标志 ⇒ 一条都不报', () => {
    expect(detectRollbackMarkers([{ path: 'a.md', content: '干净的内容\n' }])).toEqual([])
  })

  it('自引用豁免：判据文件按构造必须含标志字面量，不该被判成回退', () => {
    const hits = detectRollbackMarkers([
      { path: 'scripts/ownership-check.ts', content: `const M = "${SOME_MARKER}"\n` },
      { path: 'tests/ownership-check.test.ts', content: `const s = "${SOME_MARKER}"\n` },
    ])
    expect(hits).toEqual([])
  })

  it('既有词汇豁免：同一标志在该文件上一版已存在 ⇒ 不算这一笔引入的回退', () => {
    const hit: MarkerHit = { path: 'DEV_LOG.md', line: 10, marker: SOME_MARKER, excerpt: SOME_MARKER }
    const kept = dropPreexistingMarkers([hit], [{ path: 'DEV_LOG.md', content: `历史正文里也有 ${SOME_MARKER}\n` }])
    expect(kept).toEqual([])
  })

  it('既有词汇豁免只认同一文件：别的文件出现过不算', () => {
    const hit: MarkerHit = { path: 'docs/specs/x.md', line: 10, marker: SOME_MARKER, excerpt: SOME_MARKER }
    const kept = dropPreexistingMarkers([hit], [{ path: 'DEV_LOG.md', content: `别的文件里有 ${SOME_MARKER}\n` }])
    expect(kept).toHaveLength(1)
  })

  it('新增文件（HEAD 无此文件）⇒ 不豁免，命中照报', () => {
    const hit: MarkerHit = { path: 'new.md', line: 1, marker: SOME_MARKER, excerpt: SOME_MARKER }
    expect(dropPreexistingMarkers([hit], [])).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ 集成测（真 git 仓库） */

const repos: string[] = []

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'openvibe-guard-'))
  repos.push(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

/** 提交一律在临时仓库内带上身份与关掉签名，不碰全局 git 配置 */
function commitAll(dir: string, message: string): void {
  execFileSync(
    'git',
    [
      '-c',
      'user.email=guard@example.com',
      '-c',
      'user.name=guard',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      message,
    ],
    { cwd: dir },
  )
}

afterAll(() => {
  for (const dir of repos) rmSync(dir, { recursive: true, force: true })
})

describe('concurrency-guard · 集成：真仓库里暂存与工作树分叉', () => {
  it('暂存之后工作树又被改 ⇒ 检出漂移，规则 A 拦下', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'DEV_LOG.md'), '第一行\n第二行\n')
    execFileSync('git', ['add', 'DEV_LOG.md'], { cwd: dir })
    // 模拟并行会话把内容写进同一个文件的工作树
    writeFileSync(join(dir, 'DEV_LOG.md'), '第一行\n第二行\n第三行（别人的在编内容）\n')

    const drift = detectStagedWorktreeDrift(dir)
    expect(drift).toHaveLength(1)
    expect(drift[0]!.path).toBe('DEV_LOG.md')
    expect(drift[0]!.worktreeOnlyLines).toBe(1)

    const outcome = runGuard({ repoRoot: dir, env: {} })
    expect(outcome.exitCode).toBe(1)
    const text = outcome.lines.join('\n')
    expect(text).toContain('规则 A')
    expect(text).toContain('DEV_LOG.md')
    expect(text).toContain('为什么危险')
    expect(text).toContain('怎么处置')
  })

  it('工作树与暂存区一致 ⇒ 放行（退出码 0）', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), '第一行\n')
    execFileSync('git', ['add', 'a.md'], { cwd: dir })

    const outcome = runGuard({ repoRoot: dir, env: {} })
    expect(outcome.exitCode).toBe(0)
    expect(outcome.lines.join('\n')).toContain('通过')
  })

  it('规则 A 可被环境变量显式放行，且放行文案写清了变量名与用法', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), '第一行\n')
    execFileSync('git', ['add', 'a.md'], { cwd: dir })
    writeFileSync(join(dir, 'a.md'), '第一行\n第二行\n')

    const blocked = runGuard({ repoRoot: dir, env: {} })
    expect(blocked.exitCode).toBe(1)

    const allowed = runGuard({ repoRoot: dir, env: { OPENVIBE_ALLOW_PARTIAL_STAGE: '1' } })
    expect(allowed.exitCode).toBe(0)
    expect(allowed.driftAllowed).toBe(true)
    expect(allowed.lines.join('\n')).toContain('OPENVIBE_ALLOW_PARTIAL_STAGE=1')
  })
})

describe('concurrency-guard · 集成：真仓库里已暂存内容含回退特征', () => {
  it('暂存内容命中标志 ⇒ 规则 B 拦下，且不被规则 A 的放行变量放过', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'docs.md'), `状态：${SOME_MARKER}\n`)
    execFileSync('git', ['add', 'docs.md'], { cwd: dir })

    const outcome = runGuard({ repoRoot: dir, env: { OPENVIBE_ALLOW_PARTIAL_STAGE: '1' } })
    expect(outcome.exitCode).toBe(1)
    expect(outcome.markers.length).toBeGreaterThan(0)
    const text = outcome.lines.join('\n')
    expect(text).toContain('规则 B')
    expect(text).toContain('docs.md')
    expect(text).toContain('不提供放行开关')
  })

  it('同一标志在该文件上一版已存在 ⇒ 视为既有词汇，放行', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'docs.md'), `状态：${SOME_MARKER}\n`)
    execFileSync('git', ['add', 'docs.md'], { cwd: dir })
    commitAll(dir, 'init')

    writeFileSync(join(dir, 'docs.md'), `状态：${SOME_MARKER}\n新增一行\n`)
    execFileSync('git', ['add', 'docs.md'], { cwd: dir })

    const outcome = runGuard({ repoRoot: dir, env: {} })
    expect(outcome.markers).toEqual([])
    expect(outcome.exitCode).toBe(0)
  })
})

describe('concurrency-guard · 采集层', () => {
  it('已暂存内容取自 index 而非工作树（index 与工作树不同时，采到的必须是暂存版）', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), '暂存版\n')
    execFileSync('git', ['add', 'a.md'], { cwd: dir })
    writeFileSync(join(dir, 'a.md'), '工作树版\n')

    const outcome = runGuard({ repoRoot: dir, env: {} })
    // 采集层拿到的是暂存版（'暂存版'），所以规则 B 看不到工作树里的内容
    expect(outcome.markers).toEqual([])
    expect(outcome.drift).toHaveLength(1)
  })

  it('空暂存区（没有任何已暂存文件）⇒ 零漂移零命中，不报错', () => {
    const dir = makeRepo()
    const outcome = runGuard({ repoRoot: dir, env: {} })
    expect(outcome.drift).toEqual([])
    expect(outcome.markers).toEqual([])
    expect(outcome.exitCode).toBe(0)
  })

  it('纯函数不依赖 IO：注入内容即可判定（同一份事实两次判定结果一致）', () => {
    const blob: StagedBlob = { path: 'x.md', content: `命中：${SOME_MARKER}\n` }
    expect(detectRollbackMarkers([blob])).toEqual(detectRollbackMarkers([blob]))
  })
})
