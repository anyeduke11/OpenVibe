import { describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { DevLogRepo } from '../repos/devlog'
import { AppError } from '@openvibe/shared'

const stages = [
  { name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }, { id: 'c2', text: '建日志' }], artifacts: [] },
  { name: '开发', checklist: [{ id: 'c3', text: '小步提交' }], artifacts: [] },
]

describe('stagesSnapshot 物化（design D10）', () => {
  it('模板后续修改不影响存量项目；内置模板禁改禁删', () => {
    const h = newDb()
    const flows = new FlowTemplatesRepo(h.db)
    const builtin = flows.create({ name: '个人轻量流', kind: 'light', stages }, { builtin: true })
    const copy = flows.duplicate(builtin.id)
    const projects = new ProjectsRepo(h.db)
    const project = projects.create({ name: 'demo', flowTemplateId: copy.id })

    flows.update(copy.id, { stages: [{ name: '新阶段', checklist: [], artifacts: [] }] })
    expect(projects.get(project.id)?.stagesSnapshot).toEqual(stages)

    expect(() => flows.update(builtin.id, { name: 'x' })).toThrow(AppError)
    expect(() => flows.delete(builtin.id)).toThrow(AppError)
    // 复制件 kind → custom、builtin=false、名称带副本
    expect(copy.kind).toBe('custom')
    expect(copy.builtin).toBe(false)
    expect(copy.name).toContain('副本')
    h.close()
  })
})

describe('阶段切换与检查清单持久化', () => {
  it('switchStage 校验快照内阶段；勾选状态持久且 healthSummary 汇总正确', () => {
    const h = newDb()
    const flows = new FlowTemplatesRepo(h.db)
    const template = flows.create({ name: '轻量流', kind: 'light', stages })
    const projects = new ProjectsRepo(h.db)
    const project = projects.create({ name: 'demo', flowTemplateId: template.id })

    expect(() => projects.switchStage(project.id, '不存在阶段')).toThrow(AppError)
    projects.switchStage(project.id, '开发')
    expect(projects.get(project.id)?.currentStage).toBe('开发')

    projects.checkState(project.id, '启动', 'c1', true)
    projects.checkState(project.id, '启动', 'c2', true)
    const summary = projects.healthSummary(project.id)
    expect(summary.unchecked).toBe(1) // 仅 c3
    expect(summary.total).toBe(3)

    // 取消勾选回落
    projects.checkState(project.id, '启动', 'c2', false)
    expect(projects.healthSummary(project.id).unchecked).toBe(2)

    // 最近日志时间进入摘要
    new DevLogRepo(h.db).create(project.id, { type: 'DEV', title: '', body: '', relatedFiles: [] })
    expect(projects.healthSummary(project.id).lastLogAt).toBeTruthy()
    h.close()
  })
})

describe('UT-ENTRYNO-01 · 日志编号分配与导出', () => {
  it('同类型递增不重号，跨类型独立；displayNo 4 位零填充', () => {
    const h = newDb()
    const flows = new FlowTemplatesRepo(h.db)
    const template = flows.create({ name: '轻量流', kind: 'light', stages })
    const projects = new ProjectsRepo(h.db)
    const project = projects.create({ name: 'demo', flowTemplateId: template.id })
    const logs = new DevLogRepo(h.db)

    const e1 = logs.create(project.id, { type: 'DEV', title: '首条', body: 'b', relatedFiles: ['src/a.ts'] })
    const e2 = logs.create(project.id, { type: 'DEV', title: '', body: '', relatedFiles: [] })
    const c1 = logs.create(project.id, { type: 'CHECK', title: '', body: '', relatedFiles: [] })
    const e3 = logs.create(project.id, { type: 'DEV', title: '', body: '', relatedFiles: [] })

    expect([e1.entryNo, e2.entryNo, e3.entryNo]).toEqual([1, 2, 3])
    expect(c1.entryNo).toBe(1)
    expect(e1.displayNo).toBe('DEV-0001')
    expect(c1.displayNo).toBe('CHECK-0001')

    // 回流反链幂等
    logs.linkAsset(e1.id, 'trm_x')
    logs.linkAsset(e1.id, 'trm_x')
    expect(logs.get(e1.id)?.linkedAssetIds).toEqual(['trm_x'])

    const md = logs.export(project.id, 'DEV')
    expect(md).toContain('DEV-0001 · 首条')
    expect(md).toContain('src/a.ts')
    expect(md.indexOf('DEV-0001')).toBeLessThan(md.indexOf('DEV-0003'))
    h.close()
  })

  it('evidence 结构落库并可读（m5 §3）', () => {
    const h = newDb()
    const flows = new FlowTemplatesRepo(h.db)
    const template = flows.create({ name: '轻量流', kind: 'light', stages })
    const projects = new ProjectsRepo(h.db)
    const project = projects.create({ name: 'demo', flowTemplateId: template.id })
    const log = new DevLogRepo(h.db).create(project.id, {
      type: 'DEV',
      title: '',
      body: '',
      relatedFiles: [],
      evidence: { command: 'pnpm test', resultSummary: '10 passed' },
    })
    expect(log.evidence).toEqual({ command: 'pnpm test', resultSummary: '10 passed' })
    h.close()
  })
})
