import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { type SqliteDatabase } from '@openvibe/core'
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
    expect(res.json.timeToValue).toEqual({
      firstEventAt: null,
      firstInjectionAt: null,
      seconds: null,
    })
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

  /**
   * OM-05b · 守护「同毫秒两次建包」的顺序确定性（2026-11-07 登记，2026-11-08 改为确定性构造）。
   *
   * ## 这条用例在防什么
   *
   * 原实现 `ORDER BY created_at DESC, id DESC`：`created_at` 是 ISO **毫秒**字符串，
   * 两次快速建包会落在同一毫秒；此时 tiebreak 是 `id DESC`，而 `id` 是 **nanoid（随机）**
   * ⇒「最新」由随机数决定 ⇒ OM-05 偶发失败（实测连跑 3 次：红/绿/绿）。
   *
   * 修法：tiebreak 换成 `rowid DESC`（`standard_packs` 是普通 rowid 表，`rowid` 即落库序）。
   *
   * ⚠️ **为什么直接 INSERT 而不用 `PacksRepo.create`**：
   *   本用例要测的是**查询的 tiebreak**，不是建包流程。用 repo 直调曾指望「同进程够快 ⇒ 同毫秒」，
   *   但那是**墙钟依赖** —— 2026-11-08 全量跑（机器吃紧、并发降到 1）实测两次跨了 2 ms，
   *   前提自检当场失败。**同毫秒必须由构造保证，不能靠希望。**
   *
   * ⚠️ **为什么后插者的 id 故意取字典序更小**（`pk_a…` < `pk_z…`）：
   *   这样旧实现在 `id DESC` 下**必然**选中前一条 ⇒ 本用例对旧实现是**确定性失败**，
   *   不是「碰运气失败」。特征化因此可复算，不依赖任何随机性。
   */
  it('OM-05b: 同毫秒两次建包 ⇒ 缺省取**后插者**（tiebreak 不靠随机 id）', async () => {
    const h = await makeHarness()
    // ⚠️ 选集不能为空：`renderPack` 对空选集抛 EMPTY_SELECTION（m6a FR-2.4，422），
    //   那样 `/api/om` 返回的是错误信封、`density` 恒为 undefined，本用例就测不到目标路径。
    const prompt = await api<{ id: string }>(h, 'POST', '/api/prompts', {
      title: 'om-same-ms 资产',
      content: '同毫秒顺序守护用例的资产。',
    })
    expect(prompt.statusCode).toBe(201)

    // 同一条 created_at（写死），两条记录落在同一毫秒 —— 由构造保证
    const ts = '2026-11-08T04:00:00.000Z'
    const selection = JSON.stringify({
      promptIds: [prompt.json.id],
      termIds: [],
      skillIds: [],
      playbookIds: [],
      flowTemplateId: null,
    })
    const insert = h.db.prepare(
      `INSERT INTO standard_packs (id, name, description, selection, targets, created_at, updated_at)
       VALUES (?, ?, '', ?, ?, ?, ?)`,
    )
    // 先插者：id 字典序**大**（pk_z…）；后插者：id 字典序**小**（pk_a…）
    insert.run('pk_zzz_same_ms_first', 'om-same-ms-first', selection, '["claude-code"]', ts, ts)
    insert.run('pk_aaa_same_ms_second', 'om-same-ms-second', selection, '["claude-code"]', ts, ts)

    const rows = h.db
      .prepare('SELECT id, name, created_at FROM standard_packs ORDER BY rowid')
      .all() as { id: string; name: string; created_at: string }[]
    const lastRow = rows[rows.length - 1]!
    expect(lastRow.name).toBe('om-same-ms-second')

    // ① 缺省取后插者：rowid 大的那个（而非 id 大的那个）
    const byDefault = await api<OmOut>(h, 'GET', '/api/om')
    expect(byDefault.json.density?.packId).toBe(lastRow.id)
    expect(byDefault.json.density?.packName).toBe('om-same-ms-second')

    // ② 反向断言：不是「随机选一个」—— 指定包仍精确返回
    const byParam = await api<OmOut>(h, 'GET', '/api/om?pack_id=pk_zzz_same_ms_first')
    expect(byParam.json.density?.packName).toBe('om-same-ms-first')
  })

  it('OM-06: 未知 pack_id → 404 NOT_FOUND 信封', async () => {
    const h = await makeHarness()
    const res = await api(h, 'GET', '/api/om?pack_id=pk_missing')
    expect(res.statusCode).toBe(404)
  })
})
