import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { PackExportOut } from '@openvibe/shared'
import { ApiError } from '../src/client'
import { SyncError, syncAction } from '../src/commands/sync'
import {
  SourceError,
  assertSourceExclusive,
  findRegisteredPack,
  loadBundleJson,
  loadPackDir,
  loadPackFromServer,
  parsePackRef,
  pickExport,
  targetPathsFor,
} from '../src/pack-source'
import { fakeClient, onlineSyncRoutes } from './helpers/fake-client'
import { treeSnapshot } from './helpers/tree'
import {
  contentOf,
  demoPack,
  writeBundleFile,
  writePackDir,
  type PackFixture,
} from './helpers/pack-fixture'

/**
 * 包来源层（m6b FR-2.1 / §6.7 / design §7.1）：三条通道必须在验签后汇成同一个 LoadedPack，
 * 因此这里逐通道验证「校验发生在落盘之前」，以及导出挑选不被服务端排序带偏。
 */

const roots: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-source-test-'))
  roots.push(dir)
  return dir
}
function mkdirs(...segments: string[]): string {
  const abs = join(...segments)
  mkdirSync(abs, { recursive: true })
  return abs
}
function putFile(dir: string, rel: string, content: string): string {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
  return abs
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('来源旗标与包名解析（m6b FR-2.1）', () => {
  it('SOURCE-01: parsePackRef 支持 name 与 name@version，空版本段回退为「取最新」', () => {
    expect(parsePackRef('fixture')).toEqual({ name: 'fixture', version: null })
    expect(parsePackRef('fixture@1.2.0')).toEqual({ name: 'fixture', version: '1.2.0' })
    expect(parsePackRef('fixture@')).toEqual({ name: 'fixture', version: null })
    // 只在最后一个 @ 处切：包名里含 @ 时版本段仍是尾段
    expect(parsePackRef('a@b@1.0.0')).toEqual({ name: 'a@b', version: '1.0.0' })
    expect(parsePackRef('@scope')).toEqual({ name: '@scope', version: null })
  })

  it('SOURCE-02: 三选一两两互斥，错误文案点出是哪两个', () => {
    expect(() => assertSourceExclusive({})).not.toThrow()
    expect(() => assertSourceExclusive({ pack: 'fixture' })).not.toThrow()
    expect(() => assertSourceExclusive({ pack: 'f', file: 'b.json' })).toThrowError(SourceError)
    try {
      assertSourceExclusive({ file: 'b.json', dir: 'packDir' })
      expect.unreachable('应当抛出 SOURCE_CONFLICT')
    } catch (e) {
      const err = e as SourceError
      expect(err.code).toBe('SOURCE_CONFLICT')
      expect(err.message).toContain('三选一')
      expect(err.message).toContain('--file / --dir')
    }
  })
})

describe('离线通道：--file 与 --dir 两种形态等价（design §7.1）', () => {
  it('SOURCE-03: 目录导出与 bundle 解析出同一份 manifest、指纹与内容', () => {
    const root = tempRoot()
    const v1 = demoPack()
    const fromBundle = loadBundleJson(v1.bundle, 'bundle.json')
    const dir = writePackDir(root, v1)
    const fromDir = loadPackDir(dir)

    expect(fromDir.fingerprint).toBe(v1.fingerprint)
    expect(fromBundle.fingerprint).toBe(v1.fingerprint)
    expect(fromDir.files.map((f) => f.path)).toEqual(v1.files.map((f) => f.path))
    expect(Object.fromEntries(fromDir.files.map((f) => [f.path, f.content]))).toEqual(contentOf(v1))
    expect(fromDir.origin).toBe(dir)
    expect(fromBundle.origin).toBe('bundle.json')
    expect(fromDir.manifest.pack.id).toBe('pk_fixture')
  })

  it('SOURCE-04: 目录导出缺一个文件 → SOURCE_READ 点名缺谁，不做半成品注入', () => {
    const root = tempRoot()
    const v1 = demoPack()
    const dir = writePackDir(root, v1)
    rmSync(join(dir, 'files', 'TERMS.md'))
    try {
      loadPackDir(dir)
      expect.unreachable('应当抛出 SOURCE_READ')
    } catch (e) {
      const err = e as SourceError
      expect(err.code).toBe('SOURCE_READ')
      expect(err.message).toContain('目录导出缺少文件')
      expect(err.message).toContain('TERMS.md')
    }
    expect(() => loadPackDir(join(root, 'nope'))).toThrowError(/读不到目录导出的 manifest/)
  })

  it('SOURCE-05: manifest 与 files/ 内容不一致 → 逐哈希核对后 CONTENT_MODIFIED 整包拒', () => {
    const root = tempRoot()
    const v1 = demoPack()
    const dir = writePackDir(root, v1, 'clean')
    putFile(dir, 'files/TERMS.md', '有人偷改了导出的术语表\n')
    try {
      loadPackDir(dir)
      expect.unreachable('应当抛出 CONTENT_MODIFIED')
    } catch (e) {
      const err = e as SourceError
      expect(err.code).toBe('CONTENT_MODIFIED')
      expect(err.details).toMatchObject({ modified: ['TERMS.md'] })
    }
  })

  it('SOURCE-06: schemaVersion 超前先于 zod 报出（§6.7：告诉用户升级 CLI）', () => {
    const root = tempRoot()
    const v1 = demoPack()
    try {
      loadBundleJson({ ...v1.bundle, bundleSchemaVersion: 2 }, 'future.json')
      expect.unreachable('应当抛出 SCHEMA_UNSUPPORTED')
    } catch (e) {
      const err = e as SourceError
      expect(err.code).toBe('SCHEMA_UNSUPPORTED')
      expect(err.message).toContain('npx openvibe-cli@latest')
      expect(err.details).toMatchObject({ schemaVersion: 2, supported: 1 })
    }

    const dir = writePackDir(root, v1, 'aheadDir')
    writeFileSync(
      join(dir, 'openvibe.pack.json'),
      JSON.stringify({ ...v1.manifest, schemaVersion: 99 }),
      'utf8',
    )
    try {
      loadPackDir(dir)
      expect.unreachable('应当抛出 SCHEMA_UNSUPPORTED')
    } catch (e) {
      const err = e as SourceError
      expect(err.code).toBe('SCHEMA_UNSUPPORTED')
      expect(err.message).toContain('manifest schemaVersion 为 99')
    }
  })

  it('SOURCE-07: 结构不合契约（缺 manifest / 顶层不是对象）→ BUNDLE_INVALID 而非崩溃', () => {
    try {
      loadBundleJson({ files: [] }, 'broken.json')
      expect.unreachable('应当抛出 BUNDLE_INVALID')
    } catch (e) {
      const err = e as SourceError
      expect(err.code).toBe('BUNDLE_INVALID')
      expect(err.message).toContain('broken.json')
      expect(err.message).toContain('design §7.1')
    }
    // bundle 文件内容是 `null` / 一个数字这类合法 JSON、非法包体：要给出契约错误而不是 TypeError
    expect(() => loadBundleJson(null, 'null.json')).toThrowError(/顶层不是 JSON 对象/)
    expect(() => loadBundleJson('42', 'num.json')).toThrowError(SourceError)
    const root = tempRoot()
    const dir = writePackDir(root, demoPack(), 'manifestNull')
    writeFileSync(join(dir, 'openvibe.pack.json'), 'null', 'utf8')
    expect(() => loadPackDir(dir)).toThrowError(/顶层不是 JSON 对象/)
  })
})

describe('在线通道：--pack 三段式取包（packs → exports → bundle）', () => {
  const vLatest: PackFixture = demoPack({ version: '1.10.0' })
  const exportsRoute = {
    items: [
      {
        id: 'pex_9',
        packId: 'pk_fixture',
        version: '1.9.0',
        exportedAt: '2026-09-19T00:00:00Z',
      },
      {
        id: 'pex_1',
        packId: 'pk_fixture',
        version: '1.10.0',
        exportedAt: '2026-09-18T00:00:00Z',
      },
    ],
  }
  const getSource = () => ({
    '/api/packs': { items: [{ id: 'pk_fixture', name: 'fixture', version: '1.10.0' }] },
    '/api/packs/pk_fixture/exports': exportsRoute,
    '/api/packs/pk_fixture/exports/pex_1/bundle': vLatest.bundle,
    '/api/packs/pk_fixture/exports/pex_9/bundle': demoPack({ version: '1.9.0' }).bundle,
  })

  it('SOURCE-08: 无版本时按 semver 取最新导出（1.10.0 > 1.9.0，服务端按 exported_at 排序也不受影响）', async () => {
    const { client, paths } = fakeClient({ get: getSource() })
    const loaded = await loadPackFromServer(client, 'fixture')
    expect(loaded.origin).toBe('服务端 fixture@1.10.0')
    expect(loaded.fingerprint).toBe(vLatest.fingerprint)
    expect(paths()).toEqual([
      'GET /api/packs',
      'GET /api/packs/pk_fixture/exports',
      'GET /api/packs/pk_fixture/exports/pex_1/bundle',
    ])
  })

  it('SOURCE-09: @version 精确命中；缺包/缺版本/缺导出各自的 404 文案都能指路', async () => {
    const { client } = fakeClient({ get: getSource() })
    const loaded = await loadPackFromServer(client, 'fixture@1.9.0')
    expect(loaded.origin).toBe('服务端 fixture@1.9.0')
    expect(loaded.manifest.pack.version).toBe('1.9.0')

    const badVersion = await loadPackFromServer(client, 'fixture@2.0.0').catch((e: unknown) => e)
    expect(badVersion).toBeInstanceOf(ApiError)
    expect((badVersion as ApiError).status).toBe(404)
    expect((badVersion as ApiError).message).toContain('现有导出 1.9.0、1.10.0')

    const noExport = fakeClient({
      get: {
        '/api/packs': getSource()['/api/packs'],
        '/api/packs/pk_fixture/exports': { items: [] },
      },
    })
    const empty = await loadPackFromServer(noExport.client, 'fixture').catch((e: unknown) => e)
    expect((empty as ApiError).message).toContain('该标准包尚未导出任何版本')

    const noPack = fakeClient({ get: { '/api/packs': { items: [] } } })
    const missing = await loadPackFromServer(noPack.client, 'ghost').catch((e: unknown) => e)
    expect((missing as ApiError).message).toContain('ghost')
    expect((missing as ApiError).hint).toContain('/packs')
  })

  it('SOURCE-10: pickExport 是纯函数——空清单与字典序陷阱都在这里挡住', () => {
    const items: PackExportOut[] = [
      {
        id: 'a',
        packId: 'p',
        version: '1.9.0',
        fingerprint: '',
        channel: 'download',
        exportedAt: '2026-09-19T00:00:00Z',
      },
      {
        id: 'b',
        packId: 'p',
        version: '1.10.0',
        fingerprint: '',
        channel: 'download',
        exportedAt: '2026-09-18T00:00:00Z',
      },
    ]
    expect(pickExport(items, null).id).toBe('b')
    expect(pickExport(items, '1.9.0').id).toBe('a')
    expect(() => pickExport([], null)).toThrowError('尚未导出任何版本')
    expect(() => pickExport(items, '0.1.0')).toThrowError('没有 0.1.0 版本的导出')
  })

  it('SOURCE-11: 在线通道只走这三个端点，多余响应即失败（零外联的反向证据）', async () => {
    const { client, calls } = fakeClient({
      get: getSource(),
      post: { '/api/telemetry/events': { queued: true } },
    })
    await loadPackFromServer(client, 'fixture')
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
    expect(calls.map((c) => c.path)).not.toContain('/api/telemetry/events')
  })
})

describe('缺省来源：项目登记包（m6b FR-2.1）', () => {
  it('SOURCE-12: 按 localPath 匹配（resolve 归一后比较），未绑定/包已删/无登记一律 null', async () => {
    const project = tempRoot()
    const bound = fakeClient({
      get: {
        '/api/projects?status=all': {
          items: [
            { id: 'prj_1', localPath: join(project, 'other'), standardPackId: 'pk_other' },
            {
              id: 'prj_2',
              localPath: join(project, 'nested', '..'),
              standardPackId: 'pk_fixture',
              standardPackVersion: '1.10.0',
            },
          ],
        },
        '/api/packs': { items: [{ id: 'pk_fixture', name: 'fixture', version: '1.10.0' }] },
      },
    })
    expect(await findRegisteredPack(bound.client, join(project, 'nested', '..'))).toEqual({
      packId: 'pk_fixture',
      name: 'fixture',
      version: '1.10.0',
    })
    expect(bound.paths()).toEqual(['GET /api/projects?status=all', 'GET /api/packs'])

    const unbound = fakeClient({
      get: {
        '/api/projects?status=all': {
          items: [{ id: 'prj_1', localPath: project, standardPackId: null }],
        },
      },
    })
    expect(await findRegisteredPack(unbound.client, project)).toBeNull()

    const dangling = fakeClient({
      get: {
        '/api/projects?status=all': {
          items: [{ id: 'prj_1', localPath: project, standardPackId: 'pk_deleted' }],
        },
        '/api/packs': { items: [] },
      },
    })
    expect(await findRegisteredPack(dangling.client, project)).toBeNull()

    const noProject = fakeClient({ get: { '/api/projects?status=all': { items: [] } } })
    expect(await findRegisteredPack(noProject.client, project)).toBeNull()
  })

  it('SOURCE-13: sync 缺省取登记包，与离线注入同构 → 全 IN_SYNC；未登记时零写入并指路 Web', async () => {
    const root = tempRoot()
    const project = mkdirs(root, 'proj')
    const v1 = demoPack()
    const seededAt = new Date('2026-09-21T10:20:30.400Z')
    await syncAction(
      { projectPath: project, file: writeBundleFile(root, v1), yes: true },
      { now: () => seededAt },
    )

    const { client, paths } = fakeClient({
      get: {
        '/api/projects?status=all': {
          items: [
            {
              id: 'prj_1',
              localPath: resolve(project),
              standardPackId: 'pk_fixture',
              standardPackVersion: '1.0.0',
            },
          ],
        },
        '/api/packs': { items: [{ id: 'pk_fixture', name: 'fixture', version: '1.0.0' }] },
        '/api/packs/pk_fixture/exports': {
          items: [
            {
              id: 'pex_1',
              packId: 'pk_fixture',
              version: '1.0.0',
              exportedAt: '2026-09-20T00:00:00Z',
            },
          ],
        },
        '/api/packs/pk_fixture/exports/pex_1/bundle': v1.bundle,
      },
      post: onlineSyncRoutes().post,
    })
    const outcome = await syncAction({ projectPath: project }, { client })
    expect(outcome.counts.IN_SYNC).toBe(v1.files.length)
    expect(outcome.writes).toEqual([])
    expect(outcome.injectionReported).toBe(true)
    expect(paths()).toEqual([
      'GET /api/projects?status=all',
      'GET /api/packs',
      'GET /api/packs',
      'GET /api/packs/pk_fixture/exports',
      'GET /api/packs/pk_fixture/exports/pex_1/bundle',
      'POST /api/injections',
    ])

    const fresh = mkdirs(root, 'fresh')
    const orphan = await syncAction({ projectPath: fresh }, { client }).catch((e: unknown) => e)
    expect(orphan).toBeInstanceOf(SyncError)
    expect((orphan as SyncError).code).toBe('NO_REGISTERED_PACK')
    expect((orphan as Error).message).toContain('/projects')
    // 连包都没取到，磁盘上不该出现任何产物
    expect(Object.keys(treeSnapshot(fresh))).toEqual(['.'])
  })
})

describe('--target 子集路径集（m6b FR-2.7）', () => {
  it('SOURCE-14: 主文件按 adapter 归属过滤，辅助产物恒在范围内', () => {
    const paths = [
      'CLAUDE.md',
      '.cursor/rules/openvibe.mdc',
      'AGENTS.md',
      'TERMS.md',
      'CHECKLIST.md',
    ]
    const auxPaths = new Set(['TERMS.md', 'CHECKLIST.md'])
    expect(targetPathsFor(paths, new Set(['AGENTS.md']), auxPaths)).toEqual([
      'AGENTS.md',
      'TERMS.md',
      'CHECKLIST.md',
    ])
    expect(targetPathsFor(paths, new Set(), new Set())).toEqual([])
  })
})
