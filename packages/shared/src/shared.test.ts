import { describe, expect, it } from 'vitest'
import {
  ADAPTER_IDS,
  CONTROLLED_TAG_VOCAB,
  PromptCreateInput,
  SCHEMA_VERSION,
  TermCreateInput,
  extractVariables,
  idKindOf,
  isValidPackRelativePath,
  newId,
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
