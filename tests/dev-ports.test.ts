import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { API_PORT_ENV, DEFAULT_PORT, WEB_PORT, WEB_PORT_ENV, resolvePort } from '@openvibe/shared'

/**
 * 端口守卫（2026-10-19）。
 *
 * ## 它拦的是什么
 *
 * 端口在本仓历史上**散在三处**：`packages/shared/src/constants.ts`（`DEFAULT_PORT`）、
 * `apps/web/vite.config.ts`（`WEB_PORT` 与 proxy 目标）、以及各处日志里手写的字符串。
 * 散布的后果不是「不好看」，是**代理会静默指向一个没人监听的端口而 vite 绝不报错** ——
 * 现象是页面全空、控制台一个 401，排查的人会先怀疑鉴权。
 *
 * ## 为什么 vite 配置那份不删掉
 *
 * 试过让 `vite.config.ts` 直接 import shared，**实测起不来**：
 * vite.config 由 esbuild 打包后交给 Node 原生 ESM 加载，而 `shared/src/index.ts` 里是
 * `./constants` 这种无扩展名相对导入（只对打包器成立）⇒ `ERR_MODULE_NOT_FOUND`，
 * 且 vite 报成「failed to load config」，完全看不出跟端口那行有关。
 * ⇒ 改成「一份为准 ＋ 一份被守卫锁死」，而不是两份各自对。
 */

const ROOT = resolve(__dirname, '..')
const read = (...p: string[]) => readFileSync(resolve(ROOT, ...p), 'utf8')
const viteConfigSrc = read('apps', 'web', 'vite.config.ts')
const devAllSrc = read('scripts', 'dev-all.mjs')
const serverIndexSrc = read('apps', 'server', 'src', 'index.ts')

/** 取 `export const NAME = <整数>` / `const NAME = <整数>` 的字面量值 */
function constValue(src: string, name: string): number {
  const m = src.match(new RegExp(`^\\s*(?:export\\s+)?const ${name} = (\\d+)\\s*$`, 'm'))
  if (!m)
    throw new Error(`在本文件里找不到 \`const ${name} = <整数>\`—— 解析失败就大声失败，不 fallback`)
  return Number(m[1])
}

describe('端口单一出处', () => {
  it('vite.config 的 WEB_PORT 与 shared 的 WEB_PORT 一致', () => {
    expect(constValue(viteConfigSrc, 'WEB_PORT')).toBe(WEB_PORT)
  })

  it('vite.config 的 proxy 目标端口与 shared 的 DEFAULT_PORT 一致', () => {
    expect(constValue(viteConfigSrc, 'API_PORT')).toBe(DEFAULT_PORT)
  })

  it('vite.config 的 proxy 目标是从 API_PORT 派生的，不是写死的地址', () => {
    // ⚠️ 2026-10-30 起派生链多了一跳：`API_PORT` → `resolvePort(env)` → `effectiveApiPort`
    //   → proxy target。判据是「**目标里那个变量本身**派生自 API_PORT」，而不是
    //   「模板里出现 API_PORT 这几个字母」——后者在加一跳之后就断了，
    //   而真正要防的「代理指向一个没人监听的端口」并没有因此失去保护。
    expect(viteConfigSrc).toContain('`http://127.0.0.1:${String(effectiveApiPort)}`')
    expect(viteConfigSrc).toContain(
      'const effectiveApiPort = resolvePort(process.env[API_PORT_ENV], API_PORT)',
    )
  })

  it('vite.config 全文只把端口数字写在那两个常量定义处（散文里也不许写）', () => {
    // ⚠️ 扫的是**整份文本**而不是「代码」：正确 JS 注释剥离要跟字符串字面量里的 `//` 打架
    //   （本文件就有 `http://…`），而这里的判据是「这个数字只该出现在定义处」。
    //   所以连注释一起扫 —— 代价是注释里引用一个端口也会让本闸红，
    //   而那时的正确处置是改措辞（见两处源文件里的同款说明），不是把本闸放松。
    const hits = viteConfigSrc.match(/\b8787\b/g) ?? []
    expect(hits).toHaveLength(1) // 恰好一次 —— 就是 `const API_PORT = …` 那行
  })

  it('dev-all 不硬写任何端口（它必须从 shared 解析，否则横幅会说谎）', () => {
    expect(devAllSrc).not.toMatch(/\b8787\b/)
    expect(devAllSrc).not.toMatch(/\b5144\b/)
    expect(devAllSrc).toContain('DEFAULT_PORT')
    expect(devAllSrc).toContain('WEB_PORT')
  })

  it('server 启动横幅不硬写端口字面量（它 import shared，能直接用常量）', () => {
    expect(serverIndexSrc).not.toMatch(/\b8787\b/)
    expect(serverIndexSrc).not.toMatch(/\b5144\b/)
    expect(serverIndexSrc).toContain('WEB_PORT')
    expect(serverIndexSrc).toContain('LOOPBACK_HOST')
  })

  it('dev-all 的端口解析失败时会退出，而不是用兜底值继续跑', () => {
    // 兜底才是那个骗人的东西：解析不到就退，比打一个错的地址强
    expect(devAllSrc).toContain('process.exit(1)')
    expect(devAllSrc).not.toMatch(/const\s+\w+\s*=\s*\?*\s*87\d\d/)
  })
})

/**
 * dev 隔离实例的端口覆盖守卫（2026-10-30）。
 *
 * ## 它拦的是什么
 *
 * 端口覆盖靠**三个进程读同一个环境变量名**：server 读它决定监听端口、
 * vite 读它决定 `/api` 代理目标、dev-all 读它决定横幅显示什么。
 *
 * ⇒ 三处任何一处变量名写错，后果是**静默的错位**：server 听 8787、vite 代理到 8788，
 *   而横幅显示 8787 —— 人打开页面看到的是「连不上」，却查不出是哪一处名字不一致。
 *   这正是本仓的老毛病（端口散布三处）的复刻，所以必须钉死。
 */
describe('dev 隔离实例 · 端口覆盖变量名单源', () => {
  it('shared 的变量名是权威出处', () => {
    expect(API_PORT_ENV).toBe('OPENVIBE_API_PORT')
    expect(WEB_PORT_ENV).toBe('OPENVIBE_WEB_PORT')
  })

  it('vite.config 用的变量名与 shared 一致', () => {
    expect(viteConfigSrc).toContain(`const API_PORT_ENV = '${API_PORT_ENV}'`)
    expect(viteConfigSrc).toContain(`const WEB_PORT_ENV = '${WEB_PORT_ENV}'`)
  })

  it('dev-all 用的变量名与 shared 一致', () => {
    expect(devAllSrc).toContain(`const API_PORT_ENV = '${API_PORT_ENV}'`)
    expect(devAllSrc).toContain(`const WEB_PORT_ENV = '${WEB_PORT_ENV}'`)
  })

  it('server 用的变量名与 shared 一致（它 import shared，读的是导出常量）', () => {
    expect(serverIndexSrc).toContain('API_PORT_ENV')
    expect(serverIndexSrc).toContain('WEB_PORT_ENV')
    expect(serverIndexSrc).toContain('resolvePort')
  })

  it('vite 的代理目标与 web 监听端口都读覆盖变量（不是写死的常量）', () => {
    expect(viteConfigSrc).toContain('resolvePort(process.env[API_PORT_ENV]')
    expect(viteConfigSrc).toContain('resolvePort(process.env[WEB_PORT_ENV]')
  })

  it('dev-all 把覆盖后的端口显示在横幅上（横幅不许说谎）', () => {
    expect(devAllSrc).toContain('resolvePort(process.env[API_PORT_ENV]')
    expect(devAllSrc).toContain('resolvePort(process.env[WEB_PORT_ENV]')
  })
})

/**
 * 端口覆盖值的解析口径（2026-10-30）。
 *
 * ## 为什么非法值必须抛错而不是回落
 *
 * 回落是这里最坏的行为：用户以为自己在 8788 上跑隔离实例，实际连的是 8787 的
 * 真实实例 ⇒ 写库写进了真实数据，而他毫不知情。
 * ⇒ 覆盖值不是合法端口时**大声失败**，让进程带着明确的错误信息退出。
 */
describe('dev 隔离实例 · 端口覆盖值解析', () => {
  it('未设置 / 空串 ⇒ 用默认端口', () => {
    expect(resolvePort(undefined, DEFAULT_PORT)).toBe(DEFAULT_PORT)
    expect(resolvePort('', DEFAULT_PORT)).toBe(DEFAULT_PORT)
    expect(resolvePort('   ', DEFAULT_PORT)).toBe(DEFAULT_PORT)
  })

  it('合法端口 ⇒ 用它', () => {
    expect(resolvePort('8788', DEFAULT_PORT)).toBe(8788)
    expect(resolvePort('5145', WEB_PORT)).toBe(5145)
  })

  it('0 是合法值（含义：让内核分配空闲端口，本仓既有语义）', () => {
    expect(resolvePort('0', DEFAULT_PORT)).toBe(0)
  })

  it('非法值 ⇒ 抛错（绝不静默回落）', () => {
    for (const bad of ['abc', '-1', '70000', '8788.5']) {
      expect(() => resolvePort(bad, DEFAULT_PORT)).toThrow()
    }
  })

  it('抛错信息里带上那个非法值（人要知道是自己写错了什么）', () => {
    expect(() => resolvePort('abc', DEFAULT_PORT)).toThrow(/abc/)
  })
})

describe('守卫自证：它必须能红', () => {
  it('把 vite.config 的 API_PORT 改成别的值，解析器给出的就是别的值', () => {
    const mutated = viteConfigSrc.replace(/const API_PORT = \d+/, 'const API_PORT = 9999')
    expect(constValue(mutated, 'API_PORT')).toBe(9999)
    expect(constValue(mutated, 'API_PORT')).not.toBe(DEFAULT_PORT)
  })

  it('把 dev-all 的解析改成硬写端口，自证断言会红', () => {
    const mutated = devAllSrc.replace(
      'readPorts()',
      'function readPorts(){return {api:8787,web:5144}}',
    )
    expect(mutated).toMatch(/\b8787\b/)
  })
})
