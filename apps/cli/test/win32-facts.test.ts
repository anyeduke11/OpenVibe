// apps/cli/test/win32-facts.test.ts —— 三平台语义差的**事实探针**（owner 裁定 2026-09-27：先拿 runner 实测一次）。
// 为什么需要它：win32 上有 4 支 POSIX 语义用例长期 `skipIf`（config/sync/lock 的权限位），而 Windows 的
// `stat.mode` 是 CRT umask 模拟值、不是 NTFS ACL——直接把断言换成「win32 版」会把一个测不到安全属性的
// 数值当成绿灯。本文件因此**不猜**：它把每个平台的原始数值打到日志里（`[win32-facts]` 前缀，
// `gh run view <run> --log-tail | grep win32-facts` 取数），只在「与安全无关」的那半留真断言。
// 唯一的条件式安全断言在第 3 支：链接既然被 realpath 解析到项目外，闸就必须判 ESCAPE；解析不到则只记录。
import {
  chmodSync,
  existsSync,
  lstatSync,
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
import { PACK_LOCK_REL, checkWritePath } from '@openvibe/core'
import { syncAction } from '../src/commands/sync'
import { writeConfigFile } from '../src/config'
import { demoPack, writeBundleFile } from './helpers/pack-fixture'

const NOW = new Date('2026-09-27T10:20:30.400Z')
const IS_WINDOWS = process.platform === 'win32'

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => 'overwrite'),
  isCancel: vi.fn((v: unknown) => v === '__cancel__'),
  confirm: vi.fn(async () => true),
}))

const roots: string[] = []

function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

/** 八进制短写：0o666 → '666'，日志里比十进制好读 */
const oct = (mode: number): string => (mode & 0o777).toString(8)

/**
 * 建「指向已有目录的链接」并回报成败：win32 用 junction（`mklink /J` 不需要提权），
 * 其余平台用 dir symlink。返回值是实测事实，不是断言。
 */
function probeDirLink(target: string, link: string): { created: boolean; error: string | null } {
  try {
    symlinkSync(target, link, IS_WINDOWS ? 'junction' : 'dir')
    return { created: true, error: null }
  } catch (e) {
    return { created: false, error: (e as NodeJS.ErrnoException).code ?? String(e) }
  }
}

describe('CLI-FACT · 平台语义数值记录（三平台都跑，日志即产物）', () => {
  it('CLI-FACT-01: config.json 的 stat.mode 实测值（POSIX 腿断言 0600，win32 只能先量）', () => {
    const home = sandbox('ov-facts-home-')
    const path = writeConfigFile(
      { serverUrl: 'http://127.0.0.1:8787', token: 'a'.repeat(48), port: 8787 },
      home,
    )
    const fresh = statSync(path).mode
    // 先放宽再走写入路径：mode 只在新建时生效，收回靠显式 chmod——win32 的 chmod 只映射只读位
    chmodSync(path, 0o644)
    const widened = statSync(path).mode
    writeConfigFile({ serverUrl: 'http://127.0.0.1:8788', token: 'b'.repeat(48), port: 8788 }, home)
    const rewritten = statSync(path).mode

    console.info(
      `[win32-facts] platform=${process.platform} mode新建=${oct(fresh)}(${fresh.toString(8)}) ` +
        `chmod644后=${oct(widened)} 再写后=${oct(rewritten)} ` +
        `group+other位=${(rewritten & 0o077).toString(8)} 判定=${
          rewritten & 0o077 ? 'win32 权限位不可信，0600 断言换不得' : '本平台上 0o077 归零'
        }`,
    )

    // 与安全无关的那半照断言：文件在、内容按新值覆盖
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8')).port).toBe(8788)
  })

  it('CLI-FACT-02: sync 落盘的受管文件与 lock 的 mode 实测值（POSIX 腿是 CLI-SYNC-03d）', async () => {
    const root = sandbox('ov-facts-sync-')
    const project = join(root, 'proj')
    mkdirSync(project)
    const bundlePath = writeBundleFile(root, demoPack({ targets: ['claude-code', 'cursor'] }))

    await syncAction({ projectPath: project, file: bundlePath, yes: true }, { now: () => NOW })

    const claude = statSync(join(project, 'CLAUDE.md')).mode
    const lock = statSync(join(project, PACK_LOCK_REL)).mode
    // 判据是「与 POSIX 期望值 0644 同不同」，不是「group/other 位是否为零」——0644 本来就有 other 读位
    const posixShape = (claude & 0o777) === 0o644 && (lock & 0o777) === 0o644
    console.info(
      `[win32-facts] platform=${process.platform} 受管文件mode=${oct(claude)} lockmode=${oct(lock)} ` +
        `期望=644 判定=${posixShape ? '与 POSIX 同值，CLI-SYNC-03d 可移植' : '本平台 mode 语义与 POSIX 不同'}`,
    )

    expect(existsSync(join(project, 'CLAUDE.md'))).toBe(true)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
  })

  it('CLI-FACT-03: 目录链接（junction / dir symlink）能否被 realpath 解析 → 决定 win32 逃逸可测性', () => {
    const root = sandbox('ov-facts-link-')
    const outside = join(root, 'outside-dir')
    mkdirSync(outside)
    writeFileSync(join(outside, 'victim.md'), '项目外\n', 'utf8')
    const project = join(root, 'proj')
    mkdirSync(project)
    const link = join(project, 'escape')
    const { created, error } = probeDirLink(outside, link)
    if (!created) {
      console.info(
        `[win32-facts] platform=${process.platform} 建目录链接失败 code=${error} ⇒ 本平台无可测逃逸形态`,
      )
      expect(statSync(project).isDirectory()).toBe(true)
      return
    }

    const st = lstatSync(link)
    let real: string | null = null
    try {
      real = realpathSync(link)
    } catch {
      real = null
    }
    const resolvesOutside = real !== null && real === realpathSync(outside)
    // dirent 分类也要记：treeSnapshot 之类按 readdir 分类的helper会不会把目录链接当文件读，全看这个
    const dirent = readdirSync(project, { withFileTypes: true }).find((d) => d.name === 'escape')
    const check = checkWritePath(project, 'escape/victim.md')

    console.info(
      `[win32-facts] platform=${process.platform} lstat{symlink=${st.isSymbolicLink()} ` +
        `dir=${st.isDirectory()} nlink=${st.nlink}} realpath=${String(real)} 解析到项目外=${resolvesOutside} ` +
        `dirent{symlink=${dirent?.isSymbolicLink()} dir=${dirent?.isDirectory()} file=${dirent?.isFile()}} ` +
        `checkWritePath=${JSON.stringify(check)}`,
    )

    // 条件式安全断言：链接既然被解析到项目外，闸就必须点名 ESCAPE。解析不到时不假断言，只留上面的数值。
    if (resolvesOutside) {
      expect(check).toEqual({ ok: false, reason: 'ESCAPE' })
    } else {
      console.info(
        '[win32-facts] 未解析：逃逸防护在本平台无从判定，数值即结论——不要据此写「win32 已验」',
      )
    }
    expect(readFileSync(join(outside, 'victim.md'), 'utf8')).toBe('项目外\n')
  })
})
