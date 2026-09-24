import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  PACK_BACKUP_REL,
  PACK_LOCK_REL,
  packLockJson,
  parsePackLock,
  type RetirementState,
} from '@openvibe/core'
// 05c/05d 要直接驱动 clack 的 module mock（覆盖 clean.ts 里的 confirmWithClack），故必须把这个命名导入引进来
import { confirm } from '@clack/prompts'
import { cleanAction, CleanError } from '../src/commands/clean'
import { syncAction } from '../src/commands/sync'
import { demoPack, writeBundleFile, type PackFixture } from './helpers/pack-fixture'
import { putFile, treeSnapshot } from './helpers/tree'

/**
 * T10 · `openvibe clean`（m6b FR-6 + 验收 §7.10 a–j）。
 * 分支映射：01↔a 02↔b 03↔c 04↔d 05↔e 05b/05c/05d↔e2 06↔f 06b↔e3 06c↔f2 07↔g 08↔h 09↔i 10↔j。
 * 判据一律落在磁盘实况与 lock 读回上——被保护的对象就是那些文件。
 */

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => 'overwrite'),
  isCancel: vi.fn((v: unknown) => v === '__cancel__'),
  confirm: vi.fn(async () => true),
}))

const NOW = new Date('2026-09-24T10:20:30.400Z')
const STAMP = '2026-09-24T10-20-30Z'
/** 符号链接用例的建链权限闸（承 apps/cli/test/sync.test.ts 的 CLI-SEC-01b 口径，三平台 CI） */
const IS_WINDOWS = process.platform === 'win32'
/**
 * 快照键比对用的 lock 路径：`treeSnapshot` 的键恒用 `/` 分隔（helpers/tree.ts:19），
 * 而 `PACK_LOCK_REL` 是 `path.join('.openvibe', 'pack.lock.json')` —— win32 上带反斜杠。
 * 直接拿它当快照键，windows-latest 那条腿就会在「少了一笔 lock」的断言上假红，
 * 故先归一化成 `/` 形式（承 apps/cli/test/sync.test.ts:152 的「期望值写 `/` 路径」口径）。
 */
const PACK_LOCK_KEY = PACK_LOCK_REL.split(/[\\/]/).join('/')
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

  it('CLI-CLEAN-04c: dry-run 不改 exitCode 语义（有 DRIFT 残留时仍为 2）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    putFile(project, 'TERMS.md', '用户改过的术语表\n')
    const before = treeSnapshot(project)
    const dry = await cleanAction(
      { projectPath: project, dryRun: true },
      { isTTY: true, confirm: async () => false, now: () => NOW },
    )
    expect(dry.exitCode).toBe(2)
    expect(dry.summary.driftKept).toBe(1)
    expect(treeSnapshot(project)).toEqual(before)
    const real = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })
    expect(real.exitCode).toBe(dry.exitCode)
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

  it('CLI-CLEAN-05b: TTY 且用户在确认里选「否」→ 什么都不删、退出码 2、cleaned=false（§7.10 e2 / FR-6.9 v1.4）', async () => {
    const { project } = await injected(fixture())
    const before = treeSnapshot(project)
    const outcome = await cleanAction(
      { projectPath: project },
      { isTTY: true, confirm: async () => false, now: () => NOW },
    )
    expect(treeSnapshot(project)).toEqual(before)
    expect(outcome.summary.cleaned).toBe(false)
    expect(outcome.summary.inSyncRemoved).toBe(0)
    // 2 而非 0：0 的口径是「全清」，一次什么都没做的执行报 0 是假信号；1 的枚举里全是错误
    expect(outcome.exitCode).toBe(2)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
    // 取消必须留下可读痕迹：不能既什么都不做又不告诉用户为什么
    expect(outcome.hints.join('\n')).toContain('未删除')
  })

  it('CLI-CLEAN-05c: 真走 confirmWithClack（不注入 deps.confirm）——accept 即删、cancel 即退 2', async () => {
    const { project } = await injected(fixture())
    // 这一支刻意**不给 deps.confirm**，让 clean.ts 里的 confirmWithClack 与 clack 的 module mock 直接对话
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const declined = await cleanAction({ projectPath: project }, { isTTY: true, now: () => NOW })
    expect(declined.exitCode).toBe(2)
    expect(declined.summary.cleaned).toBe(false)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
    expect(vi.mocked(confirm)).toHaveBeenCalledTimes(1)

    vi.mocked(confirm).mockResolvedValueOnce(true)
    const accepted = await cleanAction({ projectPath: project }, { isTTY: true, now: () => NOW })
    expect(accepted.summary.cleaned).toBe(true)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)
    // 同一批文件第二次没有可删项，但 lock 已不存在 ⇒ NO_LOCK（退场收尾的幂等面）
    await expect(
      cleanAction({ projectPath: project }, { isTTY: true, now: () => NOW }),
    ).rejects.toMatchObject({ code: 'NO_LOCK' })
  })

  it('CLI-CLEAN-05d: clack 回传 cancel 哨兵（Ctrl-C）→ 与答「不」同口径，退出码 2 且零删除', async () => {
    const { project } = await injected(fixture())
    const before = treeSnapshot(project)
    vi.mocked(confirm).mockResolvedValueOnce('__cancel__' as unknown as boolean)
    const outcome = await cleanAction({ projectPath: project }, { isTTY: true, now: () => NOW })
    expect(outcome.exitCode).toBe(2)
    expect(outcome.summary.cleaned).toBe(false)
    expect(treeSnapshot(project)).toEqual(before)
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

  it('CLI-CLEAN-06b: 无可删项（全部 ABSENT：用户自己删过注入文件）→ 照样收尾并删 lock，cleaned=true（FR-6.5 v1.4 / §7.10 e3）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    // 用户手工把注入产物删光：lock 还在，盘上一个都不在 ⇒ 全部 ABSENT，removals 为空
    const lock = parsePackLock(readFileSync(join(project, PACK_LOCK_REL), 'utf8'))
    expect(lock, 'sync 后应能读回 lock').not.toBeNull()
    for (const entry of lock?.files ?? []) rmSync(join(project, entry.path), { force: true })
    const before = treeSnapshot(project)

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })
    // 判据是 driftKept===0 而非「本次删了几个」：留着 lock 会让 diff 长报全量缺失且无命令可收尾
    expect(outcome.summary.absent).toBe(lock?.files.length ?? 0)
    expect(outcome.summary.inSyncRemoved).toBe(0)
    expect(outcome.summary.driftKept).toBe(0)
    expect(outcome.summary.cleaned).toBe(true)
    expect(outcome.exitCode).toBe(0)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)
    expect(existsSync(join(project, PACK_BACKUP_REL))).toBe(false)
    // 除 lock 那一笔之外一个字节都没动。目录 mtime 会因 unlink 变化，故只对文件比内容
    const after = treeSnapshot(project)
    expect(Object.keys(before).filter((k) => !(k in after))).toEqual([PACK_LOCK_KEY])
    expect(Object.keys(after).filter((k) => !(k in before))).toEqual([])
    for (const [path, entry] of Object.entries(after)) {
      if (entry.kind !== 'file') continue
      expect(entry.sha256, `${path} 的内容不该被 clean 改动`).toBe(before[path]?.sha256)
    }
  })

  // 06b 钉的是「全 ABSENT」那一半；这一支钉 FR-6.5 v1.4 的另一半「全 FOREIGN」——
  // 旧实现（`removedPaths.size > 0 || ABSENT === files.length`）在这里会把 lock 留在盘上。
  // 与 Task 5 的 CLI-CLEAN-10（§7.10 j）不重复：那一支的判据是「managed:false 的文件不许删」，
  // 这一支的判据是「一个都没删的收尾也算退场成功 ⇒ lock 该消失」。
  it('CLI-CLEAN-06d: 全部登记项 managed:false（全 FOREIGN、文件都在盘上）→ 不动一个文件也照样收尾删 lock（I-1 / FR-6.5 v1.4）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    const lock = parsePackLock(readFileSync(join(project, PACK_LOCK_REL), 'utf8'))
    if (!lock) throw new Error('sync 后应能读回 lock')
    // 只翻 managed 位：分类器据 FR-6.3 判全部 FOREIGN ⇒ removals 为空、driftKept 为 0
    putFile(
      project,
      PACK_LOCK_REL,
      packLockJson({
        ...lock,
        files: lock.files.map((f) => ({ ...f, managed: false })),
      }),
    )
    const before = treeSnapshot(project)

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    expect(outcome.summary).toMatchObject({
      foreign: lock.files.length,
      inSyncRemoved: 0,
      driftKept: 0,
      cleaned: true,
      backedUpTo: null,
    })
    expect(outcome.exitCode).toBe(0)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)
    expect(existsSync(join(project, PACK_BACKUP_REL))).toBe(false)
    // 除了 lock 那一笔，包产物一个都没动（它们不再是「我方写的」，删它们是 §7.10 j 的越权）
    const after = treeSnapshot(project)
    expect(Object.keys(before).filter((k) => !(k in after))).toEqual([PACK_LOCK_KEY])
    expect(Object.keys(after).filter((k) => !(k in before))).toEqual([])
    for (const [path, entry] of Object.entries(after)) {
      if (entry.kind !== 'file') continue
      expect(entry.sha256, `${path} 的内容不该被 clean 改动`).toBe(before[path]?.sha256)
    }
    for (const p of fx.files.map((f) => f.path))
      expect(existsSync(join(project, p)), `${p} 是 FOREIGN，不该被删`).toBe(true)
  })

  // I-3 / FR-6.6：删除循环遇到「路径被判违规」必须整包中止，不能和「文件已不存在」共用 continue。
  // Windows CI 无建链权限，同一条规则由 packages/core/src/inject/security.test.ts 的注入式
  // realpath 覆盖；这里只钉 CLI 侧「抓到之后怎么做」。§7.10 g 的「报告含违规路径」是 Task 4 的闸。
  it.skipIf(IS_WINDOWS)(
    'CLI-CLEAN-06e: 受管文件被换成指向项目外的符号链接 → 整包中止、合法条目也不删、链外文件原样在（I-3 / FR-6.6）',
    async () => {
      const { root, project } = await injected(fixture())
      const outside = join(root, 'outside-target.md')
      writeFileSync(outside, '项目外的重要文件\n', 'utf8')
      rmSync(join(project, 'CLAUDE.md'), { force: true })
      symlinkSync(outside, join(project, 'CLAUDE.md'))
      expect(lstatSync(join(project, 'CLAUDE.md')).isSymbolicLink()).toBe(true)
      // 快照取整个 root：链外的目标也在比对范围内，「顺着链接删」才会被抓到
      const before = treeSnapshot(root)

      const err = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW }).catch(
        (e: CleanError) => e,
      )

      expect(err).toBeInstanceOf(CleanError)
      // 哪一层抓到的都算数（净化闸的归属要在 Task 4 移进 core），但必须是整包中止而非跳过。
      // 「整包」不靠措辞钉：Task 4 重写 core 的文案时 `整包` 二字会让这条测试为无关原因变红，
      // 中止的证据是下面三件事——全树一个字节没动、链外文件还在、lock 仍在（早退路径不收尾）。
      expect(['PATH_ESCAPE', 'VALIDATION_ERROR']).toContain((err as CleanError).code)
      // 措辞无关的「抓到的是哪条路径」：违规路径要么点在 message 里，要么在 details 里。
      const { message, details } = err as CleanError
      expect(`${message} ${JSON.stringify(details ?? '')}`).toContain('CLAUDE.md')
      expect(treeSnapshot(root)).toEqual(before)
      expect(readFileSync(outside, 'utf8')).toBe('项目外的重要文件\n')
      // 早退路径一律保留 lock（FR-6.5 v1.4 末段）
      expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
      expect(existsSync(join(project, PACK_BACKUP_REL))).toBe(false)
    },
  )

  // I-3 的另一半：`!existsSync` 不是违规。lock 可被手改（本项目的全部前提），重复登记同一路径
  // 是 lock 冗余而非安全事件——第二次 unlink 撞不上 ENOENT，也不能被当成 PATH_ESCAPE 而中止。
  // 顺带钉住 Minor 的「按条目计」：4 个文件重复登记一条就报 5。
  it('CLI-CLEAN-06f: lock 把同一路径登记两次 → 第二次按「已不存在」跳过而不中止，计数按条目（I-3 / Minor）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    const lock = parsePackLock(readFileSync(join(project, PACK_LOCK_REL), 'utf8'))
    const dupe = lock?.files[0]
    if (!lock || !dupe) throw new Error('sync 后应能读回含登记项的 lock')
    putFile(project, PACK_LOCK_REL, packLockJson({ ...lock, files: [...lock.files, dupe] }))

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    // 按条目计：重复的那条也进 inSyncRemoved，所以比实删文件数多一个（不是缺陷，是口径）
    expect(outcome.summary.inSyncRemoved).toBe(lock.files.length + 1)
    expect(outcome.summary.inSyncRemoved).toBeGreaterThan(fx.files.length)
    for (const p of fx.files.map((f) => f.path))
      expect(existsSync(join(project, p)), `${p} 应已删除`).toBe(false)
    expect(outcome.summary.driftKept).toBe(0)
    expect(outcome.summary.cleaned).toBe(true)
    expect(outcome.exitCode).toBe(0)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)
    // 备份的是去重后的真实文件数：第二个同名条目根本没走到 copyFileSync
    const backedUp = Object.values(treeSnapshot(join(project, PACK_BACKUP_REL))).filter(
      (e) => e.kind === 'file',
    ).length
    expect(backedUp).toBe(fx.files.length)
  })
})
