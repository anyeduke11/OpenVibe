// packages/core/src/inject/security-link.test.ts —— 免特权链接形状下的逃逸判定（design §7.7 规则 3 / D5）。
// 承 security.test.ts 的 UT-INJECT-SEC-02：那两支「真实链接」用 POSIX symlink，win32 无建链权限只能
// `it.skipIf(IS_WINDOWS)` ⇒ 逃逸防护在 windows runner 上至今是未验证面。本文件换成三个平台都**不需要
// 管理员权限**就能造的链接：硬链接（`mklink /H`）与卷接点 junction（`mklink /J`），三条断言都会真跑。
import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkWritePath, resolveWriteTarget } from './security'

const IS_WINDOWS = process.platform === 'win32'
const roots: string[] = []

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-inject-link-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

/**
 * 建「指向已有目录的链接」：win32 用 junction，其余平台用 dir symlink——两者都不需要提权。
 * junction 是否被 realpath 解析属于 runner 事实，不靠猜：下面那条腿先当场判定，判红会直接说明
 * 「本平台没有可测的逃逸形态」，原始数值由 apps/cli/test/win32-facts.test.ts 记录。
 */
function linkDir(target: string, link: string): void {
  symlinkSync(target, link, IS_WINDOWS ? 'junction' : 'dir')
}

describe('UT-INJECT-SEC-02L · 硬链接与目录链接（三平台真跑）', () => {
  it('硬链接指向项目外文件时三道闸一律放行 → 逃逸防线的最后一环必须落在写侧', () => {
    const root = workspace()
    const outside = join(root, 'outside.txt')
    writeFileSync(outside, '项目外的重要文件\n', 'utf8')
    const project = join(root, 'proj')
    mkdirSync(project)
    const target = join(project, 'CLAUDE.md')
    linkSync(outside, target)

    // 这不是「测不到就打个勾」，而是钉住一个设计前提：硬链接不是 reparse point，realpath 原样
    // 返回、lstat 看着就是普通文件，所以 `checkWritePath` 结构上抓不到它。哪天闸改成拒绝 nlink>1，
    // 这条先红——那是把 `cp -al` / pnpm store 用户挡在注入之外的改动，必须重新裁（owner 裁定不拒绝）。
    expect(lstatSync(target).isSymbolicLink()).toBe(false)
    expect(checkWritePath(project, 'CLAUDE.md')).toEqual({
      ok: true,
      absPath: resolve(project, 'CLAUDE.md'),
    })
    expect(resolveWriteTarget(project, 'CLAUDE.md')).toBe(resolve(project, 'CLAUDE.md'))
  })

  it('目录链接（junction / dir symlink）指向项目外 → ESCAPE 且 resolveWriteTarget 为 null', () => {
    const root = workspace()
    const outside = join(root, 'outside-dir')
    mkdirSync(outside)
    const project = join(root, 'proj')
    mkdirSync(project)
    const link = join(project, 'escape')
    linkDir(outside, link)

    expect(
      realpathSync(link),
      '目录链接未被 realpath 解析到目标：本平台没有可测的逃逸形态（数值见 apps/cli/test/win32-facts.test.ts）',
    ).toBe(realpathSync(outside))

    expect(checkWritePath(project, 'escape/x.md')).toEqual({ ok: false, reason: 'ESCAPE' })
    expect(resolveWriteTarget(project, 'escape/x.md')).toBeNull()
  })

  it('链接在更深层父目录（.cursor/rules 待创建）→ 上溯到最近存在祖先照样判 ESCAPE', () => {
    const root = workspace()
    const outside = join(root, 'outside-rules')
    mkdirSync(outside)
    const project = join(root, 'proj')
    mkdirSync(project)
    // 生产形态：`.cursor` 是链接、`.cursor/rules` 还不存在，写入会先 mkdir -p 再落文件
    linkDir(outside, join(project, '.cursor'))

    expect(checkWritePath(project, '.cursor/rules/openvibe.mdc')).toEqual({
      ok: false,
      reason: 'ESCAPE',
    })
  })
})
