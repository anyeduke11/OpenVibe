import { describe, expect, it } from 'vitest'
import { AppError } from '@openvibe/shared'
import { parseImportFiles, stripFrontmatter } from './index'

describe('UT-IMPORTER-01 · 规则文件四解析器（dev-plan §7.3 / m1 FR-6）', () => {
  it('.cursorrules → 全文 + rule + cursor', () => {
    const [item] = parseImportFiles([
      { filename: '.cursorrules', content: 'always respond in chinese' },
    ])
    expect(item).toBeDefined()
    expect(item?.title).toBe('.cursorrules')
    expect(item?.useAs).toBe('rule')
    expect(item?.platformMarks).toEqual(['cursor'])
    expect(item?.content).toBe('always respond in chinese')
  })

  it('CLAUDE.md → claude-code；AGENTS.md → generic（精确名优先于 .md 通道）', () => {
    const items = parseImportFiles([
      { filename: 'CLAUDE.md', content: '# 项目规则\n全文入 content' },
      { filename: 'AGENTS.md', content: 'agents body' },
    ])
    expect(items[0]?.platformMarks).toEqual(['claude-code'])
    expect(items[1]?.platformMarks).toEqual(['generic'])
    expect(items[0]?.title).toBe('CLAUDE.md')
    // 规则文件不做 H1 提取（表格约定：全文入 content，title=文件名）
    expect(items[0]?.content).toContain('# 项目规则')
  })

  it('.mdc → frontmatter 剥离入 description，正文入 content（m1 FR-6.4）', () => {
    const [item] = parseImportFiles([
      {
        filename: 'openvibe.mdc',
        content: '---\ndescription: "包规则"\nglobs: ""\nalwaysApply: true\n---\n正文内容在此',
      },
    ])
    expect(item?.description).toBe('包规则')
    expect(item?.content.trim()).toBe('正文内容在此')
    expect(item?.useAs).toBe('rule')
    expect(item?.platformMarks).toEqual(['cursor'])
  })

  it('stripFrontmatter 对无 frontmatter 文本原样返回', () => {
    const r = stripFrontmatter('没有头块的正文')
    expect(r.description).toBe('')
    expect(r.body).toBe('没有头块的正文')
  })
})

describe('UT-IMPORTER-02 · Markdown 与 JSON 通道 + 整批拒绝', () => {
  it('.md 无 H1 → title 取文件名；有 H1 → title 取标题（m1 FR-6.2）', () => {
    const items = parseImportFiles([
      { filename: '重构指南.md', content: '# 重构引导\n步骤…' },
      { filename: '随手记.md', content: '无标题正文' },
    ])
    expect(items[0]?.title).toBe('重构引导')
    expect(items[1]?.title).toBe('随手记.md')
    expect(items[0]?.useAs).toBe('reference')
  })

  it('JSON 导出文件回导：多 items 展开（m1 FR-6.1）', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-21T00:00:00Z',
      items: [
        { title: 'A', content: 'ca' },
        { title: 'B', content: 'cb', useAs: 'rule' },
      ],
    })
    const items = parseImportFiles([{ filename: 'prompts-export.json', content: json }])
    expect(items).toHaveLength(2)
    expect(items[1]?.useAs).toBe('rule')
  })

  it('非法 JSON / 未知扩展名 / 超 512KB → AppError VALIDATION_ERROR（m1 §6.5 整批拒绝）', () => {
    expect(() => parseImportFiles([{ filename: 'bad.json', content: '{not json' }])).toThrow(
      AppError,
    )
    expect(() => parseImportFiles([{ filename: 'x.toml', content: 'a = 1' }])).toThrow(
      /不支持的文件类型/,
    )
    const big = 'x'.repeat(600 * 1024)
    let caught: unknown
    try {
      parseImportFiles([{ filename: 'big.md', content: `# t\n${big}` }])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).code).toBe('VALIDATION_ERROR')
    expect((caught as AppError).message).toContain('big.md')
  })
})
