import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { runSeed } from '../db/seed'
import { TermsRepo } from '../repos/terms'

function writeSeedDir(
  dir: string,
  files: Record<string, unknown>,
): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content))
  }
}

const baseFiles = {
  'terms.json': {
    schemaVersion: 1,
    items: [
      { zh: '氛围编程', en: 'vibe coding', aliases: [], definition: '以自然语言意图驱动的开发方式', example: '', tags: ['基础概念'] },
      { zh: '幻觉', en: 'hallucination', aliases: [], definition: '模型生成看似合理实则错误的内容', example: '', tags: ['风险陷阱'] },
    ],
  },
  'flow-templates.json': {
    schemaVersion: 1,
    items: [
      {
        name: '个人轻量流',
        kind: 'light',
        stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }], artifacts: [] }],
      },
    ],
  },
  'prompts.json': {
    schemaVersion: 1,
    items: [{ title: '代码审查请求', content: '审查 {{language}} 代码', tags: ['精选'], platformMarks: ['generic'], useAs: 'reference' }],
  },
}

describe('UT-SEED-01/02 · 种子幂等与升级', () => {
  it('跑两遍计数不变（幂等）', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeSeedDir(h.dir, baseFiles)

    const first = runSeed(h.db, h.dir)
    expect(first.map((r) => r.status)).toEqual(['imported', 'imported', 'imported'])
    expect(first[0]?.created).toBe(2)

    const count = () => (h.db.prepare('SELECT COUNT(*) AS c FROM terms').get() as { c: number }).c
    const afterFirst = count()
    expect(afterFirst).toBe(2)

    const second = runSeed(h.db, h.dir)
    expect(second.every((r) => r.status === 'skipped')).toBe(true)
    expect(count()).toBe(afterFirst)
    h.close()
  })

  it('内容变更升级：新条目并入 + 未改条目更新 + 用户改过的跳过', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeSeedDir(h.dir, baseFiles)
    runSeed(h.db, h.dir)

    // 用户改过「幻觉」（seed_hash → NULL）
    const terms = new TermsRepo(h.db)
    const hallucination = terms.search('hallucination')[0]?.term
    terms.update(hallucination!.id, { definition: '用户自己改过的定义' })

    // 新 bundle：修改「氛围编程」定义 + 新增一条
    writeSeedDir(h.dir, {
      'terms.json': {
        schemaVersion: 1,
        items: [
          { zh: '氛围编程', en: 'vibe coding', aliases: [], definition: '更新后的定义内容', example: '', tags: ['基础概念'] },
          { zh: '幻觉', en: 'hallucination', aliases: [], definition: '旧定义', example: '', tags: ['风险陷阱'] },
          { zh: '规则漂移', en: 'rule drift', aliases: [], definition: '新增词条定义', example: '', tags: ['风险陷阱'] },
        ],
      },
    })
    const upgraded = runSeed(h.db, h.dir)
    expect(upgraded[0]?.status).toBe('imported')
    expect(upgraded[0]?.created).toBe(1)
    expect(upgraded[0]?.updated).toBe(1)
    expect(upgraded[0]?.skipped).toBe(1)

    const total = (h.db.prepare('SELECT COUNT(*) AS c FROM terms').get() as { c: number }).c
    expect(total).toBe(3)
    expect(terms.search('vibe coding')[0]?.term.definition).toBe('更新后的定义内容')
    expect(terms.search('hallucination')[0]?.term.definition).toBe('用户自己改过的定义')
    h.close()
  })

  it('单文件缺失/损坏不阻塞（seed-content FR-1）', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeFileSync(join(h.dir, 'terms.json'), '{ broken json')
    // 另两个文件缺失
    const results = runSeed(h.db, h.dir)
    expect(results[0]?.status).toBe('error')
    expect(results[1]?.status).toBe('error')
    expect(results[2]?.status).toBe('error')
    h.close()
  })
})
