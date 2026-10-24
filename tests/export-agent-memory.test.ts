import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  absolutePathHits,
  buildReadme,
  checkAgentMemory,
  exportAgentMemory,
  indexTopicNames,
  parseIndexCounts,
  sha256,
  EXPORT_MARKER,
} from '../scripts/export-agent-memory'

/**
 * `tests/export-agent-memory.test.ts` —— 记忆导出脚本（`scripts/export-agent-memory.ts`）的判据。
 *
 * ## 它挡什么
 *
 * 导出件一旦「看起来对」就没人再看：源改了没重导、目录名指向错的 profile、
 * README 里混进本机绝对路径 —— 这三样都要在**导出当场**就红，而不是等下一轮发现。
 *
 * ## 造什么样本
 *
 * 用**真的临时目录**当源（不碰本机的真实记忆目录），所以这支用例在任何机器上都能跑，
 * 且**不依赖本机状态**。
 */

const tmpDirs: string[] = []

function mkSource(): { from: string } {
  const from = mkdtempSync(join(tmpdir(), 'ov-mem-'))
  tmpDirs.push(from)
  mkdirSync(join(from, 'topics'), { recursive: true })
  writeFileSync(
    join(from, 'MEMORY.md'),
    [
      '# MEMORY · 索引',
      '',
      '## 主题甲（topic-a）— 甲',
      '',
      '| 条目 | 要点 |',
      '|---|---|',
      '| 甲一 | 要点一 |',
      '| 甲二 | 要点二 |',
      '',
      '## 主题乙（topic-b）— 乙',
      '',
      '| 条目 | 要点 |',
      '|---|---|',
      '| 乙一 | 要点三 |',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(join(from, 'topics', 'topic-a.md'), '# 甲\n\nType: pattern\n\n甲的内容\n', 'utf8')
  writeFileSync(join(from, 'topics', 'topic-b.md'), '# 乙\n\nType: incident-lesson\n\n乙的内容\n', 'utf8')
  return { from }
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()
    if (d) rmSync(d, { recursive: true, force: true })
  }
})

describe('索引解析（纯函数）', () => {
  it('条数只数数据行：表头与分隔行不算', () => {
    const { from } = mkSource()
    const counts = parseIndexCounts(readFileSync(join(from, 'MEMORY.md'), 'utf8'))
    expect(counts.get('topic-a')).toBe(2)
    expect(counts.get('topic-b')).toBe(1)
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('主题名取自标题里的括号，不是取自值', () => {
    const { from } = mkSource()
    const names = indexTopicNames(readFileSync(join(from, 'MEMORY.md'), 'utf8'))
    expect(names).toEqual(['topic-a', 'topic-b'])
  })
})

describe('绝对路径检测', () => {
  it('三种形态各命中一次', () => {
    const hits = absolutePathHits('见 /Users/x/a 与 /home/y/b 与 C:\\c\\d')
    expect(hits.length).toBe(3)
  })

  it('没有绝对路径时零命中', () => {
    expect(absolutePathHits('路径写作 ~/.minimax/agents/x/memory 与 docs/a.md')).toEqual([])
  })
})

describe('导出', () => {
  it('产出 README ＋ 索引 ＋ 全部 topic，且与源逐字节相同', () => {
    const { from } = mkSource()
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    const res = exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })

    expect(res.entryCount).toBe(3)
    expect(res.files.sort()).toEqual(['MEMORY.md', 'topics/topic-a.md', 'topics/topic-b.md'])

    // 逐字节相同（不是「看起来一样」）
    expect(sha256(readFileSync(join(to, 'MEMORY.md'), 'utf8'))).toBe(
      sha256(readFileSync(join(from, 'MEMORY.md'), 'utf8')),
    )
    expect(sha256(readFileSync(join(to, 'topics', 'topic-a.md'), 'utf8'))).toBe(
      sha256(readFileSync(join(from, 'topics', 'topic-a.md'), 'utf8')),
    )
  })

  it('README 带来源 profile 与导出日，且零绝对路径', () => {
    const { from } = mkSource()
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })

    const readme = readFileSync(join(to, 'README.md'), 'utf8')
    expect(readme).toContain(EXPORT_MARKER)
    expect(readme).toContain('demo')
    expect(readme).toContain('2026-10-22')
    expect(readme).toContain('**3**') // 索引条目数
    expect(absolutePathHits(readme)).toEqual([])
  })

  it('索引点名的 topic 不存在 ⇒ 报错，不产出半份导出件', () => {
    const { from } = mkSource()
    // 索引里点一个磁盘上没有的主题
    writeFileSync(
      join(from, 'MEMORY.md'),
      [
        '# MEMORY · 索引',
        '',
        '## 主题甲（topic-a）— 甲',
        '',
        '| 条目 | 要点 |',
        '|---|---|',
        '| 甲一 | 要点一 |',
        '',
        '## 缺失的主题（topic-missing）— 缺',
        '',
        '| 条目 | 要点 |',
        '|---|---|',
        '| 缺一 | 要点 |',
        '',
      ].join('\n'),
      'utf8',
    )
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    expect(() => exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })).toThrow(
      /topic-missing/,
    )
  })

  it('目标目录里有不认识的文件 ⇒ 拒绝清理（不越界删别人的东西）', () => {
    const { from } = mkSource()
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    writeFileSync(join(to, 'keep-me.txt'), '别人的东西', 'utf8')
    expect(() => exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })).toThrow(
      /拒绝清理/,
    )
    // 别人的文件必须还在
    expect(readFileSync(join(to, 'keep-me.txt'), 'utf8')).toBe('别人的东西')
  })

  it('空 topic 文件 ⇒ 报错', () => {
    const { from } = mkSource()
    writeFileSync(join(from, 'topics', 'topic-b.md'), '', 'utf8')
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    expect(() => exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })).toThrow(/空文件/)
  })

  it('重跑幂等：第二次导出与第一次逐字节相同', () => {
    const { from } = mkSource()
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })
    const first = readFileSync(join(to, 'README.md'), 'utf8')
    exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })
    expect(readFileSync(join(to, 'README.md'), 'utf8')).toBe(first)
  })
})

describe('README 生成（纯函数）', () => {
  it('列出每个主题的条目数，合计等于索引条目数', () => {
    const readme = buildReadme({
      opts: { from: '/tmp/x', to: '/tmp/y', profile: 'demo', date: '2026-10-22' },
      files: ['MEMORY.md', 'topics/topic-a.md'],
      entryCount: 3,
      topicCounts: new Map([
        ['topic-a', 2],
        ['topic-b', 1],
      ]),
      names: ['topic-a', 'topic-b'],
    })
    expect(readme).toContain('| `topics/topic-a.md` | **2** |')
    expect(readme).toContain('| `topics/topic-b.md` | **1** |')
    expect(readme).toContain('| 索引条目数 | **3** |')
  })
})

/**
 * 核对模式（`--check`）：源改了但**没重导**时，仓里那份会静默过期。
 * 这一组判据挡的就是「导出只在当场自证、事后无人复查」这个缺口。
 */
describe('核对模式（只读）：导出件与源是否分叉', () => {
  function mkExported(): { from: string; to: string } {
    const { from } = mkSource()
    const to = mkdtempSync(join(tmpdir(), 'ov-mem-out-'))
    tmpDirs.push(to)
    exportAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })
    return { from, to }
  }

  it('导出后核对 ⇒ 一致', () => {
    const { from, to } = mkExported()
    const res = checkAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })
    expect(res.inSync).toBe(true)
    expect(res.entries.every((e) => e.state === 'same')).toBe(true)
  })

  it('⭐ 变异腿：改源一个字 ⇒ 核对当场报 diff（证明这条闸能红）', () => {
    const { from, to } = mkExported()
    writeFileSync(join(from, 'topics', 'topic-a.md'), '# 甲\n\nType: pattern\n\n甲的内容改了\n', 'utf8')
    const res = checkAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })
    expect(res.inSync).toBe(false)
    const hit = res.entries.find((e) => e.path === 'topics/topic-a.md')
    expect(hit?.state).toBe('diff')
  })

  it('源删掉一个 topic ⇒ 导出目录里那份记为 extra（不是默默多出来）', () => {
    const { from, to } = mkExported()
    rmSync(join(from, 'topics', 'topic-b.md'), { force: true })
    const res = checkAgentMemory({ from, to, profile: 'demo', date: '2026-10-22' })
    expect(res.inSync).toBe(false)
    expect(res.entries.find((e) => e.path === 'topics/topic-b.md')?.state).toBe('extra')
  })

  it('核对沿用 README 里**记录的导出日** ⇒ 不因「今天不同」而假红', () => {
    const { from, to } = mkExported()
    // 核对时传的 date 与记录在案的导出日不同（模拟另一天跑核对）
    const res = checkAgentMemory({ from, to, profile: 'demo', date: '2026-11-30' })
    expect(res.inSync).toBe(true)
  })
})
