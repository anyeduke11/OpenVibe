import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { newDb } from '../test-support/new-db'
import { TermsRepo } from '../repos/terms'
import { AppError } from '@openvibe/shared'

describe('UT-FTS-03/04 · 术语搜索（主名/英文/别名）', () => {
  it('两字词走 LIKE，英文与别名走 FTS', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    repo.create({
      zh: '规则漂移',
      en: 'rule drift',
      aliases: ['大模型漂移'],
      definition: '长会话中模型逐渐偏离规则文件约束的现象',
      status: 'active',
    })
    repo.create({ zh: '检索增强生成', en: 'RAG', aliases: [], definition: '检索外部知识再生成', status: 'active' })

    expect(repo.search('漂移')).toHaveLength(1)
    expect(repo.search('RAG')[0]?.term.en).toBe('RAG')
    expect(repo.search('大模型漂移')).toHaveLength(1)
    expect(repo.search('检索增强')).toHaveLength(1)
    h.close()
  })
})

describe('UT-COMPOSE 前置 · TERMS.md 确定性渲染', () => {
  it('同一选集两次渲染字节一致；表格符转义', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const a = repo.create({ zh: '规则漂移', en: 'rule drift', aliases: [], definition: '定义带|竖线', status: 'active' })
    const b = repo.create({ zh: '幻觉', en: 'hallucination', aliases: [], definition: '看似合理实则错误', status: 'active' })

    const first = repo.renderMd({ termIds: [b.id, a.id], orderBy: 'en-alpha' })
    const second = repo.renderMd({ termIds: [b.id, a.id], orderBy: 'en-alpha' })
    expect(createHash('sha256').update(first).digest('hex')).toBe(
      createHash('sha256').update(second).digest('hex'),
    )
    // en-alpha 排序：hallucination 在 rule drift 前
    expect(first.indexOf('幻觉')).toBeLessThan(first.indexOf('规则漂移'))
    expect(first).toContain('定义带\\|竖线')
    expect(first).toContain('| 术语 | English | 别名 | 定义 |')
    h.close()
  })

  it('空选集 → EMPTY_SELECTION', () => {
    const h = newDb()
    expect(() => new TermsRepo(h.db).renderMd({ termIds: [] })).toThrow(AppError)
    h.close()
  })
})

describe('UT-TERM-01 · 删除词条的引用清理', () => {
  it('被 2 个词条关联的词条删除后，relatedTermIds 不再含该 id', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const target = repo.create({ zh: '上下文窗口', en: 'context window', aliases: [], definition: 'd', status: 'active' })
    const a = repo.create({
      zh: 'A', en: 'a', aliases: [], definition: 'd',
      relatedTermIds: [target.id], status: 'active',
    })
    const b = repo.create({
      zh: 'B', en: 'b', aliases: [], definition: 'd',
      relatedTermIds: [target.id], status: 'active',
    })

    repo.delete(target.id)
    expect(repo.get(a.id)?.relatedTermIds).toEqual([])
    expect(repo.get(b.id)?.relatedTermIds).toEqual([])
    h.close()
  })
})
