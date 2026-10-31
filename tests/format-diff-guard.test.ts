import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FORMAT_LINES_THRESHOLD,
  FORMAT_RATIO_THRESHOLD,
  collectFormatDiffReports,
  pickFormatHints,
  renderFormatHints,
} from '../scripts/format-diff-guard'

/**
 * 排版差异占比闸（2026-10-30）。
 *
 * ## 它钉的是哪一次事故
 *
 * 本仓发生过一次噪声：一次全仓 `prettier --write` 的重排被混进语义提交，
 * diff 里大量表格对齐改动淹没了真正的语义行。
 *
 * pre-commit 的闸三（排版不合 prettier 就拦）管不到「排版**合了**，
 * 却和大段语义改动混在同一批」——那种提交照样让 reviewer 找不到那一行语义改动。
 *
 * ⇒ 本文件钉的是「**这一笔里纯排版差异占多少**」这个量的算法与阈值，
 *   以及「哪些情况该提示、哪些不该」。
 *
 * ## 为什么在真 git 仓库里造场景
 *
 * 口径依赖 `git diff --cached --numstat` 与 `--ignore-all-space` 的真实行为
 * （二进制文件、重命名、行尾过滤、空白忽略的具体边界）⇒ mock 出来的数字
 *   只能证明「我算了我给的数」，证不了「我算的是 git 真正的数」。
 */

const repos: string[] = []

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'openvibe-fmt-'))
  repos.push(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

/** 提交一律在临时仓库内带上身份与关掉签名，不碰全局 git 配置 */
function commitAll(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync(
    'git',
    [
      '-c',
      'user.email=fmt@example.com',
      '-c',
      'user.name=fmt',
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

/** 一张 50 行的 Markdown 表格（列宽不齐 ⇒ prettier 会给它加空格对齐） */
function wideTable(rows: number): string {
  const out: string[] = ['| 名称 | 说明 | 状态 |', '| --- | --- | --- |']
  for (let i = 0; i < rows; i++) out.push(`| 条目${String(i)} | 说明文字${String(i)} | 完成 |`)
  return out.join('\n') + '\n'
}

/** 列宽不齐的版本（prettier 会把它对齐 ⇒ 纯空白差异） */
function wideTableUnaligned(rows: number): string {
  const out: string[] = ['| 名称 | 说明 | 状态 |', '| --- | --- | --- |']
  for (let i = 0; i < rows; i++) out.push(`| 条目${String(i)} | 说明文字${String(i)} | 完成 |`)
  return out.join('\n') + '\n'
}

describe('排版差异占比 · 口径', () => {
  it('纯排版差异（只有表格列对齐的空白变化）⇒ 占比接近 100%', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), wideTableUnaligned(50))
    commitAll(dir, '初始')
    // 同一张表，但每行末尾加空格（模拟 prettier 的列对齐）
    writeFileSync(join(dir, 'a.md'), wideTable(50).replace(/\n/g, '  \n'))
    execFileSync('git', ['add', 'a.md'], { cwd: dir })

    const reports = collectFormatDiffReports(dir)
    expect(reports).toHaveLength(1)
    const r = reports[0]!
    expect(r.formatLines).toBeGreaterThan(0)
    expect(r.semanticLines).toBe(0)
    expect(r.ratio).toBeGreaterThan(0.9)
  })

  it('纯语义改动（无空白差异）⇒ 占比为 0，不提示', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), '第一行\n第二行\n')
    commitAll(dir, '初始')
    writeFileSync(join(dir, 'a.md'), '第一行\n第二行改了\n')
    execFileSync('git', ['add', 'a.md'], { cwd: dir })

    const reports = collectFormatDiffReports(dir)
    expect(reports).toHaveLength(1)
    expect(reports[0]!.formatLines).toBe(0)
    expect(reports[0]!.ratio).toBe(0)
    expect(pickFormatHints(reports)).toEqual([])
  })

  it('⚠️ 一行语义 + 大段表格对齐 ⇒ 判定为「排版主导」并提示', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), wideTableUnaligned(50))
    commitAll(dir, '初始')
    // 一行语义改动 + 整张表被 prettier 对齐
    writeFileSync(join(dir, 'a.md'), `语义改动行\n${wideTable(50).replace(/\n/g, '  \n')}`)
    execFileSync('git', ['add', 'a.md'], { cwd: dir })

    const reports = collectFormatDiffReports(dir)
    const hints = pickFormatHints(reports)
    expect(hints).toHaveLength(1)
    expect(hints[0]!.path).toBe('a.md')
    expect(hints[0]!.percent).toBeGreaterThan(60)
    expect(hints[0]!.formatLines).toBeGreaterThan(FORMAT_LINES_THRESHOLD)
  })

  it('⚠️ 纯排版文件在「忽略空白」的 numstat 里会整个消失 ⇒ 那不是「未知」而是「零语义改动」', () => {
    // 这条钉的是一道**曾经静默失效**的闸：`--ignore-all-space` 的 numstat 里，
    // 纯空白差异的文件**整个不存在**。早先把它当「未知」回退成总改动行数
    // ⇒ 每个文件都被算成 0% 排版 ⇒ 闸永远不提示，而它看起来像「一切正常」。
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), wideTableUnaligned(50))
    commitAll(dir, '初始')
    writeFileSync(join(dir, 'a.md'), wideTable(50).replace(/\n/g, '  \n'))
    execFileSync('git', ['add', 'a.md'], { cwd: dir })

    const reports = collectFormatDiffReports(dir)
    expect(reports).toHaveLength(1)
    // 语义改动必须是 0（不是「等于总改动」）
    expect(reports[0]!.semanticLines).toBe(0)
    // 且必须被判成「排版主导」⇒ 会提示
    expect(pickFormatHints(reports)).toHaveLength(1)
  })

  it('新增文件不参与占比计算（HEAD 里没有旧版本，无从比）', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), '初始\n')
    commitAll(dir, '初始')
    writeFileSync(join(dir, 'new.md'), '全新文件\n'.repeat(80))
    execFileSync('git', ['add', 'new.md'], { cwd: dir })

    const reports = collectFormatDiffReports(dir)
    // `--diff-filter=ACMR` 含 A，但新增文件没有「旧排版」可比
    // ⇒ 它要么不出现，要么 formatLines 为 0；两种都不该被提示。
    const hints = pickFormatHints(reports)
    expect(hints).toEqual([])
  })

  it('小文件里的空白差异不提示（改两格空格是日常）', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.md'), '第一行\n')
    commitAll(dir, '初始')
    writeFileSync(join(dir, 'a.md'), '第一行  \n')
    execFileSync('git', ['add', 'a.md'], { cwd: dir })

    const reports = collectFormatDiffReports(dir)
    expect(pickFormatHints(reports)).toEqual([])
  })
})

describe('排版差异占比 · 阈值与文案', () => {
  it('两个条件都满足才提示（占比高但行数少 ⇒ 不提示）', () => {
    const reports = [
      { path: 'a.md', totalLines: 100, semanticLines: 10, formatLines: 90, ratio: 0.9 },
    ]
    expect(pickFormatHints(reports, FORMAT_RATIO_THRESHOLD, 200)).toEqual([])
    expect(pickFormatHints(reports, FORMAT_RATIO_THRESHOLD, 30)).toHaveLength(1)
  })

  it('行数够但占比不够 ⇒ 不提示', () => {
    const reports = [
      { path: 'a.md', totalLines: 1000, semanticLines: 500, formatLines: 500, ratio: 0.5 },
    ]
    expect(pickFormatHints(reports)).toEqual([])
  })

  it('提示文案带文件名、占比与行数，且写明「不拦提交」', () => {
    const text = renderFormatHints([
      { path: 'docs/a.md', percent: 86, formatLines: 43, totalLines: 50 },
    ])
    expect(text).toContain('docs/a.md')
    expect(text).toContain('86%')
    expect(text).toContain('43')
    expect(text).toContain('不拦提交')
  })

  it('⚠️ 阈值本身可调（不是写死在代码里的一堆数字）', () => {
    const reports = [
      { path: 'a.md', totalLines: 100, semanticLines: 40, formatLines: 60, ratio: 0.6 },
    ]
    // 默认阈值：0.6 不是「超过」0.6 ⇒ 不提示
    expect(pickFormatHints(reports)).toEqual([])
    // 阈值调低 ⇒ 提示
    expect(pickFormatHints(reports, 0.5, 30)).toHaveLength(1)
  })
})
