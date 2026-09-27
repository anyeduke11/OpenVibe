// apps/cli/test/inject-hardlink.test.ts —— 免特权链接形状下的 sync / clean 行为（m6b §7.11 / §7.5 / D5）。
// 为什么单开一份：apps/cli/test/{sync,clean}.test.ts 的符号链接逃逸腿用 POSIX symlink，win32 无建链
// 权限只能 `it.skipIf(IS_WINDOWS)` ⇒ 「注入与退场只动项目内」在最现实的 NTFS 攻击形状（`mklink /H`
// 建硬链接不需要特权）上一直没有可执行证据。本文件的三种链接在三个平台都能免特权造出来，全部真跑。
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { PACK_LOCK_REL } from '@openvibe/core'
import { AppError } from '@openvibe/shared'
import { cleanAction } from '../src/commands/clean'
import { syncAction } from '../src/commands/sync'
import { contentOf, demoPack, writeBundleFile, type PackFixture } from './helpers/pack-fixture'

/**
 * 断言映射：01c ↔ §7.11 a（§7.5 的写侧半边）+ owner 裁定「替换式写入，不拒绝」；
 * 01c2 ↔ §7.11 b；01d ↔ §7.5 / §7.11 d「路径解析后逃逸 → 整包拒绝」（换成 junction 后 win32 也可证）；
 * 06g / 06g2 ↔ §7.11 c，即 §6.11 a「删除循环节刻意不改」的正反两面。
 * 判据一律落在磁盘实况与链外那份文件上——被承诺保护的就是它。
 */

const NOW = new Date('2026-09-27T10:20:30.400Z')
const IS_WINDOWS = process.platform === 'win32'

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => 'overwrite'),
  isCancel: vi.fn((v: unknown) => v === '__cancel__'),
  confirm: vi.fn(async () => true),
}))

const roots: string[] = []

function sandbox(): { root: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'ov-hardlink-test-'))
  roots.push(root)
  const project = join(root, 'proj')
  mkdirSync(project)
  return { root, project }
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

/** 指向已有目录的链接：win32 用 junction，其余用 dir symlink，都不需要管理员权限 */
function linkDir(target: string, link: string): void {
  symlinkSync(target, link, IS_WINDOWS ? 'junction' : 'dir')
}

const fixture = (): PackFixture => demoPack({ targets: ['claude-code', 'cursor'] })

const packTextOf = (fx: PackFixture, rel: string): string => {
  const text = contentOf(fx)[rel]
  if (text === undefined) throw new Error(`夹具包里没有 ${rel}，样本失效`)
  return text
}

describe('sync 写侧：硬链接不漏到项目外（§6.11 / §7.11 a）', () => {
  it('CLI-SEC-01c: 受管路径预置成指向项目外的硬链接 → 注入照做、按「解链后新建」落盘、链外那份一字未动', async () => {
    const { root, project } = sandbox()
    const fx = fixture()
    const bundlePath = writeBundleFile(root, fx)
    const outside = join(root, 'outside-target.md')
    writeFileSync(outside, '项目外的重要文件\n', 'utf8')
    const claude = join(project, 'CLAUDE.md')
    linkSync(outside, claude)
    expect(statSync(claude).nlink).toBe(2)

    const outcome = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
    )

    // 不拒绝、不中止：项目是 `cp -al` / 物化快照来的（pnpm store 本身就全是硬链接）属正常场景，
    // 拒绝等于把这类用户挡在注入之外。代价是目标的 inode 换了——这里不赌 inode 复用，只断言解绑。
    expect(outcome.exitCode).toBe(0)
    expect(readFileSync(claude, 'utf8')).toBe(packTextOf(fx, 'CLAUDE.md'))
    expect(readFileSync(outside, 'utf8'), '写穿了链外的文件').toBe('项目外的重要文件\n')
    expect(statSync(outside).nlink).toBe(1)
    // 解链不是静默行为：用户以为覆盖的是项目里那一份，磁盘上还挂着另一处同名内容
    const hints = outcome.hints.join('\n')
    expect(hints).toContain('解链后新建')
    expect(hints).toContain('CLAUDE.md')
    // 备份取「写前磁盘上那一份」= 链外可见的内容，与 clean 侧同口径
    expect(outcome.backupRoot, 'CONFLICT 覆盖前必须有备份').not.toBeNull()
    const backup = join(outcome.backupRoot ?? '', 'CLAUDE.md')
    expect(existsSync(backup), '覆盖前没备份').toBe(true)
    expect(readFileSync(backup, 'utf8')).toBe('项目外的重要文件\n')
    // 其余合法条目照写：一条解链不影响整包（夹具 targets 只有 claude-code + cursor）
    const cursorRule = join(project, '.cursor', 'rules', 'openvibe.mdc')
    expect(readFileSync(cursorRule, 'utf8')).toBe(packTextOf(fx, '.cursor/rules/openvibe.mdc'))
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
  })

  it('CLI-SEC-01c2: 硬链接目标幂等重跑 → 第二次不再报解链，磁盘收敛到包内容', async () => {
    const { root, project } = sandbox()
    const fx = fixture()
    const bundlePath = writeBundleFile(root, fx)
    const outside = join(root, 'outside-target.md')
    writeFileSync(outside, '项目外的重要文件\n', 'utf8')
    const claude = join(project, 'CLAUDE.md')
    linkSync(outside, claude)

    const first = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
    )
    expect(first.hints.join('\n')).toContain('解链后新建')

    const second = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => NOW },
    )

    // 第二次全 IN_SYNC ⇒ 一个受管文件都不写，也就没有解链可报（提示不外溢成常驻噪声）。
    // 不用 treeSnapshot 断言「树不变」：lock 每次都重写，mtime 必然变。
    expect(second.writes).toEqual([])
    expect(second.backupRoot).toBeNull()
    expect(readFileSync(claude, 'utf8')).toBe(packTextOf(fx, 'CLAUDE.md'))
    expect(statSync(claude).nlink).toBe(1)
    expect(readFileSync(outside, 'utf8')).toBe('项目外的重要文件\n')
  })
})

describe('sync 整包闸：目录链接逃逸（§7.5 / §7.11 d，win32 可证形状）', () => {
  it('CLI-SEC-01d: 产物父目录预置成指向项目外的目录链接 → 整包拒绝、escapingPaths 点名、链外目录原样在', async () => {
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture())
    const outside = join(root, 'outside-rules')
    mkdirSync(outside)
    const link = join(project, '.cursor')
    linkDir(outside, link)
    expect(
      realpathSync(link),
      '目录链接未被 realpath 解析到目标：本平台没有可测的逃逸形态（数值见 win32-facts.test.ts）',
    ).toBe(realpathSync(outside))

    // 快照口径不用 treeSnapshot：它按 dirent 分类，目录链接会被当文件读而抛 EISDIR。
    // 「什么都没动」改用逐条落点断言——合法文件的写入点、lock、链外目录三处。
    const error = await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('VALIDATION_ERROR')
    expect((error as AppError).details).toMatchObject({
      escapingPaths: ['.cursor/rules/openvibe.mdc'],
    })
    expect((error as Error).message).toContain('整包拒绝')
    // 整包拒绝而非逐文件跳过：合法文件也没写，链接本身也没被替换，`.openvibe/` 未创建
    expect(existsSync(join(project, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(project, 'CLAUDE.md'))).toBe(false)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)
    expect(readdirSync(outside)).toEqual([])
  })
})

describe('clean 退场侧：硬链接不是违规（FR-6.6 的反面）', () => {
  it('CLI-CLEAN-06g: 受管文件与项目外文件硬链接（逐字节相同）→ 只退场项目内那一项，链外那份留着且已解绑', async () => {
    const { root, project } = sandbox()
    const fx = fixture()
    const bundlePath = writeBundleFile(root, fx)
    await syncAction({ projectPath: project, file: bundlePath, yes: true }, { now: () => NOW })
    const outside = join(root, 'outside-copy.md')
    linkSync(join(project, 'CLAUDE.md'), outside)
    expect(statSync(outside).nlink).toBe(2)
    const packClaude = packTextOf(fx, 'CLAUDE.md')

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    // 不中止：unlink 只动这一个目录项，链外那份本来就在项目内逐字节可见（`copyFileSync` 早已取走）
    expect(outcome.exitCode).toBe(0)
    expect(existsSync(join(project, 'CLAUDE.md')), '受管文件该退场').toBe(false)
    expect(readFileSync(outside, 'utf8')).toBe(packClaude)
    expect(statSync(outside).nlink, '退场把链外那份也带走了').toBe(1)
    expect(existsSync(join(project, PACK_LOCK_REL)), 'lock 一并收尾').toBe(false)
    // 备份仍是逐字节回退凭据：删前磁盘上那一份就是包内容
    const backupRoot = outcome.summary.backedUpTo
    expect(backupRoot, '有删除就必须有备份目录').not.toBeNull()
    expect(readFileSync(join(backupRoot ?? '', 'CLAUDE.md'), 'utf8')).toBe(packClaude)
    const removed = outcome.report.filter((r) => r.path === 'CLAUDE.md').map((r) => r.state)
    expect(removed).toEqual(['IN_SYNC'])
  })

  it('CLI-CLEAN-06g2: 同一条目的链外那份被手改过（不再是 IN_SYNC）→ 本地已改，照既有规矩保留不删', async () => {
    const { root, project } = sandbox()
    const fx = fixture()
    const bundlePath = writeBundleFile(root, fx)
    await syncAction({ projectPath: project, file: bundlePath, yes: true }, { now: () => NOW })
    const outside = join(root, 'outside-copy.md')
    linkSync(join(project, 'CLAUDE.md'), outside)
    // 改链外那份 = 改同一个 inode，项目内这份跟着变 DRIFT：判据是磁盘实况而非「谁动的手」
    writeFileSync(outside, '本地手改\n', 'utf8')
    expect(readFileSync(join(project, 'CLAUDE.md'), 'utf8')).toBe('本地手改\n')

    const outcome = await cleanAction({ projectPath: project, yes: true }, { now: () => NOW })

    expect(outcome.summary.driftKept).toBe(1)
    expect(existsSync(join(project, 'CLAUDE.md')), 'DRIFT 不该被删').toBe(true)
    expect(readFileSync(outside, 'utf8')).toBe('本地手改\n')
  })
})
