import { describe, expect, it } from 'vitest'
import { ADAPTER_IDS, AppError, renderFrontmatter } from '@openvibe/shared'
import type { AdapterId, ResolvedPack } from '@openvibe/shared'
import { COMPAT_MATRIX, adaptersFor, coveredPlatforms, planMainFiles, registry } from './index'

const pack = (targets: AdapterId[]): ResolvedPack => ({
  id: 'pk_demo',
  name: 'default',
  version: '1.0.0',
  description: '',
  targets,
  flow: null,
  prompts: [],
  terms: [],
  skills: [],
})

describe('UT-ADAPTER-01 · registry 与产物路径（design §8 v1.3 冻结）', () => {
  it('六个 MVP adapter 全注册，id 与 ADAPTER_IDS 一一对应', () => {
    expect(Object.keys(registry).sort()).toEqual([...ADAPTER_IDS].sort())
    for (const id of ADAPTER_IDS) expect(registry[id].id).toBe(id)
  })

  it('每个 adapter 恰好产出一个主规则文件，路径逐字冻结', () => {
    const expectPath: Record<AdapterId, string> = {
      'claude-code': 'CLAUDE.md',
      cursor: '.cursor/rules/openvibe.mdc',
      'generic-agents': 'AGENTS.md',
      codebuddy: 'CODEBUDDY.md',
      trae: '.trae/rules/openvibe.md',
      minicode: 'MINI.md',
    }
    for (const id of ADAPTER_IDS) {
      const planned = registry[id].plan(pack([id]))
      expect(planned).toHaveLength(1)
      expect(planned[0]?.path).toBe(expectPath[id])
    }
  })

  it('四个原样壳无 frontmatter；cursor 与 trae 有壳（§7.4）', () => {
    for (const id of ['claude-code', 'generic-agents', 'codebuddy', 'minicode'] as AdapterId[]) {
      expect(registry[id].plan(pack([id]))[0]?.frontmatter).toBeUndefined()
    }
    expect(registry.cursor.plan(pack(['cursor']))[0]?.frontmatter).toBeDefined()
    expect(registry.trae.plan(pack(['trae']))[0]?.frontmatter).toBeDefined()
  })
})

describe('UT-ADAPTER-02 · 壳的字节级渲染（golden 的前置）', () => {
  it('cursor：YAML frontmatter，description 带引号、globs 空串、alwaysApply true', () => {
    const planned = registry.cursor.plan(pack(['cursor']))[0]!
    expect(renderFrontmatter(planned.frontmatter!)).toBe(
      [
        '---',
        'description: "OpenVibe 标准包 default@1.0.0"',
        'globs: ""',
        'alwaysApply: true',
        '---',
        '',
      ].join('\n'),
    )
  })

  it('trae：裸值 frontmatter（Trae 解析器按首个 : 切分后原样取值，不加引号）', () => {
    const planned = registry.trae.plan(pack(['trae']))[0]!
    expect(renderFrontmatter(planned.frontmatter!)).toBe(
      ['---', 'description: OpenVibe 标准包 default@1.0.0', 'alwaysApply: true', '---', ''].join(
        '\n',
      ),
    )
  })
})

describe('UT-ADAPTER-03 · 多 adapter 编排（planMainFiles / adaptersFor）', () => {
  it('四根级文件正文同名不同、内容一致：plan 只给路径，正文交给 composer', () => {
    const files = planMainFiles(pack(['claude-code', 'codebuddy', 'minicode', 'generic-agents']))
    expect(files.map((f) => f.path)).toEqual(['AGENTS.md', 'CLAUDE.md', 'CODEBUDDY.md', 'MINI.md'])
    expect(files.every((f) => f.frontmatter === undefined)).toBe(true)
  })

  it('去重 + 码点序 + 可重复调用（确定性）', () => {
    const a = planMainFiles(pack(['trae', 'cursor', 'claude-code']))
    const b = planMainFiles(pack(['claude-code', 'cursor', 'trae', 'trae']))
    expect(a).toEqual(b)
    expect(a.map((f) => f.path)).toEqual([
      '.cursor/rules/openvibe.mdc',
      '.trae/rules/openvibe.md',
      'CLAUDE.md',
    ])
  })

  it('未知 target → VALIDATION_ERROR（不静默产空集）', () => {
    expect(() => adaptersFor(['windsurf'] as unknown as AdapterId[])).toThrowError(AppError)
    try {
      adaptersFor(['nope'] as unknown as AdapterId[])
      expect.unreachable()
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION_ERROR')
    }
  })
})

describe('UT-ADAPTER-04 · 兼容矩阵与「本包覆盖平台」', () => {
  it('兼容矩阵只指向已存在的产物路径（零代码新增平台的不变量）', () => {
    const artifactPaths = new Set(
      ADAPTER_IDS.flatMap((id) => registry[id].plan(pack([id])).map((f) => f.path)),
    )
    for (const row of COMPAT_MATRIX) expect(artifactPaths.has(row.reads)).toBe(true)
  })

  it('只选 generic-agents → AGENTS.md 生态全部行，码点序', () => {
    expect(coveredPlatforms(['generic-agents'])).toEqual([
      'Cline',
      'Codex',
      'Kimi Code',
      'OpenCode',
      'Qwen Code',
      'Trae CN',
      'zcode',
    ])
  })

  it('FR-1.4 口径是「额外覆盖」：所选平台自身不重复列，只有 AGENTS.md 有兼容行', () => {
    expect(coveredPlatforms(['claude-code', 'cursor', 'codebuddy', 'trae', 'minicode'])).toEqual([])
    expect(coveredPlatforms(['trae', 'generic-agents'])).toEqual(
      coveredPlatforms(['generic-agents']),
    )
    expect(coveredPlatforms([])).toEqual([])
  })
})
