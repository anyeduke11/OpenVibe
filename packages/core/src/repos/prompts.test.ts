import { describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import { PromptsRepo } from '../repos/prompts'

describe('UT-VERSION-01/02 · 版本快照触发与回滚', () => {
  it('内容变化产生版本，回滚创建新版本且内容等于目标版本', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    const { prompt } = repo.create({ title: '审查', content: 'v1 内容' })
    repo.update(prompt.id, { content: 'v2 内容' })
    repo.update(prompt.id, { content: 'v3 内容' })

    const versions = repo.versions(prompt.id)
    expect(versions.map((v) => v.versionNo)).toEqual([1, 2, 3])

    const { prompt: restored, newVersionNo } = repo.restore(prompt.id, 1)
    expect(newVersionNo).toBe(4)
    expect(restored.content).toBe('v1 内容')
    // 既有版本从不改写（m1 FR-4.3）
    expect(repo.versions(prompt.id).map((v) => v.versionNo)).toEqual([1, 2, 3, 4])
    h.close()
  })

  it('内容不变只改元数据不产生版本', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    const { prompt } = repo.create({ title: '审查', content: '内容' })
    const result = repo.update(prompt.id, { tags: ['代码审查'] })
    expect(result.versionCreated).toBeNull()
    expect(repo.versions(prompt.id)).toHaveLength(1)
    h.close()
  })

  it('rule 类含变量 → 保存成功但返回警告（m1 FR-2.4）', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    const { warnings } = repo.create({
      title: 'SQL 约束',
      content: '所有查询必须 {{limit}} 行',
      useAs: 'rule',
    })
    expect(warnings.length).toBeGreaterThan(0)
    h.close()
  })
})

describe('UT-FTS-01/02 · 提示词搜索（中文子串 + 英文前缀）', () => {
  it('中文 ≥3 走 FTS，<3 走 LIKE 降级', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    repo.create({ title: '反漂移规则', content: '长会话中注意规则漂移问题，定期回顾规则文件' })
    repo.create({ title: '无关', content: '完全无关的内容' })

    const hit = repo.list({ page: 1, size: 50, q: '规则漂移' })
    expect(hit.total).toBe(1)
    expect(hit.items[0]?.title).toBe('反漂移规则')

    const likeHit = repo.list({ page: 1, size: 50, q: '漂移' })
    expect(likeHit.total).toBe(1)
    h.close()
  })

  it('英文子串（含前缀）可命中', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    repo.create({ title: '缓存策略', content: 'use memoization to avoid recompute' })
    expect(repo.list({ page: 1, size: 50, q: 'memoiz' }).total).toBe(1)
    expect(repo.list({ page: 1, size: 50, q: 'missing' }).total).toBe(0)
    h.close()
  })

  it('过滤器组合：tag + status', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    repo.create({ title: 'a', content: 'x', tags: ['审查'], status: 'active' })
    repo.create({ title: 'b', content: 'y', tags: ['其他'] })
    expect(repo.list({ page: 1, size: 50, tag: '审查' }).total).toBe(1)
    expect(repo.list({ page: 1, size: 50, status: 'draft' }).total).toBe(1)
    expect(repo.list({ page: 1, size: 50, tag: '审查', status: 'active' }).total).toBe(1)
    h.close()
  })

  it('importBatch 按 title+contentHash 去重（m1 FR-6.1）', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    const item = { title: '导入项', content: '内容唯一' }
    const first = repo.importBatch([item, { ...item, content: '内容不同' }])
    expect(first.created).toHaveLength(2)
    const second = repo.importBatch([item])
    expect(second.created).toHaveLength(0)
    expect(second.skipped).toHaveLength(1)
    h.close()
  })
})
