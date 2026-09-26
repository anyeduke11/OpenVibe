import { describe, expect, it } from 'vitest'
import {
  ADAPTER_IDS,
  CONTROLLED_TAG_VOCAB,
  PACK_GENERATOR,
  PACK_LEAD_QUOTE,
  PACK_MARKER_BEGIN,
  PACK_MARKER_END,
  PACK_SECTION_ORDER,
  PACK_TITLE,
  PackSelection,
  PromptCreateInput,
  SCHEMA_VERSION,
  TermCreateInput,
  bidirectionalRelatedIds,
  compareCodeUnit,
  dedupeAliases,
  extractVariables,
  findMatchRanges,
  idKindOf,
  isValidPackRelativePath,
  newId,
  packSubject,
  renderFrontmatter,
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

  it('PackSelection：playbookIds 非空即拒（M4 未上，owner 裁 ⑫），其余四字段不受影响', () => {
    // 缺省与显式空都得过：`default([])` 那半件不能因为加闸而变成「必须显式传」
    expect(PackSelection.safeParse({}).data?.playbookIds).toEqual([])
    expect(PackSelection.safeParse({ playbookIds: [] }).success).toBe(true)

    const rejected = PackSelection.safeParse({ playbookIds: ['pbx_1'] })
    expect(rejected.success).toBe(false)
    const issues = rejected.success ? [] : rejected.error.issues
    expect(issues.map((i) => i.path.join('.'))).toEqual(['playbookIds'])
    // 文案要点名「为什么拒」，只说「校验失败」等于把锅推给调用方
    expect(issues[0]?.message).toContain('M4')

    expect(PackSelection.safeParse({ promptIds: ['prm_1'], termIds: ['trm_1'] }).success).toBe(true)
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

describe('UT-PACKCONTRACT-01 · 标准包正文契约常量（design §7.3/§7.4）', () => {
  it('受管块标记、标题、引导引用逐字冻结', () => {
    expect(PACK_MARKER_BEGIN('default', '1.0.0')).toBe(
      '<!-- openvibe:pack=default@1.0.0 begin (regenerate: npx openvibe-cli sync) -->',
    )
    expect(PACK_MARKER_END).toBe('<!-- openvibe:end -->')
    expect(PACK_TITLE('default', '1.0.0')).toBe('# OpenVibe 标准包：default@1.0.0')
    expect(PACK_LEAD_QUOTE).toBe(
      '> 本文件由 OpenVibe 生成。要修改标准，请回资产库改后重新注入；\n' +
        '> 本地手改会被 `openvibe diff` 漂移检测发现。',
    )
    expect(PACK_GENERATOR).toBe('openvibe/0.1.0')
    expect(packSubject('default', '1.0.0')).toBe('default@1.0.0')
  })

  it('节序固定为四节且不可配置（确定性来源）', () => {
    expect([...PACK_SECTION_ORDER]).toEqual([
      '## 工作流程',
      '## 行为规则',
      '## 术语表',
      '## 任务提示词参考',
    ])
  })

  it('renderFrontmatter：键序即写入序、布尔小写、字符串原样、结尾换行', () => {
    expect(
      renderFrontmatter({
        description: '"带引号的值"',
        globs: '""',
        alwaysApply: true,
      }),
    ).toBe('---\ndescription: "带引号的值"\nglobs: ""\nalwaysApply: true\n---\n')
    expect(renderFrontmatter({})).toBe('---\n\n---\n')
  })

  it('compareCodeUnit 用码点序：大写先于小写，不受 locale 影响', () => {
    expect(['b', 'A', 'a', 'B'].sort(compareCodeUnit)).toEqual(['A', 'B', 'a', 'b'])
    expect(['AGENTS.md', '.trae/rules/openvibe.md', 'CLAUDE.md'].sort(compareCodeUnit)).toEqual([
      '.trae/rules/openvibe.md',
      'AGENTS.md',
      'CLAUDE.md',
    ])
    expect(compareCodeUnit('x', 'x')).toBe(0)
  })
})
