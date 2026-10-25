import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { demoPack, writeBundleFile } from './helpers/pack-fixture'
import { syncAction } from '../src/commands/sync'
import { verifyAction } from '../src/commands/verify'
import type { ApiClient } from '../src/client'
import type { PackExportOut } from '@openvibe/shared'

/**
 * v0.2.3 批次 B FR-4：`openvibe verify` 端到端（spec `v023-b-first-lap.md` §7-1/2）。
 * 判据映射：四/六态各一支（人为造中间态：删文件=PARTIAL / 改文件=DISK_DRIFT /
 * 放弃儿=ORPHAN / 空目录=UNMANAGED / 服务端新版本=STALE_LOCK）；目录零变化断言；
 * --json 单对象 + 退出码。纯函数腿在 packages/core/src/inject/verify.test.ts。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRY = join(HERE, '..', 'src', 'index.ts')
const roots: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

/** 真注入一遍拿到 lock 与产物（同 diff.test 的夹具手法） */
async function injectedProject(): Promise<{ project: string; bundlePath: string }> {
  const root = tempDir('ov-verify-test-')
  const project = join(root, 'proj')
  mkdirSync(project)
  const pack = demoPack()
  const bundlePath = writeBundleFile(root, pack)
  const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true }, {})
  if (outcome.writes.length === 0) throw new Error('夹具注入未产生写入，verify 用例无法成立')
  return { project, bundlePath }
}

const exportRow = (version: string): PackExportOut => ({
  id: `pex_${version}`,
  packId: 'pk_fixture',
  version,
  fingerprint: 'f'.repeat(64),
  channel: 'download',
  exportedAt: '2026-10-24T00:00:00Z',
})

const clientWithExports = (versions: string[]): { client: ApiClient } => ({
  client: {
    getJson: async () => ({ items: versions.map(exportRow) }),
  } as unknown as ApiClient,
})

/** 目录指纹：相对路径 + 内容 sha256 + 文件集，verify 前后必须逐字节不变 */
function dirFingerprint(root: string): string {
  const rows: string[] = []
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name)
      const relPath = rel === '' ? name : `${rel}/${name}`
      if (statSync(abs).isDirectory()) {
        walk(abs, relPath)
      } else {
        const sha = createHash('sha256').update(readFileSync(abs)).digest('hex')
        rows.push(`${relPath} ${sha}`)
      }
    }
  }
  walk(root, '')
  return rows.join('\n')
}

describe('verifyAction 的状态判定（FR-4，进程内）', () => {
  it('VERIFY-01: 注入后 → CONSISTENT（离线时包侧未核只降级为警告）', async () => {
    const { project } = await injectedProject()
    const outcome = await verifyAction({ projectPath: project }, {})
    expect(outcome.state).toBe('CONSISTENT')
    expect(outcome.exitCode).toBe(0)
    expect(outcome.probedOnline).toBe(false)
    expect(outcome.warnings.join('\n')).toContain('离线')
  })

  it('VERIFY-02: 删一个受管文件 → PARTIAL（疑似上次注入中断）', async () => {
    const { project } = await injectedProject()
    rmSync(join(project, 'CHECKLIST.md'))
    const outcome = await verifyAction({ projectPath: project }, {})
    expect(outcome.state).toBe('PARTIAL')
    expect(outcome.missing).toEqual(['CHECKLIST.md'])
    expect(outcome.hints.join('\n')).toContain('sync --dry-run')
  })

  it('VERIFY-03: 手改受管文件 → DISK_DRIFT（指向 diff）', async () => {
    const { project } = await injectedProject()
    writeFileSync(join(project, 'TERMS.md'), `${readFileSync(join(project, 'TERMS.md'), 'utf8')}\n手改\n`, 'utf8')
    const outcome = await verifyAction({ projectPath: project }, {})
    expect(outcome.state).toBe('DISK_DRIFT')
    expect(outcome.drifted.map((d) => d.path)).toEqual(['TERMS.md'])
    expect(outcome.hints.join('\n')).toContain('openvibe diff')
  })

  it('VERIFY-04: 带注入标记的未登记文件 → ORPHAN', async () => {
    const { project } = await injectedProject()
    writeFileSync(
      join(project, 'MINI.md'),
      '<!-- openvibe:pack=fixture@1.0.0 begin (regenerate: npx openvibe-cli sync) -->\n弃儿\n',
      'utf8',
    )
    const outcome = await verifyAction({ projectPath: project }, {})
    expect(outcome.state).toBe('ORPHAN')
    expect(outcome.orphan).toEqual(['MINI.md'])
  })

  it('VERIFY-05: 服务端有更新导出版本 → STALE_LOCK（probedOnline=true）', async () => {
    const { project } = await injectedProject()
    const outcome = await verifyAction({ projectPath: project }, clientWithExports(['1.1.0']))
    expect(outcome.state).toBe('STALE_LOCK')
    expect(outcome.newer).toEqual({ from: '1.0.0', to: '1.1.0' })
    expect(outcome.probedOnline).toBe(true)
  })

  it('VERIFY-06: 同版本导出不判 STALE_LOCK', async () => {
    const { project } = await injectedProject()
    const outcome = await verifyAction({ projectPath: project }, clientWithExports(['1.0.0']))
    expect(outcome.state).toBe('CONSISTENT')
  })

  it('VERIFY-07: 零写入判据——verify 前后项目目录逐字节不变（含 lock 本身）', async () => {
    const { project } = await injectedProject()
    const before = dirFingerprint(project)
    await verifyAction({ projectPath: project }, clientWithExports(['1.1.0']))
    expect(dirFingerprint(project)).toBe(before)
  })

  it('VERIFY-08: 无 lock 目录 → UNMANAGED（这是状态不是错误，退 2）', async () => {
    const project = join(tempDir('ov-verify-empty-'), 'proj')
    mkdirSync(project)
    const outcome = await verifyAction({ projectPath: project }, {})
    expect(outcome.state).toBe('UNMANAGED')
    expect(outcome.exitCode).toBe(2)
    expect(outcome.pack).toBeNull()
  })
})

describe('verify 真子进程（退出码与 --json 契约）', () => {
  const runCli = (args: string[], home: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
    })

  it('VERIFY-09: --json 下 stdout 单对象，command=verify + state + exitCode', async () => {
    const { project } = await injectedProject()
    const home = tempDir('ov-verify-home-')
    const res = runCli(['--json', 'verify', project], home)
    expect(res.status).toBe(0)
    const env = JSON.parse(res.stdout) as {
      command: string
      summary: { state: string; exitCode: number; ok: boolean }
    }
    expect(env.command).toBe('verify')
    expect(env.summary.state).toBe('CONSISTENT')
    expect(env.summary.exitCode).toBe(0)
    expect(env.summary.ok).toBe(true)
  }, 30_000)

  it('VERIFY-10: 无 lock → 退出码 2 + state=UNMANAGED', () => {
    const project = join(tempDir('ov-verify-empty2-'), 'proj')
    mkdirSync(project)
    const home = tempDir('ov-verify-home2-')
    const res = runCli(['--json', 'verify', project], home)
    expect(res.status).toBe(2)
    const env = JSON.parse(res.stdout) as { summary: { state: string } }
    expect(env.summary.state).toBe('UNMANAGED')
  }, 30_000)
})

describe('FR-4.4 · sync 前置中断提示（复盘补背书）', () => {
  it('VERIFY-11: lock 登记文件缺失（PARTIAL 磁盘态）⇒ sync 提示「上次注入可能中断」且不阻断', async () => {
    const { project, bundlePath } = await injectedProject()
    // 造中断态：删一个 lock 登记的受管文件（磁盘缺失但 lock 还在）
    rmSync(join(project, 'CHECKLIST.md'))

    const warnings: string[] = []
    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true }, {}, warnings)

    // 提示在（含缺失文件名），且 sync 照常完成（不阻断——重建缺失文件）
    expect(warnings.join('\n')).toContain('上次注入可能中断')
    expect(warnings.join('\n')).toContain('CHECKLIST.md')
    expect(outcome.writes.map((w) => w.path)).toContain('CHECKLIST.md')
    // 提示指路 verify
    expect(warnings.join('\n')).toContain('openvibe verify')
  })
})
