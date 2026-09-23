import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ADAPTER_IDS } from '@openvibe/shared'
import { BootError, bootstrap, type BootstrapResult } from '../src/bootstrap'
import { packExportDir } from '../src/lib/pack-export'

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')
const open: BootstrapResult[] = []
const roots: string[] = []

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-boot-'))
  roots.push(dir)
  return dir
}

/**
 * 首启组装预置包会写 `<home>/packs/default@1.0.0/`（core/db/index.ts 读 OPENVIBE_HOME）。
 * 每个用例一个新沙箱：导出内容含条目 id，两个临时库共用目录会让第二次导出撞 VERSION_IMMUTABLE。
 */
const REAL_HOME = process.env.OPENVIBE_HOME
beforeEach(() => {
  process.env.OPENVIBE_HOME = tempRoot()
})
afterAll(() => {
  if (REAL_HOME === undefined) delete process.env.OPENVIBE_HOME
  else process.env.OPENVIBE_HOME = REAL_HOME
})

/** /api 受 §11 Bearer 保护，不带令牌的 fetch 只会拿到 401，断言会变空转 */
const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })
const body = async (res: Response): Promise<Record<string, unknown>> =>
  (await res.json()) as Record<string, unknown>
const termsTotal = async (r: BootstrapResult) =>
  ((await (await fetch(`${r.url}/api/terms`, auth(r.token))).json()) as { total: number }).total

/** 最小 Web 产物夹具：index.html + 一个 asset */
function webFixture(): string {
  const dir = join(tempRoot(), 'dist')
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>OpenVibe</title><div id="root"></div>',
  )
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')
  return dir
}

afterEach(async () => {
  while (open.length) await open.pop()?.close()
  while (roots.length) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

describe('bootstrap 启动序列（dev-plan §1.2 步骤 3/4/6，§4.3）', () => {
  it('BOOT-01: 真监听 127.0.0.1 + 播种 + 令牌生成，health 可访问', async () => {
    const r = await bootstrap({
      dbPath: join(tempRoot(), 'data', 'openvibe.db'),
      seedDir: SEED_DIR,
      port: 0,
    })
    open.push(r)

    expect(r.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(r.token).toMatch(/^[0-9a-f]{64}$/)
    const health = await fetch(`${r.url}/api/health`)
    expect(health.status).toBe(200)
    expect((await body(health)).status).toBe('ok')
    expect(r.seed.created.terms).toBeGreaterThan(0)
    expect(existsSync(r.dbPath)).toBe(true)
  })

  it('BOOT-02: 同一 DB 二次启动不重复播种，且沿用传入令牌', async () => {
    const dbPath = join(tempRoot(), 'data', 'openvibe.db')
    const first = await bootstrap({ dbPath, seedDir: SEED_DIR, port: 0, token: 'a'.repeat(64) })
    open.push(first)
    const total = await termsTotal(first)

    const second = await bootstrap({ dbPath, seedDir: SEED_DIR, port: 0, token: 'a'.repeat(64) })
    open.push(second)
    expect(second.token).toBe('a'.repeat(64))
    expect(second.seed.created.terms).toBe(0)
    // 整包 content_hash 未变 → core 按 bundle 粒度跳过（逐条 skipped 计数只属于「已变更但不并入」）
    expect(second.seed.bundles.terms).toBe('skipped')

    expect(await termsTotal(second)).toBe(total)
  })

  it('BOOT-03: DB 打不开 → BootError 带路径，不静默降级为内存库', async () => {
    const taken = tempRoot()
    await expect(bootstrap({ dbPath: taken, seedDir: SEED_DIR, port: 0 })).rejects.toMatchObject({
      name: 'BootError',
      code: 'DB_OPEN_FAILED',
    })
    await expect(bootstrap({ dbPath: taken, seedDir: SEED_DIR, port: 0 })).rejects.toThrow(taken)
  })

  it('BOOT-04: 种子目录缺失只记 warning，服务照常启动（seed 失败不阻塞）', async () => {
    const r = await bootstrap({
      dbPath: join(tempRoot(), 'data', 'openvibe.db'),
      seedDir: join(tempRoot(), 'no-such-seed'),
      port: 0,
    })
    open.push(r)
    expect(r.warnings.join(' ')).toContain('种子目录不存在')
    // 预置包同样降级为 warning：种子未就绪不得让 serve 退出（onboarding §4.1）
    expect(r.defaultPack.status).toBe('failed')
    expect(r.warnings.join(' ')).toContain('预置包')
    expect((await body(await fetch(`${r.url}/api/health`))).status).toBe('ok')
  })

  it('BOOT-05: 只允许回环地址绑定（design §11.1）', async () => {
    await expect(
      bootstrap({ dbPath: join(tempRoot(), 'd.db'), seedDir: SEED_DIR, port: 0, host: '0.0.0.0' }),
    ).rejects.toBeInstanceOf(BootError)
    const r = await bootstrap({
      dbPath: join(tempRoot(), 'd.db'),
      seedDir: SEED_DIR,
      port: 0,
      host: 'localhost',
    })
    open.push(r)
    expect(r.url).toContain('127.0.0.1')
  })

  it('BOOT-06: 步骤 5 首启组装 default 包，六目标齐、导出登记落盘（onboarding FR-1.1）', async () => {
    const dbPath = join(tempRoot(), 'data', 'openvibe.db')
    const r = await bootstrap({ dbPath, seedDir: SEED_DIR, port: 0 })
    open.push(r)

    expect(r.defaultPack.status).toBe('created')
    expect(r.defaultPack.rebuilt).toBe(true)
    expect(r.defaultPack.version).toBe('1.0.0')
    expect(r.defaultPack.reason).toBeNull()

    const pack = r.db
      .prepare('SELECT id, targets FROM standard_packs WHERE name = ?')
      .get('default') as { id: string; targets: string }
    expect(ADAPTER_IDS).toEqual(JSON.parse(pack.targets))
    expect(
      r.db
        .prepare('SELECT version, channel FROM pack_exports WHERE pack_id = ?')
        .all(pack.id),
    ).toEqual([{ version: '1.0.0', channel: 'directory' }])
    expect(r.defaultPack.directoryPath).toBe(packExportDir('default', '1.0.0'))
    expect(readdirSync(r.defaultPack.directoryPath ?? '').length).toBeGreaterThan(0)
  })

  it('BOOT-07: 二次启动不重复组装（D-3：在位即 exists，不追加导出）', async () => {
    const dbPath = join(tempRoot(), 'data', 'openvibe.db')
    const first = await bootstrap({ dbPath, seedDir: SEED_DIR, port: 0 })
    await first.close()

    const second = await bootstrap({ dbPath, seedDir: SEED_DIR, port: 0 })
    open.push(second)
    expect(second.defaultPack.status).toBe('exists')
    expect(second.defaultPack.rebuilt).toBe(false)
    expect(
      (second.db.prepare('SELECT COUNT(*) AS n FROM pack_exports').get() as { n: number }).n,
    ).toBe(1)
    expect(second.warnings.join(' ')).not.toContain('预置包')
  })
})

describe('plugins/static 托管与 SPA 回退（design §4 步骤 7，D-1 降级）', () => {
  it('STATIC-01: 根路径与资源命中产物，未知前端路由回退 index.html，/api 仍走 JSON 404', async () => {
    const root = webFixture()
    const r = await bootstrap({
      dbPath: join(tempRoot(), 'd.db'),
      seedDir: SEED_DIR,
      port: 0,
      webRoot: root,
    })
    open.push(r)
    expect(r.web.served).toBe(true)

    const home = await (await fetch(`${r.url}/`)).text()
    expect(home).toContain('id="root"')
    const asset = await fetch(`${r.url}/assets/app.js`)
    expect(asset.status).toBe(200)
    expect(await asset.text()).toContain('console.log')

    const spa = await fetch(`${r.url}/library?x=1`)
    expect(spa.status).toBe(200)
    expect(spa.headers.get('content-type')).toContain('text/html')
    expect(await spa.text()).toContain('id="root"')

    // 未知 API 路径必须保持 JSON 语义：无令牌 401（auth preHandler 先于 404），带令牌 404
    const noToken = await fetch(`${r.url}/api/nope`)
    expect(noToken.status).toBe(401)
    expect((await body(noToken)).code).toBe('UNAUTHORIZED')
    const missing = await fetch(`${r.url}/api/nope`, auth(r.token))
    expect(missing.status).toBe(404)
    expect((await body(missing)).code).toBe('NOT_FOUND')
  })

  it('STATIC-02: 产物缺失 → 仅 API 模式启动 + 构建提示，不报错退出', async () => {
    const r = await bootstrap({
      dbPath: join(tempRoot(), 'd.db'),
      seedDir: SEED_DIR,
      port: 0,
      webRoot: join(tempRoot(), 'no-dist'),
    })
    open.push(r)
    expect(r.web.served).toBe(false)
    expect(r.warnings.join(' ')).toContain('@openvibe/web build')
    expect((await body(await fetch(`${r.url}/api/health`))).status).toBe('ok')
    const root = await fetch(`${r.url}/`)
    expect(root.status).toBe(404)
    expect((await body(root)).code).toBe('NOT_FOUND')
  })
})
