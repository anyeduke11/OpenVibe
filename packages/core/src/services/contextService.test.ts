import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { TasksRepo } from '../repos/tasks'
import { DevLogRepo } from '../repos/devlog'
import { createContextService } from './contextService'
import { parseContextFields, CONTEXT_FIELDS } from '@openvibe/shared'

/**
 * M8 · 聚合查询面（M8-D · FR-3）。
 *
 * 覆盖的判据：FR-3.2.1 假零禁止 · FR-3.2.2 不返 body · FR-3.3 非法 fields 不静默忽略 ·
 * FR-3.4 预算裁剪顺序 ＋ **每次裁剪进 truncated**。
 */

function fixture() {
  const h = newDb()
  const stages = [
    { name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }, { id: 'c2', text: '定范围' }], artifacts: [] },
    { name: '设计', checklist: [{ id: 'd1', text: '画流程' }], artifacts: [] },
  ]
  const template = new FlowTemplatesRepo(h.db).create({ name: '轻量流', kind: 'light', stages })
  const projects = new ProjectsRepo(h.db)
  const projectId = projects.create({ name: '聚合演示', flowTemplateId: template.id }).id
  return { h, projects, projectId }
}

const noLock = () => null

/**
 * 宽检查项 fixture。
 *
 * ⚠️ 为什么不能直接用上面的 `fixture()` 测「砍 checklist」：`build` 的第三刀量的是
 * `{logs, assets, checklist}` 的 UTF-8 字节数，而默认 fixture 只有 2 条短检查项，
 * 实测序列化后 ≈ **183 字节** —— 低于 `MIN_BUDGET_CHARS`（200）。
 * 于是 **任何合法 budget（≥200）都压不动它**，用例会「因为没触发裁剪所以找不到 note」而红，
 * 或者日后被人把断言改松就变成永真。这是个真实的陷阱，不是笔误。
 *
 * 所以这里造一个真实体量的检查项表（6 条 · 长文案 ≈ 617 字节），让预算 220 真的把它逼过线。
 */
function wideChecklistFixture() {
  const h = newDb()
  const checklist = Array.from({ length: 6 }, (_, i) => ({
    id: `w${i + 1}`,
    text: '写下这个问题的一句话陈述并确认边界',
  }))
  const stages = [
    { name: '启动', checklist, artifacts: [] },
    { name: '设计', checklist: [{ id: 'd1', text: '画流程' }], artifacts: [] },
  ]
  const template = new FlowTemplatesRepo(h.db).create({ name: '宽检查项流', kind: 'light', stages })
  const projects = new ProjectsRepo(h.db)
  const projectId = projects.create({ name: '聚合演示', flowTemplateId: template.id }).id
  return { h, projects, projectId }
}

describe('FR-3.3 · fields 裁剪不静默忽略', () => {
  it('不传 ⇒ 六个段全要', () => {
    expect(parseContextFields(undefined)).toEqual([...CONTEXT_FIELDS])
  })

  it('合法子集按给定顺序返回、去重', () => {
    expect(parseContextFields('stage,logs,stage')).toEqual(['stage', 'logs'])
  })

  it('**空串是非法**而不是「全选」—— 拼错字段名却拿到全量，不会报错也不会察觉', () => {
    expect(() => parseContextFields('')).toThrow(/合法值/)
  })

  it('非法值 ⇒ 抛错且**错误消息里列出全部合法值**（不静默忽略）', () => {
    try {
      parseContextFields('stage,status,next')
      throw new Error('本该抛错')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('status')
      expect(msg).toContain('next')
      for (const f of CONTEXT_FIELDS) expect(msg).toContain(f)
    }
  })
})

describe('FR-3.2 · 出参形状与「假零禁止」', () => {
  it('恒返回 project / stage 摘要，即便 `?fields=logs`', () => {
    const { h, projectId } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['logs'])
    expect(out.project.id).toBe(projectId)
    expect(out.stage.total).toBe(2)
    expect(out.fields).toEqual(['logs'])
    h.close()
  })

  it('项目不存在 ⇒ NOT_FOUND（11 项闭集内，不新增码）', () => {
    const { h } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    try {
      svc.build('prj_不存在')
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as { code: string }).code).toBe('NOT_FOUND')
    }
    h.close()
  })

  it('FR-3.2.1 · 读不到 pack.lock.json ⇒ 三字段全 null **且进 truncated**（不是「没漂移」）', () => {
    const { h, projectId } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['pack'])
    expect(out.pack).toEqual({ id: null, name: null, version: null, drifted: null, outdated: null })
    const note = out.truncated.find((t) => t.section === 'pack')
    expect(note).toBeDefined()
    expect(note!.reason).toBe('no_lock_file')
    expect(note!.detail).toContain('不是「没漂移」')
    h.close()
  })

  it('能读到 lock ⇒ drifted/outdated 为真值，且 truncated 里没有 pack 段', () => {
    const { h, projects, projectId } = fixture()
    // ⚠️ 必须先绑定本机路径，否则 readPack 走的是「未绑定路径」分支（那是另一条已覆盖的用例）
    projects.update(projectId, { localPath: '/tmp/openvibe-ctx' })
    const svc = createContextService({
      db: h.db,
      readLock: () => ({ packId: 'pk_1', name: '默认包', version: '1.0.0', drifted: true, outdated: false }),
    })
    const out = svc.build(projectId, ['pack'])
    expect(out.pack.drifted).toBe(true)
    expect(out.pack.outdated).toBe(false)
    expect(out.truncated.find((t) => t.section === 'pack')).toBeUndefined()
    h.close()
  })

  it('项目未绑定本机路径 ⇒ pack 三字段全 null **且说明是「不可判定」不是「没漂移」**', () => {
    const { h, projectId } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['pack'])
    expect(out.pack.drifted).toBeNull()
    const note = out.truncated.find((t) => t.section === 'pack')
    expect(note!.detail).toContain('未绑定本机路径')
    h.close()
  })

  it('FR-3.2.2 · 日志段**不含 body**（上下文体积敏感，正文另取）', () => {
    const { h, projects, projectId } = fixture()
    new TasksRepo(h.db).create(projectId, { title: '先建张卡' })
    const logs = new DevLogRepo(h.db)
    logs.create(projectId, { type: 'DEV', title: '起手', body: '很长的正文内容' })
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['logs'])
    expect(out.logs.items.length).toBeGreaterThan(0)
    expect(out.logs.items[0]).not.toHaveProperty('body')
    expect(JSON.stringify(out.logs)).not.toContain('很长的正文内容')
    void projects
    h.close()
  })

  it('checklist 的勾选态按**行是否存在**判（取消勾选是 DELETE，不是置 null）', () => {
    const { h, projects, projectId } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    const before = svc.build(projectId, ['checklist'])
    expect(before.checklist.items.map((i) => i.checked)).toEqual([false, false])
    projects.checkState(projectId, '启动', 'c1', true)
    const after = svc.build(projectId, ['checklist'])
    expect(after.checklist.items[0]!.checked).toBe(true)
    expect(after.checklist.items[1]!.checked).toBe(false)
    h.close()
  })
})

describe('FR-3.4 · 预算裁剪：顺序固定 ＋ 每次必留痕', () => {
  function withLogs(h: ReturnType<typeof newDb>, projectId: string, n: number, size: number) {
    const logs = new DevLogRepo(h.db)
    for (let i = 0; i < n; i++) {
      logs.create(projectId, { type: 'DEV', title: `第 ${i} 条`, body: 'x'.repeat(size) })
    }
  }

  it('预算够 ⇒ 不裁剪，truncated 为空数组（不是 undefined）', () => {
    const { h, projectId } = fixture()
    withLogs(h, projectId, 2, 200)
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['logs', 'checklist', 'assets'], 100_000)
    expect(out.truncated).toEqual([])
    expect(out.logs.items).toHaveLength(2)
    h.close()
  })

  it('预算不够 ⇒ **先砍 logs**，并在 truncated 记明丢了多少', () => {
    const { h, projectId } = fixture()
    withLogs(h, projectId, 20, 400)
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['logs', 'checklist', 'assets'], 2_000)
    const note = out.truncated.find((t) => t.section === 'logs')
    expect(note).toBeDefined()
    expect(note!.reason).toBe('budget')
    expect(note!.dropped).toBeGreaterThan(0)
    // 保留的是**最近的**：`DevLogRepo.list` 是 created_at DESC ⇒ 最新在前
    expect(out.logs.items[0]!.title).toBe('第 19 条')
    h.close()
  })

  it('**砍 checklist 必须整段写明** —— agent 不得把它读成「没有未完成检查项」', () => {
    const { h, projectId } = wideChecklistFixture()
    const svc = createContextService({ db: h.db, readLock: noLock })

    // 先证明「不裁剪时确实超预算」——否则这条用例日后被改松就成永真，没人看得出它已失效
    const full = svc.build(projectId, ['checklist'])
    const fullBytes = Buffer.byteLength(
      JSON.stringify({ logs: full.logs, assets: full.assets, checklist: full.checklist }),
      'utf8',
    )
    expect(full.checklist.items).toHaveLength(6)
    expect(fullBytes).toBeGreaterThan(220)

    const out = svc.build(projectId, ['checklist'], 220)
    const note = out.truncated.find((t) => t.section === 'checklist')
    expect(note).toBeDefined()
    expect(note!.dropped).toBe(6)
    expect(note!.detail).toContain('这不是')
    expect(out.checklist.items).toEqual([])
    h.close()
  })

  it('裁剪顺序固定：logs → assets → checklist（多个段同时超预算时按此序记）', () => {
    const { h, projectId } = fixture()
    withLogs(h, projectId, 30, 300)
    const svc = createContextService({ db: h.db, readLock: noLock })
    const out = svc.build(projectId, ['logs', 'assets', 'checklist'], 300)
    const order = out.truncated.map((t) => t.section)
    const rank = (s: string) => ['logs', 'assets', 'checklist', 'pack'].indexOf(s)
    const ranks = order.map(rank)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    h.close()
  })

  it('预算低于结构下界 ⇒ 422 并说明（返回一个 agent 无法使用的残缺上下文更糟）', () => {
    const { h, projectId } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    expect(() => svc.build(projectId, ['logs'], 10)).toThrow(/至少/)
    h.close()
  })

  it('**钉死上游排序方向**：`DevLogRepo.list` 必须是最新在前，否则裁剪会静默变成「留最旧的」', () => {
    const { h, projectId } = fixture()
    withLogs(h, projectId, 3, 10)
    const out = createContextService({ db: h.db, readLock: noLock }).build(projectId, ['logs'], undefined)
    expect(out.logs.items.map((l) => l.title)).toEqual(['第 2 条', '第 1 条', '第 0 条'])
    h.close()
  })

  it('每次服务都留台账：agent_context_served 的 payload 只含白名单三键', () => {
    const { h, projectId } = fixture()
    const svc = createContextService({ db: h.db, readLock: noLock })
    svc.build(projectId, ['logs'], undefined, new Date('2026-10-15T00:00:00Z'))
    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_context_served'")
      .get() as { payload_json: string }
    expect(Object.keys(JSON.parse(row.payload_json)).sort()).toEqual(['fieldsCount', 'platform', 'truncated'])
    h.close()
  })
})
