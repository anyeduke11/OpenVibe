import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { PacksRepo, runSeed, TermsRepo } from '@openvibe/core'
import type { TermOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

const TOKEN = 'test-token'
const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

function injectApi(
  h: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return h.app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}` } })
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex')

/** 词条创建（API 通道），返回 TermOut */
async function mkTerm(h: Harness, input: object): Promise<TermOut> {
  const res = await injectApi(h, 'POST', '/api/terms', {
    definition: '一条用于集成测试的定义文本',
    ...input,
  })
  expect(res.statusCode).toBe(201)
  return res.json() as TermOut
}

describe('T4c · m3 §7 验收映射（API 行为层）', () => {
  it('IT-API-TERM-01（§7.2）: 中文字串 / 英文主名 / 别名三径命中并带 matches 偏移', async () => {
    const h = await makeHarness()
    await mkTerm(h, { zh: '规则漂移', en: 'rule drift', aliases: ['drift'], definition: '长会话中模型逐渐偏离规则文件约束的现象' })
    await mkTerm(h, { zh: '检索增强生成', en: 'RAG', aliases: ['RAG'], definition: '检索外部知识再生成' })
    await mkTerm(h, { zh: '幻觉', en: 'hallucination', aliases: ['大模型幻觉'], definition: '看似合理实则错误的输出' })

    const drift = await injectApi(h, 'GET', '/api/terms/search?q=' + encodeURIComponent('漂移'))
    expect(drift.statusCode).toBe(200)
    const driftBody = drift.json()
    expect(driftBody.total).toBe(1)
    expect(driftBody.items[0].term.zh).toBe('规则漂移')
    expect(driftBody.items[0].matchedFields).toContain('zh')
    expect(driftBody.items[0].matches.find((m: { field: string }) => m.field === 'zh')).toEqual({
      field: 'zh',
      start: 2,
      end: 4,
    })

    const rag = await injectApi(h, 'GET', '/api/terms/search?q=RAG')
    expect(rag.json().items.map((i: { term: TermOut }) => i.term.zh)).toEqual(['检索增强生成'])

    const alias = await injectApi(h, 'GET', '/api/terms/search?q=' + encodeURIComponent('大模型幻觉'))
    expect(alias.json().items[0].term.zh).toBe('幻觉')
    expect(alias.json().items[0].matchedFields).toContain('aliases')

    const noQ = await injectApi(h, 'GET', '/api/terms/search')
    expect(noQ.statusCode).toBe(422)
    expect(noQ.json().code).toBe('VALIDATION_ERROR')
  })

  it('IT-TERM-RENDER-01（§7.3）: 同一选集两次渲染 sha256 相同，definition 的 | 转义不破表', async () => {
    const h = await makeHarness()
    const a = await mkTerm(h, { zh: '规则漂移', en: 'rule drift', definition: '偏离规则文件的现象' })
    const b = await mkTerm(h, { zh: '术语表', en: 'glossary', definition: '列序为 术语 | English | 别名 | 定义' })
    const c = await mkTerm(h, { zh: '幻觉', en: 'hallucination', definition: '看似合理实则错误' })
    const names = ['规则漂移', '术语表', '幻觉']
    const orderOf = (md: string): string[] =>
      names
        .map((zh) => ({ zh, at: md.indexOf(`| ${zh} |`) }))
        .filter((x) => x.at >= 0)
        .sort((x, y) => x.at - y.at)
        .map((x) => x.zh)

    const render = (termIds: string[], orderBy?: string) =>
      injectApi(h, 'POST', '/api/terms/render-terms-md', { termIds, orderBy })

    const alpha = await render([c.id, b.id, a.id])
    const shuffled = await render([a.id, b.id, c.id])
    expect(alpha.statusCode).toBe(200)
    const md = alpha.json().content as string
    expect(sha(md)).toBe(sha(shuffled.json().content as string))
    expect(md).toContain('| 术语 | English | 别名 | 定义 |')
    expect(md).toContain('术语 \\| English \\| 别名 \\| 定义')
    // en-alpha：glossary < hallucination < rule drift
    expect(orderOf(md)).toEqual(['术语表', '幻觉', '规则漂移'])

    // pinyin：guizepiaoyi < huanjue < shuyubiao（词典键，跨平台稳定）
    const pinyinDoc = (await render([a.id, b.id, c.id], 'pinyin')).json().content as string
    expect(orderOf(pinyinDoc)).toEqual(['规则漂移', '幻觉', '术语表'])

    // manual：保留选集顺序
    expect(orderOf((await render([c.id, a.id, b.id], 'manual')).json().content)).toEqual([
      '幻觉',
      '规则漂移',
      '术语表',
    ])
  })

  it('IT-TERM-01-API（§7.4）: DELETE 清理相关词引用，被包引用时回 X-Referenced-Packs', async () => {
    const h = await makeHarness()
    const target = await mkTerm(h, { zh: '上下文窗口', en: 'context window' })
    const a = await mkTerm(h, { zh: '甲', en: 'a-term', relatedTermIds: [target.id] })
    const b = await mkTerm(h, { zh: '乙', en: 'b-term', relatedTermIds: [target.id] })

    new PacksRepo(h.handle.db).create({
      name: 'term-pack',
      description: '',
      selection: { promptIds: [], termIds: [target.id], skillIds: [], playbookIds: [], flowTemplateId: null },
      targets: ['claude-code'],
    })

    const del = await injectApi(h, 'DELETE', `/api/terms/${target.id}`)
    expect(del.statusCode).toBe(204)
    expect(del.headers['x-referenced-packs']).toBe('term-pack')

    const repo = new TermsRepo(h.handle.db)
    expect(repo.get(a.id)?.relatedTermIds).toEqual([])
    expect(repo.get(b.id)?.relatedTermIds).toEqual([])
    expect(repo.get(target.id)).toBeNull()

    const again = await injectApi(h, 'DELETE', `/api/terms/${target.id}`)
    expect(again.statusCode).toBe(404)
    expect(again.json().code).toBe('NOT_FOUND')
  })

  it('IT-ERR-02（§7.5）: zh/en 全空 422 且不入库；空选集与失效选集错误码分明', async () => {
    const h = await makeHarness()

    const bothEmpty = await injectApi(h, 'POST', '/api/terms', { zh: '', en: '', definition: '定义' })
    expect(bothEmpty.statusCode).toBe(422)
    expect(bothEmpty.json().code).toBe('VALIDATION_ERROR')
    expect(bothEmpty.json().details.fieldErrors.zh).toBeTruthy()
    expect((await injectApi(h, 'GET', '/api/terms')).json().total).toBe(0)

    const selfRef = await mkTerm(h, { zh: '自指', en: 'self' })
    const bad = await injectApi(h, 'PATCH', `/api/terms/${selfRef.id}`, {
      relatedTermIds: [selfRef.id],
    })
    expect(bad.statusCode).toBe(422)
    expect(bad.json().message).toContain('自指')

    const emptySelection = await injectApi(h, 'POST', '/api/terms/render-terms-md', { termIds: [] })
    expect(emptySelection.statusCode).toBe(422)
    expect(emptySelection.json().code).toBe('EMPTY_SELECTION')

    const stale = await injectApi(h, 'POST', '/api/terms/render-terms-md', {
      termIds: [selfRef.id, 'trm_gone'],
    })
    expect(stale.statusCode).toBe(422)
    expect(stale.json().code).toBe('STALE_SELECTION')

    const missing = await injectApi(h, 'PATCH', '/api/terms/trm_nonexistent', { definition: 'x' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe('NOT_FOUND')
  })

  it('IT-SEED-REAL-01（§7.1）: 真实 seed 文件首启导入 ≥60，二次启动计数不变', async () => {
    const h = await makeHarness()
    const db = h.handle.db

    const first = runSeed(db, SEED_DIR)
    const termsBundle = first.find((r) => r.bundle === 'terms')
    expect(termsBundle?.status).toBe('imported')
    expect(termsBundle?.warnings).toEqual([])
    expect(termsBundle?.created).toBeGreaterThanOrEqual(60)
    expect((first.find((r) => r.bundle === 'flow-templates')?.created ?? 0) + (first.find((r) => r.bundle === 'flow-templates')?.updated ?? 0)).toBe(3)

    const count = (db.prepare("SELECT COUNT(*) AS n FROM terms WHERE source='openvibe-seed'").get() as { n: number }).n
    expect(count).toBe(termsBundle?.created)

    // 二次启动：contentHash 命中登记表 → 全 bundle skipped，计数不变
    const second = runSeed(db, SEED_DIR)
    expect(second.every((r) => r.status === 'skipped')).toBe(true)
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM terms WHERE source='openvibe-seed'").get() as { n: number }).n,
    ).toBe(count)

    const list = await injectApi(h, 'GET', '/api/terms')
    expect(list.json().total).toBe(count)
    const search = await injectApi(h, 'GET', '/api/terms/search?q=' + encodeURIComponent('规则漂移'))
    expect(search.json().items[0].term.en).toBe('rule drift')

    // 全量选集渲染：无表格错位（每数据行恰 5 个裸 |）
    const ids = (list.json().items as TermOut[]).map((t) => t.id)
    const rendered = await injectApi(h, 'POST', '/api/terms/render-terms-md', { termIds: ids })
    const dataLines = (rendered.json().content as string).split('\n').slice(6, 6 + ids.length)
    expect(dataLines).toHaveLength(ids.length)
    for (const line of dataLines) {
      expect(line.replaceAll('\\|', '').split('|')).toHaveLength(6)
    }
  })
})
