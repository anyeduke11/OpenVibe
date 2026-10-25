import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import type { SqliteDatabase } from '@openvibe/core'
import type { OmOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * v0.2.3 批次 B FR-5/6（GET /api/om，OM1 密度 + OM2 首次见效时间）。
 * 判据（PRD-v0.2.3 RQ5 验收）：同输入同值可复算；空数据显式 null（面板显示待采集，
 * 不显示 0）；全本机现算零出网（本测试全程无网络调用）。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    platform: 'darwin',
    now: () => new Date('2026-10-24T12:00:00.000Z'),
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
  method: 'GET' | 'POST',
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

describe('GET /api/om（OM1 密度 + OM2 首次见效）', () => {
  it('OM-01: 空库 → density=null、timeToValue 全 null（待采集，不是 0）', async () => {
    const h = await makeHarness()
    const res = await api<OmOut>(h, 'GET', '/api/om')
    expect(res.statusCode).toBe(200)
    expect(res.json.density).toBeNull()
    expect(res.json.timeToValue).toEqual({ firstEventAt: null, firstInjectionAt: null, seconds: null })
  })

  it('OM-02: 建包后 → 密度可复算且确定；无事件时 timeToValue 仍 null', async () => {
    const h = await makeHarness()
    const prompt = await api<{ id: string }>(h, 'POST', '/api/prompts', {
      title: '回归修复提示词',
      content: '先复现，再定位根因，修复后补一条回归用例再交付。',
      tags: ['debug'],
    })
    expect(prompt.statusCode).toBe(201)
    const term = await api<{ id: string }>(h, 'POST', '/api/terms', {
      zh: '环境型红',
      definition: '与环境负载相关而非代码缺陷导致的用例失败。',
    })
    expect(term.statusCode).toBe(201)

    const created = await api<{ id: string }>(h, 'POST', '/api/packs', {
      name: 'om-fixture',
      selection: { promptIds: [prompt.json.id], termIds: [term.json.id] },
      targets: ['claude-code', 'generic-agents'],
    })
    expect(created.statusCode).toBe(201)

    const first = await api<OmOut>(h, 'GET', '/api/om')
    expect(first.statusCode).toBe(200)
    const d = first.json.density
    expect(d).not.toBeNull()
    expect(d?.packName).toBe('om-fixture')
    expect(d?.managedTokens).toBeGreaterThan(0)
    expect(d?.assetCount).toBe(2)
    expect(d?.perAsset).toBe(Math.round(((d?.managedTokens ?? 0) / 2) * 10) / 10)
    expect(d?.top5.length).toBeGreaterThan(0)

    // 同输入同值（RQ5 验收 1：可复算且确定）
    const second = await api<OmOut>(h, 'GET', '/api/om')
    expect(second.json).toEqual(first.json)

    expect(first.json.timeToValue.seconds).toBeNull()
  })

  it('OM-03: 台账首事件 → 首次注入 → OM2 墙钟差可算（300 秒）', async () => {
    const h = await makeHarness()
    h.db
      .prepare(
        `INSERT INTO local_events (kind, payload_json, created_at, day)
         VALUES ('asset_created', '{}', '2026-10-24T10:00:00.000Z', '2026-10-24')`,
      )
      .run()
    h.db
      .prepare(
        `INSERT INTO injections (pack_id, pack_version, project_path, injected_at)
         VALUES ('pk_x', '1.0.0', '/tmp/proj', '2026-10-24T10:05:00.000Z')`,
      )
      .run()

    const res = await api<OmOut>(h, 'GET', '/api/om')
    expect(res.json.timeToValue).toEqual({
      firstEventAt: '2026-10-24T10:00:00.000Z',
      firstInjectionAt: '2026-10-24T10:05:00.000Z',
      seconds: 300,
    })
  })

  it('OM-04: 只有注入没有台账（被清空）→ seconds=null（不造假数字）', async () => {
    const h = await makeHarness()
    h.db
      .prepare(
        `INSERT INTO injections (pack_id, pack_version, project_path, injected_at)
         VALUES ('pk_x', '1.0.0', '/tmp/proj', '2026-10-24T10:05:00.000Z')`,
      )
      .run()
    const res = await api<OmOut>(h, 'GET', '/api/om')
    expect(res.json.timeToValue.firstInjectionAt).toBe('2026-10-24T10:05:00.000Z')
    expect(res.json.timeToValue.firstEventAt).toBeNull()
    expect(res.json.timeToValue.seconds).toBeNull()
  })

  it('OM-05: ?pack_id= 指定包 → 密度按指定包算（不是最新建的那个）', async () => {
    const h = await makeHarness()
    const mkPack = async (name: string): Promise<string> => {
      const prompt = await api<{ id: string }>(h, 'POST', '/api/prompts', {
        title: `${name} 的提示词`,
        content: `${name} 的正文，足够长以便 token 有区分度。`,
      })
      const created = await api<{ id: string }>(h, 'POST', '/api/packs', {
        name,
        selection: { promptIds: [prompt.json.id] },
        targets: ['claude-code'],
      })
      return created.json.id
    }
    const olderId = await mkPack('om-older')
    await mkPack('om-newer')

    const byParam = await api<OmOut>(h, 'GET', `/api/om?pack_id=${olderId}`)
    expect(byParam.json.density?.packId).toBe(olderId)
    expect(byParam.json.density?.packName).toBe('om-older')

    // 缺省仍是最新建包
    const byDefault = await api<OmOut>(h, 'GET', '/api/om')
    expect(byDefault.json.density?.packName).toBe('om-newer')
  })

  it('OM-06: 未知 pack_id → 404 NOT_FOUND 信封', async () => {
    const h = await makeHarness()
    const res = await api(h, 'GET', '/api/om?pack_id=pk_missing')
    expect(res.statusCode).toBe(404)
  })
})
