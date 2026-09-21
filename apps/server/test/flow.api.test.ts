import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { runSeed } from '@openvibe/core'
import type { DevLogOut, FlowTemplateOut, ProjectOut, Stage, TaskOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

const TOKEN = 'test-token'
const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')

/** 项目端点统一带健康摘要（避免前端二次请求，见 routes/projects.ts） */
type ProjectView = ProjectOut & {
  health: {
    stage: string | null
    unchecked: number
    total: number
    logCount: number
    taskCount: number
  }
  localPathWarning?: string | null
}

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  /** 沙箱根：localPath 与 lock 夹具都建在这里，用例结束统一删（不入库、不碰真实 home） */
  root: string
}

const openHandles: Harness[] = []

async function makeHarness(seed = false): Promise<Harness> {
  const handle = newDb()
  if (seed) runSeed(handle.db, SEED_DIR)
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle, root: mkdtempSync(join(tmpdir(), 'ov-m5-test-')) }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
    if (h) rmSync(h.root, { recursive: true, force: true })
  }
})

function injectApi(
  h: Harness,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return h.app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}` } })
}

const stage = (name: string, itemCount: number): Stage => ({
  name,
  checklist: Array.from({ length: itemCount }, (_, i) => ({
    id: `${name}-c${i + 1}`,
    text: `${name} 检查项 ${i + 1}`,
  })),
  artifacts: [],
})

async function mkTemplate(h: Harness, name: string, stages: Stage[]): Promise<FlowTemplateOut> {
  const res = await injectApi(h, 'POST', '/api/flow-templates', { name, kind: 'custom', stages })
  expect(res.statusCode).toBe(201)
  return res.json() as FlowTemplateOut
}

async function mkProject(h: Harness, flowTemplateId: string, extra: object = {}): Promise<ProjectView> {
  const res = await injectApi(h, 'POST', '/api/projects', { name: '观测台', flowTemplateId, ...extra })
  expect(res.statusCode).toBe(201)
  return res.json() as ProjectView
}

async function mkTask(h: Harness, projectId: string, title: string): Promise<TaskOut> {
  const res = await injectApi(h, 'POST', `/api/projects/${projectId}/tasks`, { title })
  expect(res.statusCode).toBe(201)
  return res.json() as TaskOut
}

/** 写出合法 pack.lock.json（design §7.5）并返回项目目录 */
function writeLock(h: Harness, version: string, packName = 'default'): string {
  const dir = join(h.root, `proj-${packName}-${version}`)
  mkdirSync(join(dir, '.openvibe'), { recursive: true })
  writeFileSync(
    join(dir, '.openvibe', 'pack.lock.json'),
    JSON.stringify({
      schemaVersion: 1,
      pack: { id: 'pk_std', name: packName, version, fingerprint: 'f'.repeat(64) },
      injectedAt: '2026-09-20T02:11:00.000Z',
      files: [{ path: 'CLAUDE.md', sha256: 'a'.repeat(64), managed: true }],
    }),
  )
  return dir
}

/** 目录树指纹（相对路径 + 内容 base64），用于证明删项目未触碰用户文件 */
function hashTree(dir: string): string {
  const acc = createHash('sha256')
  const walk = (cur: string, prefix: string): void => {
    for (const name of readdirSync(cur).sort()) {
      const abs = join(cur, name)
      const rel = prefix === '' ? name : `${prefix}/${name}`
      if (statSync(abs).isDirectory()) walk(abs, rel)
      else acc.update(`${rel}:${readFileSync(abs).toString('base64')}\n`)
    }
  }
  walk(dir, '')
  return acc.digest('hex')
}

async function seededBuiltin(h: Harness, name: string): Promise<FlowTemplateOut> {
  const res = await injectApi(h, 'GET', '/api/flow-templates')
  expect(res.statusCode).toBe(200)
  const found = (res.json().items as FlowTemplateOut[]).find((t) => t.name === name)
  if (!found) throw new Error(`种子模板缺失: ${name}`)
  return found
}

function countRows(h: Harness, sql: string): number {
  return (h.handle.db.prepare(sql).get() as { n: number }).n
}

describe('T5b · m5 §7 验收映射（API 行为层）', () => {
  it('IT-FLOW-01（§7.2）: 复制 Spec 驱动流→删 1 阶段加 2 项→新项目快照一致，本体未变', async () => {
    const h = await makeHarness(true)
    const builtin = await seededBuiltin(h, 'Spec 驱动流')
    expect(builtin.builtin).toBe(true)
    const originalStages = builtin.stages

    const dup = await injectApi(h, 'POST', `/api/flow-templates/${builtin.id}/duplicate`)
    expect(dup.statusCode).toBe(201)
    const copy = dup.json() as FlowTemplateOut
    expect(copy).toMatchObject({ builtin: false, kind: 'custom', name: 'Spec 驱动流 副本' })
    expect(copy.stages).toEqual(originalStages)

    const edited = originalStages
      .filter((s) => s.name !== '审查')
      .map((s) =>
        s.name === '实现'
          ? {
              ...s,
              checklist: [
                ...s.checklist,
                { id: 'impl-extra-1', text: '补单测' },
                { id: 'impl-extra-2', text: '跑三平台 CI' },
              ],
            }
          : s,
      )
    const patch = await injectApi(h, 'PATCH', `/api/flow-templates/${copy.id}`, { stages: edited })
    expect(patch.statusCode).toBe(200)
    expect((patch.json() as FlowTemplateOut).stages).toEqual(edited)

    const project = await mkProject(h, copy.id, { name: '副本落地' })
    expect(project.stagesSnapshot).toEqual(edited)
    expect(project.currentStage).toBe(edited[0]?.name)

    // 本体不受影响（design D10：改副本不动原本体）
    const after = await seededBuiltin(h, 'Spec 驱动流')
    expect(after.stages).toEqual(originalStages)
    expect(after.stages.some((s) => s.name === '审查')).toBe(true)

    // 第二次复制名称去重
    const dup2 = await injectApi(h, 'POST', `/api/flow-templates/${builtin.id}/duplicate`)
    expect((dup2.json() as FlowTemplateOut).name).toBe('Spec 驱动流 副本2')
  })

  it('IT-FLOW-02（§7.3）: 内置模板改/删 → 403 BUILTIN_IMMUTABLE；自定义可删且二次删 404', async () => {
    const h = await makeHarness(true)
    const builtin = await seededBuiltin(h, '个人轻量流')

    const badPatch = await injectApi(h, 'PATCH', `/api/flow-templates/${builtin.id}`, {
      stages: [stage('只此一家', 1)],
    })
    expect(badPatch.statusCode).toBe(403)
    expect(badPatch.json().code).toBe('BUILTIN_IMMUTABLE')
    expect(badPatch.json().message).toContain('不可编辑')

    const badDelete = await injectApi(h, 'DELETE', `/api/flow-templates/${builtin.id}`)
    expect(badDelete.statusCode).toBe(403)
    expect(badDelete.json().code).toBe('BUILTIN_IMMUTABLE')

    // 复制出来的才能改——§7.3 的 UI 禁用入口在服务端有对等防线
    const custom = await injectApi(
      h,
      'POST',
      `/api/flow-templates/${builtin.id}/duplicate`,
    ).then((r) => r.json() as FlowTemplateOut)
    const ok = await injectApi(h, 'PATCH', `/api/flow-templates/${custom.id}`, { name: '我的轻量流' })
    expect(ok.statusCode).toBe(200)
    expect((ok.json() as FlowTemplateOut).name).toBe('我的轻量流')

    expect((await injectApi(h, 'DELETE', `/api/flow-templates/${custom.id}`)).statusCode).toBe(204)
    const again = await injectApi(h, 'DELETE', `/api/flow-templates/${custom.id}`)
    expect(again.statusCode).toBe(404)
    expect(again.json().code).toBe('NOT_FOUND')

    // 内置模板仍在列表里（三档：个人轻量流 / Spec 驱动流 / 复盘流）
    const list = await injectApi(h, 'GET', '/api/flow-templates')
    const builtins = (list.json().items as FlowTemplateOut[]).filter((t) => t.builtin)
    expect(builtins.map((t) => t.name).sort()).toEqual(['Spec 驱动流', '个人轻量流', '复盘流'])
  })

  it('IT-PROJECT-01（§7.1）: lock 可读 → 包@版本与注入时间；登记版本落后 → upToDate=false', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '单阶段流', [stage('开发', 2)])
    const dir = writeLock(h, '1.2.0', 'team-pack')
    const project = await mkProject(h, tpl.id, { name: '注入观测', localPath: dir })
    expect(project.localPathWarning).toBeNull()

    // 尚未登记包：只报 lock 内容，不臆造 upToDate
    const bare = (await injectApi(h, 'GET', `/api/projects/${project.id}/injection-status`)).json()
    expect(bare.lockPresent).toBe(true)
    expect(bare.pack).toEqual({ name: 'team-pack', version: '1.2.0', fingerprint: 'f'.repeat(64) })
    expect(bare.injectedAt).toBe('2026-09-20T02:11:00.000Z')
    expect(bare.registered).toBeUndefined()
    expect(bare.upToDate).toBeUndefined()
    expect(bare.suggestedCommand).toBe(`npx openvibe-cli sync ${dir} --pack team-pack`)

    const reg = await injectApi(h, 'PATCH', `/api/projects/${project.id}`, {
      standardPackId: 'pk_std',
      standardPackVersion: '1.2.0',
    })
    expect(reg.statusCode).toBe(200)
    const same = (
      await injectApi(h, 'GET', `/api/projects/${project.id}/injection-status`)
    ).json()
    expect(same.upToDate).toBe(true)
    expect(same.registered).toEqual({ packId: 'pk_std', version: '1.2.0' })

    // 登记版本改为更旧 → 「可更新」提示的判据（工作台文案在 T5c）
    await injectApi(h, 'PATCH', `/api/projects/${project.id}`, { standardPackVersion: '1.1.0' })
    const stale = (
      await injectApi(h, 'GET', `/api/projects/${project.id}/injection-status`)
    ).json()
    expect(stale.upToDate).toBe(false)
    expect(stale.lockPresent).toBe(true)
  })

  it('IT-CHECK-01（§7.4）: 勾 3/5 → 完成度 60%，重取仍保持；取消回落到 2/5 已勾', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '五项清单', [stage('开发', 5)])
    const project = await mkProject(h, tpl.id)
    const ids = ['开发-c1', '开发-c2', '开发-c3', '开发-c4', '开发-c5']

    expect(project.health).toMatchObject({ total: 5, unchecked: 5 })

    for (const itemId of ids.slice(0, 3)) {
      const res = await injectApi(h, 'PUT', `/api/projects/${project.id}/check-states`, {
        stageName: '开发',
        itemId,
        checked: true,
      })
      expect(res.statusCode).toBe(200)
    }
    const detail = (await injectApi(h, 'GET', `/api/projects/${project.id}`)).json() as ProjectView
    expect(detail.health).toMatchObject({ total: 5, unchecked: 2 })
    expect(((detail.health.total - detail.health.unchecked) / detail.health.total) * 100).toBe(60)

    const list = (await injectApi(h, 'GET', `/api/projects/${project.id}/check-states`)).json()
    expect(list.total).toBe(3)
    expect(list.items.map((i: { itemId: string }) => i.itemId)).toEqual(ids.slice(0, 3))

    // 重复勾选幂等（ON CONFLICT 更新，不产生第二条登记）
    await injectApi(h, 'PUT', `/api/projects/${project.id}/check-states`, {
      stageName: '开发',
      itemId: ids[0],
      checked: true,
    })
    expect(
      (await injectApi(h, 'GET', `/api/projects/${project.id}/check-states`)).json().total,
    ).toBe(3)

    const uncheck = await injectApi(h, 'PUT', `/api/projects/${project.id}/check-states`, {
      stageName: '开发',
      itemId: ids[0],
      checked: false,
    })
    expect(uncheck.json().health).toMatchObject({ total: 5, unchecked: 3 })

    const badItem = await injectApi(h, 'PUT', `/api/projects/${project.id}/check-states`, {
      stageName: '开发',
      itemId: 'ghost',
      checked: true,
    })
    expect(badItem.statusCode).toBe(422)
    expect(badItem.json().message).toContain('检查项不存在')

    const badStage = await injectApi(h, 'PUT', `/api/projects/${project.id}/check-states`, {
      stageName: '已消失的阶段',
      itemId: ids[0],
      checked: true,
    })
    expect(badStage.statusCode).toBe(422)
    expect(badStage.json().message).toContain('阶段不存在')
  })

  it('IT-TASK-01（§7.5）: 看板 todo→doing 与列内排序落库，重取列表顺序保持', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '看板流', [stage('开发', 1)])
    const project = await mkProject(h, tpl.id, { name: '看板项目' })

    const a = await mkTask(h, project.id, 'A')
    const b = await mkTask(h, project.id, 'B')
    const c = await mkTask(h, project.id, 'C')
    expect([a, b, c].map((t) => [t.title, t.status, t.order])).toEqual([
      ['A', 'todo', 0],
      ['B', 'todo', 1],
      ['C', 'todo', 2],
    ])

    // C 拖到 doing，再把 A 拖到 doing 的第 2 位
    expect(
      (await injectApi(h, 'PATCH', `/api/tasks/${c.id}`, { status: 'doing', order: 0 })).statusCode,
    ).toBe(200)
    expect(
      (await injectApi(h, 'PATCH', `/api/tasks/${a.id}`, { status: 'doing', order: 1 })).statusCode,
    ).toBe(200)

    const doing = (await injectApi(h, 'GET', `/api/projects/${project.id}/tasks?status=doing`)).json()
    expect(doing.items.map((t: TaskOut) => [t.title, t.status, t.order])).toEqual([
      ['C', 'doing', 0],
      ['A', 'doing', 1],
    ])
    const todo = (await injectApi(h, 'GET', `/api/projects/${project.id}/tasks?status=todo`)).json()
    expect(todo.items.map((t: TaskOut) => [t.title, t.order])).toEqual([['B', 0]])

    // 全部（不带 status）按列 + 序返回，源列不留空洞
    const all = (await injectApi(h, 'GET', `/api/projects/${project.id}/tasks`)).json()
    expect(all.total).toBe(3)

    // 改标题 / 摘掉阶段：不带 order 即走 update 分支
    const edit = await injectApi(h, 'PATCH', `/api/tasks/${b.id}`, {
      title: 'B 改名',
      stageName: null,
    })
    expect(edit.statusCode).toBe(200)
    expect(edit.json()).toMatchObject({ title: 'B 改名', stageName: null, status: 'todo', order: 0 })

    const badMove = await injectApi(h, 'PATCH', `/api/tasks/${b.id}`, { status: 'review', order: 0 })
    expect(badMove.statusCode).toBe(422)
    expect(badMove.json().code).toBe('VALIDATION_ERROR')

    const badStage = await injectApi(h, 'PATCH', `/api/tasks/${b.id}`, { stageName: '不存在' })
    expect(badStage.statusCode).toBe(422)

    expect((await injectApi(h, 'GET', '/api/projects/prj_ghost/tasks')).statusCode).toBe(404)
  })

  it('IT-DEVLOG-01（§7.6）: 连续三条 DEV 编号有序，导出含 evidence 段；CHECK 独立编号', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '日志流', [stage('开发', 1)])
    const project = await mkProject(h, tpl.id, { name: '日志项目' })

    const nos: string[] = []
    for (const title of ['接入 FTS5', '拆分 repos', 'CI 三平台']) {
      const res = await injectApi(h, 'POST', `/api/projects/${project.id}/devlog`, {
        type: 'DEV',
        title,
        body: `正文 ${title}`,
        relatedFiles: ['packages/core/src/db/index.ts'],
        evidence: { command: 'pnpm test', resultSummary: '全绿' },
      })
      expect(res.statusCode).toBe(201)
      nos.push((res.json() as DevLogOut).displayNo)
    }
    expect(nos).toEqual(['DEV-0001', 'DEV-0002', 'DEV-0003'])

    const check = await injectApi(h, 'POST', `/api/projects/${project.id}/devlog`, {
      type: 'CHECK',
      title: '走查 m5 §7',
    })
    expect((check.json() as DevLogOut).displayNo).toBe('CHECK-0001')

    const list = (await injectApi(h, 'GET', `/api/projects/${project.id}/devlog?type=DEV`)).json()
    expect(list.total).toBe(3)
    expect(list.items[0].entryNo).toBe(3) // 新→旧

    const exportRes = await injectApi(h, 'GET', `/api/projects/${project.id}/devlog/export?type=DEV`)
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.headers['content-disposition']).toContain('DEV_LOG.md')
    const md = exportRes.body
    expect(md.startsWith('# DEV_LOG')).toBe(true)
    expect(md.indexOf('## DEV-0001')).toBeLessThan(md.indexOf('## DEV-0003'))
    expect(md).toContain('- 测试命令: `pnpm test`')
    expect(md).toContain('结果: 全绿')
    expect(md).toContain('packages/core/src/db/index.ts')
    expect(md).not.toContain('CHECK-0001')

    const checkMd = await injectApi(
      h,
      'GET',
      `/api/projects/${project.id}/devlog/export?type=CHECK`,
    )
    expect(checkMd.headers['content-disposition']).toContain('CHECK_LOG.md')
    expect(checkMd.body).toContain('## CHECK-0001 · 走查 m5 §7')

    expect(
      (await injectApi(h, 'GET', `/api/projects/${project.id}/devlog/export?type=BOGUS`)).statusCode,
    ).toBe(422)
  })

  it('IT-REFLOW-01（§7.7）: 日志→draft 词条（source=project:名）→挂链→反查 DEV 编号', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '回流流', [stage('复盘', 1)])
    const project = await mkProject(h, tpl.id, { name: '回流实验' })
    const log = (await injectApi(h, 'POST', `/api/projects/${project.id}/devlog`, {
      type: 'DEV',
      title: '发现规则漂移现象',
      body: '长会话中模型偏离规则文件',
    }))
      .json() as DevLogOut

    const termRes = await injectApi(h, 'POST', '/api/terms', {
      zh: '规则漂移',
      definition: '长会话中模型逐渐偏离规则文件约束的现象',
      source: `project:${project.name}`,
    })
    expect(termRes.statusCode).toBe(201)
    const term = termRes.json()
    expect(term).toMatchObject({ status: 'draft', source: 'project:回流实验' })

    const link = await injectApi(h, 'POST', `/api/projects/${project.id}/devlog/${log.id}/assets`, {
      assetId: term.id,
    })
    expect(link.statusCode).toBe(200)
    expect((link.json() as { log: DevLogOut }).log.linkedAssetIds).toEqual([term.id])

    const origin = (await injectApi(h, 'GET', `/api/reflow-origin/${term.id}`)).json()
    expect(origin.origin).toEqual({
      logId: log.id,
      projectId: project.id,
      projectName: '回流实验',
      logType: 'DEV',
      entryNo: 1,
      displayNo: 'DEV-0001',
    })

    // 再次挂链幂等；换日志挂同一资产时反查取最早一条
    await injectApi(h, 'POST', `/api/projects/${project.id}/devlog/${log.id}/assets`, {
      assetId: term.id,
    })
    expect(
      (link.json() as { log: DevLogOut }).log.linkedAssetIds.filter((x) => x === term.id),
    ).toHaveLength(1)

    expect((await injectApi(h, 'GET', '/api/reflow-origin/trm_ghost')).json().origin).toBeNull()

    const cross = await injectApi(h, 'POST', `/api/projects/${project.id}/devlog/dev_ghost/assets`, {
      assetId: term.id,
    })
    expect(cross.statusCode).toBe(404)
  })

  it('IT-PROJECT-02（§7.8）: 删项目级联清零，localPath 目录文件哈希不变', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '删除流', [stage('开发', 3)])
    const dir = writeLock(h, '1.0.0')
    const project = await mkProject(h, tpl.id, { name: '待删项目', localPath: dir })
    writeFileSync(join(dir, 'CLAUDE.md'), '# 用户自己的内容')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'main.ts'), 'export const x = 1')

    await mkTask(h, project.id, '卡一')
    await mkTask(h, project.id, '卡二')
    await injectApi(h, 'POST', `/api/projects/${project.id}/devlog`, { type: 'DEV', title: '日志' })
    await injectApi(h, 'PUT', `/api/projects/${project.id}/check-states`, {
      stageName: '开发',
      itemId: '开发-c1',
      checked: true,
    })
    expect(project.health).toMatchObject({ taskCount: 0, logCount: 0 })
    const after = (await injectApi(h, 'GET', `/api/projects/${project.id}`)).json() as ProjectView
    expect(after.health).toMatchObject({ taskCount: 2, logCount: 1 })

    const before = hashTree(dir)
    expect((await injectApi(h, 'DELETE', `/api/projects/${project.id}`)).statusCode).toBe(204)

    expect(countRows(h, 'SELECT COUNT(*) AS n FROM projects')).toBe(0)
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM tasks')).toBe(0)
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM dev_log_entries')).toBe(0)
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM project_check_states')).toBe(0)

    expect(hashTree(dir)).toBe(before)
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# 用户自己的内容')

    const gone = await injectApi(h, 'GET', `/api/projects/${project.id}`)
    expect(gone.statusCode).toBe(404)
    expect(gone.json().code).toBe('NOT_FOUND')
  })

  it('IT-PROJECT-03（§6.1 / FR-1.4 / §6.4）: 相对路径 422；缺失目录降级 warning；损坏 lock 不扩散；归档默认隐藏', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '路径流', [stage('开发', 1)])

    const rel = await injectApi(h, 'POST', '/api/projects', {
      name: '相对路径',
      flowTemplateId: tpl.id,
      localPath: 'relative/dir',
    })
    expect(rel.statusCode).toBe(422)
    expect(rel.json().code).toBe('VALIDATION_ERROR')
    expect(rel.json().details.fieldErrors.localPath).toBeTruthy()

    const missing = join(h.root, 'not-created-yet')
    const ok = await injectApi(h, 'POST', '/api/projects', {
      name: '路径未建',
      flowTemplateId: tpl.id,
      localPath: missing,
    })
    expect(ok.statusCode).toBe(201)
    const project = ok.json() as ProjectView
    expect(project.localPathWarning).toBe('路径当前不存在')

    // 无 lock → lockPresent:false，且不带 pack 字段（前端显示「未注入」）
    expect(
      (await injectApi(h, 'GET', `/api/projects/${project.id}/injection-status`)).json(),
    ).toEqual({ lockPresent: false, error: 'lock 文件异常' })

    // 损坏 lock 只影响注入状态字段，工作台其余信息照旧
    mkdirSync(join(missing, '.openvibe'), { recursive: true })
    writeFileSync(join(missing, '.openvibe', 'pack.lock.json'), '{这不是 JSON')
    const corrupt = (
      await injectApi(h, 'GET', `/api/projects/${project.id}/injection-status`)
    ).json()
    expect(corrupt.error).toBe('lock 文件异常')
    const detail = await injectApi(h, 'GET', `/api/projects/${project.id}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({ name: '路径未建', health: { total: 1 } })

    // 非目录路径（指到文件）→ 保存成功 + 警告
    const filePath = join(h.root, 'a-file.txt')
    writeFileSync(filePath, 'x')
    const isFile = await injectApi(h, 'PATCH', `/api/projects/${project.id}`, {
      localPath: filePath,
    })
    expect(isFile.statusCode).toBe(200)
    expect(isFile.json().localPathWarning).toBe('localPath 不是目录，按未注入处理')

    await injectApi(h, 'PATCH', `/api/projects/${project.id}`, { localPath: missing })
    expect((await injectApi(h, 'GET', '/api/projects')).json().total).toBe(1)
    expect(
      (await injectApi(h, 'PATCH', `/api/projects/${project.id}`, { status: 'archived' })).statusCode,
    ).toBe(200)
    expect((await injectApi(h, 'GET', '/api/projects')).json().total).toBe(0)
    const archived = (await injectApi(h, 'GET', '/api/projects?status=archived')).json()
    expect(archived.total).toBe(1)
    expect(archived.items[0].status).toBe('archived')
  })

  it('IT-ERR-03: 新项目族边界——未知 id 404、非法入参 422、错误响应零堆栈泄漏', async () => {
    const h = await makeHarness()
    const tpl = await mkTemplate(h, '错误流', [stage('开发', 1)])
    const project = await mkProject(h, tpl.id, { name: '边界' })

    const cases: Array<{
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      url: string
      payload?: object
      status: number
      code: string
    }> = [
      { method: 'GET', url: '/api/projects/prj_ghost', status: 404, code: 'NOT_FOUND' },
      { method: 'PATCH', url: '/api/flow-templates/ft_ghost', payload: { name: 'x' }, status: 404, code: 'NOT_FOUND' },
      { method: 'POST', url: '/api/flow-templates/ft_ghost/duplicate', status: 404, code: 'NOT_FOUND' },
      { method: 'POST', url: '/api/projects', payload: { name: '', flowTemplateId: tpl.id }, status: 422, code: 'VALIDATION_ERROR' },
      { method: 'POST', url: '/api/projects', payload: { name: '缺模板' }, status: 422, code: 'VALIDATION_ERROR' },
      { method: 'POST', url: '/api/projects', payload: { name: '坏模板', flowTemplateId: 'ft_none' }, status: 404, code: 'NOT_FOUND' },
      { method: 'POST', url: `/api/projects/${project.id}/stages/current`, payload: { stageName: '不存在' }, status: 422, code: 'VALIDATION_ERROR' },
      { method: 'POST', url: `/api/projects/${project.id}/tasks`, payload: { title: '   ' }, status: 422, code: 'VALIDATION_ERROR' },
      { method: 'POST', url: `/api/projects/${project.id}/tasks`, payload: { title: '好', stageName: '不存在' }, status: 422, code: 'VALIDATION_ERROR' },
      { method: 'PATCH', url: '/api/tasks/tk_ghost', payload: { status: 'doing', order: 0 }, status: 404, code: 'NOT_FOUND' },
      { method: 'DELETE', url: '/api/tasks/tk_ghost', status: 404, code: 'NOT_FOUND' },
      { method: 'POST', url: `/api/projects/${project.id}/devlog`, payload: { type: 'NOPE' }, status: 422, code: 'VALIDATION_ERROR' },
      { method: 'POST', url: '/api/projects/prj_ghost/devlog', payload: { type: 'DEV' }, status: 404, code: 'NOT_FOUND' },
      { method: 'DELETE', url: '/api/projects/prj_ghost', status: 404, code: 'NOT_FOUND' },
    ]
    for (const c of cases) {
      const res = await injectApi(h, c.method, c.url, c.payload)
      expect([c.method, c.url, res.statusCode, res.json().code]).toEqual([
        c.method,
        c.url,
        c.status,
        c.code,
      ])
      expect(res.json().message).toBeTypeOf('string')
      expect(res.body).not.toMatch(/SqliteError|at .*\.ts:\d+:\d+/)
    }

    // 空阶段数组：模板创建直接 422（stages min(1)）
    expect(
      (
        await injectApi(h, 'POST', '/api/flow-templates', {
          name: '空阶段',
          kind: 'custom',
          stages: [],
        })
      ).statusCode,
    ).toBe(422)
  })
})
