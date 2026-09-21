import { describe, expect, it } from 'vitest'
import {
  ADAPTER_IDS,
  CONTROLLED_TAG_VOCAB,
  PromptCreateInput,
  SCHEMA_VERSION,
  TermCreateInput,
  bidirectionalRelatedIds,
  dedupeAliases,
  extractVariables,
  findMatchRanges,
  idKindOf,
  isValidPackRelativePath,
  newId,
  renderTermsMdTable,
} from './index'

describe('UT-EXAMPLE-01 · shared 基础能力', () => {
  it('newId 生成带前缀的 nanoid，idKindOf 可反查', () => {
    const id = newId('prompt')
    expect(id.startsWith('prm_')).toBe(true)
    expect(id.length).toBeGreaterThan('prm_'.length)
    expect(idKindOf(id)).toBe('prompt')
    expect(idKindOf('unknown-id')).toBeNull()
  })

  it('契约常量：schemaVersion=1、六 adapter、八类受控词表', () => {
    expect(SCHEMA_VERSION).toBe(1)
    expect(ADAPTER_IDS).toHaveLength(6)
    expect(CONTROLLED_TAG_VOCAB).toHaveLength(8)
  })

  it('变量提取：合法名去重、非法名忽略（m1 FR-2.1）', () => {
    const content = '审查 {{language}} 与 {{ language }}，忽略 {{非法名}}、{{a-b}} 与 {{a_b}}'
    expect(extractVariables(content).sort()).toEqual(['a-b', 'a_b', 'language'])
  })

  it('PromptCreateInput：空 title / 缺 content 被拒', () => {
    expect(PromptCreateInput.safeParse({ title: '', content: 'x' }).success).toBe(false)
    expect(PromptCreateInput.safeParse({ title: 'ok' }).success).toBe(false)
    expect(PromptCreateInput.safeParse({ title: 'ok', content: 'x' }).success).toBe(true)
  })

  it('TermCreateInput：zh/en 全空被拒（m3 §6.1）', () => {
    const base = { definition: '定义内容' }
    expect(TermCreateInput.safeParse(base).success).toBe(false)
    expect(TermCreateInput.safeParse({ ...base, zh: '规则漂移' }).success).toBe(true)
    expect(TermCreateInput.safeParse({ ...base, en: 'rule drift' }).success).toBe(true)
  })

  it('包相对路径安全规则（design §7.7）', () => {
    expect(isValidPackRelativePath('CLAUDE.md')).toBe(true)
    expect(isValidPackRelativePath('.cursor/rules/openvibe.mdc')).toBe(true)
    expect(isValidPackRelativePath('../evil.txt')).toBe(false)
    expect(isValidPackRelativePath('/abs/path')).toBe(false)
    expect(isValidPackRelativePath('a\\b')).toBe(false)
    expect(isValidPackRelativePath('a//b')).toBe(false)
  })
})

describe('UT-TERMSMD-01 · TERMS.md 契约纯函数（shared）', () => {
  it('表头固定、裸 | 转义、换行折叠', () => {
    const md = renderTermsMdTable('选集', [
      {
        zh: '术语表',
        en: 'TERMS.md',
        aliases: ['词汇标准'],
        definition: '列序为 术语 | English | 别名 | 定义',
      },
      { zh: '带换行', en: 'br', aliases: [], definition: '第一行\n第二行' },
    ])
    expect(md.split('\n').slice(0, 6)).toEqual([
      '# 术语表 · 选集',
      '',
      '> AI 与团队共用的词汇标准；新词请先入库再使用。',
      '',
      '| 术语 | English | 别名 | 定义 |',
      '|------|---------|------|------|',
    ])
    expect(md).toContain('列序为 术语 \\| English \\| 别名 \\| 定义')
    expect(md).toContain('| 带换行 | br |  | 第一行 第二行 |')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('组包标题可注入 packName@version（design §7.4）', () => {
    const md = renderTermsMdTable('default@1.0.0', [])
    expect(md.split('\n')[0]).toBe('# 术语表 · default@1.0.0')
  })

  it('双向相关取并集、排除自指、按 id 码点序', () => {
    const terms = [
      { id: 'trm_b', relatedTermIds: ['trm_a', 'trm_a'] },
      { id: 'trm_a', relatedTermIds: ['trm_c', 'trm_a'] },
      { id: 'trm_c', relatedTermIds: [] },
    ]
    expect(bidirectionalRelatedIds(terms, 'trm_a')).toEqual(['trm_b', 'trm_c'])
    expect(bidirectionalRelatedIds(terms, 'trm_c')).toEqual(['trm_a'])
    expect(bidirectionalRelatedIds(terms, 'trm_missing')).toEqual([])
  })

  it('别名去重忽略大小写与空白；命中区间大小写无关', () => {
    expect(dedupeAliases([' RAG ', 'rag', 'RAG', '', '检索增强'])).toEqual(['RAG', '检索增强'])
    expect(findMatchRanges('Rule Drift 规则漂移', 'drift')).toEqual([{ start: 5, end: 10 }])
    expect(findMatchRanges('a-b-a', 'a')).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ])
    expect(findMatchRanges('', 'x')).toEqual([])
    expect(findMatchRanges('abc', '')).toEqual([])
  })
})
