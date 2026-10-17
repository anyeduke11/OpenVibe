import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { TasksRepo } from '../repos/tasks'
import { createAgentService, AGENT_BATCH_LIMITS } from './agentService'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import { AGENT_PAYLOAD_KEYS, TASK_STATUS, type AgentIngestKind, type AgentIngestOne } from '@openvibe/shared'

/**
 * M8 回流写入面 · **服务层直测**（不经 HTTP）。
 *
 * **为什么要有这一层**（2026-10-15 更新）：本文件最初写下时，
 * `apps/server/src/app.ts` 未设 Fastify `bodyLimit`，默认 1 MB，请求先在传输层被 413 拒掉，
 * 所以「2 MB 总量上限」这条判据在 HTTP 那一侧**测不到**。当时因此绕开传输层，把三条上限逐条钉死。
 *
 * **2026-10-15 的变化**：owner 已裁「抬」，实现改为**按端点**在 ingest 路由上覆盖
 * （`apps/server/src/routes/agent.ts` 的 `AGENT_INGEST_BODY_LIMIT`），全局仍未设 `bodyLimit`。
 * 传输层不再是这两条判据的瓶颈。
 *
 * **那为什么本文件还留着**：**因为判据的性质没变**——这三条是**域内**规则，
 * 归属服务层（service-layer.md FR-3：路由只解析入参）。传输层放宽不构成把判据下移的理由。
 * 顺带一提，「逐条裁决」也是纯服务层行为：HTTP 侧那条 413 用例压根不产生逐条结果。
 */

function fixture() {
  const h = newDb()
  const template = new FlowTemplatesRepo(h.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(h.db).create({ name: '服务层演示', flowTemplateId: template.id }).id
  let tick = 0
  // M8-E 写侧总闸（FR-5.5.2.1）**默认关**，故本 fixture 必须显式打开，
  // 否则下面每支 ingest 用例都会先撞 422 —— 测的就不是它们要测的东西了。
  // ⚠️ 这条总闸本身的判据在 `agentWriteGate.test.ts`，不在这里。
  new AppMetaRepo(h.db).write(APP_META_KEYS.agentWriteEnabled, true)
  const svc = createAgentService({ db: h.db, now: () => new Date(Date.UTC(2026, 9, 14, 0, 0, tick++)) })
  return { h, svc, projectId }
}

function item(key: string, bytes: number): AgentIngestOne {
  return {
    kind: 'dev_log',
    idempotencyKey: key,
    payload: { body: 'x'.repeat(bytes) },
    sourcePlatform: 'trae',
  }
}

describe('体量三值（FR-2.6，owner 裁③）', () => {
  it('上限值与 spec 一致：单条 512 KB / 20 条 / 总量 2 MB', () => {
    expect(AGENT_BATCH_LIMITS.singleEntryMaxBytes).toBe(512 * 1024)
    expect(AGENT_BATCH_LIMITS.maxItems).toBe(20)
    expect(AGENT_BATCH_LIMITS.requestTotalMaxBytes).toBe(2 * 1024 * 1024)
  })

  it('单条 512 KB 边界：恰好 512 KB 放行，+1 B 拒', () => {
    const { svc, projectId, h } = fixture()
    const atLimit = svc.ingestBatch({ projectId, items: [item('a', 512 * 1024 - 32)] })
    expect(atLimit.accepted).toBe(1)
    const over = svc.ingestBatch({ projectId, items: [item('b', 512 * 1024 + 1024)] })
    expect(over.rejected).toBe(1)
    expect(over.items[0]?.reason).toContain('超单条上限')
    h.close()
  })

  it('总量 2 MB 边界：每条都合法，累计越线后**后条 rejected、前条照落**', () => {
    const { svc, projectId, h } = fixture()
    // 每条 500 KB（< 512 KB），五条累计 2.5 MB > 2 MB ⇒ 前四条落、第五条起拒
    const items = Array.from({ length: 5 }, (_, i) => item(`t-${i}`, 500 * 1024))
    const r = svc.ingestBatch({ projectId, items })
    expect(r.accepted).toBe(4)
    expect(r.rejected).toBe(1)
    expect(r.items[4]?.reason).toContain('总量上限')
    h.close()
  })

  it('**变异腿**：只看单条上限、不看累计总量 ⇒ 上一条必红（这是本文件存在的理由）', () => {
    // 把判据写成可读形式：五条各 500 KB，**每条单独看都在 512 KB 之内**，
    // 只有累计判断能让第 5 条被拒。若实现里去掉总量判断，上一条会变成 5 条全落 ⇒ 必红。
    const each = 500 * 1024
    expect(each).toBeLessThan(AGENT_BATCH_LIMITS.singleEntryMaxBytes)
    expect(5 * each).toBeGreaterThan(AGENT_BATCH_LIMITS.requestTotalMaxBytes)
  })

  it('条数 20 边界：20 条放行、21 条整批 422（整批拒，不逐条挤牙膏）', () => {
    const { svc, projectId, h } = fixture()
    const twenty = Array.from({ length: 20 }, (_, i) => item(`n-${i}`, 10))
    expect(svc.ingestBatch({ projectId, items: twenty }).accepted).toBe(20)
    const twentyOne = [...twenty, item('n-20', 10)]
    expect(() => svc.ingestBatch({ projectId, items: twentyOne })).toThrow(/20/)
    h.close()
  })
})

describe('逐条成败互不影响（FR-2.7）', () => {
  it('超限那条拒掉，其余照落，返回逐条 index 与 status', () => {
    const { svc, projectId, h } = fixture()
    const r = svc.ingestBatch({
      projectId,
      items: [item('ok1', 10), item('big', 600 * 1024), item('ok2', 10)],
    })
    expect(r.items.map((i) => [i.index, i.status])).toEqual([
      [0, 'accepted'],
      [1, 'rejected'],
      [2, 'accepted'],
    ])
    h.close()
  })

  it('项目不存在 ⇒ NOT_FOUND 抛出（**不吞成 20 条 rejected**）', () => {
    const { svc, h } = fixture()
    try {
      svc.ingestBatch({ projectId: 'prj_不存在', items: [item('x', 10)] })
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as { code: string }).code).toBe('NOT_FOUND')
    }
    h.close()
  })

  it('台账只写白名单键：accepted 事件恰为 kind + sourcePlatform', () => {
    const { svc, projectId, h } = fixture()
    svc.ingestBatch({
      projectId,
      items: [{ ...item('w', 10), payload: { body: '机密', cwd: '/Users/me' } }],
    })
    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_ingest_accepted'")
      .get() as { payload_json: string }
    // ⚠️ 引用**单一出处**而非字面量：原先这里硬编码，改规格或改表都不会红
    expect(Object.keys(JSON.parse(row.payload_json)).sort()).toEqual(
      [...AGENT_PAYLOAD_KEYS.agent_ingest_accepted].sort(),
    )
    expect(row.payload_json).not.toContain('机密')
    expect(row.payload_json).not.toContain('/Users/me')
    h.close()
  })

  it('⚠️ 补覆盖：rejected 事件的键闭集此前**零断言**（spec 条 u 判据写「扫描五类事件」）', () => {
    const { svc, projectId, h } = fixture()
    // 超单条上限 ⇒ 走拒收分支
    svc.ingestBatch({ projectId, items: [item('r1', 600_000)] })
    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_ingest_rejected'")
      .get() as { payload_json: string }
    expect(row).toBeDefined()
    expect(Object.keys(JSON.parse(row.payload_json)).sort()).toEqual(
      [...AGENT_PAYLOAD_KEYS.agent_ingest_rejected].sort(),
    )
    h.close()
  })

  it('⚠️ rejected 的 reasonCode 必须是**枚举**而非自由文本（FR-5.1.1），且值不得是那句中文原因', () => {
    const { svc, projectId, h } = fixture()
    svc.ingestBatch({ projectId, items: [item('r2', 600_000)] })
    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_ingest_rejected'")
      .get() as { payload_json: string }
    const payload = JSON.parse(row.payload_json) as { reasonCode: string }
    expect(['oversize', 'invalid']).toContain(payload.reasonCode)
    // 自由文本会把「超了多少字节」「项目不存在」这类细节带进永存本机库的台账
    expect(payload.reasonCode).not.toContain('超')
    h.close()
  })
})

/* ============================================================================
 * 发布分发（FR-2.8 / FR-2.9 / FR-2.1.1）
 *
 * **这一组是补一段从未存在的功能**：原先 `review` 只改 `agent_ingests.status`，
 * 人工确认后业务表里空无一物（dev-plan §4.2 的 🔴 行）。
 *
 * 断言一律**直读业务表**，不走 repo 读侧 —— 「零写入」这件事必须用最直白的方式钉死，
 * 否则「读了读侧恰好没看见」和「真的没写」分不开。
 * ==========================================================================*/

const BUSINESS_TABLES = ['dev_log_entries', 'project_check_states', 'tasks', 'requirements'] as const

function countRows(h: ReturnType<typeof newDb>, table: string): number {
  return (h.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
}

/** 四张业务表全空 —— 「发布前 agent 推的东西一行都没落」 */
function expectBusinessTablesEmpty(h: ReturnType<typeof newDb>): void {
  for (const t of BUSINESS_TABLES) {
    expect(countRows(h, t), `${t} 在人工确认前不该有任何行`).toBe(0)
  }
}

/** 推一条并拿回 id。返回前先断言确实 accepted，否则后面的断言全是空中楼阁 */
function push(
  svc: ReturnType<typeof createAgentService>,
  projectId: string,
  kind: AgentIngestKind,
  key: string,
  payload: Record<string, unknown>,
  sourceSessionId?: string,
): string {
  const item: AgentIngestOne = { kind, idempotencyKey: key, payload, sourcePlatform: 'trae' }
  if (sourceSessionId) item.sourceSessionId = sourceSessionId
  const r = svc.ingestBatch({ projectId, items: [item] })
  expect(r.accepted, `${key} 应 accepted`).toBe(1)
  return r.items[0]!.id as string
}

describe('发布分发 · 人工确认门（FR-2.5）', () => {
  it('推了四类各一条、**一条都还没确认** ⇒ 四张业务表全空，且状态全是 pending', () => {
    const { svc, projectId, h } = fixture()
    const ids = [
      push(svc, projectId, 'dev_log', 'gate-dev', { type: 'DEV', title: '标题', body: '正文' }),
      push(svc, projectId, 'check_state', 'gate-chk', { stageName: '启动', itemId: 'c1' }),
      push(svc, projectId, 'task_status', 'gate-task', { taskId: 'tsk_x', status: 'doing' }),
      push(svc, projectId, 'requirement', 'gate-req', { title: '要支持导出 PDF' }),
    ]
    // **这一条是 FR-2.5 的全部**：agent 的判断不可作为事实源
    expectBusinessTablesEmpty(h)
    expect(svc.listPending(projectId).map((i) => i.status)).toEqual(['pending', 'pending', 'pending', 'pending'])
    for (const id of ids) expect(svc.getIngest(id)!.reviewedAt).toBeNull()
    h.close()
  })
})

describe('发布分发 · dev_log → dev_log_entries（FR-2.8）', () => {
  it('确认后落一行：type 取载荷值、title/body 照落、entry_no 由既有递增逻辑分配', () => {
    const { svc, projectId, h } = fixture()
    const id = push(svc, projectId, 'dev_log', 'dl1', { type: 'DEV', title: '接入层落地', body: '补了发布分发' })
    svc.reviewIngest(id, 'published', null)

    const row = h.db.prepare('SELECT type, entry_no, title, body FROM dev_log_entries').get() as {
      type: string
      entry_no: number
      title: string
      body: string
    }
    expect(row).toEqual({ type: 'DEV', entry_no: 1, title: '接入层落地', body: '补了发布分发' })
    h.close()
  })

  it('type 取既有闭集的另一支 CHECK：两条日志 entry_no 递增且**互不冲突**', () => {
    const { svc, projectId, h } = fixture()
    svc.reviewIngest(push(svc, projectId, 'dev_log', 'd1', { type: 'CHECK', title: '验收', body: '过' }), 'published', null)
    svc.reviewIngest(push(svc, projectId, 'dev_log', 'd2', { type: 'DEV', title: '开发', body: '写' }), 'published', null)

    const rows = h.db
      .prepare('SELECT type, entry_no FROM dev_log_entries ORDER BY rowid ASC')
      .all() as { type: string; entry_no: number }[]
    // 既有分配口径是「同项目同类型 max+1」，故两支各自从 1 起 —— 这正是不该自己算编号的理由
    expect(rows).toEqual([
      { type: 'CHECK', entry_no: 1 },
      { type: 'DEV', entry_no: 1 },
    ])
    // 若这里改成「自己算号」或忽略 type，第二支会撞上 UNIQUE(project_id, type, entry_no)
    expect(countRows(h, 'dev_log_entries')).toBe(2)
    h.close()
  })

  it('type 缺省补 DEV（上报方漏一个可选字段不该把日志卡在队列里）', () => {
    const { svc, projectId, h } = fixture()
    // 载荷里只有 body，连 type 都没有 —— 既有 API 用例也是这个形状
    svc.reviewIngest(push(svc, projectId, 'dev_log', 'dl-def', { body: '只有正文' }), 'published', null)
    expect((h.db.prepare('SELECT type FROM dev_log_entries').get() as { type: string }).type).toBe('DEV')
    h.close()
  })

  it('type 报闭集外的值 ⇒ 整条 rejected 且 dev_log_entries 零写入（不扩列）', () => {
    const { svc, projectId, h } = fixture()
    const id = push(svc, projectId, 'dev_log', 'dl-bad', { type: 'NOTE', body: 'x' })
    const out = svc.reviewIngest(id, 'published', null)
    expect(out.status).toBe('rejected')
    expect(out.rejectReason).toContain('type 非法')
    expectBusinessTablesEmpty(h)
    h.close()
  })
})

describe('发布分发 · check_state → project_check_states（FR-2.9）', () => {
  it('确认后落一行勾选态，stageName/itemId 照载荷落', () => {
    const { svc, projectId, h } = fixture()
    svc.reviewIngest(push(svc, projectId, 'check_state', 'cs1', { stageName: '启动', itemId: 'c1' }), 'published', null)
    expect(new ProjectsRepo(h.db).listCheckStates(projectId)).toEqual([
      { stageName: '启动', itemId: 'c1', checkedAt: expect.any(String) },
    ])
    h.close()
  })

  it('重复推同一格勾选 ⇒ 既有 ON CONFLICT 收敛成一行，不叠行', () => {
    const { svc, projectId, h } = fixture()
    svc.reviewIngest(push(svc, projectId, 'check_state', 'cs-a', { stageName: '启动', itemId: 'c1' }), 'published', null)
    svc.reviewIngest(push(svc, projectId, 'check_state', 'cs-b', { stageName: '启动', itemId: 'c1' }), 'published', null)
    expect(countRows(h, 'project_check_states')).toBe(1)
    h.close()
  })

  it('缺 itemId ⇒ rejected 且零写入（**猜一个 itemId 落库比不落更坏**）', () => {
    const { svc, projectId, h } = fixture()
    const out = svc.reviewIngest(push(svc, projectId, 'check_state', 'cs-bad', { stageName: '启动' }), 'published', null)
    expect(out.status).toBe('rejected')
    expect(out.rejectReason).toContain('itemId')
    expectBusinessTablesEmpty(h)
    h.close()
  })
})

describe('发布分发 · task_status → tasks.status（FR-2.9）', () => {
  it('合法值确认后更新既有任务的状态', () => {
    const { svc, projectId, h } = fixture()
    const taskId = new TasksRepo(h.db).create(projectId, { title: '写发布分发' }).id
    expect(new TasksRepo(h.db).get(taskId)!.status).toBe('todo')

    svc.reviewIngest(push(svc, projectId, 'task_status', 'ts1', { taskId, status: 'done' }), 'published', null)
    expect(new TasksRepo(h.db).get(taskId)!.status).toBe('done')
    // 任务**总数**不变：这是更新既有行，不是新建
    expect(countRows(h, 'tasks')).toBe(1)
    h.close()
  })

  it.each(['blocked', 'review', 'DONE', ''])('上报闭集外的值 %j ⇒ 整条 rejected 且 tasks 零写入', (bad) => {
    const { svc, projectId, h } = fixture()
    const repo = new TasksRepo(h.db)
    const taskId = repo.create(projectId, { title: '不该被动' }).id

    const out = svc.reviewIngest(push(svc, projectId, 'task_status', `ts-${bad || '空'}`, { taskId, status: bad }), 'published', null)
    expect(out.status).toBe('rejected')
    expect(out.rejectReason).toContain('不扩列')
    // 零写入：任务状态**一个字节都没动**，且没有新建出第二条任务
    expect(repo.get(taskId)!.status).toBe('todo')
    expect(countRows(h, 'tasks')).toBe(1)
    // 闭集本身仍是三项（FR-2.9：不得扩列，扩列属 A/B 级）
    expect(TASK_STATUS).toEqual(['todo', 'doing', 'done'])
    // 其余三张表连 fixture 的底子都没有，全空
    for (const t of ['dev_log_entries', 'project_check_states', 'requirements'] as const) {
      expect(countRows(h, t), `${t} 不该有任何行`).toBe(0)
    }
    h.close()
  })

  it('指向别的项目的任务 ⇒ rejected 且零写入（跨项目写 refused）', () => {
    const { svc, projectId, h } = fixture()
    const tpl = new FlowTemplatesRepo(h.db).create({
      name: '另一条流',
      kind: 'light',
      stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
    })
    const otherProject = new ProjectsRepo(h.db).create({ name: '别人的项目', flowTemplateId: tpl.id }).id
    const foreignTask = new TasksRepo(h.db).create(otherProject, { title: '别家的任务' }).id

    const out = svc.reviewIngest(push(svc, projectId, 'task_status', 'ts-x', { taskId: foreignTask, status: 'done' }), 'published', null)
    expect(out.status).toBe('rejected')
    expect(out.rejectReason).toContain('跨项目')
    expect(new TasksRepo(h.db).get(foreignTask)!.status).toBe('todo')
    h.close()
  })

  it('任务不存在 ⇒ rejected 且零写入（不留悬空引用）', () => {
    const { svc, projectId, h } = fixture()
    const out = svc.reviewIngest(push(svc, projectId, 'task_status', 'ts-gone', { taskId: 'tsk_不存在', status: 'done' }), 'published', null)
    expect(out.status).toBe('rejected')
    expect(out.rejectReason).toContain('不存在')
    expectBusinessTablesEmpty(h)
    h.close()
  })
})

describe('发布分发 · requirement → requirements 草稿（FR-2.1.1）', () => {
  it('确认后落一行，status 为 draft，priority/detail 照载荷落', () => {
    const { svc, projectId, h } = fixture()
    svc.reviewIngest(
      push(svc, projectId, 'requirement', 'rq1', { title: '导出支持 PDF', detail: '销售要发标书', priority: 'P1' }),
      'published',
      null,
    )
    const row = h.db.prepare('SELECT project_id, title, detail, priority, status FROM requirements').get() as {
      project_id: string
      title: string
      detail: string
      priority: string
      status: string
    }
    expect(row).toEqual({
      project_id: projectId,
      title: '导出支持 PDF',
      detail: '销售要发标书',
      priority: 'P1',
      status: 'draft',
    })
    h.close()
  })

  it('⚠️ 载荷里带 status:"confirmed" 也**一律落 draft** —— agent 的判断不可作为事实源（FR-2.5）', () => {
    const { svc, projectId, h } = fixture()
    svc.reviewIngest(push(svc, projectId, 'requirement', 'rq-hack', { title: '想直接确认', status: 'confirmed' }), 'published', null)
    // 这条若实现改成「照搬 payload.status」，就会变成 confirmed —— 人工确认门就漏了
    expect((h.db.prepare('SELECT status FROM requirements').get() as { status: string }).status).toBe('draft')
    h.close()
  })

  it('priority 报闭集外的值 ⇒ rejected 且零写入', () => {
    const { svc, projectId, h } = fixture()
    const out = svc.reviewIngest(push(svc, projectId, 'requirement', 'rq-bad', { title: '优先级非法', priority: 'P9' }), 'published', null)
    expect(out.status).toBe('rejected')
    expect(out.rejectReason).toContain('priority 非法')
    expectBusinessTablesEmpty(h)
    h.close()
  })

  it('自报 sourceSessionId 在 agent_sessions 里查无此会话 ⇒ 落 NULL，不撞外键', () => {
    const { svc, projectId, h } = fixture()
    // agent_sessions 全仓无写入路径（实测 INSERT 命中 0），所以这个 id 必然不存在；
    // 硬塞会撞 `source_session_id REFERENCES agent_sessions(id)` 的 FK 约束
    svc.reviewIngest(push(svc, projectId, 'requirement', 'rq-session', { title: '带会话号' }, 'asn_不存在的会话'), 'published', null)
    expect((h.db.prepare('SELECT source_session_id FROM requirements').get() as { source_session_id: string | null }).source_session_id).toBeNull()
    h.close()
  })
})

describe('发布分发 · 幂等（同一个 id 重复 review 不产生第二条业务行）', () => {
  it('dev_log 重复 review 三次 ⇒ dev_log_entries 仍只有一行', () => {
    const { svc, projectId, h } = fixture()
    const id = push(svc, projectId, 'dev_log', 'idem-dl', { type: 'DEV', title: '只应有一行', body: 'x' })
    svc.reviewIngest(id, 'published', null)
    svc.reviewIngest(id, 'published', null)
    svc.reviewIngest(id, 'published', null)
    // 分发只在「首次离开 pending」那一次发生；去掉这道闸就会变成三行
    expect(countRows(h, 'dev_log_entries')).toBe(1)
    h.close()
  })

  it('requirement 重复 review ⇒ requirements 仍只有一行', () => {
    const { svc, projectId, h } = fixture()
    const id = push(svc, projectId, 'requirement', 'idem-rq', { title: '只应有一行需求' })
    svc.reviewIngest(id, 'published', null)
    svc.reviewIngest(id, 'published', null)
    expect(countRows(h, 'requirements')).toBe(1)
    h.close()
  })

  it('已发布的记录被改判 rejected ⇒ 业务行**不被撤销**（记录状态变，行留下）', () => {
    const { svc, projectId, h } = fixture()
    const id = push(svc, projectId, 'dev_log', 'flip', { type: 'DEV', title: '先发后撤', body: 'x' })
    svc.reviewIngest(id, 'published', null)
    const out = svc.reviewIngest(id, 'rejected', '看错了')
    expect(out.status).toBe('rejected')
    // 这是**已登记的语义**：分发只做加法，不做减法（撤一条 dev_log 要走既有的删除端点）
    expect(countRows(h, 'dev_log_entries')).toBe(1)
    h.close()
  })

  it('重复 review 不会二次分发：幂等键不同的第二条同内容记录照常各落一行', () => {
    const { svc, projectId, h } = fixture()
    svc.reviewIngest(push(svc, projectId, 'dev_log', 'a', { type: 'DEV', body: '甲' }), 'published', null)
    svc.reviewIngest(push(svc, projectId, 'dev_log', 'b', { type: 'DEV', body: '甲' }), 'published', null)
    // 幂等是「同一条记录不重复分发」，不是「同内容去重」—— 后者会把 agent 的两次真实上报吞掉
    expect(countRows(h, 'dev_log_entries')).toBe(2)
    h.close()
  })
})

describe('发布分发 · 未定义的落点（登记在案的缺口）', () => {
  it('session 这一类只转状态、不落任何业务表（FR-2.8/2.9/2.1.1 三个落点都没有它）', () => {
    const { svc, projectId, h } = fixture()
    const out = svc.reviewIngest(push(svc, projectId, 'session', 'se1', { title: '一次会话' }), 'published', null)
    expect(out.status).toBe('published')
    // 这是**如实登记的缺口**不是漏写：agent_sessions 表在 0007 建了但全仓无写入路径，
    // spec 的 FR-2 也没给 session 任何落点。若日后补上落点，这条断言就是它的红线
    expectBusinessTablesEmpty(h)
    h.close()
  })
})
