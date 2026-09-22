import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIMITS } from '@openvibe/shared'
import { checkPackInjectable, checkWritePath, resolveWriteTarget } from './security'

interface Thrown {
  code: string
  message: string
  details: Record<string, unknown>
}

/** 断言「整包拒绝」并取回 details（CLI 靠它逐条报告违规项，m6b §6.1） */
function thrown(fn: () => unknown): Thrown {
  try {
    fn()
  } catch (e) {
    return e as Thrown
  }
  throw new Error('预期抛出整包拒绝，实际通过')
}

const OK = { path: 'CLAUDE.md', content: '# 规则\n' }

function workspace(prefix: string): { dir: string; close(): void } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return {
    dir,
    close() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function bigFile(path: string, bytes: number) {
  return { path, content: 'a'.repeat(bytes) }
}

describe('UT-INJECT-SEC-01 · 路径语法违规整包拒绝（design §7.7 / m6b §6.1）', () => {
  it('.. / 绝对路径 / 反斜杠 / 空段 / 点段 / 超长 → 一次聚合报告，码点序', () => {
    const files = [
      { path: '../evil.txt', content: 'x' },
      { path: '/etc/passwd', content: 'x' },
      { path: 'a\\b.md', content: 'x' },
      { path: './x.md', content: 'x' },
      { path: 'a//b.md', content: 'x' },
      { path: 'docs/../CLAUDE.md', content: 'x' },
      { path: `${'s'.repeat(129)}.md`, content: 'x' },
      { path: `${'t'.repeat(256)}.md`, content: 'x' },
      { path: '', content: 'x' },
      OK,
    ]
    const err = thrown(() => checkPackInjectable('/tmp/proj', files))
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.message).toContain('整包拒绝')
    expect(err.details['invalidPaths']).toEqual([
      '',
      '../evil.txt',
      './x.md',
      '/etc/passwd',
      'a//b.md',
      'a\\b.md',
      'docs/../CLAUDE.md',
      `${'s'.repeat(129)}.md`,
      `${'t'.repeat(256)}.md`,
    ])
    expect(err.details['fileCount']).toBe(files.length)
  })

  it('合法包 → 通过，返回逐文件绝对路径与总字节', () => {
    const res = checkPackInjectable('/tmp/proj', [
      OK,
      { path: '.cursor/rules/openvibe.mdc', content: 'x' },
    ])
    expect(res.absPaths['CLAUDE.md']).toBe(join('/tmp/proj', 'CLAUDE.md'))
    expect(res.totalBytes).toBe(Buffer.byteLength(OK.content) + 1)
    expect(Object.keys(res.absPaths).length).toBe(2)
  })
})

describe('UT-INJECT-SEC-02 · 符号链接逃逸拒绝（design §7.7 规则 3 / §11.3）', () => {
  it('目标父目录 realpath 落在项目外 → 整包拒绝并点名', () => {
    const w = workspace('ov-inject-outside-')
    const files = [
      { path: 'escape/x.md', content: 'x' },
      { path: 'CLAUDE.md', content: 'x' },
    ]
    const err = thrown(() =>
      checkPackInjectable('/tmp/proj', files, {
        realpath: (p) => (p === join('/tmp/proj', 'escape') ? w.dir : p),
      }),
    )
    expect(err.details['escapingPaths']).toEqual(['escape/x.md'])
    expect(err.message).toContain('整包拒绝')
    w.close()
  })

  it('项目根经符号链接到达 + 父目录待创建 → 不误判逃逸（macOS /var→/private/var 的真实形态）', () => {
    const linkRoot = '/var/tmp/proj'
    const realRoot = '/private/var/tmp/proj'
    // 假的 realpath 只认「已存在的路径」：新项目里 .cursor/rules 还没建出来
    const check = checkWritePath(linkRoot, '.cursor/rules/openvibe.mdc', {
      realpath: (p) => (p === linkRoot ? realRoot : p.startsWith(`${realRoot}/`) ? p : null),
    })
    expect(check).toEqual({ ok: true, absPath: join(linkRoot, '.cursor/rules/openvibe.mdc') })
  })

  it('真实符号链接（非 win32）→ ESCAPE', () => {
    const w = workspace('ov-inject-sym-')
    if (process.platform === 'win32') {
      w.close()
      return
    }
    const outside = join(w.dir, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'x.md'), 'x', 'utf8')
    const project = join(w.dir, 'proj')
    mkdirSync(project)
    symlinkSync(outside, join(project, 'escape'), 'dir')
    expect(checkWritePath(project, 'escape/x.md')).toEqual({ ok: false, reason: 'ESCAPE' })
    expect(resolveWriteTarget(project, 'escape/x.md')).toBeNull()
    w.close()
  })

  it('语法违规优先于 ESCAPE 判定', () => {
    expect(checkWritePath('/tmp/proj', '../../etc/x.md')).toEqual({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(checkWritePath('/tmp/proj', 'ok.md')).toEqual({
      ok: true,
      absPath: join('/tmp/proj', 'ok.md'),
    })
  })
})

describe('UT-INJECT-SEC-03 · 规模与数量越限拒绝（m6b §6.3 / §6.7 / design §7.7）', () => {
  it('单文件 > 512KB → 拒绝并列出该文件（注入侧是硬拒绝，不同于导出侧警告）', () => {
    const files = [OK, bigFile('TERMS.md', LIMITS.singleFileMaxBytes + 1)]
    const err = thrown(() => checkPackInjectable('/tmp/proj', files))
    expect(err.message).toMatch(/单文件[\s\S]*超过[\s\S]*整包拒绝/)
    const oversized = err.details['oversizedFiles'] as { path: string; bytes: number }[]
    expect(oversized[0]).toEqual({ path: 'TERMS.md', bytes: LIMITS.singleFileMaxBytes + 1 })
  })

  it('总量 > 2MB（逐文件均合规）→ 拒绝并报总字节', () => {
    const per = 480 * 1024
    const files = Array.from({ length: 5 }, (_, i) => bigFile(`f${i}.md`, per))
    const err = thrown(() => checkPackInjectable('/tmp/proj', files))
    expect(err.details['totalBytes']).toBe(per * 5)
    expect(err.message).toContain('总量')
  })

  it('文件数 > 200 → 拒绝（§7.7 规则 1）', () => {
    const files = Array.from({ length: LIMITS.packFileCountMax + 1 }, (_, i) => ({
      path: `f${i}.md`,
      content: 'x',
    }))
    const err = thrown(() => checkPackInjectable('/tmp/proj', files))
    expect(err.details['fileCount']).toBe(LIMITS.packFileCountMax + 1)
    expect(err.message).toContain('文件数')
  })

  it('多类违规同时存在 → 一次报全部（不挤牙膏）', () => {
    const files = [{ path: '../evil.txt', content: 'x' }, bigFile('big.md', 600 * 1024)]
    const err = thrown(() => checkPackInjectable('/tmp/proj', files))
    expect(err.details['invalidPaths']).toEqual(['../evil.txt'])
    expect((err.details['oversizedFiles'] as unknown[]).length).toBe(1)
  })
})

describe('UT-INJECT-SEC-04 · 写入时二次校验（双保险，落盘前逐文件调用）', () => {
  it('合法相对路径 → 项目内绝对路径；违规 → null', () => {
    expect(resolveWriteTarget('/tmp/proj', 'docs/a.md')).toBe(join('/tmp/proj', 'docs/a.md'))
    expect(resolveWriteTarget('/tmp/proj', '../a.md')).toBeNull()
    expect(resolveWriteTarget('/tmp/proj', 'a/../b.md')).toBeNull()
    expect(resolveWriteTarget('/tmp/proj', '')).toBeNull()
  })

  it('项目根含符号链接段也不误判（macOS /var → /private/var）', () => {
    const w = workspace('ov-inject-root-')
    const project = join(w.dir, 'proj')
    mkdirSync(join(project, 'nested'), { recursive: true })
    expect(checkWritePath(project, 'nested/x.md')).toEqual({
      ok: true,
      absPath: join(project, 'nested/x.md'),
    })
    w.close()
  })
})
