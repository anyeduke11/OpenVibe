import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assertIsolatedHome, isIsolatedHome, realHome } from '../scripts/isolated-home.mjs'
import { tempDir } from '@openvibe/core/test-support'

/**
 * 真机实测的隔离守卫（2026-10-31）。
 *
 * ## 它钉的是哪一件事
 *
 * 本仓的走查脚本会真的写库、真的起服务。若 `OPENVIBE_HOME` 没被隔离，
 * 它们写的是**用户真实数据**（`~/.openvibe/data/openvibe.db`）——
 * 一次误操作就可能动到用户自己的资产，且**没有任何信号**。
 *
 * ⇒ 守卫把「必须隔离」变成机器可判的事实：跑真机实测时若指向真实 home，
 *   **拒绝执行**并说清怎么修。
 *
 * ## 为什么「拒绝」而不是「自动改成沙箱」
 *
 * 自动改会让脚本**静默**跑在别的环境里 ⇒ 测出来的结论不是它要测的
 * （有的脚本本意就是要连真实环境看看会怎样）⇒ 拒绝 + 说清原因，把决定权留给人。
 */

const dirs: string[] = []

function makeTempDir(): string {
  const dir = tempDir('ov-iso-guard-')
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

describe('真机实测 · 隔离守卫', () => {
  it('未设置 OPENVIBE_HOME ⇒ 不隔离', () => {
    expect(isIsolatedHome(undefined)).toBe(false)
    expect(isIsolatedHome('')).toBe(false)
    expect(isIsolatedHome('   ')).toBe(false)
  })

  it('指向真实 home ⇒ 不隔离', () => {
    expect(isIsolatedHome(realHome())).toBe(false)
  })

  it('指向真实 home 的等价写法 ⇒ 同样不隔离（路径要归一）', () => {
    // `~/.openvibe/../.openvibe` 与 `~/.openvibe` 是同一个目录
    const tricky = join(realHome(), '..', '.openvibe')
    expect(isIsolatedHome(tricky)).toBe(false)
  })

  it('指向临时目录 ⇒ 隔离', () => {
    expect(isIsolatedHome(makeTempDir())).toBe(true)
  })

  it('守卫会拒绝不隔离的运行，并说清怎么修', () => {
    expect(() => assertIsolatedHome(undefined)).toThrow(/拒绝执行/)
    expect(() => assertIsolatedHome(undefined)).toThrow(/OPENVIBE_HOME/)
    // 修法必须在信息里（只说「不许跑」等于把人堵在门外）
    expect(() => assertIsolatedHome(undefined)).toThrow(/mktemp|dev:iso/)
  })

  it('守卫对隔离的运行放行', () => {
    expect(() => assertIsolatedHome(makeTempDir())).not.toThrow()
  })
})

describe('隔离实例入口（pnpm dev --iso）', () => {
  it('隔离实现在 dev-all 里自动准备三项覆盖值（数据目录 + 两个端口）', () => {
    // 2026-11-10：隔离能力折叠进 dev-all.mjs --iso，dev-iso.mjs 变为薄封装
    const script = resolve(__dirname, '..', 'scripts', 'dev-all.mjs')
    expect(existsSync(script)).toBe(true)
    const src = execFileSync(
      'node',
      ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(script)},'utf8'))`],
      { encoding: 'utf8' },
    )
    // 三项覆盖值都要在（少一项就有可能写到真实环境）
    expect(src).toContain('OPENVIBE_HOME')
    expect(src).toContain('OPENVIBE_API_PORT')
    expect(src).toContain('OPENVIBE_WEB_PORT')
    // 数据目录必须在临时目录下，不能是真实 home
    expect(src).toContain('tmpdir()')
    expect(src).not.toContain('homedir()')
  })

  it('package.json 里有 dev:iso 入口（薄封装，实现只在 dev-all）', () => {
    const pkg = JSON.parse(
      execFileSync(
        'node',
        ['-e', "process.stdout.write(require('fs').readFileSync('package.json','utf8'))"],
        {
          encoding: 'utf8',
          cwd: resolve(__dirname, '..'),
        },
      ),
    ) as { scripts: Record<string, string> }
    expect(pkg.scripts['dev:iso']).toBe('node scripts/dev-iso.mjs')
  })

  it('dev:iso 的实现在 dev-all（薄封装不重复造轮子）', () => {
    const wrapper = resolve(__dirname, '..', 'scripts', 'dev-iso.mjs')
    const src = execFileSync(
      'node',
      ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(wrapper)},'utf8'))`],
      { encoding: 'utf8' },
    )
    expect(src).toContain('--iso')
    expect(src).toContain('dev-all.mjs')
    // 重试逻辑只该有一份
    expect(src).not.toContain('withPortRetry')
  })
})

/* ------------------------------------------------------------------ 走查脚本接入 */

/**
 * 「所有会写库的走查脚本都必须接隔离守卫」（2026-10-31）。
 *
 * ## 它防的是什么
 *
 * 守卫模块本身写得再对，**没人调用**它就等于不存在。
 * 而走查脚本是散的（`docs/devlog-evidence/` 下按编号分目录）⇒
 * 新写一个走查脚本时很容易忘了接守卫 ⇒ 它照样会写进用户真实数据。
 *
 * ## 判定口径
 *
 * 「这个脚本会让数据落到某个 home」的**语法特征**（2026-10-31 起随守卫包装器一起变）：
 * - `.mjs`：`spawnIsolated(` / `spawnSyncIsolated(`（经守卫投递 home —— 合法形态）
 * - `.sh`：`export OPENVIBE_HOME=` / `OPENVIBE_HOME=`
 *
 * ⚠️ **`.mjs` 里裸写 `OPENVIBE_HOME:` 不再是合法形态**（那是「断言的值」与
 *   「投递的值」分离的写法）⇒ 由 `tests/iso-ports-guard.test.ts` 单独判红。
 *
 * ⚠️ **只提到 `OPENVIBE_HOME` 这几个字不算**（例如「本脚本不碰 OPENVIBE_HOME」
 *   这类只读脚本的注释）⇒ 用上面两种形态判，避免把只读脚本误判成漏接。
 */
function walkthroughScripts(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkthroughScripts(p, out)
    else if (/\.(mjs|sh)$/.test(e.name)) out.push(p)
  }
  return out.sort()
}

/** 该脚本是否会让数据落到某个 home（按形态判，不看注释里的字样） */
function writesToSomeHome(src: string): boolean {
  return /\bspawn(Sync)?Isolated\s*\(/.test(src) || /(export\s+)?OPENVIBE_HOME=/.test(src)
}

describe('走查脚本 · 隔离守卫的接入覆盖率', () => {
  it('⚠️ 每个会写库的走查脚本都接了守卫（漏一个 ⇒ 它照样能写真实数据）', () => {
    const dir = resolve(__dirname, '..', 'docs', 'devlog-evidence')
    const offenders: string[] = []
    for (const file of walkthroughScripts(dir)) {
      const src = readFileSync(file, 'utf8')
      if (!writesToSomeHome(src)) continue
      // 经守卫包装器投递（包装器内部断言）算已接守卫
      if (
        !src.includes('assertIsolatedHome') &&
        !src.includes('spawnIsolated') &&
        !src.includes('spawnSyncIsolated')
      ) {
        offenders.push(file.replace(dir + '/', ''))
      }
    }
    expect(
      offenders,
      `这些走查脚本会让数据落到某个 home，却没接隔离守卫（请 import 并调用 assertIsolatedHome 或 spawnIsolated）：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('判据能红：造一个「写 home 但没接守卫」的脚本会被逮到', () => {
    // ⚠️ `.mjs` 裸写 `OPENVIBE_HOME:` 的形态由 `tests/iso-ports-guard.test.ts` 判红；
    //   这里考的是「shell 形态（export）忘了接守卫」这一路。
    const fake = `
      export OPENVIBE_HOME=/tmp/ov-walk-XXXX
      node "$CLI" serve
    `
    expect(writesToSomeHome(fake)).toBe(true)
    expect(fake.includes('assertIsolatedHome')).toBe(false)
    expect(fake.includes('spawnIsolated')).toBe(false)
  })

  it('只读脚本不会被误判（注释里提到字样不算「会写 home」）', () => {
    const readOnly = '// 只读：沙箱目录在 /tmp/ov-probe-*，不碰 OPENVIBE_HOME、不开端口\n'
    expect(writesToSomeHome(readOnly)).toBe(false)
  })
})
