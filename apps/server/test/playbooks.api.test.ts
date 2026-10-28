import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { PacksRepo, buildPackLock, planInjection, runSeed } from '@openvibe/core'
import {
  PACK_FILE_PLAYBOOKS,
  type PackOut,
  type PlaybookOut,
  type PreviewOut,
} from '@openvibe/shared'
import { buildApp } from '../src/app'

/** m4 §7.3：六端点 / STALE_SELECTION 的 playbookIds 腿 / CONTEXT_AUX 计入 / EMPTY_SELECTION 归因 / 变异反证 */

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

function api(
  h: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return h.app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}` } })
}

async function mkPlaybook(h: Harness, input: object = {}): Promise<PlaybookOut> {
  const res = await api(h, 'POST', '/api/playbooks', {
    scenario: '商业银行核心系统投产前的变更评审',
    problem: '评审只看功能清单，回退方案口头带过',
    practice: '三件套：变更清单、可执行回退脚本、影响面清单；回退耗时必须实测而非估计。',
    ...input,
  })
  expect(res.statusCode).toBe(201)
  return res.json() as PlaybookOut
}

/** 组包测试的公共底座：一条 rule 提示词 + 一条术语（技巧不成包，裁定 ⑤） */
async function mkBasePack(h: Harness, name: string, playbookIds: string[]): Promise<PackOut> {
  const prompt = await api(h, 'POST', '/api/prompts', {
    title: '审查纪律',
    content: '逐条给行号，不评论未改动行。',
    useAs: 'rule',
    status: 'active',
  })
  const term = await api(h, 'POST', '/api/terms', {
    zh: '规则漂移',
    en: 'rule drift',
    definition: '定义文本',
  })
  const res = await api(h, 'POST', '/api/packs', {
    name,
    selection: {
      promptIds: [(prompt.json() as { id: string }).id],
      termIds: [(term.json() as { id: string }).id],
      skillIds: [],
      playbookIds,
      flowTemplateId: null,
    },
    targets: ['claude-code'],
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as PackOut
}

const preview = async (h: Harness, id: string): Promise<PreviewOut> => {
  const res = await api(h, 'POST', `/api/packs/${id}/preview`, {})
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as PreviewOut
}

describe('IT-PB-01 · 六端点（FR-3）', () => {
  it('list / create / search / render / patch / delete 全链路', async () => {
    const h = await makeHarness()
    const empty = await api(h, 'GET', '/api/playbooks')
    expect(empty.json().total).toBe(0)

    const a = await mkPlaybook(h, { status: 'published', tags: ['风险陷阱'] })
    const b = await mkPlaybook(h, {
      scenario: '数据分类分级制度已发布',
      problem: '定级靠业务部门口头判断',
      practice: '用 information_schema.columns 导出字段清单后抽样统计定级。',
      antiPractice: '让各业务部门凭印象定级。',
    })
    expect(a.status).toBe('published')

    const list = await api(h, 'GET', '/api/playbooks')
    expect(list.json().total).toBe(2)

    const hit = await api(h, 'GET', '/api/playbooks/search?q=' + encodeURIComponent('数据分类分级'))
    expect(hit.json().total).toBe(1)
    expect(hit.json().items[0].matchedFields).toContain('scenario')
    const noQ = await api(h, 'GET', '/api/playbooks/search')
    expect(noQ.statusCode).toBe(422)
    expect(noQ.json().code).toBe('VALIDATION_ERROR')

    const rendered = await api(h, 'POST', '/api/playbooks/render-playbooks-md', {
      playbookIds: [b.id, a.id],
    })
    expect(rendered.statusCode).toBe(200)
    const md = rendered.json().content as string
    expect(md).toContain('| 场景 | 问题 | 正确做法 | 反例 | 亲测有效 |')
    // 码点序：商 U+5546 < 数 U+6570 ⇒ 商业银行… 在前（不用拼音序，CI 三平台字节一致）
    expect(md.indexOf('商业银行核心系统投产前')).toBeLessThan(md.indexOf('数据分类分级'))

    const patched = await api(h, 'PATCH', `/api/playbooks/${a.id}`, {
      practice: '改写后的做法：先在测试环境实测回退耗时，再定回退窗口。',
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().practice).toContain('测试环境实测')
    // FR-4.2：PATCH 置真必须随带证据
    const badVerified = await api(h, 'PATCH', `/api/playbooks/${a.id}`, { verified: true })
    expect(badVerified.statusCode).toBe(422)
    expect(badVerified.json().code).toBe('VALIDATION_ERROR')

    const del = await api(h, 'DELETE', `/api/playbooks/${a.id}`)
    expect(del.statusCode).toBe(204)
    const again = await api(h, 'DELETE', `/api/playbooks/${a.id}`)
    expect(again.statusCode).toBe(404)
    expect(again.json().code).toBe('NOT_FOUND')
  })

  it('DELETE 被包引用时回 x-referenced-packs', async () => {
    const h = await makeHarness()
    const pb = await mkPlaybook(h)
    new PacksRepo(h.handle.db).create({
      name: 'pb-pack',
      description: '',
      selection: {
        promptIds: [],
        termIds: [],
        skillIds: [],
        playbookIds: [pb.id],
        flowTemplateId: null,
      },
      targets: ['claude-code'],
    })
    const del = await api(h, 'DELETE', `/api/playbooks/${pb.id}`)
    expect(del.statusCode).toBe(204)
    expect(del.headers['x-referenced-packs']).toBe('pb-pack')
  })
})

describe('IT-PB-02 · 组包接入（FR-7 / §6.4）', () => {
  it('STALE_SELECTION 的 playbookIds 腿：指向已删除 ⇒ 422 且明细点名', async () => {
    const h = await makeHarness()
    const pb = await mkPlaybook(h)
    const pack = await mkBasePack(h, 'pb-stale', [pb.id])
    await api(h, 'DELETE', `/api/playbooks/${pb.id}`)

    const res = await api(h, 'POST', `/api/packs/${pack.id}/preview`, {})
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('STALE_SELECTION')
    expect((res.json().details as { playbookIds: string[] }).playbookIds).toEqual([pb.id])
  })

  it('EMPTY_SELECTION 归因「只选了技巧」（裁定 ⑤ / §6.4）', async () => {
    const h = await makeHarness()
    const pb = await mkPlaybook(h)
    const only = await api(h, 'POST', '/api/packs', {
      name: 'pb-only',
      selection: {
        promptIds: [],
        termIds: [],
        skillIds: [],
        playbookIds: [pb.id],
        flowTemplateId: null,
      },
      targets: ['claude-code'],
    })
    expect(only.statusCode).toBe(201)
    const res = await api(h, 'POST', `/api/packs/${(only.json() as PackOut).id}/preview`, {})
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('EMPTY_SELECTION')
    expect(res.json().message).toContain('只选了技巧')

    // 未选技巧时文案仍是 m6a 那句，不得被 M4 的归因文案替换掉
    const none = await api(h, 'POST', '/api/packs', {
      name: 'pb-none',
      selection: {
        promptIds: [],
        termIds: [],
        skillIds: [],
        playbookIds: [],
        flowTemplateId: null,
      },
      targets: ['claude-code'],
    })
    const res2 = await api(h, 'POST', `/api/packs/${(none.json() as PackOut).id}/preview`, {})
    expect(res2.json().message).not.toContain('只选了技巧')
  })

  it('CONTEXT_AUX 计入：技巧条数变化 ⇒ ≈token 必须变化（FR-7.4）', async () => {
    const h = await makeHarness()
    const one = await mkPlaybook(h, {
      scenario: 'A 场景',
      problem: 'A 问题',
      practice: '做法 A：先把变更清单、回退脚本、影响面三件套补齐，再谈投产窗口。',
      status: 'published',
    })
    const two = await mkPlaybook(h, {
      scenario: 'B 场景',
      problem: 'B 问题',
      practice: '做法 B：在测试环境真跑一遍回退脚本并记录分钟数，用 binlog 回放倒推回退窗口。',
      status: 'published',
    })
    const draft = await mkPlaybook(h, {
      scenario: 'C 场景',
      problem: 'C 问题',
      practice: '做法 C：草稿态技巧不进产物，只渲染 published（FR-6.2）。',
      status: 'draft',
    })
    // 同一个包上逐次改选集：包名与 id 都进正文，只有这样才能把「技巧条数」隔离成唯一变量
    const pack = await mkBasePack(h, 'pb-tokens', [])
    const p1 = await preview(h, pack.id)
    const patchedOne = await api(h, 'PATCH', `/api/packs/${pack.id}`, {
      selection: { ...(pack.selection as Record<string, unknown>), playbookIds: [one.id] },
    })
    expect(patchedOne.statusCode, patchedOne.body).toBe(200)
    const patched = await api(h, 'PATCH', `/api/packs/${pack.id}`, {
      selection: { ...(pack.selection as Record<string, unknown>), playbookIds: [one.id, two.id] },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    const p2 = await preview(h, pack.id)
    const patchedDraft = await api(h, 'PATCH', `/api/packs/${pack.id}`, {
      selection: {
        ...(pack.selection as Record<string, unknown>),
        playbookIds: [one.id, two.id, draft.id],
      },
    })
    expect(patchedDraft.statusCode, patchedDraft.body).toBe(200)
    const p3 = await preview(h, pack.id)

    const tokens = (out: PreviewOut): number => out.sizeEstimate?.perTarget[0]?.approxTokens ?? 0
    expect(p1.files.map((f) => f.path)).not.toContain(PACK_FILE_PLAYBOOKS)
    expect(p2.files.map((f) => f.path)).toContain(PACK_FILE_PLAYBOOKS)
    expect(tokens(p2)).toBeGreaterThan(tokens(p1))
    // draft 不进产物 ⇒ 与只选两条 published 的包逐字节相同（FR-6.2/6.3）
    expect(p3.fingerprint).toBe(p2.fingerprint)
    expect(p3.files.map((f) => f.path)).toEqual(p2.files.map((f) => f.path))
    // CONTEXT_AUX 收进来：perTarget 的 files 里能看到 PLAYBOOKS.md
    expect(p2.sizeEstimate?.perTarget[0]?.files.map((f) => f.path)).toContain(PACK_FILE_PLAYBOOKS)

    // 退选技巧 ⇒ 回到零技巧的字节与 ≈token（FR-6.3：空集合不产文件，不进指纹）
    const back = await api(h, 'PATCH', `/api/packs/${pack.id}`, {
      selection: { ...(pack.selection as Record<string, unknown>), playbookIds: [] },
    })
    expect(back.statusCode, back.body).toBe(200)
    const p0 = await preview(h, pack.id)
    expect(p0.fingerprint).toBe(p1.fingerprint)
    expect(tokens(p0)).toBe(tokens(p1))
  })

  // FR-7.3 的推断转正（§7.3 变异反证）：同 prompts/terms/skills/flow，仅差 1 条技巧。
  // 若指纹相同 ⇒ 链路上还有第二处硬编文件清单，本条 fail 且不得继续拆闸。
  it('IT-PB-VAR（变异反证）: 指纹不同 + lock files 差一条 PLAYBOOKS.md', async () => {
    const h = await makeHarness()
    const pb = await mkPlaybook(h, { status: 'published' })
    const without = await preview(h, (await mkBasePack(h, 'pb-var-a', [])).id)
    const withPb = await preview(h, (await mkBasePack(h, 'pb-var-b', [pb.id])).id)

    expect(withPb.fingerprint).not.toBe(without.fingerprint)
    const pathsOf = (out: PreviewOut): string[] => out.files.map((f) => f.path)
    expect(pathsOf(withPb)).toEqual([...pathsOf(without), PACK_FILE_PLAYBOOKS].sort())
    // 正文交叉引用行也必须出现（FR-7.6），且未选技巧的包字节逐字节不变
    const main = (out: PreviewOut): string =>
      out.files.find((f) => f.path === 'CLAUDE.md')?.content ?? ''
    expect(main(withPb)).toContain(`见 ${PACK_FILE_PLAYBOOKS}（1 条）`)
    expect(main(without)).not.toContain(PACK_FILE_PLAYBOOKS)

    // lock 侧：走真 planner + buildPackLock，files 必须差出 PLAYBOOKS.md 一条
    const lockOf = (out: PreviewOut, name: string): string[] =>
      buildPackLock({
        pack: { id: `pk_${name}`, name, version: '1.0.0', fingerprint: out.fingerprint },
        plan: planInjection({
          files: out.files.map((f) => ({ path: f.path, content: f.content, sha256: f.sha256 })),
          readDisk: () => null,
          lock: null,
          targets: null,
        }),
        written: out.files.map((f) => f.path),
        oldLock: null,
        injectedAt: '2026-10-13T00:00:00.000Z',
      }).files.map((f) => f.path)

    expect(lockOf(withPb, 'b')).toEqual([...lockOf(without, 'a'), PACK_FILE_PLAYBOOKS].sort())
  })
})

describe('IT-PB-SEED · 预置技巧装载（FR-9）', () => {
  it('真实种子文件导入 ≥10 条且二次启动计数不变', async () => {
    const h = await makeHarness()
    const db = h.handle.db
    const first = runSeed(db, SEED_DIR)
    const bundle = first.find((r) => r.bundle === 'playbooks')
    expect(bundle?.status).toBe('imported')
    expect(bundle?.warnings).toEqual([])
    expect(bundle?.created).toBeGreaterThanOrEqual(10)

    const published = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM playbooks WHERE status='published' AND source='openvibe-seed'",
        )
        .get() as { n: number }
    ).n
    expect(published).toBe(bundle?.created)

    const second = runSeed(db, SEED_DIR)
    expect(second.find((r) => r.bundle === 'playbooks')?.status).toBe('skipped')
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM playbooks').get() as { n: number }).n,
    ).toBeGreaterThanOrEqual(10)
  })
})
