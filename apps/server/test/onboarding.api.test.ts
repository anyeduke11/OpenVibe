import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { APP_META_KEYS, type SqliteDatabase } from '@openvibe/core'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { PACK_FILE_MANIFEST } from '@openvibe/shared'
import type {
  FlywheelStatsOut,
  InjectionStatusOut,
  PackExportOut,
  PackOut,
  ProjectOut,
  DevLogOut,
  ReseedOut,
  SettingsOut,
} from '@openvibe/shared'
import { buildApp } from '../src/app'
import { DEFAULT_PACK_NAME, DEFAULT_PACK_VERSION } from '../src/lib/default-pack'
import { packExportDir } from '../src/lib/pack-export'

/**
 * 开箱体验的服务端四端点（T8b，specs/onboarding.md）：
 * GET /api/settings、POST /api/settings/onboarding、POST /api/settings/reseed、
 * GET /api/stats、GET /api/injection-status?dir=。
 * D-3 是本组红线：预置包只在缺失时组装，用户改过的包与条目一律只跳过并如实报原因。
 */

const TOKEN = 'test-token'
const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
  home: string
}

const openHandles: Harness[] = []

async function makeHarness(seedDir: string = SEED_DIR): Promise<Harness> {
  // 预置包导出落在 `<home>/packs/`，且导出内容含条目 id：每个用例一个新沙箱，
  // 两个临时库共用目录会让第二次导出撞 VERSION_IMMUTABLE
  const home = mkdtempSync(join(tmpdir(), 'ov-onb-home-'))
  process.env.OPENVIBE_HOME = home
  const handle = newDb()
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.4.0',
    settings: { seedDir, dataDir: home, port: 8787, dbPath: join(home, 'data', 'openvibe.db') },
  })
  const harness = { app, db, handle, home }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
    if (h) rmSync(h.home, { recursive: true, force: true })
  }
  delete process.env.OPENVIBE_HOME
})

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  auth = true,
): Promise<{ statusCode: number; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    ...(auth ? { headers: { authorization: `Bearer ${TOKEN}` } } : {}),
  })
  // 204 无体：res.json() 会抛，统一按 null 处理
  return { statusCode: res.statusCode, json: (res.body === '' ? null : res.json()) as T }
}

const count = (h: Harness, sql: string): number =>
  (h.db.prepare(sql).get() as { n: number }).n

/** 走完一次真实首启：播种 + 组装预置包，返回 default 包 id */
async function seededPack(h: Harness): Promise<string> {
  const { json } = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
  return json.defaultPack.packId ?? ''
}

const oneId = (h: Harness, table: string): string =>
  (h.db.prepare(`SELECT id FROM ${table} LIMIT 1`).get() as { id: string }).id

describe('GET /api/settings（服务信息，C-56 遗留补齐）', () => {
  it('IT-ONB-01: 空库即全 0 视图，dataDir/port/dbPath 原样回显；缺令牌 401', async () => {
    const h = await makeHarness()
    const res = await api<SettingsOut>(h, 'GET', '/api/settings')
    expect(res.statusCode).toBe(200)
    expect(res.json).toEqual({
      appVersion: '0.4.0',
      dataDir: h.home,
      port: 8787,
      seed: { terms: 0, flowTemplates: 0, prompts: 0 },
      db: { status: 'ok', detail: join(h.home, 'data', 'openvibe.db') },
      onboardingDone: false,
    })

    const anon = await api<{ code: string }>(h, 'GET', '/api/settings', undefined, false)
    expect(anon.statusCode).toBe(401)
    expect(anon.json.code).toBe('UNAUTHORIZED')
  })

  it('IT-ONB-02: 播种后 seed 三项等于库内实际行数（阈值 100/3/20）', async () => {
    const h = await makeHarness()
    await api(h, 'POST', '/api/settings/reseed')
    const res = await api<SettingsOut>(h, 'GET', '/api/settings')
    expect(res.json.seed).toEqual({
      terms: count(h, 'SELECT COUNT(*) AS n FROM terms'),
      flowTemplates: count(h, 'SELECT COUNT(*) AS n FROM flow_templates'),
      prompts: count(h, 'SELECT COUNT(*) AS n FROM prompts'),
    })
    expect(res.json.seed.terms).toBeGreaterThanOrEqual(100)
    expect(res.json.seed.flowTemplates).toBe(3)
    expect(res.json.seed.prompts).toBeGreaterThanOrEqual(20)
  })
})

describe('POST /api/settings/onboarding（FR-2.3 向导完成标记）', () => {
  it('IT-ONB-03: done=true 落 app_meta 且 GET /api/settings 回显；done=false 即「重新显示向导」', async () => {
    const h = await makeHarness()
    const on = await api<{ onboardingDone: boolean }>(h, 'POST', '/api/settings/onboarding', {
      done: true,
    })
    expect(on.statusCode).toBe(200)
    expect(on.json).toEqual({ onboardingDone: true })
    expect((await api<SettingsOut>(h, 'GET', '/api/settings')).json.onboardingDone).toBe(true)
    expect(
      h.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(APP_META_KEYS.onboardingDone) as {
        value: string
      },
    ).toEqual({ value: 'true' })

    const off = await api<{ onboardingDone: boolean }>(h, 'POST', '/api/settings/onboarding', {
      done: false,
    })
    expect(off.json.onboardingDone).toBe(false)
    expect((await api<SettingsOut>(h, 'GET', '/api/settings')).json.onboardingDone).toBe(false)
  })

  it('IT-ONB-04: done 缺失或非布尔 → 422 + fieldErrors，标记不动', async () => {
    const h = await makeHarness()
    const bad = await api<{ code: string; details?: { fieldErrors?: Record<string, string[]> } }>(
      h,
      'POST',
      '/api/settings/onboarding',
      { done: 'yes' },
    )
    expect(bad.statusCode).toBe(422)
    expect(bad.json.code).toBe('VALIDATION_ERROR')
    expect(bad.json.details?.fieldErrors?.done).toBeTruthy()
    expect((await api<SettingsOut>(h, 'GET', '/api/settings')).json.onboardingDone).toBe(false)

    expect((await api(h, 'POST', '/api/settings/onboarding', {})).statusCode).toBe(422)
  })
})

describe('POST /api/settings/reseed + 预置 default 包（FR-1，D-3）', () => {
  it('IT-ONB-05: 空库重建 → 播种 imported、default 包 created、六目标与导出历史齐备', async () => {
    const h = await makeHarness()
    const { statusCode, json } = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(statusCode).toBe(200)

    expect(json.seed.bundles.terms).toBe('imported')
    expect(json.seed.created.terms).toBeGreaterThanOrEqual(100)
    expect(json.defaultPack).toEqual({
      status: 'created',
      packId: expect.stringMatching(/^pk_/),
      rebuilt: true,
      version: DEFAULT_PACK_VERSION,
      directoryPath: packExportDir(DEFAULT_PACK_NAME, DEFAULT_PACK_VERSION),
      reason: null,
    })

    const pack = (await api<PackOut>(h, 'GET', `/api/packs/${json.defaultPack.packId}`)).json
    expect(pack.name).toBe('default')
    expect(pack.targets).toHaveLength(6)
    expect(pack.selection.termIds.length).toBeGreaterThanOrEqual(100)

    const exports = await api<{ items: PackExportOut[]; total: number }>(
      h,
      'GET',
      `/api/packs/${json.defaultPack.packId}/exports`,
    )
    expect(exports.json.items.map((e) => ({ version: e.version, channel: e.channel }))).toEqual([
      { version: '1.0.0', channel: 'directory' },
    ])
    expect(json.settings.seed.prompts).toBeGreaterThanOrEqual(20)
  })

  it('IT-ONB-06: 二次 reseed → exists + rebuilt:false，导出历史不追加（D-3 不自动补 1.0.1）', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)

    const again = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(again.json.defaultPack).toEqual({
      status: 'exists',
      packId,
      rebuilt: false,
      version: '1.0.0',
      directoryPath: packExportDir(DEFAULT_PACK_NAME, '1.0.0'),
      reason: null,
    })
    expect(count(h, 'SELECT COUNT(*) AS n FROM pack_exports')).toBe(1)
    // 整包 content_hash 未变 → bundle 粒度 skipped，条目不重复插入
    expect(again.json.seed.bundles.terms).toBe('skipped')
    expect(again.json.seed.created.terms).toBe(0)
  })

  it('IT-ONB-07: 用户改过包的 targets → skipped/「用户已修改」，改后的定义原样保留', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)
    const patched = await api<PackOut>(h, 'PATCH', `/api/packs/${packId}`, {
      targets: ['claude-code'],
    })
    expect(patched.json.targets).toEqual(['claude-code'])

    const res = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(res.json.defaultPack).toMatchObject({
      status: 'skipped',
      packId,
      rebuilt: false,
      directoryPath: null,
      reason: '用户已修改',
    })
    const after = await api<PackOut>(h, 'GET', `/api/packs/${packId}`)
    expect(after.json.targets).toEqual(['claude-code'])
    expect(count(h, 'SELECT COUNT(*) AS n FROM pack_exports')).toBe(1)
  })

  it('IT-ONB-08: 用户编辑过种子条目（seed_hash 置空）→ 选集与预置不一致，同样只跳过', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)
    // repos 的 update 会把 seed_hash 置空，这里直接落同一状态以聚焦选集比对
    expect(
      h.db.prepare('UPDATE terms SET seed_hash = NULL WHERE rowid = (SELECT MIN(rowid) FROM terms)')
        .run().changes,
    ).toBe(1)

    const res = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(res.json.defaultPack.status).toBe('skipped')
    expect(res.json.defaultPack.reason).toBe('用户已修改')
    const pack = await api<PackOut>(h, 'GET', `/api/packs/${packId}`)
    // 包仍引用全部词条：被改过的那条没有被静默剔除
    expect(pack.json.selection.termIds).toHaveLength(count(h, 'SELECT COUNT(*) AS n FROM terms'))
  })

  it('IT-ONB-09: 删掉预置包后重建 → created 新 id，已发布的 1.0.0 目录一字未动故顺延 1.0.1（FR-1.2）', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)
    const oldDir = packExportDir(DEFAULT_PACK_NAME, '1.0.0')
    const oldManifest = readFileSync(join(oldDir, PACK_FILE_MANIFEST), 'utf8')
    expect((await api(h, 'DELETE', `/api/packs/${packId}`)).statusCode).toBe(204)
    expect(count(h, 'SELECT COUNT(*) AS n FROM standard_packs')).toBe(0)
    expect(count(h, 'SELECT COUNT(*) AS n FROM pack_exports')).toBe(0)

    const res = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(res.json.defaultPack).toMatchObject({
      status: 'created',
      rebuilt: true,
      version: '1.0.1',
      directoryPath: packExportDir(DEFAULT_PACK_NAME, '1.0.1'),
    })
    expect(res.json.defaultPack.packId).not.toBe(packId)
    expect(count(h, 'SELECT COUNT(*) AS n FROM pack_exports')).toBe(1)
    // 不可变产物闸门：旧目录保持原样，被删包的导出仍可被 sync/diff 按版本复核
    expect(readFileSync(join(oldDir, PACK_FILE_MANIFEST), 'utf8')).toBe(oldManifest)
  })

  it('IT-ONB-10: 种子目录不存在 → 200 而非 500，逐 bundle error 且预置包 failed（§4.1 不阻塞）', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'ov-onb-noseed-'))
    const h = await makeHarness(join(sandbox, 'missing'))
    const res = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(res.statusCode).toBe(200)
    expect(Object.values(res.json.seed.bundles)).toEqual(['error', 'error', 'error'])
    expect(res.json.seed.warnings.join(' ')).toContain('种子文件处理失败')
    expect(res.json.defaultPack).toMatchObject({
      status: 'failed',
      packId: null,
      rebuilt: false,
      reason: expect.stringContaining('种子未就绪'),
    })
    expect(count(h, 'SELECT COUNT(*) AS n FROM standard_packs')).toBe(0)
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('IT-ONB-11: 选集一致但导出历史被删 → 只补登记，包定义不动', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)
    h.db.prepare('DELETE FROM pack_exports WHERE pack_id = ?').run(packId)

    const res = await api<ReseedOut>(h, 'POST', '/api/settings/reseed')
    expect(res.json.defaultPack).toMatchObject({
      status: 'created',
      packId,
      rebuilt: true,
      version: '1.0.0',
    })
    expect(count(h, 'SELECT COUNT(*) AS n FROM standard_packs')).toBe(1)
    expect(count(h, 'SELECT COUNT(*) AS n FROM pack_exports')).toBe(1)
  })
})

describe('GET /api/stats（FR-3 飞轮五项）', () => {
  it('IT-ONB-12: 空库五项全 0；缺令牌 401', async () => {
    const h = await makeHarness()
    const res = await api<FlywheelStatsOut>(h, 'GET', '/api/stats')
    expect(res.json).toEqual({ assets: 0, packs: 0, injections: 0, reflows: 0, loops: 0 })
    expect((await api(h, 'GET', '/api/stats', undefined, false)).statusCode).toBe(401)
  })

  it('IT-ONB-13: 完整一圈（有导出→有注入→有回流）→ loops=1，四项同增', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)
    const projectPath = mkdtempSync(join(tmpdir(), 'ov-onb-proj-'))
    const flowId = oneId(h, 'flow_templates')
    const project = await api<ProjectOut>(h, 'POST', '/api/projects', {
      name: '飞轮夹具',
      localPath: projectPath,
      flowTemplateId: flowId,
    })
    const projectId = project.json.id
    await api(h, 'PATCH', `/api/projects/${projectId}`, {
      standardPackId: packId,
      standardPackVersion: '1.0.0',
    })
    await api(h, 'POST', '/api/injections', { packId, packVersion: '1.0.0', projectPath })
    const log = await api<DevLogOut>(h, 'POST', `/api/projects/${projectId}/devlog`, {
      type: 'DEV',
      title: '回流一条术语',
      body: '把注入后发现的问题写回词条。',
    })
    await api(h, 'POST', `/api/projects/${projectId}/devlog/${log.json.id}/assets`, {
      assetId: oneId(h, 'prompts'),
    })

    const stats = await api<FlywheelStatsOut>(h, 'GET', '/api/stats')
    expect(stats.json.assets).toBe(
      count(h, 'SELECT COUNT(*) AS n FROM prompts') +
        count(h, 'SELECT COUNT(*) AS n FROM terms') +
        count(h, 'SELECT COUNT(*) AS n FROM skills'),
    )
    expect(stats.json).toMatchObject({ packs: 1, injections: 1, reflows: 1, loops: 1 })
    rmSync(projectPath, { recursive: true, force: true })
  })

  it('IT-ONB-14: 半圈不计——缺回流不计、缺路径不计，同项目重复注入只 1 圈（按项目去重）', async () => {
    const h = await makeHarness()
    const packId = await seededPack(h)
    const flowId = oneId(h, 'flow_templates')
    const dirA = mkdtempSync(join(tmpdir(), 'ov-onb-a-'))
    const dirB = mkdtempSync(join(tmpdir(), 'ov-onb-b-'))

    const mk = async (name: string, localPath?: string): Promise<string> =>
      (
        await api<ProjectOut>(h, 'POST', '/api/projects', {
          name,
          ...(localPath ? { localPath } : {}),
          flowTemplateId: flowId,
        })
      ).json.id

    // A：登记 + 两次注入 + 一条回流 → 1 圈（重复注入不加圈）
    const a = await mk('项目A', dirA)
    await api(h, 'PATCH', `/api/projects/${a}`, {
      standardPackId: packId,
      standardPackVersion: '1.0.0',
    })
    await api(h, 'POST', '/api/injections', { packId, packVersion: '1.0.0', projectPath: dirA })
    await api(h, 'POST', '/api/injections', { packId, packVersion: '1.0.0', projectPath: dirA })
    const logA = await api<DevLogOut>(h, 'POST', `/api/projects/${a}/devlog`, {
      type: 'DEV',
      title: 'A 的回流',
    })
    await api(h, 'POST', `/api/projects/${a}/devlog/${logA.json.id}/assets`, {
      assetId: oneId(h, 'terms'),
    })

    // B：同样登记并注入，但没有任何回流日志 → 不加圈
    const b = await mk('项目B', dirB)
    await api(h, 'PATCH', `/api/projects/${b}`, {
      standardPackId: packId,
      standardPackVersion: '1.0.0',
    })
    await api(h, 'POST', '/api/injections', { packId, packVersion: '1.0.0', projectPath: dirB })

    const partial = await api<FlywheelStatsOut>(h, 'GET', '/api/stats')
    expect(partial.json).toMatchObject({ loops: 1, injections: 3, reflows: 1 })

    // C：只登记了包、从未注入 → 仍不计圈
    const c = await mk('项目C')
    await api(h, 'PATCH', `/api/projects/${c}`, {
      standardPackId: packId,
      standardPackVersion: '1.0.0',
    })
    expect((await api<FlywheelStatsOut>(h, 'GET', '/api/stats')).json.loops).toBe(1)
    for (const dir of [dirA, dirB]) rmSync(dir, { recursive: true, force: true })
  })
})

describe('GET /api/injection-status?dir=（FR-2.4 步骤③自动确认，D-5）', () => {
  const q = (dir: string): string => `/api/injection-status?dir=${encodeURIComponent(dir)}`

  function injectedDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ov-onb-injected-'))
    mkdirSync(join(dir, '.openvibe'), { recursive: true })
    writeFileSync(
      join(dir, '.openvibe', 'pack.lock.json'),
      JSON.stringify({
        schemaVersion: 1,
        pack: { id: 'pk_x', name: 'default', version: '1.0.0', fingerprint: 'a'.repeat(64) },
        injectedAt: '2026-09-22T02:11:00Z',
        files: [{ path: 'CLAUDE.md', sha256: 'b'.repeat(64), managed: true }],
      }),
      'utf8',
    )
    return dir
  }

  it('IT-ONB-15: 已注入目录 → lockPresent + 包三元组 + 可直接执行的 sync 命令', async () => {
    const h = await makeHarness()
    const dir = injectedDir()
    const res = await api<InjectionStatusOut>(h, 'GET', q(dir))
    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({
      lockPresent: true,
      pack: { name: 'default', version: '1.0.0' },
      injectedAt: '2026-09-22T02:11:00Z',
    })
    expect(res.json.suggestedCommand).toBe(`npx openvibe-cli sync ${dir} --pack default`)
    // 目录版没有项目登记，registered/upToDate 一律缺席（不冒充项目态）
    expect(res.json.registered).toBeUndefined()
    expect(res.json.upToDate).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('IT-ONB-16: 空目录报「尚未注入」，坏 lock 报「lock 文件异常」——两种文案必须分开', async () => {
    const h = await makeHarness()
    const empty = mkdtempSync(join(tmpdir(), 'ov-onb-empty-'))
    const first = await api<InjectionStatusOut>(h, 'GET', q(empty))
    expect(first.statusCode).toBe(200)
    expect(first.json).toEqual({ lockPresent: false, error: expect.stringContaining('尚未注入') })

    mkdirSync(join(empty, '.openvibe'), { recursive: true })
    writeFileSync(join(empty, '.openvibe', 'pack.lock.json'), '{坏掉的 json', 'utf8')
    const broken = await api<InjectionStatusOut>(h, 'GET', q(empty))
    expect(broken.json).toEqual({ lockPresent: false, error: 'lock 文件异常' })
    rmSync(empty, { recursive: true, force: true })
  })

  it('IT-ONB-17: 相对路径/缺参/非目录 → 422，不存在 → 404', async () => {
    const h = await makeHarness()
    const rel = await api<{ code: string }>(h, 'GET', '/api/injection-status?dir=./project')
    expect(rel.statusCode).toBe(422)
    expect(rel.json.code).toBe('VALIDATION_ERROR')

    const none = await api<{ details?: { fieldErrors?: Record<string, string[]> } }>(
      h,
      'GET',
      '/api/injection-status',
    )
    expect(none.statusCode).toBe(422)
    expect(none.json.details?.fieldErrors?.dir).toBeTruthy()

    const missing = await api<{ code: string }>(h, 'GET', q(join(h.home, 'no-such-dir')))
    expect(missing.statusCode).toBe(404)
    expect(missing.json.code).toBe('NOT_FOUND')

    const filePath = join(h.home, 'plain.txt')
    writeFileSync(filePath, 'not a directory', 'utf8')
    const notDir = await api<{ code: string }>(h, 'GET', q(filePath))
    expect(notDir.statusCode).toBe(422)
    expect(notDir.json.code).toBe('VALIDATION_ERROR')
  })

  it('IT-ONB-18: 响应字段恰是 InjectionStatusOut，不带目录清单；缺令牌 401', async () => {
    const h = await makeHarness()
    const dir = injectedDir()
    expect((await api(h, 'GET', q(dir), undefined, false)).statusCode).toBe(401)

    const res = await api<Record<string, unknown>>(h, 'GET', q(dir))
    expect(Object.keys(res.json).sort()).toEqual([
      'injectedAt',
      'lockPresent',
      'pack',
      'suggestedCommand',
    ])
    rmSync(dir, { recursive: true, force: true })
  })
})
