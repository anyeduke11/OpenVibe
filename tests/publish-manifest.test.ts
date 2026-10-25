import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLI_VERSION } from '../apps/cli/src/version'
import { publishManifest } from '../scripts/build-cli'

/**
 * T9a-2 发布清单门禁（SCRIPT-PKG）。
 *
 * 为什么值得钉成用例而不是走查笔记：发布包是**单文件 bundle**，暂存清单必须把
 * 四个 `@openvibe/*` workspace 依赖整个摘掉（npm 上不存在这些包，留着就装不上），
 * bin 必须指向编译产物（现仓库的 `./src/index.ts` 在发布包里根本执行不了）。
 * 另外 `pnpm publish --dry-run` 只会生成临时清单，不替仓库补 license/repository/engines——
 * 所以这些字段要在源清单里写死，由这里逐条盯住。
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const cliManifest = JSON.parse(readFileSync(join(REPO, 'apps', 'cli', 'package.json'), 'utf8')) as Record<
  string,
  unknown
>
const coreManifest = JSON.parse(
  readFileSync(join(REPO, 'packages', 'core', 'package.json'), 'utf8'),
) as { dependencies: Record<string, string> }

const built = (): Record<string, unknown> =>
  publishManifest(cliManifest, {
    version: CLI_VERSION,
    runtimeExternal: { 'better-sqlite3': coreManifest.dependencies['better-sqlite3'] as string },
  })

describe('发布暂存清单（T9a-2 · SCRIPT-PKG）', () => {
  it('SCRIPT-PKG-01: bin 指向编译产物，包名按 v0.2.3 批次 A 裁决定为 openvibe-cli、bin 命令不变', () => {
    const m = built()
    // 包名三次摇摆（D17→D24→v0.2.3 批次 A 裁决）就此终结（spec v023-a §8.2 / DEV-0114）：
    // D24 的「openvibe 可注册」前提于 2026-10-24 被现实再次推翻——`npm view openvibe` 返回
    // 无关同名包（boxiaolanya2008，v1.0.0），publish 必 403 ⇒ 发布名定死 `openvibe-cli`。
    expect(m.name).toBe('openvibe-cli')
    // bin 命令不变：装好后命令仍是 `openvibe`（README FAQ 既有口径）
    expect(JSON.stringify(m.bin)).toContain('openvibe')
    // 与 npm publish 的 normalize 结果一致（它会把 './dist/cli.js' 改写成 'dist/cli.js'），
    // 这样沙箱里装过的清单与 npm 上用户装到的清单是同一份
    expect(m.bin).toEqual({ openvibe: 'dist/cli.js' })
    expect(m.type).toBe('module')
    // `assets/readme` 是 README 首屏两张图的落点：包内 README 与仓库根同源，图不进包就是死链（队列 ㉑(a)）
    expect(m.files).toEqual(['dist', 'assets/readme'])
    // 仓库形态的 bin 一旦漏进发布包，npx 起来就是 ERR_UNKNOWN_FILE_EXTENSION
    expect(JSON.stringify(m.bin)).not.toContain('src/index.ts')
  })

  it('SCRIPT-PKG-02: 四个 workspace 内部包全部摘除，只留原生模块作外部依赖', () => {
    const deps = built().dependencies as Record<string, string>
    expect(Object.keys(deps)).toEqual(['better-sqlite3'])
    expect(deps['better-sqlite3']).toBe('^12.2.0')
    expect(JSON.stringify(deps)).not.toContain('@openvibe/')
    expect(JSON.stringify(deps)).not.toContain('workspace:')
    expect(built().devDependencies).toBeUndefined()
  })

  it('SCRIPT-PKG-03: 版本号与 CLI_VERSION 同源，仓库私有字段不带出去', () => {
    const m = built()
    expect(m.version).toBe(CLI_VERSION)
    expect(CLI_VERSION).toBe(cliManifest.version)
    expect(m.private).toBeUndefined()
    expect(m.scripts).toBeUndefined()
    expect(m.name).not.toBe(cliManifest.name)
  })

  it('SCRIPT-PKG-04: 发布元数据齐备（dry-run 不代填，缺了就是裸包）', () => {
    const m = built()
    expect(m.license).toBe('Apache-2.0')
    expect(String((m.repository as { url: string }).url)).toMatch(/^git\+https:\/\/github\.com\//)
    expect(String(m.homepage)).toMatch(/^https:\/\/github\.com\//)
    expect((m.engines as { node: string }).node).toBe('>=22')
    expect(String(m.description).length).toBeGreaterThan(10)
    expect((m.keywords as string[]).length).toBeGreaterThan(3)
  })

  it('SCRIPT-PKG-05: 包内 README 的每个相对路径都能在包内解析（㉑(a) 的死链闸）', () => {
    const readme = readFileSync(join(REPO, 'README.md'), 'utf8')
    // Markdown 链接与 `<img src>` 两种写法都要抓：两张图正是走 src 才漏掉过
    const refs = [...readme.matchAll(/(?:\]\(|src=")\.\/([^)"\s#]+)/g)]
      .map((m) => m[1])
      .filter((r): r is string => r !== undefined)
    // 零命中说明正则失效而不是「链接都好了」——恒真断言不算闸
    expect(refs.length).toBeGreaterThan(0)
    // npm 无条件带 README.md / LICENSE / package.json，其余条目由 files 决定
    const packaged = ['README.md', 'LICENSE', 'package.json', ...(built().files as string[])]
    const unresolved = refs.filter((r) => !packaged.some((f) => r === f || r.startsWith(`${f}/`)))
    expect(unresolved).toEqual([])
  })
})
