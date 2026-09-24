import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ADAPTER_MAIN_PATH } from '@openvibe/adapters'
import {
  PACK_BACKUP_REL,
  PACK_LOCK_REL,
  SYNC_LOCK_REL,
  packLockJson,
  parsePackLock,
  type RetirementState,
} from '@openvibe/core'
// 05c/05d 要直接驱动 clack 的 module mock（覆盖 clean.ts 里的 confirmWithClack），故必须把这个命名导入引进来
import { confirm } from '@clack/prompts'
import type { PackLock } from '@openvibe/shared'
import { cleanAction, CleanError } from '../src/commands/clean'
import { syncAction } from '../src/commands/sync'
import { demoPack, writeBundleFile, type PackFixture } from './helpers/pack-fixture'
import { putFile, treeSnapshot } from './helpers/tree'

/**
 * T10 · `openvibe clean`（m6b FR-6 + 验收 §7.10 a–j）。
 * 分支映射：01↔a 02↔b 03↔c 04↔d 05/05e↔e（05e 另钉 c 的 --force 措辞） 05b/05c/05d↔e2
 * 06↔f 06b/06d↔e3 06c/06g↔f2 06e/06f↔FR-6.6 的两半（I-3） 07↔g 08/08b↔h 09↔i 10↔j。
 * §7.10 之外的契约四支：11（命令注册 + `--json` 形状）11b（`summary.ok` 与退出码同式）
 * 11c（人读轨渲染）12（错误信封）。
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
/** 08/08b 的持锁夹具走真进程（承 apps/cli/test/sync-lock.test.ts 的 CLI-LOCK-01 口径） */
const HERE = dirname(fileURLToPath(import.meta.url))
const HOLDER = join(HERE, 'helpers', 'sync-lock-holder.ts')
/** 11/11b/11c/12 走真子进程：`--json` 契约只有在自己的进程里跑才算被证明（承 diff.test.ts:29 的同一条常量） */
const CLI_ENTRY = join(HERE, '..', 'src', 'index.ts')
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

interface Holder {
  readonly child: ChildProcessWithoutNullStreams
  /** 收工：关 stdin 让夹具自己 release，并等它真退出（承 sync-lock.test.ts:112 的 `stop()` = await close） */
  stop(): Promise<void>
}

/**
 * 08/08b 的持锁夹具。spawn 与「等它抢到锁」拆开：握手断言全在调用方的 try 里，
 * 任何一步抛了都还会走 finally 收工——漏下的持锁孤儿进程会把同项目的用例拖到夹具自己的 60s 兜底。
 */
function startHolder(project: string): Holder {
  const child = spawn(process.execPath, ['--import', 'tsx', HOLDER, project], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin.on('error', () => {}) // 已退出的子进程再 end() 会炸流（承 sync-lock.test.ts:79）
  // close 只能同步挂在 spawn 之后：夹具抢锁失败会以退出码 3 立刻退出，事件过了再挂就永远等不到
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => resolve())
  })
  return {
    child,
    async stop() {
      child.stdin.end()
      await closed
    },
  }
}

/** 等锁落到盘上并核对归属，返回锁的绝对路径与逐字节原文（供事后比对「他人的锁原样在」） */
async function waitLocked(project: string, holderPid: number | undefined) {
  const lockAbs = join(project, SYNC_LOCK_REL)
  // 夹具靠 stdin 生命周期持锁，拿不到异步握手 → 轮询锁文件出现（5s 兜底）
  for (let i = 0; i < 100 && !existsSync(lockAbs); i += 1)
    await new Promise((r) => setTimeout(r, 50))
  expect(existsSync(lockAbs), '夹具未在 5s 内抢到锁').toBe(true)
  const content = readFileSync(lockAbs, 'utf8')
  // 「场上有一把锁文件」不等于「spawn 出来的那个进程持有它」：归属以盘上 pid 为准（承 sync-lock.test.ts:159）
  const held = JSON.parse(content) as { pid: number; command: string }
  expect(held.pid).toBe(holderPid)
  expect(held.command).toBe('sync-holder')
  return { lockAbs, content }
}

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
    // clack 的 module mock 是文件级的、调用日志跨整支文件累加：先清基线，Times(1) 才只数本支自己
    vi.mocked(confirm).mockClear()
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

  // T3 审查留下的两处「无断言的措辞分支」（§7.10 c、e 的文案半边）：--force 的确认文案与 NEED_TTY 的提示文案。
  // 前者若被抄回「保留 N 个已改动的文件」，就是当着用户的面承诺一件马上不做的事（--force 会删掉它们）；
  // 后者在 --force 已在场时仍叫用户「还得加 --force」。两种都是全套绿灯照漏。
  it('CLI-CLEAN-05e: --force 在场时两处措辞不自相矛盾（确认文案不提「保留」，NEED_TTY 不再叫用户加 --force）', async () => {
    vi.mocked(confirm).mockClear()
    // 注入后手改 TERMS.md ⇒ 场上恰好一个 DRIFT，--force 与默认动作的全部差别就在这条文案上
    const driftProject = async (): Promise<string> => {
      const { project } = await injected(fixture())
      putFile(project, 'TERMS.md', '用户注入后手改的内容\n')
      return project
    }
    // 刻意不给 deps.confirm：这一支要的就是真走 confirmWithClack 与 clack 的 module mock 对话。
    // 取「本次新增的那一次调用」而非 .at(-1)：调用日志是文件级累加的，读尾巴会拿到上一支的 message。
    const promptFor = async (force: boolean): Promise<string> => {
      const project = await driftProject()
      const callsBefore = vi.mocked(confirm).mock.calls.length
      vi.mocked(confirm).mockResolvedValueOnce(true)
      await cleanAction({ projectPath: project, force }, { isTTY: true, now: () => NOW })
      const asked = vi.mocked(confirm).mock.calls.slice(callsBefore)
      expect(asked, '一次 clean 只问一次').toHaveLength(1)
      const arg = asked[0]?.[0]
      expect(arg, 'confirmWithClack 应调过 clack 的 confirm').toBeTruthy()
      return String(arg?.message)
    }

    const forced = await promptFor(true)
    expect(forced).toContain('其中 1 个是已改动的文件（--force）')
    expect(forced).not.toContain('保留')
    const kept = await promptFor(false)
    expect(kept).toContain('保留 1 个已改动的文件')
    expect(kept).not.toContain('--force')

    // NEED_TTY 的两条腿都正面钉：只钉反向那句（不许出现「还得加 --force」）的话，
    // 「删掉分叉、一律用新文案」的变异体照样全绿，而没给 --force 的用户会被谎称「--force 已带上」。
    const needTtyMessage = async (force: boolean): Promise<string> => {
      const project = await driftProject()
      const err = await cleanAction(
        { projectPath: project, force },
        { isTTY: false, now: () => NOW },
      ).catch((e: CleanError) => e)
      expect((err as CleanError).code).toBe('NEED_TTY')
      expect(existsSync(join(project, PACK_LOCK_REL)), 'NEED_TTY 那条文案不改零删除的口径').toBe(
        true,
      )
      return (err as Error).message
    }

    const forcedTty = await needTtyMessage(true)
    expect(forcedTty).toContain('加 --yes')
    expect(forcedTty).toContain('--force 已带上')
    expect(forcedTty).not.toContain('还得加 --force')
    const plainTty = await needTtyMessage(false)
    expect(plainTty).toContain('还得加 --force')
    expect(plainTty).not.toContain('--force 已带上')
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

  // f2 点的是两种输入：`packPathSchema` 之前那一档（JSON 根本读不出，走 clean.ts 的 parse catch）
  // 与 06c 那一档（路径全合法、其它字段不符，走 parsePackLock 返回 null）。少一支就等于只测了一半出口。
  it('CLI-CLEAN-06g: lock 是非 JSON 文本 → LOCK_INVALID + 零删除，且与 06c 同一条出口（§7.10 f2 的另一半）', async () => {
    const { project } = await injected(fixture())
    const lockPath = join(project, PACK_LOCK_REL)
    const messages = new Set<string>()

    for (const [label, text] of [
      ['非 JSON', '这不是 JSON{'],
      ['合法 JSON 但字段不符', '{"schemaVersion":1,"pack":"不是对象"}'],
    ] as const) {
      putFile(project, PACK_LOCK_REL, text)
      const before = treeSnapshot(project)

      const err = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW }).catch(
        (e: CleanError) => e,
      )

      expect((err as CleanError).code, label).toBe('LOCK_INVALID')
      expect(existsSync(lockPath), `${label}：lock 必须仍在盘上`).toBe(true)
      expect(readFileSync(lockPath, 'utf8'), `${label}：lock 原文未被改写`).toBe(text)
      expect(treeSnapshot(project), `${label}：零删除`).toEqual(before)
      expect(existsSync(join(project, PACK_BACKUP_REL)), label).toBe(false)
      messages.add((err as Error).message)
    }
    // 同一条出口的断言版：两档共用一段措辞，措辞分叉就说明它们其实走了两条路
    expect(messages.size).toBe(1)
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

describe('lock 净化与并发（§7.10 g、h）', () => {
  it('CLI-CLEAN-07: 篡改 lock 使某条 path 为 ../evil.txt → 整包拒绝，合法条目也不删', async () => {
    const fx = fixture()
    const { root, project } = await injected(fx)
    const lockPath = join(project, PACK_LOCK_REL)
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as PackLock
    // 只篡改第一条：其余条目保持合法，「整包拒绝、合法条目也不删」才是被证明的那件事
    lock.files = lock.files.map((f, i) => (i === 0 ? { ...f, path: '../evil.txt' } : f))
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
    // 快照取整棵 root（承同文件 06e）：项目外长出任何东西都在范围内，不只 evil.txt
    const before = treeSnapshot(root)

    const err = await cleanAction(
      { projectPath: project, yes: true, force: true },
      { now: () => NOW },
    ).catch((e: CleanError) => e)

    expect((err as CleanError).code).toBe('VALIDATION_ERROR')
    expect((err as Error).message).toContain('整包拒绝')
    // 整包拒绝的证据是「清单里恰好只有这一条」：toMatchObject 只查子集，多删/多点名都照样绿
    expect((err as CleanError).details).toEqual({ escapingPaths: ['../evil.txt'] })
    expect(treeSnapshot(root)).toEqual(before)
  })

  it('CLI-CLEAN-08: 另一进程持 sync.lock 时 clean --yes → SYNC_BUSY、零删除、他人的锁原样在', async () => {
    const { project } = await injected(fixture())
    const holder = startHolder(project)
    try {
      const { lockAbs, content: lockBefore } = await waitLocked(project, holder.child.pid)
      const before = treeSnapshot(project)

      const outcome = await cleanAction(
        { projectPath: project, yes: true },
        { now: () => NOW },
      ).catch((e: CleanError) => e)

      expect((outcome as CleanError).code).toBe('SYNC_BUSY')
      expect(treeSnapshot(project)).toEqual(before)
      expect(readFileSync(lockAbs, 'utf8')).toBe(lockBefore)
    } finally {
      await holder.stop()
    }
  })

  // 08 的 removals 非空，抢锁只看 removals 也轮不到它出错；这一支的构造是「零 removal 但仍要 unlink」：
  // 全部登记项 ABSENT（同 06b）⇒ plan.removals 为空，而 FR-6.5 v1.4 的收尾判据 driftKept===0 成立，
  // 尾部照样删 pack.lock.json。抢锁条件若不覆盖它，那次删盘就在锁外（sync 正在写、clean 正在删互吃产物）。
  it('CLI-CLEAN-08b: 零 removal 但收尾要删 lock（全 ABSENT）且他人持锁 → SYNC_BUSY、pack.lock.json 仍在盘上（FR-6.8）', async () => {
    const { project } = await injected(fixture())
    const lock = parsePackLock(readFileSync(join(project, PACK_LOCK_REL), 'utf8'))
    expect(lock, 'sync 后应能读回 lock').not.toBeNull()
    // 用户手工把注入产物删光：lock 还在、盘上一个都不在 ⇒ removals 为空，唯一会发生的是删 lock
    for (const entry of lock?.files ?? []) rmSync(join(project, entry.path), { force: true })
    const holder = startHolder(project)
    try {
      const { lockAbs, content: lockBefore } = await waitLocked(project, holder.child.pid)
      const before = treeSnapshot(project)

      const outcome = await cleanAction(
        { projectPath: project, yes: true },
        { now: () => NOW },
      ).catch((e: CleanError) => e)

      expect((outcome as CleanError).code).toBe('SYNC_BUSY')
      // 这一行是 R-1 的落点：删盘发生在锁外时 lock 已经没了，SYNC_BUSY 也根本抛不出来
      expect(existsSync(join(project, PACK_LOCK_REL)), '被挡下时 lock 必须还归用户').toBe(true)
      expect(treeSnapshot(project)).toEqual(before)
      expect(readFileSync(lockAbs, 'utf8')).toBe(lockBefore)
    } finally {
      await holder.stop()
    }
  })
})

describe('可重放律与 managed 闸（§7.10 i、j）', () => {
  it('CLI-CLEAN-09: sync → clean --yes → 再 sync → diff 退出码 0（退场不残留污染态）', async () => {
    const fx = fixture()
    const { project, bundlePath } = await injected(fx)
    const first = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })
    expect(first.summary.cleaned).toBe(true)

    await syncAction({ projectPath: project, file: bundlePath, yes: true }, { now: () => NOW })
    const { diffAction } = await import('../src/commands/diff')
    const again = await diffAction({ projectPath: project })
    expect(again.exitCode).toBe(0)
    expect(again.clean).toBe(true)
  })

  it('CLI-CLEAN-10: managed:false 不构成删除凭据——用户自有的同名同字节文件留在原样且不进备份', async () => {
    const fx = fixture()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fx)
    const claude = fx.files.find((f) => f.path === 'CLAUDE.md')
    expect(claude, '夹具缺 CLAUDE.md 产物').toBeTruthy()
    // 用户自己写了个同名文件，内容与包逐字节相同（Task 1 §7.10j 的构造）
    putFile(project, 'CLAUDE.md', claude?.content ?? '')
    await syncAction(
      { projectPath: project, file: bundlePath, yes: true, targets: ['cursor'] },
      { now: () => NOW },
    )
    const lock = parsePackLock(readFileSync(join(project, PACK_LOCK_REL), 'utf8'))
    expect(lock?.files.find((f) => f.path === 'CLAUDE.md')?.managed).toBe(false)

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    expect(readFileSync(join(project, 'CLAUDE.md'), 'utf8')).toBe(claude?.content)
    expect(stateMap(outcome.report)['CLAUDE.md']).toBe('FOREIGN')
    expect(existsSync(join(project, ADAPTER_MAIN_PATH.cursor))).toBe(false)
    expect(existsSync(join(project, PACK_BACKUP_REL, STAMP, ADAPTER_MAIN_PATH.cursor))).toBe(true)
    expect(existsSync(join(project, PACK_BACKUP_REL, STAMP, 'CLAUDE.md'))).toBe(false)
    expect(outcome.exitCode).toBe(0)
  })
})

describe('命令注册与 --json 契约（FR-6.10）', () => {
  const runCli = (args: string[], home: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_TOKEN: '', OPENVIBE_SERVER: '' },
    })
  const runClean = (args: string[], home: string) => runCli(['--json', 'clean', ...args], home)
  const newHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), 'ov-clean-home-'))
    roots.push(home)
    return home
  }

  it('CLI-CLEAN-11: `clean` 在命令总览里；--json 输出形状 = {command,report,summary{6+键}}；退出码 0', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    const home = newHome()

    const help = runCli(['--help'], home)
    expect(help.stdout).toContain('clean [options] <projectPath>')

    const out = runClean([project, '--yes'], home)
    expect(out.status, out.stderr).toBe(0)
    const env = JSON.parse(out.stdout) as {
      command: string
      report: { path: string; state: string; action: string }[]
      summary: Record<string, unknown>
    }
    expect(env.command).toBe('clean')
    expect(env.report.length).toBe(fx.files.length)
    expect(env.summary).toMatchObject({ ok: true, backedUpTo: expect.any(String), cleaned: true })
    for (const key of [
      'inSyncRemoved',
      'driftKept',
      'driftForced',
      'absent',
      'backedUpTo',
      'cleaned',
    ])
      expect(Object.hasOwn(env.summary, key), `summary 缺键 ${key}`).toBe(true)
    // FR-6.10 v1.5：六键是下限，hints 必带——否则机器读者只拿到一个没有理由的退出码 2
    expect(Object.hasOwn(env.summary, 'hints'), 'summary 缺键 hints').toBe(true)
    expect(env.summary.hints).toEqual(
      expect.arrayContaining([expect.stringContaining('可手工删除 .openvibe/')]),
    )
    expect(
      env.report.every((r) => ['IN_SYNC', 'DRIFT', 'ABSENT', 'FOREIGN'].includes(r.state)),
    ).toBe(true)
    expect(env.report.every((r) => ['delete', 'keep', 'none'].includes(r.action))).toBe(true)
  })

  it('CLI-CLEAN-11b: 有 DRIFT 残留时 --json ⇒ 退出码 2 且 summary.ok === false（`ok` 与退出码不得各说各话）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    // 造一条真 DRIFT：注入后手改受管的 TERMS.md（构造与进程内的 CLI-CLEAN-02 同一条，区别只在走真子进程）
    putFile(project, 'TERMS.md', '用户注入后手改的内容\n')
    const home = newHome()

    const out = runClean([project, '--yes'], home)

    expect(out.status).toBe(2)
    const env = JSON.parse(out.stdout) as {
      summary: { ok: boolean; exitCode: number; driftKept: number }
    }
    expect(env.summary.ok).toBe(false)
    expect(env.summary.exitCode).toBe(2)
    expect(env.summary.driftKept).toBe(1)
  })

  // 先例：sync.test.ts 的 CLI-JSON-01b（一次不带 --json 的 runCli + 逐条 toContain）。
  // 11/11b/12 全走 --json ⇒ runClean 的 info 段此前零自动覆盖，而它带着全仓唯一一处
  // `inSyncRemoved + driftForced` 加法、四态列宽与 hints 的人读出口。
  it('CLI-CLEAN-11c: 不带 --json 时人读轨渲染四态行与删除统计（--force 的加法看得见）', async () => {
    const fx = fixture()
    const { project } = await injected(fx)
    putFile(project, 'TERMS.md', '用户注入后手改的内容\n')
    const home = newHome()

    const out = runCli(['clean', project, '--yes', '--force'], home)
    expect(out.status, out.stderr).toBe(0)
    const lines = out.stdout.split('\n')
    const hasLine = (prefix: string): boolean => lines.some((l) => l.startsWith(prefix))
    const n = fx.files.length
    expect(out.stdout).toContain(
      `删除 ${String(n)}（受管未改动 ${String(n - 1)} / --force 1），保留 0，已自行退场 0，非我方文件 0（永不删除）`,
    )
    // FOREIGN 为 0 时那句不许谎报有非我方文件
    expect(out.stdout).toContain('非我方文件 0（永不删除）')
    // 状态列按 padEnd(8) 对齐：IN_SYNC 七字符补一格、DRIFT 五字符补三格
    expect(hasLine('IN_SYNC  CLAUDE.md'), out.stdout).toBe(true)
    expect(hasLine('DRIFT    TERMS.md'), out.stdout).toBe(true)
    // 备份行是独立一行（行内那句「备份 <路径>」挂在每条被删文件末尾，不是它）
    expect(hasLine(`备份 ${join(project, PACK_BACKUP_REL)}`), out.stdout).toBe(true)
    expect(hasLine('已删除 pack.lock.json'), out.stdout).toBe(true)
    expect(hasLine('提示 确认无误后可手工删除 .openvibe/'), out.stdout).toBe(true)
  })

  it('CLI-CLEAN-12: 无 lock 时 --json 仍是一个对象且 summary.ok=false + code=NO_LOCK，退出码 1', () => {
    const { project } = sandbox()
    const home = newHome()
    const out = runClean([project, '--yes'], home)
    expect(out.status).toBe(1)
    const env = JSON.parse(out.stdout) as {
      command: string
      summary: { ok: boolean; error: { code: string } }
    }
    expect(env.command).toBe('clean')
    expect(env.summary.ok).toBe(false)
    expect(env.summary.error.code).toBe('NO_LOCK')
  })
})
