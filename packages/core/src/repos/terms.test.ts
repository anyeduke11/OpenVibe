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

describe('UT-TERM-02 · 别名归一与相关词校验（FR-1.1 / §6.2）', () => {
  it('别名去空白、丢空串、大小写无关去重', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const term = repo.create({
      zh: '检索增强生成',
      en: 'RAG',
      aliases: [' rag ', 'RAG', '检索增强', '', 'Retrieval-Augmented Generation'],
      definition: '先检索外部知识再据此生成回答',
      status: 'active',
    })
    expect(term.aliases).toEqual(['rag', '检索增强', 'Retrieval-Augmented Generation'])

    const patched = repo.update(term.id, { aliases: ['RAG', 'rag', 'RRF'] })
    expect(patched.aliases).toEqual(['RAG', 'RRF'])
    h.close()
  })

  it('relatedTermIds 自指或引用不存在 → VALIDATION_ERROR', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const a = repo.create({ zh: 'A', en: 'a', aliases: [], definition: 'd', status: 'active' })

    expect(() => repo.update(a.id, { relatedTermIds: [a.id] })).toThrow(/自指或不存在/)
    expect(() => repo.update(a.id, { relatedTermIds: ['trm_missing'] })).toThrow(/trm_missing/)
    expect(repo.get(a.id)?.relatedTermIds).toEqual([])

    const b = repo.create({
      zh: 'B',
      en: 'b',
      aliases: [],
      definition: 'd',
      relatedTermIds: [a.id],
      status: 'active',
    })
    expect(b.relatedTermIds).toEqual([a.id])
    h.close()
  })
})

describe('UT-COMPOSE-01 · 排序口径（en-alpha / pinyin / manual）', () => {
  const rows = [
    { zh: '规则漂移', en: 'rule drift' },
    { zh: '重复', en: 'duplication' },
    { zh: '重要', en: 'importance' },
    { zh: '上下文窗口', en: 'context window' },
  ]

  it('pinyin 走词典键（多音字按词组消歧），与码点序不同', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const created = rows.map((r) =>
      repo.create({ ...r, aliases: [], definition: `${r.zh}的定义文本`, status: 'active' }),
    )
    const ids = created.map((t) => t.id)

    const pinyinMd = repo.renderMd({ termIds: ids, orderBy: 'pinyin' })
    const order = ['重复', '规则漂移', '重要'].map((zh) => pinyinMd.indexOf(zh))
    expect(order).toEqual([...order].sort((a, b) => a - b))

    const alphaMd = repo.renderMd({ termIds: ids, orderBy: 'en-alpha' })
    expect(alphaMd.indexOf('上下文窗口')).toBeLessThan(alphaMd.indexOf('重复'))
    expect(alphaMd.indexOf('重复')).toBeLessThan(alphaMd.indexOf('规则漂移'))
    h.close()
  })

  it('同一选集任意输入顺序 → 字节一致；manual 保留选集顺序', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const created = rows.map((r) =>
      repo.create({ ...r, aliases: [], definition: `${r.zh}的定义文本`, status: 'active' }),
    )
    const ids = created.map((t) => t.id)
    const reversed = [...ids].reverse()

    const sha = (s: string) => createHash('sha256').update(s).digest('hex')
    for (const orderBy of ['en-alpha', 'pinyin'] as const) {
      expect(sha(repo.renderMd({ termIds: ids, orderBy }))).toBe(
        sha(repo.renderMd({ termIds: reversed, orderBy })),
      )
    }
    const manual = repo.renderMd({ termIds: ids, orderBy: 'manual' })
    const manualReversed = repo.renderMd({ termIds: reversed, orderBy: 'manual' })
    expect(manual).not.toBe(manualReversed)
    expect(manual.indexOf('规则漂移')).toBeLessThan(manual.indexOf('重复'))
    h.close()
  })
})

describe('UT-FTS-05 · 命中区间（m3 FR-3.2 高亮）', () => {
  it('matches 给出字段与偏移，切片即命中原文', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    repo.create({
      zh: '规则漂移',
      en: 'rule drift',
      aliases: ['大模型漂移'],
      definition: '长会话中模型逐渐偏离规则文件约束的现象，即规则漂移',
      status: 'active',
    })

    const hits = repo.search('规则漂移')
    expect(hits).toHaveLength(1)
    const found = hits[0]
    if (!found) throw new Error('no hit')
    expect(found.matchedFields).toEqual(expect.arrayContaining(['zh', 'definition']))
    expect(found.matches.filter((m) => m.field === 'zh')).toEqual([
      { field: 'zh', start: 0, end: 4 },
    ])
    expect(found.matches.filter((m) => m.field === 'definition')).toHaveLength(1)
    const defRange = found.matches.find((m) => m.field === 'definition')
    expect(found.term.definition.slice(defRange?.start ?? 0, defRange?.end)).toBe('规则漂移')

    expect(repo.search('漂移')[0]?.matches.some((m) => m.field === 'aliases')).toBe(true)
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
