import { afterEach, describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { newDb, scanForbidden, payloadKeys, type TestDbHandle } from '@openvibe/core/test-support'
import { LocalEventsRepo, type SqliteDatabase } from '@openvibe/core'
import { buildApp } from '../src/app'

/**
 * §7-d：生产写入点真实存在、字段齐备、`payload_json` 无禁列
 * （local-event-ledger.md FR-2.3 点名的 kind 之一，来自 §7 验收表 d 行）。
 *
 * ## 这条测试为什么自带「扫描器自证」一节
 *
 * FR-6.3 的禁列检查（绝对路径 / 用户名 / 项目名 / 资产正文）是**否定式判据** ——
 * 写对了永远绿。那就有一个老问题：如果扫描器本身写错了（正则失配、只扫了顶层键、
 * 忘了递归），它也永远绿，而且**看起来很有安全感**。
 *
 * 本会话已经在这类地方栽过一次：日历有效性校验的判据用的是
 * `2026-10-32`，而它恰好落在两条校验支的**交集**里，把校验整条删掉测试照样全绿。
 * 所以这里第 2 组先主动往库里灌一条**已知含禁列**的脏事件，
 * 断言扫描器必须对它报错 —— 扫描器抓不到自己，就等于没有扫描器。
 */

const TOKEN = 'test-token'
const NOW = '2026-10-15T08:30:00.000Z'
const NOW_DAY = '2026-10-15'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const open: Harness[] = []

async function makeHarness(at: string = NOW): Promise<Harness> {
  const handle = newDb()
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    now: () => new Date(at),
  })
  const h = { app, db, handle }
  open.push(h)
  return h
}

afterEach(() => {
  while (open.length > 0) {
    const h = open.pop()!
    void h.app.close()
    h.handle.close()
  }
})

function api(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  payload?: object,
) {
  return app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}` } })
}

interface Row {
  kind: string
  subject_type: string | null
  subject_id: string | null
  project_id: string | null
  payload_json: string
  day: string
}

function rows(h: Harness): Row[] {
  return h.db
    .prepare(
      `SELECT kind, subject_type, subject_id, project_id, payload_json, day
         FROM local_events ORDER BY id ASC`,
    )
    .all() as Row[]
}

function ofKind(h: Harness, kind: string): Row[] {
  return rows(h).filter((r) => r.kind === kind)
}

/** 取唯一一行；长度不符当场报出实际条数（`arr[0]!` 会把空数组变成 undefined 处的莫名 TypeError） */
function only(h: Harness, kind: string): Row {
  const got = ofKind(h, kind)
  expect(got.map((r) => r.kind)).toEqual([kind])
  const first = got[0]
  if (!first) throw new Error(`only(${kind}) 取不到行；实际行数 ${got.length}`)
  return first
}

/* ---------------------------------------------------------------------------
 * 禁列扫描（FR-6.3）
 * ------------------------------------------------------------------------- */

/** payload 键白名单：FR-6.3「只放 id 与枚举值」的白名单形态 */
const PAYLOAD_KEYS: Record<string, string[]> = {
  asset_created: ['assetType', 'origin'],
  asset_updated: ['assetType', 'origin'],
  checklist_item_checked: ['stage'],
  flow_template_run: ['origin'],
  stage_view_switched: ['origin'],
}


/* ------------------------------------------------------------------------- */

describe('§7-d · 生产写入点：asset_created 五类资产各一条', () => {
  it('五类资产各产生一条，subject_type/subject_id/payload 齐备', async () => {
    const h = await makeHarness()

    const prompt = (await api(h.app, 'POST', '/api/prompts', { title: '代码审查', content: '审查代码' })).json()
    const skill = (
      await api(h.app, 'POST', '/api/skills', { name: 'my-skill', description: '手工', source: 'manual' })
    ).json()
    const term = (
      await api(h.app, 'POST', '/api/terms', { en: 'RAG', zh: '检索增强生成', definition: '定义' })
    ).json()
    const playbook = (
      await api(h.app, 'POST', '/api/playbooks', { scenario: '投产评审', problem: 'p', practice: 'q' })
    ).json()
    const flow = (
      await api(h.app, 'POST', '/api/flow-templates', {
        name: '五项清单',
        kind: 'custom',
        stages: [{ name: '开发', checklist: [{ id: '开发-c1', text: 'x' }], artifacts: [], prompt: '' }],
      })
    ).json()

    const got = ofKind(h, 'asset_created')
    expect(got).toHaveLength(5)

    // subject_id 必须**逐条等于**该资产的真实 id，而不是「某个非空字符串」
    expect(got.map((r) => r.subject_type).sort()).toEqual([
      'flow_template',
      'playbook',
      'prompt',
      'skill',
      'term',
    ])
    const idByType = new Map(got.map((r) => [r.subject_type, r.subject_id]))
    expect(idByType.get('prompt')).toBe(prompt.id)
    expect(idByType.get('skill')).toBe(skill.id)
    expect(idByType.get('term')).toBe(term.id)
    expect(idByType.get('playbook')).toBe(playbook.id)
    expect(idByType.get('flow_template')).toBe(flow.id)

    for (const r of got) {
      const who = r.subject_type ?? '?'
      expect(r.project_id, who).toBeNull()
      expect(r.day, who).toBe(NOW_DAY)
      expect(payloadKeys(r), who).toEqual(PAYLOAD_KEYS.asset_created)
      expect(JSON.parse(r.payload_json), who).toMatchObject({ assetType: r.subject_type, origin: 'user' })
    }
  })

  it('五类资产的 PATCH 各产生一条 asset_updated', async () => {
    const h = await makeHarness()
    const prompt = (await api(h.app, 'POST', '/api/prompts', { title: 't', content: 'c' })).json()
    const skill = (
      await api(h.app, 'POST', '/api/skills', { name: 's1', description: 'd', source: 'manual' })
    ).json()
    const term = (
      await api(h.app, 'POST', '/api/terms', { en: 'E', zh: '中', definition: 'd' })
    ).json()
    const playbook = (
      await api(h.app, 'POST', '/api/playbooks', { scenario: 's', problem: 'p', practice: 'q' })
    ).json()
    const flow = (
      await api(h.app, 'POST', '/api/flow-templates', {
        name: 'f1',
        kind: 'custom',
        stages: [{ name: 'S', checklist: [{ id: 'S-c1', text: 'x' }], artifacts: [], prompt: '' }],
      })
    ).json()

    const before = ofKind(h, 'asset_created').length
    const res = await Promise.all([
      api(h.app, 'PATCH', `/api/prompts/${prompt.id}`, { content: 'c2' }),
      api(h.app, 'PATCH', `/api/skills/${skill.id}`, { description: 'd2' }),
      api(h.app, 'PATCH', `/api/terms/${term.id}`, { definition: 'd2' }),
      api(h.app, 'PATCH', `/api/playbooks/${playbook.id}`, { scenario: 's2' }),
      api(h.app, 'PATCH', `/api/flow-templates/${flow.id}`, { name: 'f2' }),
    ])
    for (const r of res) expect(r.statusCode, r.json()?.message).toBe(200)

    const upd = ofKind(h, 'asset_updated')
    expect(upd).toHaveLength(5)
    // created 不应因 PATCH 而增加
    expect(ofKind(h, 'asset_created')).toHaveLength(before)
    for (const r of upd) {
      expect(payloadKeys(r), r.subject_type ?? '?').toEqual(PAYLOAD_KEYS.asset_updated)
      expect(r.day).toBe(NOW_DAY)
    }
  })
})

describe('§7-d · 生产写入点：checklist_item_checked', () => {
  async function mkProjectWithChecklist(h: Harness): Promise<{ id: string }> {
    const tpl = (
      await api(h.app, 'POST', '/api/flow-templates', {
        name: '五项清单',
        kind: 'custom',
        stages: [
          {
            name: '开发',
            checklist: [
              { id: '开发-c1', text: '一' },
              { id: '开发-c2', text: '二' },
            ],
            artifacts: [],
            prompt: '',
          },
        ],
      })
    ).json()
    const project = (
      await api(h.app, 'POST', '/api/projects', { name: '观测台', flowTemplateId: tpl.id })
    ).json()
    return { id: project.id as string }
  }

  const check = (h: Harness, projectId: string, itemId: string, checked: boolean) =>
    api(h.app, 'PUT', `/api/projects/${projectId}/check-states`, {
      stageName: '开发',
      itemId,
      checked,
    })

  it('勾选产生一条，project_id 落列、payload 只放阶段枚举', async () => {
    const h = await makeHarness()
    const { id } = await mkProjectWithChecklist(h)
    // ⚠️ 必须 await：`expect(promise).resolves` 不加 await 会把断言排到微任务里，
    // afterEach 关库之后才执行，报出来的 500 是「库已关」而不是产品缺陷 —— 极易误判。
    const first = await check(h, id, '开发-c1', true)
    expect(first.statusCode, first.body).toBe(200)

    const got = ofKind(h, 'checklist_item_checked')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      subject_type: 'checklist_item',
      subject_id: '开发-c1',
      project_id: id,
      day: NOW_DAY,
    })
    const row = only(h, 'checklist_item_checked')
    expect(payloadKeys(row)).toEqual(PAYLOAD_KEYS.checklist_item_checked)
    expect(JSON.parse(row.payload_json)).toEqual({ stage: '开发' })
  })

  it('**重复 PUT 不重复记**（幂等端点若直接记事件会把计数虚高，§6.4 要求发射点自带去重）', async () => {
    const h = await makeHarness()
    const { id } = await mkProjectWithChecklist(h)
    for (let i = 0; i < 5; i++) await check(h, id, '开发-c1', true)
    expect(ofKind(h, 'checklist_item_checked')).toHaveLength(1)
  })

  it('**取消勾选不记**，取消后再勾记第二条（真翻转才记）', async () => {
    const h = await makeHarness()
    const { id } = await mkProjectWithChecklist(h)
    await check(h, id, '开发-c1', true)
    await check(h, id, '开发-c1', false)
    expect(ofKind(h, 'checklist_item_checked')).toHaveLength(1)

    await check(h, id, '开发-c1', true)
    expect(ofKind(h, 'checklist_item_checked')).toHaveLength(2)
  })

  it('不同检查项各记一条（去重键不能宽到把两项合并成一条）', async () => {
    const h = await makeHarness()
    const { id } = await mkProjectWithChecklist(h)
    await check(h, id, '开发-c1', true)
    await check(h, id, '开发-c2', true)
    const got = ofKind(h, 'checklist_item_checked')
    expect(got).toHaveLength(2)
    expect(got.map((r) => r.subject_id).sort()).toEqual(['开发-c1', '开发-c2'])
  })
})

describe('§7-d · 生产写入点：stage_view_switched（切换到另一个阶段）', () => {
  /**
   * 两个阶段的项目：`POST /api/projects` 要求指定模板，阶段来自模板快照，
   * 而 `switchStage` 只认快照里的阶段名 —— 所以「切到不存在的阶段」天然可测。
   *
   * ⚠️ 建项目本身会产生一条 `flow_template_run`（FR-2.3 的四类之一），
   * 所以本组一律按 kind 过滤断言，不断言台账总行数。
   */
  async function mkProject(h: Harness): Promise<string> {
    const tpl = (
      await api(h.app, 'POST', '/api/flow-templates', {
        name: '两阶段模板',
        kind: 'custom',
        stages: [
          { name: '需求', checklist: [{ id: '需求-c1', text: '一' }], artifacts: [] },
          { name: '交付', checklist: [{ id: '交付-c1', text: '二' }], artifacts: [] },
        ],
      })
    ).json() as { id: string }
    const proj = (
      await api(h.app, 'POST', '/api/projects', { name: '阶段观测', flowTemplateId: tpl.id })
    ).json() as { id: string }
    return proj.id
  }

  const switchTo = (h: Harness, projectId: string, stageName: string) =>
    api(h.app, 'POST', `/api/projects/${projectId}/stages/current`, { stageName })

  it('切到另一个阶段记一条：project_id 落列、subject 为阶段、payload 只放 origin', async () => {
    const h = await makeHarness()
    const id = await mkProject(h)
    const r = await switchTo(h, id, '交付')
    expect(r.statusCode, r.body).toBe(200)

    const got = ofKind(h, 'stage_view_switched')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      subject_type: 'stage',
      subject_id: '交付',
      project_id: id,
      day: NOW_DAY,
    })
    expect(payloadKeys(only(h, 'stage_view_switched'))).toEqual(PAYLOAD_KEYS.stage_view_switched)
  })

  it('⚠️ 重复切到**同一个**阶段不重记（§6.4 要求发射点自带去重，不依赖前端）', async () => {
    const h = await makeHarness()
    const id = await mkProject(h)
    await switchTo(h, id, '交付')
    const before = ofKind(h, 'stage_view_switched').length
    expect(before).toBe(1)

    // 绕过前端那层保护，直接连打三次同一阶段
    for (let i = 0; i < 3; i++) await switchTo(h, id, '交付')
    expect(ofKind(h, 'stage_view_switched')).toHaveLength(before)
  })

  it('⚠️ 切回去要各记一条（回看旧阶段同样是一次「看过」；去重键不能宽到把来回切合并）', async () => {
    const h = await makeHarness()
    const id = await mkProject(h)
    await switchTo(h, id, '交付')
    await switchTo(h, id, '需求')
    await switchTo(h, id, '交付')
    const got = ofKind(h, 'stage_view_switched')
    expect(got).toHaveLength(3)
    expect(got.map((g) => g.subject_id)).toEqual(['交付', '需求', '交付'])
  })

  it('切到快照里没有的阶段 ⇒ 422 且**一条都不记**（校验失败不得留下半条台账）', async () => {
    const h = await makeHarness()
    const id = await mkProject(h)
    const r = await switchTo(h, id, '不存在的阶段')
    expect(r.statusCode).toBe(422)
    expect(ofKind(h, 'stage_view_switched')).toHaveLength(0)
  })

  it('⚠️ 切到**当前已在**的阶段不记（去重的另一形态：不是「连点」，是一开始就没变）', async () => {
    // ⚠️ 本支不叫「变异腿」：它不做源码变异，只断言「去重条件读得出是条件」。
    // 真的把 `!==` 改成恒真会红的是上一支「重复切同一阶段」——
    // 那个判据由那一支承担，本支只补上「首次就切到当前阶段」这一种入口。
    const h = await makeHarness()
    const id = await mkProject(h)
    await switchTo(h, id, '需求') // 建项目后当前阶段本就是「需求」
    expect(ofKind(h, 'stage_view_switched')).toHaveLength(0)
  })
})

describe('§7-d · 生产写入点：flow_template_run（建项目即跑模板）', () => {
  /** 建一个真实模板再拿它开项目 —— 写入点记的是「这个模板被用了」，不是任意 id */
  async function runTemplate(h: Harness, name: string): Promise<{ templateId: string; projectId: string }> {
    const tpl = (
      await api(h.app, 'POST', '/api/flow-templates', {
        name,
        kind: 'custom',
        stages: [{ name: '调研', checklist: [{ id: 'c1', text: '看竞品' }], artifacts: [] }],
      })
    ).json() as { id: string }
    const proj = (
      await api(h.app, 'POST', '/api/projects', { name: `${name}-项目`, flowTemplateId: tpl.id })
    ).json() as { id: string }
    return { templateId: tpl.id, projectId: proj.id }
  }

  it('建项目产生一条：subject 落模板、project_id 落项目、payload 只放 origin', async () => {
    const h = await makeHarness()
    const { templateId, projectId } = await runTemplate(h, '标准调研流')

    const got = ofKind(h, 'flow_template_run')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      subject_type: 'flow_template',
      subject_id: templateId,
      project_id: projectId,
      day: NOW_DAY,
    })
    const row = only(h, 'flow_template_run')
    expect(payloadKeys(row)).toEqual(PAYLOAD_KEYS.flow_template_run)
    expect(JSON.parse(row.payload_json)).toEqual({ origin: 'user' })
  })

  it('⚠️ 用不同模板各跑一次 ⇒ 各记一条（不得被去重键合并）', async () => {
    // 这条的判据是「能红」：若写入点误用 project_id 当去重键，两个项目会塌成一条。
    const h = await makeHarness()
    await runTemplate(h, '模板甲')
    await runTemplate(h, '模板乙')
    const got = ofKind(h, 'flow_template_run')
    expect(got).toHaveLength(2)
    expect(new Set(got.map((r) => r.subject_id)).size).toBe(2)
  })

  it('⚠️ 台账里不得出现模板名（FR-6.3 禁列：可识别的自由文本不入台账）', async () => {
    const h = await makeHarness()
    await runTemplate(h, '客户尽调标准流程')
    for (const r of ofKind(h, 'flow_template_run')) {
      expect(r.payload_json).not.toContain('客户尽调标准流程')
      expect(r.payload_json).not.toContain(homedir())
    }
  })
})

describe('§7-d · payload 禁列（FR-6.3）', () => {
  it('**真实写入面全部干净**：无绝对路径 / 用户名 / 项目名 / 资产正文', async () => {
    const h = await makeHarness()
    const prompt = (
      await api(h.app, 'POST', '/api/prompts', {
        title: '含正文与占位符的提示词',
        content: '审查 {{language}} 代码，关注：{{task}}，项目本地路径 /Users/duke/work/secret-repo',
      })
    ).json()
    const tpl = (
      await api(h.app, 'POST', '/api/flow-templates', {
        name: '五项清单',
        kind: 'custom',
        stages: [
          { name: '开发', checklist: [{ id: '开发-c1', text: 'x' }], artifacts: [], prompt: '' },
        ],
      })
    ).json()
    const project = (
      await api(h.app, 'POST', '/api/projects', {
        name: '招商银行核心系统投产评审项目',
        flowTemplateId: tpl.id,
        localPath: `${homedir()}/work/duke-secret-repo`,
      })
    ).json()
    await api(h.app, 'PATCH', `/api/prompts/${prompt.id}`, { content: '更长的正文' })
    await api(h.app, 'PUT', `/api/projects/${project.id}/check-states`, {
      stageName: '开发',
      itemId: '开发-c1',
      checked: true,
    })

    // ⚠️ 上面刻意喂了含绝对路径的正文与项目名：它们**绝不能**出现在 payload 里
    const all = rows(h)
    expect(all.length).toBeGreaterThan(0)
    for (const r of all) expect(scanForbidden(r), JSON.stringify(r)).toEqual([])
    // 项目名同样不入 payload（stage 是阶段枚举，不是项目名）
    expect(all.map((r) => r.payload_json).join('')).not.toContain('招商银行')
  })

  it('**扫描器自证**：灌一条含绝对路径与用户名的脏事件，扫描器必须报错', async () => {
    const h = await makeHarness()
    // 直写库绕过写入点 —— 模拟「将来有人手滑把路径放进 payload」
    h.db
      .prepare(
        `INSERT INTO local_events (kind, subject_type, subject_id, project_id, payload_json, created_at, day)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'asset_created',
        'prompt',
        'prm_x',
        null,
        // 动态家目录：CI runner 上同样触发「本机用户名」判定（写死 /Users/duke 只在 owner 机器绿）
        JSON.stringify({ assetType: 'prompt', nested: { where: join(homedir(), 'work', 'secret-repo') } }),
        NOW,
        NOW_DAY,
      )

    expect(rows(h)).toHaveLength(1)
    expect(scanForbidden(only(h, 'asset_created'))).toEqual(
      expect.arrayContaining(['Unix 绝对路径', '本机用户名']),
    )
    // 对照组：只把 payload 换回写入口径的形状（其余列逐字不动），扫描器必须放行。
    // 少了这一行，就无法区分「扫描器抓到了脏行」与「扫描器对一切非空 payload 都报错」。
    const clean: Row = { ...only(h, 'asset_created'), payload_json: JSON.stringify({ assetType: 'prompt', origin: 'user' }) }
    expect(scanForbidden(clean)).toEqual([])
  })

  it('**键白名单自证**：payload 多一个键就红（新增泄漏列不可能悄悄通过）', async () => {
    const h = await makeHarness()
    await api(h.app, 'POST', '/api/prompts', { title: 't', content: 'c' })
    const r = only(h, 'asset_created')
    const leaked = { ...JSON.parse(r.payload_json), localPath: '/tmp/x' }
    const scan = (row: Row) => ({
      keys: payloadKeys(row),
      forbidden: scanForbidden(row),
    })
    expect(scan(r).keys).toEqual(PAYLOAD_KEYS.asset_created)
    expect(scan({ ...r, payload_json: JSON.stringify(leaked) }).keys).not.toEqual(
      PAYLOAD_KEYS.asset_created,
    )
    expect(scan({ ...r, payload_json: JSON.stringify(leaked) }).forbidden).toContain(
      '任意根目录绝对路径',
    )
  })
})

describe('§7-d · 时钟注入：day 由事件时间派生而非墙上时钟', () => {
  it('注入 2026-09-01 ⇒ day 为 2026-09-01（证明 app.ts 真的把 now 透传到了路由）', async () => {
    const h = await makeHarness('2026-09-01T23:59:59.000Z')
    await api(h.app, 'POST', '/api/prompts', { title: 't', content: 'c' })
    const r = only(h, 'asset_created')
    expect(r.day).toBe('2026-09-01')
    expect(r.day).not.toBe(NOW_DAY)
  })

  it('台账直写与端点读面一致（同一时钟源，不是各算各的）', async () => {
    const h = await makeHarness('2026-10-01T00:00:00.000Z')
    await api(h.app, 'POST', '/api/prompts', { title: 't', content: 'c' })
    const repo = new LocalEventsRepo(h.db)
    const out = (
      await api(h.app, 'GET', '/api/local-events/summary?from=2026-10-01&to=2026-10-02')
    ).json()
    expect(out.windowTotal).toBe(1)
    expect(repo.countAll()).toBe(1)
    expect(out.byDay).toEqual([{ day: '2026-10-01', kind: 'asset_created', count: 1 }])
  })
})
