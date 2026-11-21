import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { join, resolve } from 'node:path'
import {
  detectPortConflict,
  pickPortPair,
  withPortRetry,
  PORT_RETRY_LIMIT,
} from '../scripts/iso-ports.mjs'
import {
  assertIsolatedHome,
  isolatedEnv,
  isIsolatedHome,
  realHome,
} from '../scripts/isolated-home.mjs'

/**
 * 隔离实例的**端口重试**与**子进程 env 守卫**（2026-10-31）。
 *
 * ## 它防两件事
 *
 * 1. **端口被占 ⇒ 手动重跑**：端口是「先探再放」，探到与真正 listen 之间有窗口，
 *    窗口期内端口被别人占走 ⇒ vite `strictPort` 报错退出。
 *    ⇒ 现在自动换一组端口重试（最多 `PORT_RETRY_LIMIT` 次），并把重试打印出来。
 *
 * 2. **断言的值与投递的值不一致**：守卫断言的是「脚本自算的沙箱常量」，
 *    而真正决定数据落点的是「传给子进程的 env」⇒ 两者可以不一致，守卫就形同虚设。
 *    ⇒ `spawnIsolated` / `spawnSyncIsolated` 把断言与投递绑成一步。
 */

const ROOT = resolve(__dirname, '..')

describe('隔离实例 · 端口冲突重试', () => {
  it('探到的两个端口必须不同（刚 close 的端口会被内核复用）', async () => {
    const ports = await pickPortPair()
    expect(ports.api).not.toBe(ports.web)
    expect(ports.api).toBeGreaterThan(0)
    expect(ports.web).toBeGreaterThan(0)
  })

  it('能认出 vite 的端口占用文案', () => {
    // vite strictPort 的原话（vite 7 实测）：`Port 5144 is already in use`
    expect(detectPortConflict('Port 5144 is already in use')).toBe(true)
  })

  it('能认出 node 的端口占用文案', () => {
    expect(detectPortConflict('Error: listen EADDRINUSE: address already in use')).toBe(true)
  })

  it('别的失败不算端口冲突（编译错、依赖缺失不该触发重试）', () => {
    // ⚠️ 这条是重试策略的边界：误判会让「真因」被重试噪声盖住。
    expect(detectPortConflict("error TS2304: Cannot find name 'foo'")).toBe(false)
    expect(detectPortConflict("Cannot find module 'better-sqlite3'")).toBe(false)
  })

  it('真机：端口真被占 ⇒ 真实 OS 报错能被认出来（不是只认手写文案）', async () => {
    // ⚠️ **真起一个监听把端口占住**，再让另一个进程去 bind 它 ⇒ 拿到的是真 OS 报错。
    //   这一步防的是「检测只认我们以为的文案，而真机的报错长得不一样」。
    const squatter = createServer()
    await new Promise<void>((resolve) => squatter.listen(0, '127.0.0.1', () => resolve()))
    const port = (squatter.address() as AddressInfo).port
    try {
      // 让子进程去 bind 已被占的端口 ⇒ 它会拿到 EADDRINUSE
      const out = execFileSync(
        process.execPath,
        [
          '-e',
          `const s=require('net').createServer();s.listen(${String(port)},'127.0.0.1',()=>{s.close()});` +
            `s.on('error',(e)=>{console.error(e.code+': '+e.message);process.exit(3)})`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
      // 子进程若没报错就退出了（说明 bind 成功 ⇒ 端口没被占住 ⇒ 本用例的前提失效）
      expect(out).not.toContain('EADDRINUSE')
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string }
      const text = `${err.stdout ?? ''}${err.stderr ?? ''}`
      expect(text).toContain('EADDRINUSE')
      // ⚠️ 核心断言：真机的报错文本能被检测函数认出来
      expect(detectPortConflict(text)).toBe(true)
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()))
    }
  })

  it('冲突时换一组端口重试，并把重试过程回报出来', async () => {
    const tried: number[] = []
    const retries: number[] = []
    const result = await withPortRetry({
      allocate: async () => {
        const ports = await pickPortPair()
        tried.push(ports.api)
        return ports
      },
      // 第一次报冲突 ⇒ 必须再试一次
      attempt: async () => ({ conflict: tried.length === 1, code: 1 }),
      onRetry: ({ attempt: n, ports }) => retries.push(n * 1000 + ports.api),
    })
    expect(tried.length).toBe(2)
    expect(retries.length).toBe(1)
    expect(result.conflict).toBe(false)
    expect(result.attempts).toBe(2)
  })

  it('真机：端口在「探测后、绑定前」被抢走 ⇒ 真 EADDRINUSE ⇒ 换一组后绑定成功', async () => {
    // ⚠️ **这条复刻的是真实竞态窗口**：端口是「先探再放」，探到与真正 listen 之间
    //   有人抢走 ⇒ vite strictPort 报错退出。本用例让子进程**真去 bind**，
    //   并用**真 OS 报错**驱动重试 ⇒ 不依赖任何手写文案。
    let squatter: Server | null = null
    const triedPorts: number[] = []
    const result = await withPortRetry({
      allocate: () => pickPortPair(),
      attempt: async (ports) => {
        // 第一次：模拟「别人在这窗口里抢占了 web 端口」
        if (squatter === null) {
          squatter = createServer()
          await new Promise<void>((r) => squatter!.listen(ports.web, '127.0.0.1', () => r()))
        }
        triedPorts.push(ports.web)
        // 真去 bind：被占 ⇒ 子进程非零退出 + 真 EADDRINUSE；没被占 ⇒ 退出码 0
        let out = ''
        let code = 0
        try {
          out = execFileSync(
            process.execPath,
            [
              '-e',
              `const s=require('net').createServer();s.listen(${String(ports.web)},'127.0.0.1',()=>{s.close()});` +
                `s.on('error',(e)=>{console.error(e.code+': '+e.message);process.exit(3)})`,
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
          )
        } catch (e) {
          const err = e as { stdout?: string; stderr?: string; status?: number }
          out = `${err.stdout ?? ''}${err.stderr ?? ''}`
          code = err.status ?? 3
        }
        // ⚠️ 冲突判定走的就是真报错文本（与 dev-iso 里同一条路径）
        return { conflict: detectPortConflict(out), code }
      },
      onRetry: () => {},
    })
    // 第一次必然撞上（端口已被抢）⇒ 触发重试 ⇒ 第二次换成新端口并绑定成功
    expect(triedPorts.length).toBe(2)
    expect(triedPorts[0]).not.toBe(triedPorts[1])
    expect(result.conflict).toBe(false)
    expect(result.attempts).toBe(2)
    await new Promise<void>((r) => squatter!.close(() => r()))
  })

  it('重试用尽就停（不无限重试），并把最后一次的结果原样交回', async () => {
    let calls = 0
    const result = await withPortRetry({
      allocate: async () => {
        calls += 1
        return { api: 40000 + calls, web: 50000 + calls }
      },
      attempt: async () => ({ conflict: true, code: 1 }),
    })
    // 首试 1 次 + 重试 PORT_RETRY_LIMIT 次
    expect(calls).toBe(PORT_RETRY_LIMIT + 1)
    expect(result.exhausted).toBe(true)
    expect(result.attempts).toBe(PORT_RETRY_LIMIT + 1)
    expect(result.code).toBe(1)
  })

  it('不冲突时只试一次（正常路径不重试）', async () => {
    let calls = 0
    const result = await withPortRetry({
      allocate: async () => {
        calls += 1
        return { api: 1, web: 2 }
      },
      attempt: async () => ({ conflict: false, code: 0 }),
    })
    expect(calls).toBe(1)
    expect(result.conflict).toBe(false)
    expect(result.exhausted).toBeUndefined()
  })
})

describe('隔离实例 · dev --iso 入口', () => {
  it('脚本存在，且用了端口重试与守卫通道', () => {
    // 2026-11-10：隔离能力折叠进 dev-all.mjs --iso，dev-iso.mjs 变为薄封装
    const script = join(ROOT, 'scripts', 'dev-all.mjs')
    const src = readFileSync(script, 'utf8')
    // 端口重试：必须走 withPortRetry（自己手写重试循环 ⇒ 判据看不见）
    expect(src).toContain('withPortRetry')
    expect(src).toContain('detectPortConflict')
    // home 的投递必须走守卫（手写 `OPENVIBE_HOME:` env ⇒ 断言与投递可能不一致）
    expect(src).toContain('isolatedEnv')
    expect(src).not.toMatch(/OPENVIBE_HOME:/)
  })
})

describe('子进程 env 守卫 · 断言与投递是同一个值', () => {
  it('env 里的 OPENVIBE_HOME 就是被断言过的那个值', () => {
    const home = '/tmp/ov-guard-probe-home'
    expect(isIsolatedHome(home)).toBe(true)
    expect(isolatedEnv(home).OPENVIBE_HOME).toBe(home)
  })

  it('调用方额外塞的 OPENVIBE_HOME 盖不掉被断言过的那个值', () => {
    // ⚠️ 这是本闸的核心：若调用方能另设 home，守卫就只验了一半。
    const home = '/tmp/ov-guard-probe-home'
    const env = isolatedEnv(home, { OPENVIBE_HOME: realHome() })
    expect(env.OPENVIBE_HOME).toBe(home)
  })

  it('home 不隔离 ⇒ 拒绝给出 env（而不是给一个能写真实数据的 env）', () => {
    expect(() => isolatedEnv(realHome())).toThrow(/拒绝执行/)
  })
})

describe('走查脚本 · 子进程 home 只能经守卫投递', () => {
  /**
   * 「走查脚本里不允许出现裸的 `OPENVIBE_HOME:` 赋值」（2026-10-31）。
   *
   * ## 它防的是什么
   *
   * 守卫断言的是「脚本自算的沙箱常量」，而真正决定数据落点的是**传给子进程的 env**。
   * 手写 `env: { ...process.env, OPENVIBE_HOME: X }` 意味着「断言的值」与「投递的值」
   * 由两处独立的代码决定 ⇒ 可以不一致，而守卫看不出来。
   *
   * ⇒ 唯一的合法形态是经 `spawnIsolated` / `spawnSyncIsolated` 投递（它先断言、再投递）。
   *
   * ## 判定口径
   *
   * **扫源码写法**（不是运行时行为）：`.mjs` 里出现 `OPENVIBE_HOME:` 这个 env 键
   * ⇒ 判红。⚠️ 注释里提到 `OPENVIBE_HOME` 不算（那不是赋值）⇒ 只认 `OPENVIBE_HOME:`。
   */
  function walkthroughScripts(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walkthroughScripts(p, out)
      else if (/\.(mjs|sh)$/.test(e.name)) out.push(p)
    }
    return out.sort()
  }

  it('⚠️ 走查脚本里不许裸写 OPENVIBE_HOME（home 只能经守卫投递）', () => {
    const dir = join(ROOT, 'docs', 'devlog-evidence')
    const offenders: string[] = []
    for (const file of walkthroughScripts(dir)) {
      const src = readFileSync(file, 'utf8')
      if (!/OPENVIBE_HOME:/.test(src)) continue
      offenders.push(file.replace(dir + '/', ''))
    }
    expect(
      offenders,
      `这些走查脚本裸写了 OPENVIBE_HOME ⇒ 断言的值与投递的值可能不是同一个：\n${offenders.join('\n')}\n（请改用 spawnIsolated / spawnSyncIsolated）`,
    ).toEqual([])
  })

  it('判据能红：造一个裸写 home 的走查脚本会被逮到', () => {
    const fake = `
      const proc = spawn(BIN, ['serve'], { env: { ...process.env, OPENVIBE_HOME: HOME } })
    `
    expect(/OPENVIBE_HOME:/.test(fake)).toBe(true)
  })

  it('注释里提到 OPENVIBE_HOME 不算裸赋值（别误伤）', () => {
    const commented = '// home 由守卫投递，OPENVIBE_HOME 只来自被断言过的值\n'
    expect(/OPENVIBE_HOME:/.test(commented)).toBe(false)
  })

  it('守卫生效：真 home 会被拒绝，临时目录会放行', () => {
    expect(() => assertIsolatedHome(realHome())).toThrow(/拒绝执行/)
    expect(() => assertIsolatedHome('/tmp/ov-guard-probe-home')).not.toThrow()
  })
})
