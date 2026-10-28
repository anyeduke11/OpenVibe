import { describe, expect, it, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { APP_META_KEYS, AppMetaRepo, FlowTemplatesRepo, ProjectsRepo } from '@openvibe/core'
import { buildApp } from '../src/app'

/**
 * M8-E 写侧总闸（`m8-agent-panel.md` FR-5.5.2.1）与设置节的验收。
 *
 * **为什么单独一个文件**：`agentPanel.test.tsx` 管渲染面，本文件管**写侧生效**——
 * 开关关着时回流必须真的进不来。合在一个文件里，「界面显示关」和「后端真的拒」
 * 会由同一支用例顺带覆盖，而它们其实是两件独立的事，一头坏看不出是哪头。
 */

const TOKEN = 'test-token'
const WEB_SRC = join(process.cwd(), 'apps/web/src')
const open: { app: FastifyInstance; handle: TestDbHandle }[] = []

async function harness(): Promise<{
  app: FastifyInstance
  projectId: string
  db: TestDbHandle['db']
}> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const template = new FlowTemplatesRepo(handle.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(handle.db).create({
    name: '写闸演示',
    flowTemplateId: template.id,
  }).id
  open.push({ app, handle })
  return { app, projectId, db: handle.db }
}

afterEach(() => {
  while (open.length > 0) {
    const h = open.pop()!
    void h.app.close()
    h.handle.close()
  }
})

/** 批请求形状：`projectId` 在**批顶层**，不在 item 里（`AgentIngestBatch`）——
 *  首版把两者搞混，症状是 422 而 message 指向 projectId 缺失 —— 与写闸无关。 */
const oneBatch = (projectId: string) => ({
  projectId,
  items: [
    {
      kind: 'dev_log',
      idempotencyKey: 'k1',
      payload: { type: 'DEV', title: '一次回流' },
      sourcePlatform: 'claude-code',
    },
  ],
})

describe('WEB-M8E-10 · 「允许 agent 写入」默认**关**', () => {
  it('设置端点在全新库上返回 enabled=false', async () => {
    const h = await harness()
    const r = await h.app.inject({
      method: 'GET',
      url: '/api/settings/agent-write',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toEqual({ enabled: false })
  })

  it('⚠️ 缺行即 false（不是 undefined）—— 读侧 fallback 写错会让界面显示「未知」', () => {
    const handle = newDb()
    const meta = new AppMetaRepo(handle.db)
    expect(meta.read<boolean>(APP_META_KEYS.agentWriteEnabled, false)).toBe(false)
    handle.close()
  })
})

describe('WEB-M8E-11 · 开关关闭时回流写入被拒，且**一条都不记**', () => {
  it('默认关 ⇒ POST /api/agent/ingest 报 422', async () => {
    const h = await harness()
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/agent/ingest',
      payload: oneBatch(h.projectId),
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(r.statusCode).toBe(422)
  })

  it('⚠️ 被拒时台账**零行**（半批成功会让关闸看起来像部分故障）', async () => {
    const h = await harness()
    await h.app.inject({
      method: 'POST',
      url: '/api/agent/ingest',
      payload: oneBatch(h.projectId),
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const c = h.db
      .prepare('SELECT COUNT(*) AS c FROM agent_ingests WHERE project_id = ?')
      .get(h.projectId) as { c: number }
    expect(c.c).toBe(0)
  })

  it('打开开关后同一条请求即被接受（证明拒的是开关，不是别的）', async () => {
    const h = await harness()
    new AppMetaRepo(h.db).write(APP_META_KEYS.agentWriteEnabled, true)
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/agent/ingest',
      payload: oneBatch(h.projectId),
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().accepted).toBe(1)
  })

  it('关掉后又拒（开关是双向生效的，不是单向解锁）', async () => {
    const h = await harness()
    const meta = new AppMetaRepo(h.db)
    meta.write(APP_META_KEYS.agentWriteEnabled, true)
    const ok = await h.app.inject({
      method: 'POST',
      url: '/api/agent/ingest',
      payload: oneBatch(h.projectId),
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(ok.statusCode).toBe(200)

    meta.write(APP_META_KEYS.agentWriteEnabled, false)
    const denied = await h.app.inject({
      method: 'POST',
      url: '/api/agent/ingest',
      payload: oneBatch(h.projectId),
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(denied.statusCode).toBe(422)
  })

  it('POST 开关端点能打开它，且读回一致', async () => {
    const h = await harness()
    const post = await h.app.inject({
      method: 'POST',
      url: '/api/settings/agent-write',
      payload: { enabled: true },
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(post.statusCode, post.body).toBe(200)
    const get = await h.app.inject({
      method: 'GET',
      url: '/api/settings/agent-write',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(get.json()).toEqual({ enabled: true })
  })
})

describe('WEB-M8E-12 · 本节**不重复**台账/遥测总开关（FR-5.5.2）', () => {
  it('M8 设置节里不得出现遥测/台账开关的字面量', () => {
    const src = readFileSync(join(WEB_SRC, 'components/settings/AgentSettingsSection.tsx'), 'utf8')
    // 剥注释后判：注释里解释「为什么不复用」不算重复开关
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/telemetry/i)
    expect(code).not.toMatch(/local[_-]?ledger/i)
    expect(code).not.toMatch(/telemetryEnabled|agentWriteEnabled\s*\?|台账总开关/)
  })

  it('⚠️ 本节只挂**一个** checkbox（多一个就是重复开关的苗头）', () => {
    const src = readFileSync(join(WEB_SRC, 'components/settings/AgentSettingsSection.tsx'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect((code.match(/type="checkbox"/g) ?? []).length).toBe(1)
  })
})

describe('WEB-M8E-09 · 面板不得提供「用新的覆盖旧的」（FR-5.6.3）', () => {
  it('待确认列表源码里没有覆盖类动作的端点调用', () => {
    const src = readFileSync(join(WEB_SRC, 'components/agent/PendingIngestList.tsx'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/overwrite|force|replaceAll|合并/)
  })

  it("裁决入参类型里只有 to: 'published' | 'rejected'（类型层就堵死覆盖）", () => {
    const src = readFileSync(join(WEB_SRC, 'hooks/useAgentIngests.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).toContain("to: 'published' | 'rejected'")
    expect(code).not.toMatch(/'overwrite'|"overwrite"/)
  })
})

/**
 * 结构自证：WEB-M8E-12/09 都做「剥注释后判」。若剥注释退化成不剥，
 * 注释里那些「**不得**出现 X」的字面量会让判据恒红 ⇒ 那就失去意义。
 *
 * ⚠️ **首版这支队错了**：它对 `components/settings` 整棵树做证，而那棵树里有
 * `SettingsSections.tsx` —— 它**合法地** import 了 `TelemetrySection`，
 * 于是剥完注释仍有 telemetry，红的原因与被测物无关。
 * ⇒ 自证必须**只测剥注释这个动作本身**，不牵连任何真实文件。
 */
describe('剥注释判据自证', () => {
  it('剥掉行注释与块注释，且**不**误伤代码里的真引用', () => {
    const src = [
      '// 注释里提到 telemetry',
      '/* 块注释也提到 telemetry */',
      "import { TelemetrySection } from './x'",
      'const url = "https://example.com" // 行尾注释',
    ].join('\n')
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(stripped).not.toContain('注释里提到')
    expect(stripped).not.toContain('块注释也提到')
    // 真代码引用必须留着 —— 否则判据会把「删掉真引用」也判成合格
    expect(stripped).toContain('TelemetrySection')
    expect(stripped).toContain('https://example.com')
  })
})
