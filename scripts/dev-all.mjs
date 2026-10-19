#!/usr/bin/env node
/**
 * dev:all —— 一条命令同时起 web 与 server（2026-10-19）。
 *
 * ⚠️ **为什么不用 `a & b & wait`**：那是能用的最小写法，但它对本脚本要断的两件事都答不出来 ——
 *   ① `pnpm --filter … dev` 自己还要再 fork 一层 shell → vite/tsx 是**孙进程**。
 *      给 `pnpm` 发 SIGINT 不保证孙进程收到，于是 Ctrl-C 后端口仍被占，
 *      下一次启动就撞 `strictPort` 报错 —— 而报的是「端口被占」，**没人会想到是上一次没关干净**。
 *   ② 只想启动时先失败，没有「一方挂了就把另一方也收掉」的语义。
 *   这两件事都不是审美问题，是 Ctrl-C 后留孤儿进程，所以这里显式按**进程组**管理。
 *
 * 零依赖（只用 node: 内建模块），与仓内其余脚本一致。
 *
 * 根 `package.json` 里的三个入口：
 * - `dev` / `dev:all` → 本脚本（默认就起全，`dev` 直接指过来是刻意的 ——
 *   `docs/specs/theme.md` 的走查路径写的就是 `pnpm dev`，留半截等于让文档继续骗人）
 * - `dev:each` → 原先的 `pnpm -r --if-present dev`。**它的毛病不是并行，是会卡住**：
 *   pnpm 按依赖序逐个跑，而 vite / tsx watch 都是常驻进程 ⇒ 跑到第一个就不动了，
 *   后面的包永远排不上。保留它是因为「只起某一个包」偶尔有用（`--filter` 配合），
 *   但**起完整环境不要用它**。
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RULES = '─'.repeat(64)

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

function fail(msg) {
  console.error(`[dev:all] ${msg}`)
  process.exit(1)
}

const { api, web } = readPorts()
const WEB_URL = `http://127.0.0.1:${web}`
const API_URL = `http://127.0.0.1:${api}`

console.log(`[dev:all] ${RULES}`)
console.log(`[dev:all] 应用入口（浏览器打开这个）  ${WEB_URL}`)
console.log(`[dev:all] API（脚本直连）            ${API_URL}`)
console.log(`[dev:all] 浏览器走 Origin 白名单；脚本走 Bearer token。`)
console.log(`[dev:all]   curl 经 web 代理要手动带头，否则 401：`)
console.log(`[dev:all]     curl -H "Origin: ${WEB_URL}" ${WEB_URL}/api/terms`)
console.log(`[dev:all] Ctrl-C 会同时停掉两个进程。`)
console.log(`[dev:all] ${RULES}`)

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map()
let shuttingDown = false

function start(name, filter) {
  /* ⚠️ `shell: true` 不是偷懒，是**必需**：homebrew 装的 `pnpm` 是一个**无 shebang 的文本
     shim**（首行就是注释），Node 直接 spawn 它会 `ENOEXEC`（2026-10-19 实测）。
     而走 shell 恰好就是我们要的语义 —— 用 shell 解析得到的是「用户在终端里会跑到的那个
     pnpm」，而不是我们硬编码的一条路径（corepack / npm 安装 / Linux 下的形态都不同）。
     ⚠️ 实测过「不经过 shell」这条看起来更干净的路：它在本机根本起不来。
     两个实参都是本文件里的字面量，没有注入面。 */
  // ⚠️ detached:true 让每个子进程自成**进程组组长**，于是能按组发信号 ——
  //   否则 process.kill(-pid) 只会打到 pnpm 那一层，vite/tsx 留在原地占端口。
  const proc = spawn(`pnpm --filter ${filter} dev`, {
    cwd: ROOT,
    detached: true,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  children.set(name, proc)

  // 按行加前缀；必须缓冲到换行才输出，否则半行会被拆成两条日志。
  for (const stream of [proc.stdout, proc.stderr]) {
    let buf = ''
    stream.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const l of lines) console.log(`[${name}] ${l}`)
    })
    stream.on('end', () => {
      if (buf.trim()) console.log(`[${name}] ${buf}`)
    })
  }

  proc.on('exit', (code, sig) => {
    if (shuttingDown) return
    // 一方自己退了（多半是端口被占）⇒ 把另一方也收掉，别留半个环境。
    console.error(`[dev:all] ${name} 退出（code=${code} signal=${sig}），正在停掉其余进程`)
    shutdown(typeof code === 'number' && code !== 0 ? code : 1)
  })
  return proc
}

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
    console.log(`[dev:all] 已向 ${name} 进程组发 SIGTERM（pid ${proc.pid}）`)
  }
  const alive = [...children.values()].filter((p) => p.exitCode === null && p.signalCode === null)
  if (alive.length === 0) return process.exit(code)
  // 兜底：3 秒后还没走的按组 SIGKILL —— vite/tsx 偶尔会卡在等 stdin。
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

try {
  start('web', '@openvibe/web')
  start('server', '@openvibe/server')
} catch (e) {
  // ⚠️ 起不来也要收干净：让一个子进程抛异常就把另一个留在后台，
  //   下次启动就会撞「端口被占」，而报错的进程是上一次那个已经消失的 dev:all。
  console.error(`[dev:all] 启动失败：${e instanceof Error ? e.message : String(e)}`)
  shutdown(1)
}
