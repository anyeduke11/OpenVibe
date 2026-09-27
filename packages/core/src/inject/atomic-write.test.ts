// packages/core/src/inject/atomic-write.test.ts —— 落盘「只动这一个目录项」保证的正向断言（m6b §6.11）。
// 为什么整份文件不带平台门控：硬链接在 APFS / ext4 / NTFS 上都**不需要特权**即可创建（win32 即
// `mklink /H`），而它恰好是 `checkWritePath` 三道闸唯一看不见的穿透形状。只在 POSIX 上测这条，
// 等于把「注入只动项目内」这句承诺在最现实的平台上留成未验证面（承 owner 裁定 2026-09-27：
// 替换式写入、不拒绝）。mode 的透传不在这里重复断言——既有 POSIX 腿（CLI-SYNC-03d 等）已经
// 走的就是这个函数，win32 的 mode 语义归 apps/cli/test/win32-facts.test.ts 记录。
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { writeReplacingLinks } from './atomic-write'

const roots: string[] = []

/** 一次性沙箱：`root/proj` 与链外文件分居两侧，链外那一份才是「副作用漏没漏出去」的判据 */
function workspace(): { root: string; proj: string } {
  const root = mkdtempSync(join(tmpdir(), 'ov-atomic-write-'))
  roots.push(root)
  const proj = join(root, 'proj')
  mkdirSync(proj)
  return { root, proj }
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

describe('UT-AW · 替换写与硬链接（三平台真跑）', () => {
  it('UT-AW-01: 目标挂着硬链接 → 解链后新建，链外那份的内容与链接数都不受影响', () => {
    const { root, proj } = workspace()
    const outside = join(root, 'outside.txt')
    writeFileSync(outside, '链外的原始内容\n', 'utf8')
    const target = join(proj, 'CLAUDE.md')
    linkSync(outside, target)
    const sharedIno = statSync(target).ino
    expect(sharedIno).toBe(statSync(outside).ino)
    expect(statSync(target).nlink).toBe(2)

    expect(writeReplacingLinks(target, '注入内容\n')).toEqual({ brokeLink: true })

    expect(readFileSync(target, 'utf8')).toBe('注入内容\n')
    expect(readFileSync(outside, 'utf8'), '写穿了链外的文件').toBe('链外的原始内容\n')
    // 两侧各自回到 1：目标已与新内容解绑，链外那份不再被项目里的目录项共享
    expect(statSync(target).nlink).toBe(1)
    expect(statSync(outside).nlink).toBe(1)
  })

  it('UT-AW-02: 目标是普通文件（无额外链接）→ 原地覆盖并回报未解链', () => {
    const { proj } = workspace()
    const target = join(proj, 'AGENTS.md')
    writeFileSync(target, '本地手写规则\n', 'utf8')

    expect(writeReplacingLinks(target, '注入内容\n')).toEqual({ brokeLink: false })
    expect(readFileSync(target, 'utf8')).toBe('注入内容\n')
    expect(statSync(target).nlink).toBe(1)
  })

  it('UT-AW-03: 目标不存在（NEW 文件）→ 直接建出来，没有链可解也不报错', () => {
    const { proj } = workspace()
    const target = join(proj, 'TERMS.md')

    expect(writeReplacingLinks(target, '# 术语\n')).toEqual({ brokeLink: false })
    expect(readFileSync(target, 'utf8')).toBe('# 术语\n')
  })

  it('UT-AW-04: 同一目标连续两次写 → 第二次不再解链，内容收敛到最后一版（§6.5 幂等重跑）', () => {
    const { root, proj } = workspace()
    const outside = join(root, 'outside2.txt')
    writeFileSync(outside, '链外\n', 'utf8')
    const target = join(proj, 'CHECKLIST.md')
    linkSync(outside, target)

    expect(writeReplacingLinks(target, '第一版\n').brokeLink).toBe(true)
    expect(writeReplacingLinks(target, '第二版\n').brokeLink).toBe(false)

    expect(readFileSync(target, 'utf8')).toBe('第二版\n')
    expect(readFileSync(outside, 'utf8')).toBe('链外\n')
  })

  it('UT-AW-05: 中途抛错（目标是不可解链的目录）→ 异常照实上抛，不吞成「写成功」', () => {
    const { proj } = workspace()
    // 目录当目标写会撞 EISDIR：sync.ts 靠这个异常走 WRITE_FAILED 分支并保留已写文件
    expect(() => writeReplacingLinks(proj, 'x\n')).toThrow()
  })
})
