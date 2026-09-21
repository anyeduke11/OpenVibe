import { describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { TasksRepo } from '../repos/tasks'
import { DevLogRepo } from '../repos/devlog'
import { AppError } from '@openvibe/shared'

function fixture() {
  const h = newDb()
  const flows = new FlowTemplatesRepo(h.db)
  const template = flows.create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projects = new ProjectsRepo(h.db)
  const projectId = projects.create({ name: '飞轮演示', flowTemplateId: template.id }).id
  return { h, projects, projectId, tasks: new TasksRepo(h.db), logs: new DevLogRepo(h.db) }
}

describe('UT-TASK-01 · 建卡与列内 order（m5 FR-4）', () => {
  it('同列依次追加 0/1/2，list 按 status+order 返回', () => {
    const f = fixture()
    const a = f.tasks.create(f.projectId, { title: '写 README' })
    const b = f.tasks.create(f.projectId, { title: '建术语表' })
    const c = f.tasks.create(f.projectId, { title: '接 CLI' })
    expect([a.order, b.order, c.order]).toEqual([0, 1, 2])
    expect(a.status).toBe('todo')
    expect(f.tasks.list(f.projectId).map((t) => t.title)).toEqual([
      '写 README',
      '建术语表',
      '接 CLI',
    ])
    f.h.close()
  })

  it('title 为空 → VALIDATION_ERROR；未知项目 → NOT_FOUND', () => {
    const f = fixture()
    expect(() => f.tasks.create(f.projectId, { title: '  ' })).toThrow(AppError)
    expect(() => f.tasks.create('prj_missing', { title: 'x' })).toThrow(/项目不存在/)
    f.h.close()
  })
})

describe('UT-TASK-02 · 拖拽移动的重排语义（m5 §7.5）', () => {
  it('跨列插入首位 → 目标列 order 连续，源列收缩不留洞', () => {
    const f = fixture()
    f.tasks.create(f.projectId, { title: 'A' })
    f.tasks.create(f.projectId, { title: 'B' })
    const c = f.tasks.create(f.projectId, { title: 'C' })
    f.tasks.move(c.id, 'doing', 0)

    const doing = f.tasks.list(f.projectId, 'doing')
    expect(doing.map((t) => [t.title, t.order])).toEqual([['C', 0]])
    expect(f.tasks.list(f.projectId, 'todo').map((t) => [t.title, t.order])).toEqual([
      ['A', 0],
      ['B', 1],
    ])
    f.h.close()
  })

  it('同列内换位：末位拖到首位，整列重新编号', () => {
    const f = fixture()
    f.tasks.create(f.projectId, { title: 'A' })
    f.tasks.create(f.projectId, { title: 'B' })
    const c = f.tasks.create(f.projectId, { title: 'C' })
    f.tasks.move(c.id, 'todo', 0)
    expect(f.tasks.list(f.projectId, 'todo').map((t) => t.title)).toEqual(['C', 'A', 'B'])
    expect(f.tasks.list(f.projectId, 'todo').map((t) => t.order)).toEqual([0, 1, 2])
    f.h.close()
  })

  it('targetIndex 越界钳制到列尾；重复移动到同一位置幂等', () => {
    const f = fixture()
    const a = f.tasks.create(f.projectId, { title: 'A' })
    f.tasks.create(f.projectId, { title: 'B' })
    f.tasks.move(a.id, 'done', 99)
    expect(f.tasks.get(a.id)).toMatchObject({ status: 'done', order: 0 })
    const before = f.tasks.list(f.projectId, 'done')
    f.tasks.move(a.id, 'done', 99)
    expect(f.tasks.list(f.projectId, 'done')).toEqual(before)
    f.h.close()
  })

  it('未知任务 → NOT_FOUND；非法列名 → VALIDATION_ERROR', () => {
    const f = fixture()
    expect(() => f.tasks.move('tsk_missing', 'todo', 0)).toThrow(/不存在/)
    const a = f.tasks.create(f.projectId, { title: 'A' })
    expect(() => f.tasks.move(a.id, 'backlog' as 'todo', 0)).toThrow(/状态/)
    f.h.close()
  })
})

describe('UT-TASK-03 · 挂阶段与元数据编辑（m5 FR-4.2）', () => {
  it('stageName 可挂可摘（null），title 可改，不影响 order/status', () => {
    const f = fixture()
    f.tasks.create(f.projectId, { title: 'A' })
    const b = f.tasks.create(f.projectId, { title: 'B', stageName: '启动' })
    expect(b.stageName).toBe('启动')
    expect(f.tasks.update(b.id, { stageName: null, title: 'B2' })).toMatchObject({
      stageName: null,
      title: 'B2',
      status: 'todo',
      order: 1,
    })
    f.h.close()
  })

  it('删除单卡后同列重新编号', () => {
    const f = fixture()
    f.tasks.create(f.projectId, { title: 'A' })
    const b = f.tasks.create(f.projectId, { title: 'B' })
    f.tasks.create(f.projectId, { title: 'C' })
    f.tasks.delete(b.id)
    expect(f.tasks.list(f.projectId, 'todo').map((t) => [t.title, t.order])).toEqual([
      ['A', 0],
      ['C', 1],
    ])
    expect(() => f.tasks.delete(b.id)).toThrow(/不存在/)
    f.h.close()
  })

  it('重排只改 order，不得把其他列的卡拉回 todo（列隔离）', () => {
    const f = fixture()
    const a = f.tasks.create(f.projectId, { title: 'A' })
    const b = f.tasks.create(f.projectId, { title: 'B' })
    f.tasks.move(b.id, 'done', 0)
    f.tasks.move(a.id, 'todo', 0)
    expect(f.tasks.get(b.id)).toMatchObject({ status: 'done', order: 0 })
    expect(f.tasks.list(f.projectId, 'todo').map((t) => t.title)).toEqual(['A'])
    f.h.close()
  })

  it('未知阶段 → VALIDATION_ERROR（快照内校验，m5 FR-4.2）', () => {
    const f = fixture()
    expect(() => f.tasks.create(f.projectId, { title: 'x', stageName: '不存在的阶段' })).toThrow(
      /阶段不存在于项目快照/,
    )
    const a = f.tasks.create(f.projectId, { title: 'A', stageName: '启动' })
    expect(() => f.tasks.update(a.id, { stageName: '不存在的阶段' })).toThrow(/阶段/)
    f.h.close()
  })

  it('删除项目级联清零 tasks（m5 §7.8）', () => {
    const f = fixture()
    f.tasks.create(f.projectId, { title: 'A' })
    f.tasks.move(f.tasks.create(f.projectId, { title: 'B' }).id, 'doing', 0)
    f.projects.delete(f.projectId)
    expect(f.tasks.list(f.projectId)).toEqual([])
    f.h.close()
  })
})

describe('UT-REFLOW-01 · 回流反查来源（m5 FR-7.2）', () => {
  it('日志 linkedAssetIds 命中 → 返回项目名与 DEV-0007 形态展示号', () => {
    const f = fixture()
    const log = f.logs.create(f.projectId, { type: 'DEV', title: '术语回流' })
    f.logs.linkAsset(log.id, 'trm_alpha')
    expect(f.logs.reflowOriginFor('trm_alpha')).toMatchObject({
      projectId: f.projectId,
      projectName: '飞轮演示',
      displayNo: 'DEV-0001',
    })
    expect(f.logs.reflowOriginFor('trm_missing')).toBeNull()
    f.h.close()
  })

  it('多条日志引用同一资产 → 取最早一条为来源；前缀不得误命中', () => {
    const f = fixture()
    const first = f.logs.create(f.projectId, { type: 'DEV', title: '第一次' })
    const second = f.logs.create(f.projectId, { type: 'CHECK', title: '第二次' })
    f.logs.linkAsset(first.id, 'trm_alpha')
    f.logs.linkAsset(second.id, 'trm_alpha')
    expect(f.logs.reflowOriginFor('trm_alpha')?.logId).toBe(first.id)

    f.logs.linkAsset(second.id, 'trm_alph')
    expect(f.logs.reflowOriginFor('trm_alph')?.logId).toBe(second.id)
    expect(f.logs.reflowOriginFor('trm_alp')).toBeNull()
    f.h.close()
  })

  it('项目删除后来源反链一并消失', () => {
    const f = fixture()
    const log = f.logs.create(f.projectId, { type: 'DEV', title: 'x' })
    f.logs.linkAsset(log.id, 'prm_beta')
    f.projects.delete(f.projectId)
    expect(f.logs.reflowOriginFor('prm_beta')).toBeNull()
    f.h.close()
  })
})
