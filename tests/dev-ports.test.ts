import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_PORT, WEB_PORT } from '@openvibe/shared'

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
    expect(viteConfigSrc).toContain('`http://127.0.0.1:${API_PORT}`')
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
