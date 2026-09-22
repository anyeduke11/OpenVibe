import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { PACK_LOCK_REL } from '@openvibe/core'
import type { PackExportOut } from '@openvibe/shared'
import { syncAction } from '../src/commands/sync'
import { DiffError, diffAction, lockPathOf } from '../src/commands/diff'
import { ServerUnreachable, type ApiClient } from '../src/client'
import { demoPack, writeBundleFile } from './helpers/pack-fixture'
import { fakeClient } from './helpers/fake-client'

/**
 * T7e · `openvibe diff`（m6b FR-5）。
 * 验收映射（dev-plan §9-T7）：§7.2 → CLI-DIFF-01 + CLI-SYNC-05。
 * 退出码是这命令的全部对外契约（0 clean / 1 错误 / 2 漂移或有新版），
 * 所以每条都同时断言 verdict 与 exitCode，而不是只看数组。
 */

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => 'overwrite'),
  confirm: vi.fn(async () => true),
  isCancel: vi.fn(() => false),
}))

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts')
const roots: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

/** 真注入一遍拿到 lock 文件（夹具产物含 TERMS.md，漂移用例改它） */
async function injectedProject(): Promise<{ project: string; bundlePath: string }> {
  const root = tempDir('ov-diff-test-')
  const project = join(root, 'proj')
  mkdirSync(project)
  const pack = demoPack()
  const bundlePath = writeBundleFile(root, pack)
  const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true }, {})
  if (outcome.writes.length === 0) throw new Error('夹具注入未产生写入，diff 用例无法成立')
  return { project, bundlePath }
}

const exportRow = (version: string, exportedAt: string): PackExportOut => ({
  id: `pex_${version}`,
  packId: 'pk_fixture',
  version,
  fingerprint: 'f'.repeat(64),
  channel: 'download',
  exportedAt,
})

describe('diff 的磁盘比对（FR-5.1/5.2）', () => {
  it('CLI-DIFF-01: 注入后 clean=0 → 手改 TERMS.md 报 drifted=2 → 以包为准修复后回 clean', async () => {
    const { project, bundlePath } = await injectedProject()

    const first = await diffAction({ projectPath: project }, {})
    expect(first.clean).toBe(true)
    expect(first.exitCode).toBe(0)
    expect(first.pack).toMatchObject({ name: 'fixture', version: '1.0.0' })

    const termsPath = join(project, 'TERMS.md')
    writeFileSync(termsPath, `${readFileSync(termsPath, 'utf8')}\n本地手改\n`, 'utf8')

    const drifted = await diffAction({ projectPath: project }, {})
    expect(drifted.clean).toBe(false)
    expect(drifted.drifted.map((d) => d.path)).toEqual(['TERMS.md'])
    expect(drifted.missing).toEqual([])
    expect(drifted.exitCode).toBe(2)

    // 走 sync 的「以包为准」：DRIFT 覆盖后 diff 必须回到 clean（§7.2 的后半段）
    const applied = await syncAction(
      { projectPath: project, file: bundlePath, yes: true, strategy: 'overwrite' },
      {},
    )
    expect(applied.writes.map((w) => w.path)).toEqual(['TERMS.md'])

    const repaired = await diffAction({ projectPath: project }, {})
    expect(repaired).toMatchObject({ clean: true, drifted: [], missing: [], exitCode: 0 })
  })

  it('CLI-DIFF-01b: 文件被删 → 记进 missing 而不是 drifted，退出码 2', async () => {
    const { project } = await injectedProject()
    rmSync(join(project, 'CHECKLIST.md'))

    const outcome = await diffAction({ projectPath: project }, {})

    expect(outcome.clean).toBe(false)
    expect(outcome.missing).toEqual(['CHECKLIST.md'])
    expect(outcome.drifted).toEqual([])
    expect(outcome.exitCode).toBe(2)
    expect(outcome.hints.join('\n')).toContain('缺失')
  })

  it('lock 哈希逐条对上磁盘内容（expected/actual 都进报告，供脚本 diff）', async () => {
    const { project } = await injectedProject()
    writeFileSync(join(project, 'CLAUDE.md'), '改了\n', 'utf8')

    const outcome = await diffAction({ projectPath: project }, {})
    const entry = outcome.drifted[0]

    expect(entry?.path).toBe('CLAUDE.md')
    expect(entry?.expected).toMatch(/^[0-9a-f]{64}$/)
    expect(entry?.actual).toMatch(/^[0-9a-f]{64}$/)
    expect(entry?.expected).not.toBe(entry?.actual)
  })

  it('无 lock → NO_LOCK，提示先 sync，退出码 1 由调用方落地', async () => {
    const project = tempDir('ov-diff-empty-')

    const err = await diffAction({ projectPath: project }, {}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(DiffError)
    expect((err as DiffError).code).toBe('NO_LOCK')
    expect((err as Error).message).toContain('openvibe sync')
    expect(lockPathOf(project)).toBe(join(project, PACK_LOCK_REL))
  })

  it('lock 内容不可解析 / 路径非法 → LOCK_INVALID（被改过的 lock 不能当基准）', async () => {
    const { project } = await injectedProject()
    writeFileSync(join(project, PACK_LOCK_REL), '{ not json', 'utf8')

    const garbage = await diffAction({ projectPath: project }, {}).catch((e: unknown) => e)
    expect((garbage as DiffError).code).toBe('LOCK_INVALID')

    const escaped = {
      schemaVersion: 1,
      pack: { id: 'pk_x', name: 'fixture', version: '1.0.0', fingerprint: 'f'.repeat(64) },
      injectedAt: '2026-09-21T00:00:00.000Z',
      files: [{ path: '../escape.md', sha256: 'a'.repeat(64), managed: true }],
    }
    writeFileSync(join(project, PACK_LOCK_REL), JSON.stringify(escaped), 'utf8')
    const badPath = await diffAction({ projectPath: project }, {}).catch((e: unknown) => e)
    expect((badPath as DiffError).code).toBe('LOCK_INVALID')
  })

  it('项目路径不是目录 → PROJECT_NOT_DIR', async () => {
    const root = tempDir('ov-diff-file-')
    const file = join(root, 'lock.json')
    writeFileSync(file, '{}', 'utf8')

    const err = await diffAction({ projectPath: file }, {}).catch((e: unknown) => e)
    expect((err as DiffError).code).toBe('PROJECT_NOT_DIR')
  })
})

describe('在线新版本探测（FR-5.3）', () => {
  it('有更新导出版本 → pack-outdated，即使磁盘 clean 也退 2', async () => {
    const { project } = await injectedProject()
    const fake = fakeClient({
      get: {
        '/api/packs/pk_fixture/exports': {
          items: [exportRow('1.0.0', '2026-09-20'), exportRow('1.2.0', '2026-09-21')],
        },
      },
    })

    const outcome = await diffAction({ projectPath: project }, { client: fake.client })

    expect(fake.paths()).toEqual(['GET /api/packs/pk_fixture/exports'])
    expect(outcome.outdated).toEqual({ from: '1.0.0', to: '1.2.0' })
    expect(outcome.clean).toBe(true)
    expect(outcome.exitCode).toBe(2)
    expect(outcome.hints.join('\n')).toContain('pack-outdated(1.0.0 → 1.2.0)')
  })

  it('导出清单按时间乱序 → 取 semver 最大而非数组末项', async () => {
    const { project } = await injectedProject()
    const fake = fakeClient({
      get: {
        '/api/packs/pk_fixture/exports': {
          items: [exportRow('1.9.0', '2026-09-21'), exportRow('1.10.0', '2026-09-19')],
        },
      },
    })

    const outcome = await diffAction({ projectPath: project }, { client: fake.client })

    expect(outcome.outdated).toEqual({ from: '1.0.0', to: '1.10.0' })
  })

  it('已是最新导出版本 → outdated=null 且不告警', async () => {
    const { project } = await injectedProject()
    const fake = fakeClient({
      get: { '/api/packs/pk_fixture/exports': { items: [exportRow('1.0.0', '2026-09-21')] } },
    })

    const outcome = await diffAction({ projectPath: project }, { client: fake.client })

    expect(outcome.outdated).toBeNull()
    expect(outcome.warnings).toEqual([])
    expect(outcome.exitCode).toBe(0)
  })

  it('包已被删 / 无导出 / 服务端不可达 → 只警告，磁盘结论照旧（离线跳过该步）', async () => {
    const { project } = await injectedProject()
    writeFileSync(join(project, 'TERMS.md'), '手改\n', 'utf8')
    const down: ApiClient = {
      serverUrl: 'http://127.0.0.1:1',
      getJson: () =>
        Promise.reject(new ServerUnreachable('http://127.0.0.1:1', 'connect ECONNREFUSED')),
      postJson: () => Promise.reject(new Error('unused')),
    }

    const unreachable = await diffAction({ projectPath: project }, { client: down })
    expect(unreachable.outdated).toBeNull()
    expect(unreachable.warnings.join('\n')).toContain('ECONNREFUSED')
    expect(unreachable.clean).toBe(false)
    expect(unreachable.exitCode).toBe(2)

    const empty = fakeClient({ get: { '/api/packs/pk_fixture/exports': { items: [] } } })
    const noExport = await diffAction({ projectPath: project }, { client: empty.client })
    expect(noExport.outdated).toBeNull()
    expect(noExport.warnings.join('\n')).toContain('导出')

    const offline = await diffAction({ projectPath: project }, {})
    expect(offline.outdated).toBeNull()
    expect(offline.hints.join('\n')).toContain('离线')
  })

  it('探测只读不改盘：lock 与产物哈希全程不变', async () => {
    const { project } = await injectedProject()
    const before = treeOf(project)
    const fake = fakeClient({
      get: { '/api/packs/pk_fixture/exports': { items: [exportRow('2.0.0', '2026-09-22')] } },
    })

    await diffAction({ projectPath: project }, { client: fake.client })

    expect(treeOf(project)).toEqual(before)
    expect(fake.calls.every((c) => c.method === 'GET')).toBe(true)
  })
})

describe('--json 契约与退出码（m6b §5.2，真子进程）', () => {
  const tempHome = (): string => {
    const home = tempDir('ov-diff-home-')
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ serverUrl: 'http://127.0.0.1:1', token: 't', port: 1 }),
      { mode: 0o600 },
    )
    return home
  }

  const runCli = (args: string[], home: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
    })

  it('漂移 → 退出码 2 + command=diff + drifted 数组', async () => {
    const { project } = await injectedProject()
    writeFileSync(join(project, 'AGENTS.md'), '手改\n', 'utf8')

    const res = runCli(['--json', 'diff', project], tempHome())

    expect(res.status).toBe(2)
    const env = JSON.parse(res.stdout) as {
      command: string
      summary: Record<string, unknown> & { clean: boolean; exitCode: number }
    }
    expect(env.command).toBe('diff')
    expect(env.summary.clean).toBe(false)
    expect(env.summary.exitCode).toBe(2)
    expect((env.summary.drifted as { path: string }[]).map((d) => d.path)).toEqual(['AGENTS.md'])
  })

  it('无 lock → 退出码 1 + error.code=NO_LOCK', () => {
    const project = tempDir('ov-diff-nolock-')

    const res = runCli(['--json', 'diff', project], tempHome())

    expect(res.status).toBe(1)
    expect(JSON.parse(res.stdout).summary.error.code).toBe('NO_LOCK')
  })
})

/** 全树 sha256 摘要（「探测不改盘」的断言口径） */
function treeOf(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else
        out[abs.slice(root.length)] = createHash('sha256').update(readFileSync(abs)).digest('hex')
    }
  }
  walk(root)
  return out
}
