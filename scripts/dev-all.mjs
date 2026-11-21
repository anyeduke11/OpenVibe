#!/usr/bin/env node
/**
 * dev —— 一条命令起「**生产形态**」的本地环境（2026-11-10 改造）。
 *
 * ## 它起什么
 *
 * ```
 * pnpm dev          构建 web → 起 server（tsx watch）
 * pnpm dev --iso    同上，但数据目录与端口都隔离（见下）
 * ```
 *
 * **为什么不再起 vite dev server**：本仓的生产形态是 **server 自己托管 web 产物**
 * （`apps/server/src/plugins/static.ts` 用 `@fastify/static` 注册 `apps/web/dist`，
 * 依据 design §4 步骤 7 / m6b D-1）。API 与页面**同端口、同源**，
 * 正合 R4 的「同源相对路径」约定（`apps/web/src/api/client.ts` 第一行）。
 *
 * 而 vite dev server 是**另一条链路**：它要单独占一个端口、要 `/api` 代理
 * （`vite.config.ts` 的 `proxy` 只配在 `server` 下），与生产架构并不一致。
 * ⇒ `pnpm dev` 改为构建后由 server 托管，**所见即生产**。
 * 代价：**没有 HMR** —— 改前端需重新构建。需要 HMR 时直接跑
 * `pnpm --filter @openvibe/web dev`（vite 仍在，只是不再由本脚本起）。
 *
 * ## 进程组管理（为什么不 `a & b & wait`）
 *
 * `pnpm --filter … dev` 自己还要再 fork 一层 shell → tsx 是**孙进程**。
 * 给 `pnpm` 发 SIGINT 不保证孙进程收到，于是 Ctrl-C 后端口仍被占，
 * 下一次启动就撞 `EADDRINUSE` —— 而报的是「端口被占」，
 * **没人会想到是上一次没关干净**。故这里显式按进程组管理。
 *
 * ## `--iso`：隔离实例
 *
 * 折叠自原 `scripts/dev-iso.mjs`（2026-11-10 整合）：临时数据目录 + 自动挑空闲端口
 * + 端口冲突自动换一组重试。`pnpm dev:iso` 是同一条命令的别名入口。
 *
 * 零依赖（只用 node: 内建模块 + 本仓两个脚本模块），与仓内其余脚本一致。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectPortConflict, pickPortPair, withPortRetry } from './iso-ports.mjs'
import { isolatedEnv } from './isolated-home.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RULES = '─'.repeat(64)

/** 本次是否隔离实例 */
const ISO = process.argv.includes('--iso')

/**
 * 两个端口的唯一出处是 `packages/shared/src/constants.ts`。
 *
 * ⚠️ **为什么是「解析」而不是 `import`**：shared 的 exports 直接指向 `.ts` 源（无 dist），
 *   裸 `.mjs` 引不了；而为了一段横幅给 dev 工具链接一个 TS 加载器不划算。
 *   代价是这处存在**可能解析不到** —— 所以刻意做窄：只认
 *   `export const <名字> = <整数>` 这一种形状，取不到就**大声失败**，
 *   绝不 fallback 到写死的端口（fallback 才是那个会骗人的东西）。
 */
function readPorts() {
  const file = resolve(ROOT, 'packages/shared/src/constants.ts')
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    return fail(`读不到端口常量出处：${file}`)
  }
  const pick = (name) => {
    const m = src.match(new RegExp(`^export const ${name} = (\\d+)\\s*$`, 'm'))
    if (!m)
      return fail(
        `在 ${file} 里找不到 \`export const ${name} = <整数>\`，请同步更新 scripts/dev-all.mjs`,
      )
    return Number(m[1])
  }
  return { api: pick('DEFAULT_PORT'), web: pick('WEB_PORT') }
}

/**
 * 端口覆盖变量名（2026-10-30）。
 *
 * ⚠️ 变量名与 shared 的 `API_PORT_ENV` / `WEB_PORT_ENV` 同源但各自留一份字面量：
 *   理由同 `readPorts`（本文件引不了 shared 的 TS 源）⇒ 由 `tests/dev-ports.test.ts` 钉死一致。
 *
 * ⚠️ **`WEB_PORT` 现在只影响 vite dev 路径**（`pnpm --filter @openvibe/web dev`）——
 *   本脚本不再起 vite，server 托管产物时页面与 API 同端口。仍保留解析是因为
 *   ① `tests/dev-ports.test.ts` 钉住三处变量名单源；② `--iso` 仍会把它透传给子进程，
 *   让人手工补起 vite 时端口一致。
 */
const API_PORT_ENV = 'OPENVIBE_API_PORT'
const WEB_PORT_ENV = 'OPENVIBE_WEB_PORT'

/**
 * 非法值大声失败：静默回落会让横幅显示一个没在跑的端口，
 * 而 server 会直接 `EADDRINUSE` 退出 ⇒ 两边对不上，人只会怀疑 server。
 */
function resolvePort(raw, fallback, label) {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    return fail(`${label} 覆盖值非法：${raw}（必须是 0–65535 的整数；未设置时用 ${fallback}）`)
  }
  return n
}

function fail(msg) {
  console.error(`[dev] ${msg}`)
  process.exit(1)
}

const { api: apiDefault, web: webDefault } = readPorts()

/** 隔离实例的沙箱数据目录（真实 `~/.openvibe` 绝不能被动） */
const isoHome = ISO ? mkdtempSync(join(tmpdir(), 'ov-iso-')) : null

/**
 * 构建 web 产物。**必须先构建**：server 托管的是 `apps/web/dist`，
 * 产物缺失时它只会降级为「仅 API + 提示」（m6b D-1），页面全空。
 */
function buildWeb() {
  return new Promise((resolveBuild) => {
    console.log('[dev] 构建 web 产物（vite build）…')
    const proc = spawn('pnpm --filter @openvibe/web build', {
      cwd: ROOT,
      detached: true,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    })
    for (const stream of [proc.stdout, proc.stderr]) {
      let buf = ''
      stream.on('data', (d) => {
        buf += d.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const l of lines) console.log(`[build] ${l}`)
      })
      stream.on('end', () => {
        if (buf.trim()) console.log(`[build] ${buf}`)
      })
    }
    proc.on('exit', (code) => {
      if (code !== 0) fail(`web 构建失败（exit ${String(code)}）—— 不启动 server`)
      console.log('[dev] web 构建完成')
      resolveBuild()
    })
  })
}

/**
 * 起一次 server。
 *
 * @param {number} apiPort 实际监听端口
 * @returns {Promise<{conflict: boolean, code?: number}>} 进程退出时回报；`conflict` = 输出里出现端口冲突信号
 */
function attemptServer(apiPort) {
  return new Promise((resolveAttempt) => {
    const webPort = resolvePort(process.env[WEB_PORT_ENV], webDefault, WEB_PORT_ENV)
    const env = isoHome
      ? isolatedEnv(isoHome, {
          [API_PORT_ENV]: String(apiPort),
          [WEB_PORT_ENV]: String(webPort),
        })
      : { ...process.env, [API_PORT_ENV]: String(apiPort) }

    const proc = spawn('pnpm --filter @openvibe/server dev', {
      cwd: ROOT,
      detached: true,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, FORCE_COLOR: '1' },
    })
    children.set('server', proc)

    let conflict = false
    let tail = ''
    const observe = (chunk) => {
      if (conflict) return
      if (detectPortConflict(tail + chunk)) conflict = true
      tail = (tail + chunk).slice(-256)
    }
    for (const stream of [proc.stdout, proc.stderr]) {
      let buf = ''
      stream.on('data', (d) => {
        observe(d.toString())
        buf += d.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const l of lines) console.log(`[server] ${l}`)
      })
      stream.on('end', () => {
        if (buf.trim()) console.log(`[server] ${buf}`)
      })
    }
    proc.on('exit', (code, sig) => {
      children.delete('server')
      if (shuttingDown) return
      if (conflict && ISO) {
        // 隔离模式下端口冲突 ⇒ 换一组端口重试（由 withPortRetry 决定）
        resolveAttempt({ conflict: true, code: 1 })
        return
      }
      if (conflict) {
        console.error(`[dev] server 端口被占（:${String(apiPort)}），退出`)
        shutdown(1)
        return
      }
      console.error(`[dev] server 退出（code=${String(code)} signal=${String(sig)}）`)
      shutdown(typeof code === 'number' && code !== 0 ? code : 1)
      resolveAttempt({ conflict: false, code })
    })
  })
}

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map()
let shuttingDown = false

/** 按进程组停全部，再等它们真的退出后返回 —— 不等就是留下孤儿。 */
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const [name, proc] of children) {
    if (proc.exitCode !== null || proc.signalCode !== null) continue
    try {
      process.kill(-proc.pid, 'SIGTERM')
    } catch {
      try {
        proc.kill('SIGTERM')
      } catch {
        /* 已经没了 */
      }
    }
    console.log(`[dev] 已向 ${name} 进程组发 SIGTERM（pid ${String(proc.pid)}）`)
  }
  const alive = [...children.values()].filter((p) => p.exitCode === null && p.signalCode === null)
  if (alive.length === 0) return process.exit(code)
  // 兜底：3 秒后还没走的按组 SIGKILL —— tsx 偶尔会卡在等 stdin。
  const timer = setTimeout(() => {
    for (const proc of children.values()) {
      try {
        process.kill(-proc.pid, 'SIGKILL')
      } catch {
        /* 已退出 */
      }
    }
    process.exit(code)
  }, 3000)
  timer.unref?.()
  let left = alive.length
  for (const proc of alive) {
    proc.on('exit', () => {
      if (--left === 0) {
        clearTimeout(timer)
        process.exit(code)
      }
    })
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => shutdown(0))
// 父进程被 kill -9 时这里救不了（无 handler 可跑），但正常退出路径都能收干净。
process.on('exit', () => {
  for (const proc of children.values()) {
    try {
      process.kill(-proc.pid, 'SIGKILL')
    } catch {
      /* 已退出 */
    }
  }
})

const API_URL = `http://127.0.0.1:${String(resolvePort(process.env[API_PORT_ENV], apiDefault, API_PORT_ENV))}`

console.log(`[dev] ${RULES}`)
if (ISO) {
  console.log('[dev] 隔离实例（数据与端口都不碰真实环境）')
  console.log(`[dev]   数据目录：${isoHome ?? '(未创建)'}`)
  console.log('[dev]   真实环境未受影响：~/.openvibe 与默认端口都保持原样')
  console.log(`[dev]   沙箱不会自动清理（跑完要删就删：${isoHome ?? '(未创建)'}）`)
  // ⚠️ 端口是**每次尝试现挑**的 ⇒ 此刻还不知道，绝不印一个默认值冒充
  console.log('[dev] 应用入口：端口自动分配，以 server 启动横幅为准')
} else {
  console.log('[dev] 生产形态：server 托管构建产物，页面与 API 同端口同源')
  console.log(`[dev]   数据目录：${process.env.OPENVIBE_HOME ?? '~/.openvibe（真实数据）'}`)
  console.log(`[dev] 应用入口（浏览器打开这个）  ${API_URL}`)
}
console.log('[dev] 鉴权走两条通道：浏览器靠 Origin 白名单，脚本靠 Bearer token。')
if (!ISO) {
  console.log('[dev]   curl 直连 API 要手动带头，否则 401：')
  console.log(`[dev]     curl -H "Origin: ${API_URL}" ${API_URL}/api/terms`)
}
console.log('[dev] 没有 HMR：改前端需重新构建（需要 HMR 就跑 pnpm --filter @openvibe/web dev）')
console.log('[dev] Ctrl-C 会停掉所有子进程。')
console.log(`[dev] ${RULES}`)

try {
  await buildWeb()

  if (ISO) {
    const result = await withPortRetry({
      allocate: () => pickPortPair(),
      attempt: (ports) => attemptServer(ports.api),
      onRetry: ({ attempt: n, limit, ports }) => {
        console.log(
          `[dev] ⚠️ 端口被占用（API ${String(ports.api)}），换一组重试（${String(n)}/${String(limit)}）`,
        )
      },
    })
    if (result.exhausted) {
      console.error(
        `[dev] ✗ 连续 ${String(result.attempts)} 次都撞上端口被占 ⇒ 放弃（先停掉占着端口的进程）`,
      )
    }
    process.exitCode = result.code ?? 0
  } else {
    await attemptServer(resolvePort(process.env[API_PORT_ENV], apiDefault, API_PORT_ENV))
  }
} catch (e) {
  console.error(`[dev] 启动失败：${e instanceof Error ? e.message : String(e)}`)
  shutdown(1)
}
