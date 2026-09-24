import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ADAPTER_MAIN_PATH } from '@openvibe/adapters'
import { PACK_BACKUP_REL, PACK_LOCK_REL, parsePackLock, type InjectPlanFile } from '@openvibe/core'
import { AppError, type PackBundle } from '@openvibe/shared'
import {
  askWithClack,
  SyncError,
  syncAction,
  uniqueBackupRoot,
  utcStamp,
  type SyncOutcome,
} from '../src/commands/sync'
import { SourceError } from '../src/pack-source'
import {
  contentOf,
  demoPack,
  writeBundleFile,
  writePackDir,
  type PackFixture,
} from './helpers/pack-fixture'
import { fakeClient, onlineSyncRoutes } from './helpers/fake-client'
import { putFile, treeSnapshot } from './helpers/tree'

/**
 * T7d · `openvibe sync`（m6b FR-2/FR-3 + design §7.5/§7.6/§7.7、§9）。
 * 验收映射（dev-plan §9-T7）：§7.1a/b/c → CLI-SYNC-02/03/04，§7.2 → CLI-SYNC-05，
 * §7.3 → CLI-SYNC-06，§7.4 → CLI-SYNC-07，§7.5 → CLI-SEC-01，§7.7 → CLI-JSON-01。
 * 断言一律落在磁盘实际状态上（全树快照 / 逐文件读回）——注入是本机唯一有破坏性的命令。
 */

// @clack 只在「取消语义」用例里被驱动：select 按队列出牌，isCancel 认哨兵值
const clackQueue: string[] = []
vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => clackQueue.shift() ?? 'overwrite'),
  isCancel: vi.fn((value: unknown) => value === '__cancel__'),
  confirm: vi.fn(async () => true),
}))

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts')
const NOW = new Date('2026-09-21T10:20:30.400Z')
const STAMP = '2026-09-21T10-20-30Z'
const IS_WINDOWS = process.platform === 'win32'

const roots: string[] = []

/** 每用例一套沙箱：root/bundle.json + root/proj（bundle 放项目外，dry-run 的树快照才干净） */
function sandbox(): { root: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'ov-sync-test-'))
  roots.push(root)
  const project = join(root, 'proj')
  mkdirSync(project)
  return { root, project }
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

const stateOf = (outcome: SyncOutcome): Record<string, string> =>
  Object.fromEntries(outcome.rows.map((r) => [r.path, r.state]))

const pathOf = (project: string, rel: string): string => join(project, rel)

const backupDir = (project: string, stamp: string): string => join(project, PACK_BACKUP_REL, stamp)

/** 读回文本，不存在返回 null（「零写入」用内容断言比 existsSync 更硬） */
function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

const fiveStateV2 = (): PackFixture =>
  demoPack({
    ruleBody: '第二版',
    targets: ['claude-code', 'cursor', 'generic-agents', 'trae'],
    withSkills: true,
  })

/**
 * 五状态夹具：v1 全量注入 → 手改 AGENTS.md（DRIFT）+ 造非受管 .trae（CONFLICT）
 * → v2 换规则正文（三个主规则文件 UPDATE）+ 加 SKILLS.md（NEW），CHECKLIST/TERMS 未动（IN_SYNC）。
 */
async function seedFiveStateProject(v1: PackFixture, v2: PackFixture) {
  const { root, project } = sandbox()
  const v1Path = writeBundleFile(root, v1, 'v1.json')
  const v2Path = writeBundleFile(root, v2, 'v2.json')
  await syncAction({ projectPath: project, file: v1Path, yes: true }, { now: () => NOW })
  putFile(project, 'AGENTS.md', 'AGENTS.md 本地手改\n')
  putFile(project, ADAPTER_MAIN_PATH.trae, '陌生本地规则文件\n')
  return { root, project, v1Path, v2Path, pack: contentOf(v2) }
}

describe('dry-run 与零副作用（m6b §7.1a / FR-2.3）', () => {
  it('CLI-SYNC-02: dry-run 后整棵树 mtime+sha256 不变、.openvibe 未创建，但计划照算', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')
    putFile(project, 'src/app.ts', 'export const a = 1\n')
    const before = treeSnapshot(project)
    expect(before['.openvibe']).toBeUndefined()

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, dryRun: true },
      { now: () => NOW },
    )

    expect(treeSnapshot(project)).toEqual(before)
    expect(outcome.dryRun).toBe(true)
    expect(outcome.lockPath).toBeNull()
    expect(outcome.backupRoot).toBeNull()
    expect(outcome.exitCode).toBe(0)
    expect(outcome.injectionReported).toBe(false)
    expect(stateOf(outcome)['CLAUDE.md']).toBe('CONFLICT')
    expect(outcome.rows.find((r) => r.path === 'CLAUDE.md')?.action).toBe('backup-write')
    // 计划里确有写入项，但一个字节都不落盘，也不预占备份路径
    expect(outcome.writes.map((w) => w.path)).toContain('CLAUDE.md')
    expect(outcome.writes.every((w) => w.backupPath === null)).toBe(true)
    expect(outcome.hints).toEqual(['dry-run：以上为默认决策下的计划，零写入零备份'])
    expect(outcome.warnings.join('\n')).toContain('1 项待决')
    // 离线上报那条警告也不该出现：dry-run 在上报分支之前就返回了
    expect(outcome.warnings.join('\n')).not.toContain('离线模式')
  })

  it('CLI-SYNC-02b: 全新项目 dry-run 零待决、不产生任何提示', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    const outcome = await syncAction({ projectPath: project, file: bundlePath, dryRun: true })
    expect(outcome.warnings).toEqual([])
    expect(outcome.plan.pending).toEqual([])
    expect(Object.values(stateOf(outcome))).toEqual(v1.files.map(() => 'NEW'))
    expect(outcome.rows.every((r) => r.inScope === true)).toBe(true)
    // 全新项目 dry-run 后仍然只有目录自身
    expect(Object.keys(treeSnapshot(project))).toEqual(['.'])
  })
})

describe('备份、lock 与权限（m6b §7.1b / FR-2.5 / §6.4）', () => {
  it('CLI-SYNC-03: 覆盖前逐文件备份且内容一致，lock 记全量期望哈希，产物 0644', async () => {
    const v1 = demoPack()
    const pack = contentOf(v1)
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    const localClaude = '本地手写规则，与包冲突\n'
    putFile(project, 'CLAUDE.md', localClaude)

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
    )

    expect(outcome.exitCode).toBe(0)
    expect(readOrNull(pathOf(project, 'CLAUDE.md'))).toBe(pack['CLAUDE.md'])
    expect(outcome.lockPath).toBe(join(project, PACK_LOCK_REL))

    const backupFile = join(backupDir(project, STAMP), 'CLAUDE.md')
    expect(outcome.backupRoot).toBe(backupDir(project, STAMP))
    expect(readOrNull(backupFile)).toBe(localClaude)
    expect(outcome.writes.find((w) => w.path === 'CLAUDE.md')?.backupPath).toBe(backupFile)
    // NEW 文件磁盘本来没有 → 不备份
    expect(outcome.writes.find((w) => w.path === 'AGENTS.md')?.backupPath).toBeNull()

    const lock = parsePackLock(readFileSync(outcome.lockPath ?? '', 'utf8'))
    expect(lock?.pack).toMatchObject({
      name: 'fixture',
      version: '1.0.0',
      fingerprint: v1.fingerprint,
    })
    expect(lock?.files.map((f) => f.path).sort()).toEqual(v1.files.map((f) => f.path).sort())
    for (const entry of lock?.files ?? []) {
      expect(entry.sha256, `${entry.path} 的期望哈希`).toBe(
        v1.files.find((f) => f.path === entry.path)?.sha256,
      )
      expect(entry.managed).toBe(true)
    }

    expect(outcome.hints.join('\n')).toContain('.gitignore')

    // 幂等重跑：全 IN_SYNC，不产生第二个备份目录
    const second = await syncAction({ projectPath: project, file: bundlePath, yes: true })
    expect(second.writes).toEqual([])
    expect(second.backupRoot).toBeNull()
    expect(Object.values(stateOf(second)).every((s) => s === 'IN_SYNC')).toBe(true)
  })

  it.skipIf(IS_WINDOWS)(
    'CLI-SYNC-03d: 受管文件与 lock 落盘 0644（win32 无 POSIX 权限位）',
    async () => {
      const v1 = demoPack()
      const { root, project } = sandbox()
      const bundlePath = writeBundleFile(root, v1)
      putFile(project, 'CLAUDE.md', '本地手写规则，与包冲突\n')

      const outcome = await syncAction(
        { projectPath: project, file: bundlePath, yes: true },
        { now: () => NOW },
      )
      expect(statSync(pathOf(project, 'CLAUDE.md')).mode & 0o777).toBe(0o644)
      expect(statSync(outcome.lockPath ?? '').mode & 0o777).toBe(0o644)
    },
  )

  it('CLI-SYNC-03b: 同一时间戳再次备份 → 目录追加 -1，旧备份不被覆盖（§6.4）', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '第一版本地内容\n')
    await syncAction({ projectPath: project, file: bundlePath, yes: true }, { now: () => NOW })

    putFile(project, 'CLAUDE.md', '第二版本地内容\n')
    const again = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
    )
    expect(again.backupRoot).toBe(backupDir(project, `${STAMP}-1`))
    expect(readOrNull(join(backupDir(project, STAMP), 'CLAUDE.md'))).toBe('第一版本地内容\n')
    expect(readOrNull(join(backupDir(project, `${STAMP}-1`), 'CLAUDE.md'))).toBe('第二版本地内容\n')
  })

  it('CLI-SYNC-03c: lock 文件损坏 → 警告并按未注入处理，覆盖前仍备份', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写\n')
    putFile(project, '.openvibe/pack.lock.json', '{ 不是 JSON')
    const warnings: string[] = []

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
      warnings,
    )
    expect(warnings.join('\n')).toContain('pack.lock.json 无法解析')
    expect(stateOf(outcome)['CLAUDE.md']).toBe('CONFLICT')
    expect(outcome.writes.find((w) => w.path === 'CLAUDE.md')?.backupPath).toBeTruthy()
  })

  it('utcStamp / uniqueBackupRoot: 时间戳形态稳定，占用即递增后缀', () => {
    expect(utcStamp(NOW)).toBe(STAMP)
    const { project } = sandbox()
    expect(uniqueBackupRoot(project, STAMP)).toBe(backupDir(project, STAMP))
    mkdirSync(backupDir(project, STAMP), { recursive: true })
    expect(uniqueBackupRoot(project, STAMP)).toBe(backupDir(project, `${STAMP}-1`))
  })
})

describe('交互确认与非 TTY 保护（m6b §7.1c / FR-2.4）', () => {
  it('CLI-SYNC-04: 非 TTY 且无 --yes → NEED_TTY，整棵树零写入', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')
    const before = treeSnapshot(project)

    const error = await syncAction(
      { projectPath: project, file: bundlePath },
      { isTTY: false, now: () => NOW },
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SyncError)
    expect((error as SyncError).code).toBe('NEED_TTY')
    expect((error as SyncError).details).toMatchObject({ pending: ['CLAUDE.md'] })
    expect((error as Error).message).toContain('--yes')
    expect(treeSnapshot(project)).toEqual(before)
  })

  it('CLI-SYNC-04b: TTY 逐项询问，DRIFT 三选项，keep-local 时包内容不落地', async () => {
    const v1 = demoPack()
    const v2 = demoPack({ ruleBody: '第二版', withSkills: true })
    const box = await seedFiveStateProject(v1, v2)
    const asked: InjectPlanFile[] = []

    const outcome = await syncAction(
      { projectPath: box.project, file: box.v2Path },
      {
        isTTY: true,
        ask: async (file) => {
          asked.push(file)
          return file.options.includes('keep-local') ? 'keep-local' : file.defaultDecision
        },
        now: () => new Date('2026-09-22T00:00:00Z'),
      },
    )

    expect(asked.map((f) => f.path)).toEqual(['AGENTS.md'])
    expect(asked[0]?.status).toBe('DRIFT')
    expect(asked[0]?.options).toEqual(['overwrite', 'keep-local', 'skip'])
    expect(asked[0]?.defaultDecision).toBe('overwrite')
    expect(readOrNull(pathOf(box.project, 'AGENTS.md'))).toBe('AGENTS.md 本地手改\n')
    expect(outcome.skipped.find((s) => s.path === 'AGENTS.md')?.why).toBe(
      '检测到漂移，选择保留本地手改',
    )
    // lock 记包侧期望哈希且仍算受管——下次 sync 继续报 DRIFT，不会退化成陌生文件
    const lock = parsePackLock(readFileSync(outcome.lockPath ?? '', 'utf8'))
    expect(lock?.files.find((f) => f.path === 'AGENTS.md')).toMatchObject({
      sha256: v2.files.find((f) => f.path === 'AGENTS.md')?.sha256,
      managed: true,
    })
  })

  it('CLI-SYNC-04c: 交互器未注入 → NO_ASKER；@clack 取消按 skip 处置（不落到破坏性默认值）', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')

    const error = await syncAction(
      { projectPath: project, file: bundlePath },
      { isTTY: true },
    ).catch((e: unknown) => e)
    expect((error as SyncError).code).toBe('NO_ASKER')

    // 询问器收到的就是规划器产出的那一项（选项集由 core 裁定，不在测试里臆造）
    const preview = await syncAction(
      { projectPath: project, file: bundlePath, dryRun: true },
      { isTTY: true },
    )
    const conflict = preview.plan.pending.find((f) => f.status === 'CONFLICT')
    if (!conflict) throw new Error('夹具未产生 CONFLICT 待决项')
    expect(conflict.options).toEqual(['overwrite', 'skip'])

    clackQueue.push('__cancel__')
    expect(await askWithClack(conflict)).toBe('skip')
    clackQueue.push('overwrite')
    expect(await askWithClack(conflict)).toBe('overwrite')
  })

  it('CLI-SYNC-04d: 项目路径不是目录 / 包路径被目录占位 → 明确错误码', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)

    const missing = await syncAction({
      projectPath: join(project, 'nope'),
      file: bundlePath,
    }).catch((e: unknown) => e)
    expect((missing as SyncError).code).toBe('NOT_A_DIRECTORY')

    mkdirSync(pathOf(project, 'CLAUDE.md'))
    const notFile = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
    ).catch((e: unknown) => e)
    expect((notFile as SyncError).code).toBe('NOT_A_FILE')
    expect((notFile as Error).message).toContain('CLAUDE.md')
  })
})

describe('五状态机与包更新（m6b §7.2 / FR-2.2 / §7.7）', () => {
  it('CLI-SYNC-05: NEW/IN_SYNC/UPDATE/CONFLICT/DRIFT 同框 → 默认覆盖后重跑全 IN_SYNC', async () => {
    const v1 = demoPack()
    const v2 = fiveStateV2()
    const box = await seedFiveStateProject(v1, v2)
    const cursor = ADAPTER_MAIN_PATH.cursor
    const trae = ADAPTER_MAIN_PATH.trae

    const outcome = await syncAction(
      { projectPath: box.project, file: box.v2Path },
      {
        isTTY: true,
        ask: async (f) => f.defaultDecision,
        now: () => new Date('2026-09-22T00:00:00Z'),
      },
    )

    expect(stateOf(outcome)).toEqual({
      [cursor]: 'UPDATE',
      [trae]: 'CONFLICT',
      'AGENTS.md': 'DRIFT',
      'CHECKLIST.md': 'IN_SYNC',
      'CLAUDE.md': 'UPDATE',
      'SKILLS.md': 'NEW',
      'TERMS.md': 'IN_SYNC',
    })
    expect(outcome.counts).toEqual({ NEW: 1, IN_SYNC: 2, UPDATE: 2, CONFLICT: 1, DRIFT: 1 })
    expect(outcome.plan.pending.map((p) => p.path)).toEqual([trae, 'AGENTS.md'])
    expect(
      outcome.rows.filter((r) => r.action !== 'skip').map((r) => [r.path, r.state, r.action]),
    ).toEqual([
      [cursor, 'UPDATE', 'backup-write'],
      [trae, 'CONFLICT', 'backup-write'],
      ['AGENTS.md', 'DRIFT', 'backup-write'],
      ['CLAUDE.md', 'UPDATE', 'backup-write'],
      ['SKILLS.md', 'NEW', 'write'],
    ])

    const dir = backupDir(box.project, '2026-09-22T00-00-00Z')
    expect(readOrNull(pathOf(box.project, 'AGENTS.md'))).toBe(box.pack['AGENTS.md'])
    expect(readOrNull(pathOf(box.project, trae))).toBe(box.pack[trae])
    // 被覆盖的旧文件逐个可回滚；NEW 的 SKILLS.md 没有备份
    expect(readOrNull(join(dir, 'AGENTS.md'))).toBe('AGENTS.md 本地手改\n')
    expect(readOrNull(join(dir, trae))).toBe('陌生本地规则文件\n')
    expect(readOrNull(join(dir, 'SKILLS.md'))).toBeNull()

    // §7.2 尾句：修完之后重跑即 clean（diff 命令在 T7e 消费同一份 lock）
    const rerun = await syncAction({ projectPath: box.project, file: box.v2Path, yes: true })
    expect(rerun.writes).toEqual([])
    expect(rerun.skipped.every((s) => s.why === '内容与包一致')).toBe(true)
    expect(rerun.counts).toMatchObject({ NEW: 0, UPDATE: 0, CONFLICT: 0, DRIFT: 0 })
  })

  it('CLI-SYNC-05b: 非受管文件的 keep-local 按 skip 处置（本包从未拥有它）', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, yes: true, strategy: 'keep-local' },
      { now: () => NOW },
    )
    expect(outcome.skipped.find((s) => s.path === 'CLAUDE.md')?.why).toBe(
      '本地文件与包冲突，选择跳过',
    )
    expect(readOrNull(pathOf(project, 'CLAUDE.md'))).toBe('本地手写规则\n')
    expect(outcome.exitCode).toBe(0)
  })

  it('CLI-SYNC-05c: 包更新后消失的旧文件不清理，lock 原样留档（§6.2）', async () => {
    const v1 = demoPack()
    const v2 = demoPack({ targets: ['claude-code'] })
    const { root, project } = sandbox()
    const v1Path = writeBundleFile(root, v1, 'v1.json')
    const v2Path = writeBundleFile(root, v2, 'v2.json')
    await syncAction({ projectPath: project, file: v1Path, yes: true }, { now: () => NOW })

    const outcome = await syncAction(
      { projectPath: project, file: v2Path, yes: true },
      { now: () => NOW },
    )
    const lock = parsePackLock(readFileSync(outcome.lockPath ?? '', 'utf8'))
    const cursorEntry = lock?.files.find((f) => f.path === ADAPTER_MAIN_PATH.cursor)
    expect(cursorEntry?.managed).toBe(true)
    expect(cursorEntry?.sha256).toBe(
      v1.files.find((f) => f.path === ADAPTER_MAIN_PATH.cursor)?.sha256,
    )
    expect(readOrNull(pathOf(project, ADAPTER_MAIN_PATH.cursor))).toBe(
      contentOf(v1)[ADAPTER_MAIN_PATH.cursor],
    )
  })
})

describe('--target 子集与批量策略（m6b FR-2.4 / FR-2.7 / §5.2）', () => {
  it('CLI-SYNC-06d: --target cursor 只写该平台主文件与辅助产物，其余范围外一律 skip', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    const cursor = ADAPTER_MAIN_PATH.cursor

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, targets: ['cursor'] },
      { now: () => NOW },
    )

    expect(outcome.writes.map((w) => w.path).sort()).toEqual(
      [cursor, 'CHECKLIST.md', 'TERMS.md'].sort(),
    )
    expect(outcome.skipped.map((s) => s.path).sort()).toEqual(['AGENTS.md', 'CLAUDE.md'].sort())
    expect(outcome.skipped.every((s) => s.why === '--target 过滤：本次不写入')).toBe(true)
    expect(
      outcome.rows
        .filter((r) => r.inScope === false)
        .map((r) => r.path)
        .sort(),
    ).toEqual(['AGENTS.md', 'CLAUDE.md'])
    expect(readOrNull(pathOf(project, 'CLAUDE.md'))).toBeNull()

    // §7.5：lock 记全量期望哈希，范围外的 managed=false
    const lock = parsePackLock(readFileSync(outcome.lockPath ?? '', 'utf8'))
    expect(lock?.files).toHaveLength(v1.files.length)
    expect(lock?.files.find((f) => f.path === 'CLAUDE.md')?.managed).toBe(false)
    expect(lock?.files.find((f) => f.path === cursor)?.managed).toBe(true)

    // 下次全量 sync：非受管 + 本地已存在且不同 → CONFLICT（lock 里仍有期望哈希可解释来源）
    putFile(project, 'CLAUDE.md', '用户自己写的\n')
    const full = await syncAction({ projectPath: project, file: bundlePath, yes: true })
    expect(stateOf(full)['CLAUDE.md']).toBe('CONFLICT')
    expect(full.plan.files.find((f) => f.path === 'CLAUDE.md')?.lockSha256).toBe(
      v1.files.find((f) => f.path === 'CLAUDE.md')?.sha256,
    )
    expect(
      parsePackLock(readFileSync(full.lockPath ?? '', 'utf8'))?.files.find(
        (f) => f.path === 'CLAUDE.md',
      )?.managed,
    ).toBe(true)
  })

  it('CLI-SYNC-06e: --target 指向包里没有产物的平台 → 警告一句，其余产物照写', async () => {
    const v1 = demoPack({ targets: ['claude-code'] })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, targets: ['trae', 'claude-code'] },
      { now: () => NOW },
    )
    expect(outcome.warnings.join('\n')).toContain(ADAPTER_MAIN_PATH.trae)
    // 主规则文件按 claude-code 命中，辅助产物（TERMS/CHECKLIST）恒在写入范围内
    expect(outcome.writes.map((w) => w.path).sort()).toEqual(
      ['CLAUDE.md', 'CHECKLIST.md', 'TERMS.md'].sort(),
    )
    expect(readOrNull(pathOf(project, ADAPTER_MAIN_PATH.trae))).toBeNull()
  })

  it('CLI-SYNC-07d: --yes --strategy skip 把冲突留在磁盘外 → 退出码 2（CI 可区分「有冲突」）', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, yes: true, strategy: 'skip' },
      { now: () => NOW },
    )
    expect(outcome.exitCode).toBe(2)
    expect(outcome.plan.pending.length).toBe(1)
    expect(readOrNull(pathOf(project, 'CLAUDE.md'))).toBe('本地手写规则\n')
    expect(outcome.backupRoot).toBeNull()
    expect(outcome.skipped.find((s) => s.path === 'CLAUDE.md')?.why).toBe(
      '本地文件与包冲突，选择跳过',
    )
    // 其余 NEW 文件照常写入，lock 照写
    expect(stateOf(outcome)['AGENTS.md']).toBe('NEW')
    expect(outcome.lockPath).toBe(join(project, PACK_LOCK_REL))
  })

  it('CLI-SYNC-07e: 无待决项时 --strategy skip 不算冲突 → 退出码 0', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, yes: true, strategy: 'skip' },
      { now: () => NOW },
    )
    expect(outcome.exitCode).toBe(0)
    expect(outcome.counts.NEW).toBe(v1.files.length)
  })

  it('CLI-SYNC-07f: --strategy 只在 --yes 下生效（不带 --yes 仍要求确认）', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')
    const error = await syncAction(
      { projectPath: project, file: bundlePath, strategy: 'overwrite' },
      { isTTY: false },
    ).catch((e: unknown) => e)
    expect((error as SyncError).code).toBe('NEED_TTY')
  })
})

describe('注入历史上报与离线降级（m6b §7.3 / FR-2.5）', () => {
  it('CLI-SYNC-06: 离线 --file 完成注入，只警告不上报；在线则 POST /api/injections 并回调遥测钩子', async () => {
    const v1 = demoPack()
    const pack = contentOf(v1)
    const off = sandbox()
    const offBundle = writeBundleFile(off.root, v1)
    const offline = await syncAction(
      { projectPath: off.project, file: offBundle, yes: true },
      { now: () => NOW },
    )
    expect(offline.injectionReported).toBe(false)
    expect(offline.warnings.join('\n')).toContain('离线模式：跳过注入历史上报')
    expect(offline.lockPath).toBe(join(off.project, PACK_LOCK_REL))
    expect(readOrNull(pathOf(off.project, 'CLAUDE.md'))).toBe(pack['CLAUDE.md'])

    const on = sandbox()
    const onBundle = writeBundleFile(on.root, v1)
    const routes = onlineSyncRoutes()
    const { client, calls } = fakeClient(routes)
    const injected: { name: string; version: string }[] = []
    const online = await syncAction(
      { projectPath: on.project, file: onBundle, yes: true },
      { client, now: () => NOW, onInjected: async (p) => void injected.push(p) },
    )
    expect(online.injectionReported).toBe(true)
    expect(online.warnings).toEqual([])
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/injections',
        body: {
          packId: 'pk_fixture',
          packVersion: '1.0.0',
          projectPath: online.projectPath,
        },
      },
    ])
    expect(injected).toEqual([{ name: 'fixture', version: '1.0.0' }])
  })

  it('CLI-SYNC-06b: 上报失败只降级为警告；零写入时不触发遥测钩子', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    const routes = onlineSyncRoutes()
    const { client, calls } = fakeClient({
      get: routes.get,
      post: routes.post,
      failOn: ['/api/injections'],
    })
    let hook = 0
    const deps = {
      client,
      now: () => NOW,
      onInjected: async () => {
        hook += 1
      },
    }
    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true }, deps)
    expect(outcome.injectionReported).toBe(false)
    expect(outcome.warnings.join('\n')).toContain('注入历史上报失败')
    expect(readOrNull(pathOf(project, 'AGENTS.md'))).toBe(contentOf(v1)['AGENTS.md'])
    expect(hook).toBe(1)

    const again = await syncAction({ projectPath: project, file: bundlePath, yes: true }, deps)
    expect(again.writes).toEqual([])
    expect(hook).toBe(1)
    expect(calls.filter((c) => c.path === '/api/injections')).toHaveLength(2)
  })

  it('CLI-SYNC-06c: --dir 目录导出与 bundle 等价（同一指纹与文件集，产物路径同规则）', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const dir = writePackDir(root, v1)
    const outcome = await syncAction({ projectPath: project, dir, yes: true }, { now: () => NOW })
    expect(outcome.pack).toMatchObject({
      name: 'fixture',
      version: '1.0.0',
      fingerprint: v1.fingerprint,
      origin: dir,
    })
    expect(outcome.counts.NEW).toBe(v1.files.length)
    expect(readOrNull(pathOf(project, 'TERMS.md'))).toBe(contentOf(v1)['TERMS.md'])
  })
})

describe('包完整性与来源校验（m6b §7.4 / §6.7 / FR-2.1）', () => {
  it('CLI-SYNC-07: 篡改 bundle 一律整包拒绝、零写入', async () => {
    const v1 = demoPack()
    const cases: { label: string; mutate: (b: PackBundle) => void; code: string }[] = [
      {
        label: '改文件内容',
        mutate: (b) => {
          const first = b.files[0]
          if (first) first.content = `${first.content}注入恶意段落\n`
        },
        code: 'CONTENT_MODIFIED',
      },
      {
        label: '删一个文件',
        mutate: (b) => {
          b.files = b.files.slice(1)
        },
        code: 'MANIFEST_MISMATCH',
      },
      {
        label: '换成别的包的指纹',
        mutate: (b) => {
          b.manifest.fingerprint = demoPack({ ruleBody: '别的' }).fingerprint
        },
        code: 'FINGERPRINT_MISMATCH',
      },
      {
        label: 'bundleSchemaVersion 超前',
        mutate: (b) => {
          b.bundleSchemaVersion = 2 as unknown as 1
        },
        code: 'SCHEMA_UNSUPPORTED',
      },
    ]

    for (const c of cases) {
      const { root, project } = sandbox()
      const tampered = JSON.parse(JSON.stringify(v1.bundle)) as PackBundle
      c.mutate(tampered)
      const bundlePath = join(root, 'tampered.json')
      writeFileSync(bundlePath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8')
      const before = treeSnapshot(project)

      const error = await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch(
        (e: unknown) => e,
      )
      expect(error, c.label).toBeInstanceOf(SourceError)
      expect((error as SourceError).code, c.label).toBe(c.code)
      expect(treeSnapshot(project), `${c.label} 之后不应有任何写入`).toEqual(before)
    }
  })

  it('CLI-SYNC-07b: 来源三选一与离线必需参数、坏 JSON/缺文件各有码', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)

    const conflict = await syncAction(
      { projectPath: project, file: bundlePath, pack: 'fixture@1.0.0' },
      { client: fakeClient().client },
    ).catch((e: unknown) => e)
    expect((conflict as SourceError).code).toBe('SOURCE_CONFLICT')
    expect((conflict as Error).message).toContain('三选一')

    const noSource = await syncAction({ projectPath: project }).catch((e: unknown) => e)
    expect((noSource as SyncError).code).toBe('NO_SOURCE')
    expect((noSource as Error).message).toContain('--file')

    const unreadable = await syncAction({
      projectPath: project,
      file: join(root, 'missing.json'),
    }).catch((e: unknown) => e)
    expect((unreadable as SourceError).code).toBe('SOURCE_READ')

    const notJson = join(root, 'broken.json')
    writeFileSync(notJson, '{', 'utf8')
    const badJson = await syncAction({ projectPath: project, file: notJson }).catch(
      (e: unknown) => e,
    )
    expect((badJson as SourceError).code).toBe('BAD_JSON')
  })
})

describe('路径攻击防线（m6b §7.5 / design §7.7 / §6.1）', () => {
  it('CLI-SEC-01: manifest 里的 ../evil.txt 整包拒绝，越界文件不存在', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const hostile = JSON.parse(JSON.stringify(v1.bundle)) as PackBundle
    const first = hostile.files[0]
    const firstManifest = hostile.manifest.files[0]
    if (!first || !firstManifest) throw new Error('夹具包为空，无法构造攻击样本')
    first.path = '../evil.txt'
    firstManifest.path = '../evil.txt'
    const bundlePath = join(root, 'hostile.json')
    writeFileSync(bundlePath, `${JSON.stringify(hostile, null, 2)}\n`, 'utf8')
    const before = treeSnapshot(project)

    const error = await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(SourceError)
    expect((error as SourceError).code).toBe('BUNDLE_INVALID')
    expect((error as Error).message).toContain('非法相对路径')
    expect(readOrNull(join(root, 'evil.txt'))).toBeNull()
    expect(treeSnapshot(project)).toEqual(before)
  })

  // 语法层（manifest schema）之外的第二道防线：路径合法但解析后逃逸项目根。
  // Windows CI 无建符号链接权限，该分支由 packages/core 的注入式 realpath 覆盖。
  it.skipIf(IS_WINDOWS)(
    'CLI-SEC-01b: 符号链接逃逸 → escapingPaths 违规、整包零写入且链外文件未被改',
    async () => {
      const v1 = demoPack()
      const { root, project } = sandbox()
      const bundlePath = writeBundleFile(root, v1)
      const outside = join(root, 'outside-target.md')
      writeFileSync(outside, '项目外的重要文件\n', 'utf8')
      symlinkSync(outside, pathOf(project, 'CLAUDE.md'))
      expect(lstatSync(pathOf(project, 'CLAUDE.md')).isSymbolicLink()).toBe(true)
      const before = treeSnapshot(root)

      const error = await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch(
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('VALIDATION_ERROR')
      expect((error as AppError).details).toMatchObject({ escapingPaths: ['CLAUDE.md'] })
      expect((error as Error).message).toContain('整包拒绝')
      // 整包拒绝而非逐文件跳过：合法文件也没写，链接本身也没被替换
      expect(readOrNull(pathOf(project, 'AGENTS.md'))).toBeNull()
      expect(treeSnapshot(root)).toEqual(before)
    },
  )
})

describe('--json 契约与退出码（m6b §5 / §7.7，真子进程）', () => {
  const runCli = (args: string[], home: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_TOKEN: '', OPENVIBE_SERVER: '' },
    })

  const tempHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), 'ov-sync-home-'))
    roots.push(home)
    return home
  }

  interface Envelope {
    command: string
    plan?: { state: string; path: string; action: string; sizeBytes: number; inScope: boolean }[]
    report?: { path: string; state: string; action: string }[]
    summary: Record<string, unknown> & {
      ok: boolean
      error?: { code: string }
      counts?: Record<string, number>
    }
  }

  it('CLI-JSON-01: --json 的 stdout 只有一个可解析对象，plan 覆盖全部五类状态', async () => {
    const box = await seedFiveStateProject(demoPack(), fiveStateV2())
    const home = tempHome()

    const res = runCli(['--json', 'sync', box.project, '--file', box.v2Path, '--yes'], home)
    expect(res.status).toBe(0)
    const env = JSON.parse(res.stdout) as Envelope
    expect(res.stdout).toBe(`${JSON.stringify(env, null, 2)}\n`)
    expect(env.command).toBe('sync')
    expect(env.plan).toHaveLength(7)
    expect(new Set(env.plan?.map((p) => p.state))).toEqual(
      new Set(['NEW', 'IN_SYNC', 'UPDATE', 'CONFLICT', 'DRIFT']),
    )
    expect(
      env.plan?.every((p) => typeof p.sizeBytes === 'number' && typeof p.inScope === 'boolean'),
    ).toBe(true)
    expect(Object.keys(env.summary.counts ?? {}).sort()).toEqual(
      ['CONFLICT', 'DRIFT', 'IN_SYNC', 'NEW', 'UPDATE'].sort(),
    )
    expect(env.summary).toMatchObject({
      ok: true,
      dryRun: false,
      written: 5,
      skipped: 2,
      pending: 2,
      injectionReported: false,
      exitCode: 0,
    })
    expect(env.summary.lockPath).toBe(join(box.project, PACK_LOCK_REL))
    expect(env.report?.map((r) => r.action)).toEqual(expect.arrayContaining(['write', 'skip']))
    // 无令牌 → 不建客户端：遥测两段都落成 offline（而不是缺字段），提示折叠进 summary.warnings
    expect(env.summary.telemetry).toEqual({ reported: 'offline', ask: 'offline' })
    expect((env.summary.warnings as string[]).join('\n')).toContain('离线模式：跳过注入历史上报')
  })

  it('CLI-JSON-01b: 人读模式渲染五状态表格（与 --json 同一份 rows）', async () => {
    const box = await seedFiveStateProject(demoPack(), fiveStateV2())
    const home = tempHome()

    const res = runCli(['sync', box.project, '--file', box.v2Path, '--yes'], home)
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('状态')
    for (const state of ['NEW', 'IN_SYNC', 'UPDATE', 'CONFLICT', 'DRIFT']) {
      expect(res.stdout).toContain(state)
    }
    expect(res.stdout).toContain('提示 建议把 .openvibe/backup/ 加入 .gitignore')
    expect(res.stdout).toContain(join(box.project, '.openvibe', 'pack.lock.json'))
  })

  it('CLI-JSON-01c: 非 TTY 无 --yes → 退出码 1 + error.code=NEED_TTY，磁盘零变化', async () => {
    const v1 = demoPack()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, v1)
    putFile(project, 'CLAUDE.md', '本地手写规则\n')
    const home = tempHome()
    const before = treeSnapshot(project)

    const res = runCli(['--json', 'sync', project, '--file', bundlePath], home)
    expect(res.status).toBe(1)
    const env = JSON.parse(res.stdout) as Envelope
    expect(env.summary.ok).toBe(false)
    expect(env.summary.error?.code).toBe('NEED_TTY')
    expect(treeSnapshot(project)).toEqual(before)
  })

  it('CLI-JSON-01d: --dry-run 与 --strategy skip 的退出码分别经子进程落地（0 与 2）', async () => {
    const v1 = demoPack()
    const dry = sandbox()
    const dryBundle = writeBundleFile(dry.root, v1)
    putFile(dry.project, 'CLAUDE.md', '本地手写规则\n')
    const home = tempHome()

    const dryRun = runCli(['--json', 'sync', dry.project, '--file', dryBundle, '--dry-run'], home)
    expect(dryRun.status).toBe(0)
    const dryEnv = JSON.parse(dryRun.stdout) as Envelope
    // dry-run 下 written 是「计划写入数」，落盘与否看 lockPath/backupRoot（消费方按 dryRun 分支）
    expect(dryEnv.summary).toMatchObject({ dryRun: true, lockPath: null, backupRoot: null })
    expect(dryEnv.summary.written).toBe(5)
    expect(dryEnv.summary.hints).toEqual(['dry-run：以上为默认决策下的计划，零写入零备份'])
    expect(readOrNull(pathOf(dry.project, 'CLAUDE.md'))).toBe('本地手写规则\n')
    expect(Object.keys(treeSnapshot(dry.project)).sort()).toEqual(['.', 'CLAUDE.md'])

    const skip = sandbox()
    const skipBundle = writeBundleFile(skip.root, v1)
    putFile(skip.project, 'CLAUDE.md', '本地手写规则\n')
    const skipped = runCli(
      ['--json', 'sync', skip.project, '--file', skipBundle, '--yes', '--strategy', 'skip'],
      home,
    )
    expect(skipped.status).toBe(2)
    expect((JSON.parse(skipped.stdout) as Envelope).summary.exitCode).toBe(2)
  })

  it('CLI-JSON-01e: 坏旗标由 commander 挡住（未知 --target / 非法 --strategy），退出码 1', () => {
    const home = tempHome()
    const badTarget = runCli(['sync', '/tmp', '--target', 'not-a-platform'], home)
    expect(badTarget.status).toBe(1)
    expect(`${badTarget.stderr}${badTarget.stdout}`).toContain('未知平台')

    const badStrategy = runCli(['sync', '/tmp', '--strategy', 'force'], home)
    expect(badStrategy.status).toBe(1)
    expect(`${badStrategy.stderr}${badStrategy.stdout}`).toContain('不是合法策略')
  })
})
