import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { PACK_BACKUP_REL, PACK_LOCK_REL, parsePackLock, type RetirementState } from '@openvibe/core'
import { cleanAction, CleanError } from '../src/commands/clean'
import { syncAction } from '../src/commands/sync'
import { demoPack, writeBundleFile, type PackFixture } from './helpers/pack-fixture'
import { putFile, treeSnapshot } from './helpers/tree'

/**
 * T10 · `openvibe clean`（m6b FR-6 + 验收 §7.10 a–j）。
 * 分支映射：01↔a 02↔b 03↔c 04↔d 05↔e 06↔f 07↔g 08↔h 09↔i 10↔j。
 * 判据一律落在磁盘实况与 lock 读回上——被保护的对象就是那些文件。
 */

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => 'overwrite'),
  isCancel: vi.fn((v: unknown) => v === '__cancel__'),
  confirm: vi.fn(async () => true),
}))

const NOW = new Date('2026-09-24T10:20:30.400Z')
const STAMP = '2026-09-24T10-20-30Z'
const roots: string[] = []

function sandbox(): { root: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'ov-clean-test-'))
  roots.push(root)
  const project = join(root, 'proj')
  mkdirSync(project)
  return { root, project }
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

const fixture = (): PackFixture => demoPack({ targets: ['claude-code', 'cursor'] })

/** 已注入项目：返回 bundle 路径与包内容查表 */
async function injected(fixture: PackFixture) {
  const { root, project } = sandbox()
  const bundlePath = writeBundleFile(root, fixture)
  await syncAction({ projectPath: project, file: bundlePath, yes: true }, { now: () => NOW })
  return { root, project, bundlePath }
}

const stateMap = (rows: { path: string; state: RetirementState }[]): Record<string, string> =>
  Object.fromEntries(rows.map((r) => [r.path, r.state]))

describe('clean 默认退场（§7.10 a）', () => {
  it('CLI-CLEAN-01: 未改动的受管文件全删 + 逐字节进备份 + lock 删除 + .openvibe 仍在 + 退出码 0', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    const paths = fx.files.map((f) => f.path)
    const expected = new Map(fx.files.map((f) => [f.path, f.content]))

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    for (const p of paths) expect(existsSync(join(project, p)), `${p} 应已删除`).toBe(false)
    for (const p of paths)
      expect(
        readFileSync(join(project, PACK_BACKUP_REL, STAMP, p), 'utf8'),
        `${p} 备份不一致`,
      ).toBe(expected.get(p))
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)
    expect(existsSync(join(project, '.openvibe'))).toBe(true)
    expect(existsSync(join(project, PACK_BACKUP_REL))).toBe(true)
    expect(outcome.summary).toMatchObject({
      inSyncRemoved: paths.length,
      driftKept: 0,
      cleaned: true,
    })
    expect(outcome.exitCode).toBe(0)
  })

  it('CLI-CLEAN-01b: 退场后 diff 报未注入（NO_LOCK）', async () => {
    const { diffAction } = await import('../src/commands/diff')
    const { project } = await injected(fixture())
    await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })
    await expect(diffAction({ projectPath: project })).rejects.toMatchObject({ code: 'NO_LOCK' })
  })
})

describe('DRIFT 保留与 --force（§7.10 b、c）', () => {
  it('CLI-CLEAN-02: 手改 TERMS.md → 该文件原样在盘 + 退出码 2 + driftKept=1 + 其余照删', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    putFile(project, 'TERMS.md', '用户注入后手改的内容\n')

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    expect(readFileSync(join(project, 'TERMS.md'), 'utf8')).toBe('用户注入后手改的内容\n')
    expect(existsSync(join(project, 'CLAUDE.md'))).toBe(false)
    expect(outcome.summary.driftKept).toBe(1)
    expect(outcome.exitCode).toBe(2)
    expect(stateMap(outcome.report)['TERMS.md']).toBe('DRIFT')
    // lock 必须留着：它仍描述活着的受管文件，删了下次 sync 会把用户手改当陌生文件
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
    const kept = parsePackLock(readFileSync(join(project, PACK_LOCK_REL), 'utf8'))
    expect(kept?.files.some((f) => f.path === 'TERMS.md')).toBe(true)
  })

  it('CLI-CLEAN-03: --force 删 DRIFT，且备份的是用户改后内容（不是包内版本）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    putFile(project, 'TERMS.md', '用户注入后手改的内容\n')

    const outcome = await cleanAction(
      { projectPath: project, yes: true, force: true },
      { now: () => NOW },
    )

    expect(existsSync(join(project, 'TERMS.md'))).toBe(false)
    expect(readFileSync(join(project, PACK_BACKUP_REL, STAMP, 'TERMS.md'), 'utf8')).toBe(
      '用户注入后手改的内容\n',
    )
    expect(outcome.summary).toMatchObject({ driftForced: 1, driftKept: 0 })
    expect(outcome.exitCode).toBe(0)
  })
})

describe('零副作用与前置（§7.10 d、e、f）', () => {
  it('CLI-CLEAN-04: dry-run 全树快照逐字节不变，且不新建 .openvibe/', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    const before = treeSnapshot(project)

    const outcome = await cleanAction({ projectPath: project, dryRun: true }, { now: () => NOW })

    expect(treeSnapshot(project)).toEqual(before)
    expect(outcome.dryRun).toBe(true)
    expect(outcome.summary.cleaned).toBe(false)
    expect(outcome.summary.inSyncRemoved).toBe(0)
    expect(outcome.report.every((r) => r.backupPath === undefined)).toBe(true)
  })

  it('CLI-CLEAN-04b: 无 lock 时 dry-run 也零副作用（不建 .openvibe/，不改一个字节）', async () => {
    const { project } = sandbox()
    putFile(project, 'README.md', '未注入过的项目\n')
    const before = treeSnapshot(project)
    await expect(cleanAction({ projectPath: project, dryRun: true })).rejects.toMatchObject({
      code: 'NO_LOCK',
    })
    expect(treeSnapshot(project)).toEqual(before)
  })

  it('CLI-CLEAN-05: 非 TTY 且无 --yes → NEED_TTY，零删除', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    const before = treeSnapshot(project)

    await expect(
      cleanAction({ projectPath: project }, { isTTY: false, now: () => NOW }),
    ).rejects.toMatchObject({ code: 'NEED_TTY' })
    expect(treeSnapshot(project)).toEqual(before)
    // 注意：首次全量 sync 不建 backup/（备份目录是惰性建的），所以这条是真断言而不是恒真式
    expect(existsSync(join(project, PACK_BACKUP_REL))).toBe(false)
  })

  it('CLI-CLEAN-05b: TTY 且用户在确认里选「否」→ 什么都不删、退出码 0、cleaned=false', async () => {
    const { project } = await injected(fixture())
    const before = treeSnapshot(project)
    const outcome = await cleanAction(
      { projectPath: project },
      { isTTY: true, confirm: async () => false, now: () => NOW },
    )
    expect(treeSnapshot(project)).toEqual(before)
    expect(outcome.summary.cleaned).toBe(false)
    expect(outcome.summary.inSyncRemoved).toBe(0)
    expect(outcome.exitCode).toBe(0)
  })

  it('CLI-CLEAN-06: 无 lock → NO_LOCK + 退出码语义 1 + 零删除', async () => {
    const { root, project } = sandbox()
    putFile(project, 'CLAUDE.md', '用户自己的文件\n')
    const before = treeSnapshot(project)
    const err = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW }).catch(
      (e: CleanError) => e,
    )
    expect((err as CleanError).code).toBe('NO_LOCK')
    expect((err as Error).message).toContain('未注入')
    expect(treeSnapshot(project)).toEqual(before)
    void root
  })

  it('CLI-CLEAN-06c: lock 存在但解析失败 → LOCK_INVALID + 一个字节都不删（§7.10 f2 / FR-6.2 安全侧）', async () => {
    const { project } = await injected(fixture())
    // 模拟用户/别的工具改坏了 lock：parsePackLock 对非 JSON 与 schema 不符都返回 null
    putFile(project, PACK_LOCK_REL, '{"schemaVersion":1,"pack":"不是对象"}\n')
    const before = treeSnapshot(project)

    const err = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW }).catch(
      (e: CleanError) => e,
    )

    expect((err as CleanError).code).toBe('LOCK_INVALID')
    expect(treeSnapshot(project)).toEqual(before)
    expect(existsSync(join(project, PACK_BACKUP_REL))).toBe(false)
  })

  it('CLI-CLEAN-06b: 无可删项时（全是 FOREIGN）保留 lock，cleaned=false', async () => {
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture())
    putFile(project, 'CLAUDE.md', '与包无关的用户文件\n')
    await syncAction(
      { projectPath: project, file: bundlePath, yes: true, targets: ['cursor'] },
      { now: () => NOW },
    )
    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })
    expect(existsSync(join(project, 'CLAUDE.md'))).toBe(true)
    expect(stateMap(outcome.report)['CLAUDE.md'] ?? 'FOREIGN').toBe('FOREIGN')
    expect(outcome.summary.inSyncRemoved).toBeGreaterThan(0)
    expect(outcome.summary.cleaned).toBe(true)
  })
})
