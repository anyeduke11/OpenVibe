import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import type { SqliteDatabase } from '@openvibe/core'
import type { ExtractOut } from '@openvibe/shared'
import { buildApp } from '../src/app'
import { FlowTemplatesRepo, ProjectsRepo } from '@openvibe/core'

/**
 * M10/D 批次 · 提取链端到端（spec `v023-d-ai-extract.md` FR-1/4/6/7/10/11）。
 * runner 走 buildApp 的注入点（fake：固定 LLM 输出）——
 * 端到端链 = 总闸 → 同意 → 预算 → 出网 → 版本比对 → 锚定 → pending → 人工确认 → 业务草稿。
 * 纯函数腿（锚定五动作/提示词/预算计数）在 core 侧；web 假红不在此判。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(options: {
  llmOutput?: string
  extractDailyCallLimit?: number
  runnerLocal?: boolean
} = {}): Promise<Harness> {
  const handle = newDb()
  const runner = {
    id: 'fake',
    model: 'fake-model',
    provider: 'fake-provider',
    local: options.runnerLocal ?? false,
    run: async () => options.llmOutput ?? '{"schema_version":1,"candidates":[]}',
  }
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    platform: 'darwin',
    now: () => new Date('2026-10-24T12:00:00.000Z'),
    extractRunner: runner,
    extractDailyCallLimit: options.extractDailyCallLimit,
  })
  const harness = { app, db, handle }
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

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
): Promise<{ statusCode: number; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { statusCode: res.statusCode, json: res.json() as T }
}

async function seedProjectWithLog(h: Harness, logBody: string): Promise<{ projectId: string; logId: string }> {
  // 夹具直建（agentWriteGate.api.test 同款手法）：模板 + 项目 + 一条 DEV 日志
  const template = new FlowTemplatesRepo(h.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const project = new ProjectsRepo(h.db).create({ name: 'cs2-fixture', flowTemplateId: template.id })
  const log = await api<{ id: string }>(h, 'POST', `/api/projects/${project.id}/devlog`, {
    type: 'DEV',
    title: '踩坑记录',
    body: logBody,
  })
  return { projectId: project.id, logId: log.json.id }
}

const LLM_OUTPUT = JSON.stringify({
  schema_version: 1,
  candidates: [
    {
      kind: 'term',
      title: '环境型红',
      body: '与环境负载相关而非代码缺陷导致的用例失败。',
      quote: '与环境负载相关而非代码缺陷导致的用例失败',
      log_index: 0,
    },
    {
      kind: 'prompt',
      title: '回归修复提示词',
      body: '先复现，再定位根因，修复后补回归用例。',
      quote: '先复现，再定位根因',
      log_index: 0,
    },
    {
      kind: 'playbook',
      title: '哨兵根调试法',
      body: '日志正文跨项目树时不做相对化。',
      quote: '这句话在日志里根本不存在（幻觉句）',
      log_index: 0,
    },
  ],
})

const LOG_BODY =
  '今天排查环境型红：与环境负载相关而非代码缺陷导致的用例失败。总结出先复现，再定位根因的套路。'

describe('M10/D 提取链端到端（AN1/AN4/AN5）', () => {
  it('EXT-01: 闸关着 ⇒ gate-closed（服务层拦截）', async () => {
    const h = await makeHarness()
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    const res = await api<ExtractOut>(h, 'POST', '/api/extract', {
      project_id: projectId,
      log_ids: [logId],
    })
    expect(res.json.status).toBe('gate-closed')
  })

  it('EXT-02: 开闸 + 无同意 ⇒ consent-required；确认后提取 ⇒ 锚定过滤 + pending 落库', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })

    const blocked = await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId] })
    expect(blocked.json.status).toBe('consent-required')

    const ok = await api<ExtractOut>(h, 'POST', '/api/extract', {
      project_id: projectId,
      log_ids: [logId],
      confirm: true,
    })
    expect(ok.json.status).toBe('ok')
    expect(ok.json.candidateCount).toBe(3)
    expect(ok.json.passedCount).toBe(2)
    expect(ok.json.droppedCount).toBe(1)
    expect(ok.json.dropped[0]?.reason).toContain('锚定失败')
    expect(ok.json.ingested).toHaveLength(2)
    expect(ok.json.ingested.map((i) => i.kind).sort()).toEqual(['prompt_candidate', 'term_candidate'])

    // pending 行在 agent_ingests（载荷无正文容器外的越界键由白名单守卫另测）
    const rows = h.db
      .prepare(`SELECT kind, status, payload_json FROM agent_ingests WHERE source_platform = 'ai-extract'`)
      .all() as { kind: string; status: string; payload_json: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
    for (const r of rows) {
      const p = JSON.parse(r.payload_json) as Record<string, unknown>
      expect(p.source).toBe('ai-extract')
      expect(typeof p.source_log_id).toBe('string')
    }
  })

  it('EXT-03: 人工确认 ⇒ 三张业务表出 draft 草稿（tags 反链）+ 采纳率面板反映', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })

    const ingests = h.db
      .prepare(`SELECT id, kind FROM agent_ingests WHERE source_platform = 'ai-extract' AND status = 'pending'`)
      .all() as { id: string; kind: string }[]
    for (const row of ingests) {
      const reviewed = await api(h, 'POST', `/api/agent/ingests/${row.id}/review`, { to: 'published' })
      expect([200, 204]).toContain(reviewed.statusCode)
    }

    // 草稿落三张表 + tags 反链
    const term = h.db.prepare(`SELECT zh, source, tags FROM terms WHERE source = 'ai-extract'`).get() as
      | { zh: string; source: string; tags: string }
      | undefined
    expect(term?.zh).toBe('环境型红')
    expect(JSON.parse(term?.tags ?? '[]')).toContain('ai-extract')
    const prompt = h.db.prepare(`SELECT title FROM prompts WHERE tags LIKE '%ai-extract%'`).get() as
      | { title: string }
      | undefined
    expect(prompt?.title).toBe('回归修复提示词')

    // 采纳率面板：term 1 published 0 rejected → rate 1；其余分母 0 → null
    const adoption = await api<{ kinds: { kind: string; published: number; rate: number | null }[]; threshold: number }>(
      h,
      'GET',
      '/api/ai/adoption',
    )
    const termStat = adoption.json.kinds.find((k) => k.kind === 'term_candidate')
    expect(termStat?.published).toBe(1)
    expect(termStat?.rate).toBe(1)
    expect(adoption.json.threshold).toBe(0.25)
  })

  it('EXT-04: 幂等——同一日志再提取 ⇒ duplicate 不产生第二行', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })
    const again = await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })
    expect(again.json.status).toBe('ok')
    const rows = h.db
      .prepare(`SELECT COUNT(*) AS c FROM agent_ingests WHERE source_platform = 'ai-extract'`)
      .get() as { c: number }
    expect(rows.c).toBe(2)
  })

  it('EXT-05: 预算熔断（dailyCallLimit=1）⇒ 第二次 budget-exhausted', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT, extractDailyCallLimit: 1 })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true, remember: true })
    // 预算检查在 runner 就绪后（本机豁免需要 local 标记）⇒ 同意关在前，带记忆过同意后撞预算
    const second = await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId] })
    expect(second.json.status).toBe('budget-exhausted')
  })

  it('EXT-06: 同意记忆——remember 后免 confirm；清除 = 删行', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h, 'POST', '/api/extract', {
      project_id: projectId,
      log_ids: [logId],
      confirm: true,
      remember: true,
    })

    // 记忆在 ⇒ 免 confirm
    const res = await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId] })
    expect(res.json.status).toBe('ok')

    // 清除 = 删行（DL-21）——再提取回到 consent-required
    const cleared = await api<{ consents: unknown[] }>(h, 'DELETE', `/api/extract/consents/${projectId}`)
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json.consents).toHaveLength(0)
    const blocked = await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId] })
    expect(blocked.json.status).toBe('consent-required')
  })

  it('EXT-07: 台账留痕（9 键白名单，无正文容器）', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })
    const row = h.db
      .prepare(`SELECT payload_json FROM local_events WHERE kind = 'ai_extract_call'`)
      .get() as { payload_json: string }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'aiModel',
      'aiProvider',
      'candidateCount',
      'droppedCount',
      'durationMs',
      'failureReason',
      'inputHash',
      'passedCount',
      'result',
    ])
    expect(payload.result).toBe('ok')
  })
})

describe('AN5 第二段：采纳率快照与连续轮次（QG1 时间序列）', () => {
  it('EXT-08: 未达窗口下限不落快照；达到后落行且轮次自增', async () => {
    const h = await makeHarness()
    const snap1 = await api<{ snapshots: unknown[] }>(h, 'POST', '/api/ai/adoption/snapshot')
    expect(snap1.json.snapshots).toHaveLength(0) // 无裁决数据 ⇒ 不落

    // 造 20+ 条裁决（全 published）⇒ 达窗口下限
    const { projectId } = await seedProjectWithLog(h, LOG_BODY)
    for (let i = 0; i < 3; i++) {
      h.db
        .prepare(
          `INSERT INTO agent_ingests (id, project_id, kind, idempotency_key, payload_json, source_platform, status, created_at)
           VALUES (?, ?, 'term_candidate', ?, '{}', 'ai-extract', 'published', '2026-10-24T12:00:00.000Z')`,
        )
        .run(`ing_${String(i)}`, projectId, `key_${String(i)}`)
    }
    // 窗口下限 20：直接插到 20 条（其余 17 条 rejected 同款）
    for (let i = 3; i < 20; i++) {
      h.db
        .prepare(
          `INSERT INTO agent_ingests (id, project_id, kind, idempotency_key, payload_json, source_platform, status, created_at)
           VALUES (?, ?, 'term_candidate', ?, '{}', 'ai-extract', 'rejected', '2026-10-24T12:00:00.000Z')`,
        )
        .run(`ing_${String(i)}`, projectId, `key_${String(i)}`)
    }
    const snap2 = await api<{ snapshots: { kind: string; roundNo: number }[] }>(h, 'POST', '/api/ai/adoption/snapshot')
    expect(snap2.json.snapshots).toHaveLength(1)
    expect(snap2.json.snapshots[0]?.kind).toBe('term_candidate')
    expect(snap2.json.snapshots[0]?.roundNo).toBe(1)
  })

  it('EXT-09: 连续 2 轮低采纳 ⇒ consecutive.triggered；GET /api/ai/adoption 返回历史', async () => {
    const h = await makeHarness()
    const { projectId } = await seedProjectWithLog(h, LOG_BODY)
    // 直接造 2 轮低采纳快照（rate 0.1：2 published / 18 rejected）
    for (let round = 1; round <= 2; round++) {
      for (let i = 0; i < 20; i++) {
        h.db
          .prepare(
            `INSERT INTO agent_ingests (id, project_id, kind, idempotency_key, payload_json, source_platform, status, created_at)
             VALUES (?, ?, 'prompt_candidate', ?, '{}', 'ai-extract', ?, '2026-10-24T12:00:00.000Z')`,
          )
          .run(`p_${round}_${String(i)}`, projectId, `pk_${round}_${String(i)}`, i < 2 ? 'published' : 'rejected')
      }
      await api(h, 'POST', '/api/ai/adoption/snapshot')
    }
    const view = await api<{
      kinds: { kind: string; rate: number | null }[]
      consecutive: { kind: string; triggered: boolean; rounds: number }[]
    }>(h, 'GET', '/api/ai/adoption')
    const promptConsec = view.json.consecutive.find((c) => c.kind === 'prompt_candidate')
    expect(promptConsec?.rounds).toBe(2)
    expect(promptConsec?.triggered).toBe(true)
    const termConsec = view.json.consecutive.find((c) => c.kind === 'term_candidate')
    expect(termConsec?.triggered).toBe(false) // 轮数不足 ⇒ 不触发
  })
})

describe('spec v023-d §7 验收缺口补齐', () => {
  it('EXT-10: 三个候选 kind 全覆盖（playbook 候选确认 → 草稿带 problem=quote 映射）', async () => {
    const h = await makeHarness({ llmOutput: JSON.stringify({ schema_version: 1, candidates: [
      { kind: 'playbook', title: '哨兵根调试法', body: '跨项目日志不做相对化。', quote: '跨项目日志不做相对化', log_index: 0 },
    ] }) })
    const { projectId, logId } = await seedProjectWithLog(h, '跨项目日志不做相对化，直接脱敏。')
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    const ok = await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })
    expect(ok.json.status).toBe('ok')
    expect(ok.json.ingested[0]?.kind).toBe('playbook_candidate')
    const row = h.db.prepare(`SELECT id FROM agent_ingests WHERE kind = 'playbook_candidate' AND status = 'pending'`).get() as { id: string }
    const reviewed = await api(h, 'POST', `/api/agent/ingests/${row.id}/review`, { to: 'published' })
    expect([200, 204]).toContain(reviewed.statusCode)
    const pb = h.db.prepare(`SELECT scenario, problem, practice, source, status FROM playbooks WHERE source = 'ai-extract'`).get() as
      | { scenario: string; problem: string; practice: string; source: string; status: string }
      | undefined
    expect(pb?.scenario).toBe('哨兵根调试法')
    expect(pb?.problem).toBe('跨项目日志不做相对化')
    expect(pb?.practice).toBe('跨项目日志不做相对化。')
    expect(pb?.status).toBe('draft')
  })

  it('EXT-11: pending 纪律——确认前业务表逐字不变；载荷 status=published 仍入库 draft（#3+#4）', async () => {
    const h = await makeHarness({ llmOutput: JSON.stringify({ schema_version: 1, candidates: [
      { kind: 'term', title: '环境型红', body: '环境负载相关失败。', quote: '环境负载相关失败', log_index: 0 },
    ] }) })
    const { projectId, logId } = await seedProjectWithLog(h, '今天遇到环境负载相关失败。')
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    const tables = ['terms', 'prompts', 'playbooks'] as const
    const before = tables.map((t) => (h.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c)
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })
    const afterPending = tables.map((t) => (h.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c)
    expect(afterPending).toEqual(before) // 确认前三张业务表零写入

    // 载荷伪造 status：直接改 pending 行的 payload 再确认——入库仍是 draft（兜底不接受载荷值）
    h.db.prepare(`UPDATE agent_ingests SET payload_json = json_set(payload_json, '$.status', 'published') WHERE kind = 'term_candidate'`).run()
    const row = h.db.prepare(`SELECT id FROM agent_ingests WHERE kind = 'term_candidate'`).get() as { id: string }
    await api(h, 'POST', `/api/agent/ingests/${row.id}/review`, { to: 'published' })
    const term = h.db.prepare(`SELECT status FROM terms WHERE source = 'ai-extract'`).get() as { status: string }
    expect(term.status).toBe('draft')
  })

  it('EXT-12: 影子门槛解除——低采纳后走高采纳轮次，triggered 变 false（#10 解除）', async () => {
    const h = await makeHarness()
    const { projectId } = await seedProjectWithLog(h, 'x')
    // 轮1：低采纳（2/20）
    for (let i = 0; i < 20; i++) {
      h.db.prepare(`INSERT INTO agent_ingests (id, project_id, kind, idempotency_key, payload_json, source_platform, status, created_at) VALUES (?, ?, 'term_candidate', ?, '{}', 'ai-extract', ?, '2026-10-24T12:00:00.000Z')`)
        .run(`t1_${String(i)}`, projectId, `k1_${String(i)}`, i < 2 ? 'published' : 'rejected')
    }
    await api(h, 'POST', '/api/ai/adoption/snapshot')
    // 轮2：高采纳（18/20）⇒ 最近一轮不低 ⇒ triggered 解除
    for (let i = 0; i < 20; i++) {
      h.db.prepare(`INSERT INTO agent_ingests (id, project_id, kind, idempotency_key, payload_json, source_platform, status, created_at) VALUES (?, ?, 'term_candidate', ?, '{}', 'ai-extract', ?, '2026-10-24T12:00:00.000Z')`)
        .run(`t2_${String(i)}`, projectId, `k2_${String(i)}`, i < 18 ? 'published' : 'rejected')
    }
    await api(h, 'POST', '/api/ai/adoption/snapshot')
    const view = await api<{ consecutive: { kind: string; triggered: boolean }[] }>(h, 'GET', '/api/ai/adoption')
    expect(view.json.consecutive.find((c) => c.kind === 'term_candidate')?.triggered).toBe(false)
  })
})

describe('缺口收口：双闸独立性（agentWriteEnabled 与 aiExtractEnabled 互不牵连）', () => {
  it('EXT-13: M8 写闸关 + AI 提取闸开 ⇒ 提取照常落 pending（提取有独立总闸，repo 直写不经 agentService 批量入口）', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    // M8 写闸保持默认关（不打开）；只开提取闸
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    const res = await api<ExtractOut>(h, 'POST', '/api/extract', {
      project_id: projectId,
      log_ids: [logId],
      confirm: true,
    })
    expect(res.json.status).toBe('ok')
    // M8 外部 agent 的批量入口仍被其写闸拦着（同一状态下 external ingest 422/被拒）
    const extIngest = await api(h, 'POST', '/api/agent/ingest', {
      project_id: projectId,
      items: [{ kind: 'dev_log', idempotency_key: 'gate-check-1', payload: { title: 'x', body: 'y' } }],
    })
    expect([403, 422]).toContain(extIngest.statusCode)
    // 提取的 pending 行在库（未经 agentService 批量闸）
    const rows = h.db
      .prepare(`SELECT COUNT(*) AS c FROM agent_ingests WHERE source_platform = 'ai-extract'`)
      .get() as { c: number }
    expect(rows.c).toBeGreaterThan(0)
  })
})

describe('缺口④：本机端点预算豁免（spec §8.2② 预判口径）', () => {
  it('EXT-14: local runner 不占次数预算——limit=1 连续两次都 ok；同 limit 的远端第二次熔断', async () => {
    // local 豁免
    const local = await makeHarness({ llmOutput: LLM_OUTPUT, extractDailyCallLimit: 1, runnerLocal: true })
    const p1 = await seedProjectWithLog(local, LOG_BODY)
    await api(local, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(local, 'POST', '/api/extract', { project_id: p1.projectId, log_ids: [p1.logId], confirm: true, remember: true })
    const second = await api<ExtractOut>(local, 'POST', '/api/extract', { project_id: p1.projectId, log_ids: [p1.logId] })
    expect(second.json.status).toBe('ok')

    // 远端（local=false）同 limit ⇒ 第二次 budget-exhausted（EXT-05 已覆盖主路径，此处断言提示文案含豁免说明）
    const remote = await makeHarness({ llmOutput: LLM_OUTPUT, extractDailyCallLimit: 1 })
    const p2 = await seedProjectWithLog(remote, LOG_BODY)
    await api(remote, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(remote, 'POST', '/api/extract', { project_id: p2.projectId, log_ids: [p2.logId], confirm: true, remember: true })
    const blocked = await api<ExtractOut>(remote, 'POST', '/api/extract', { project_id: p2.projectId, log_ids: [p2.logId] })
    expect(blocked.json.status).toBe('budget-exhausted')
    expect(blocked.json.warnings.join('；')).toContain('本机推理端点不受此限')
  })
})

describe('缺口①：出网审计行与授权来源推导（FR-7.2 补齐）', () => {
  it('EXT-15: 首次显式确认 ⇒ explicit_tick/user_reticked；记忆路径 ⇒ remembered/memory_applied（服务端推导，非客户端上报）', async () => {
    const h = await makeHarness({ llmOutput: LLM_OUTPUT })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })

    // 首次：无记忆 + 显式确认 + 记住
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true, remember: true })
    let shares = h.db
      .prepare(`SELECT consent_source, consent_detail, provider, model, candidate_count FROM ai_extract_shares ORDER BY id`)
      .all() as { consent_source: string; consent_detail: string; provider: string; model: string; candidate_count: number }[]
    expect(shares).toHaveLength(1)
    expect(shares[0]?.consent_source).toBe('explicit_tick')
    expect(shares[0]?.consent_detail).toBe('user_reticked')
    expect(shares[0]?.provider).toBe('fake-provider')
    expect(shares[0]?.candidate_count).toBe(3)

    // 第二次：记忆生效（不带 confirm）
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId] })
    shares = h.db
      .prepare(`SELECT consent_source, consent_detail, provider, model, candidate_count FROM ai_extract_shares ORDER BY id`)
      .all() as { consent_source: string; consent_detail: string; provider: string; model: string; candidate_count: number }[]
    expect(shares).toHaveLength(2)
    expect(shares[1]?.consent_source).toBe('remembered')
    expect(shares[1]?.consent_detail).toBe('memory_applied')
  })

  it('EXT-16: 失败出网不落 shares（审计在台账 result=error），成功才落；usage 视图分组计数', async () => {
    // runner 抛错 ⇒ 台账 error、无 shares
    const h = await makeHarness({ llmOutput: '不是 JSON' })
    const { projectId, logId } = await seedProjectWithLog(h, LOG_BODY)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h, 'POST', '/api/extract', { project_id: projectId, log_ids: [logId], confirm: true })
    const sharesCount = (h.db.prepare(`SELECT COUNT(*) AS c FROM ai_extract_shares`).get() as { c: number }).c
    expect(sharesCount).toBe(0)
    const ledgerErr = h.db.prepare(`SELECT COUNT(*) AS c FROM local_events WHERE kind='ai_extract_call' AND json_extract(payload_json,'$.result')='error'`).get() as { c: number }
    expect(ledgerErr.c).toBe(1)

    // 成功一次后 usage 有分组
    const h2 = await makeHarness({ llmOutput: LLM_OUTPUT })
    const p2 = await seedProjectWithLog(h2, LOG_BODY)
    await api(h2, 'POST', '/api/extract/gate', { enabled: true })
    await api<ExtractOut>(h2, 'POST', '/api/extract', { project_id: p2.projectId, log_ids: [p2.logId], confirm: true })
    const usage = await api<{ usage: { provider: string; calls: number; okCalls: number; candidates: number }[] }>(h2, 'GET', '/api/ai/extract/usage')
    expect(usage.json.usage).toHaveLength(1)
    expect(usage.json.usage[0]?.provider).toBe('fake-provider')
    expect(usage.json.usage[0]?.calls).toBe(1)
    expect(usage.json.usage[0]?.okCalls).toBe(1)
    expect(usage.json.usage[0]?.candidates).toBe(3)
  })
})
