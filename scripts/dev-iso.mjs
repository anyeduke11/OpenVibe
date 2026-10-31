#!/usr/bin/env node
/**
 * scripts/dev-iso.mjs —— 起一套**隔离的** dev 实例（2026-10-31）。
 *
 * ## 它解决什么
 *
 * 默认端口是写死的常量（web 5144 / API 8787），且 vite 侧 `strictPort: true`
 * ⇒ 同一台机器上只能起一套 dev 实例 ⇒ 任何**涉及写库**的真机实测都只能
 * 跑在用户真实数据上，风险只能靠「手轻」来兜。
 *
 * 本脚本把「隔离」变成**一条命令**：自动生成临时数据目录 + 自动挑两个空闲端口，
 * 然后把三项覆盖值交给 `scripts/dev-all.mjs`。
 *
 * ```sh
 * pnpm dev:iso
 * ```
 *
 * ## 为什么端口要「先探再放」
 *
 * 端口 0（内核分配）只对 **API** 有效：服务端能自己听随机端口，
 * 但 **web** 端口必须**事先定死** —— vite 的 `strictPort` 要求它绑定成功，
 * 而浏览器要按那个地址打开页面。
 *
 * ⇒ 用「先 listen(0) 拿到一个空闲端口 → close → 用它」的经典做法。
 * ⚠️ 这里有**竞态窗口**（探到之后、真正 listen 之前，端口可能被别处占走）：
 *   本仓的失败表现是 vite 直接报错退出（strictPort）⇒ 不会静默漂移，
 *   代价只是「重跑一次」。
 *
 * ## 数据目录
 *
 * 落在 `/tmp/ov-iso-<时间戳>-<随机>` ⇒ 与真实 `~/.openvibe` 完全分开。
 * ⚠️ **不会自动清理**：沙箱里有播种出来的库文件与导出件，
 *   自动删掉会让人以为「跑过的东西还在」——需要时由人手动删。
 *
 * ## 与 `dev:all` 的关系
 *
 * 本脚本**不自己起进程**，只算覆盖值然后交给 `dev-all.mjs` ⇒
 * 进程组管理（Ctrl-C 清干净孙进程）那套逻辑只有一份，不重复实现。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 探一个当前空闲的端口。
 *
 * ⚠️ 竞态窗口说明见文件头：探到之后端口并未被占住，
 *   只是「大概率还空着」。本仓的 vite `strictPort` 会把撞车变成显式报错。
 */
function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('拿不到空闲端口（address 不是 TCP 端点）'))
        return
      }
      const { port } = address
      server.close(() => resolvePromise(port))
    })
  })
}

const apiPort = await findFreePort()
const webPort = await findFreePort()

// ⚠️ 两个端口必须不同：探端口可能连着两次拿到同一个（刚 close 的端口会被复用）
const webPortFinal = webPort === apiPort ? await findFreePort() : webPort

const home = mkdtempSync(join(tmpdir(), 'ov-iso-'))
mkdirSync(home, { recursive: true })

const env = {
  ...process.env,
  OPENVIBE_HOME: home,
  OPENVIBE_API_PORT: String(apiPort),
  OPENVIBE_WEB_PORT: String(webPortFinal),
}

console.log('─'.repeat(64))
console.log('[dev:iso] 隔离实例（数据与端口都不碰真实环境）')
console.log(`[dev:iso]   数据目录：${home}`)
console.log(`[dev:iso]   API 端口：${apiPort}`)
console.log(`[dev:iso]   web 端口：${webPortFinal}  ← 浏览器打开 http://127.0.0.1:${webPortFinal}`)
console.log(`[dev:iso]   真实环境未受影响：~/.openvibe 与 :${8787} 都保持原样`)
console.log(`[dev:iso]   沙箱不会自动清理（跑完要删就删：${home}）`)
console.log('─'.repeat(64))

const child = spawn('node', [join(ROOT, 'scripts', 'dev-all.mjs')], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: false,
})

// 子进程退出 ⇒ 本脚本跟着退出（否则会留一个空壳进程占着终端）
child.on('exit', (code, signal) => {
  if (signal !== null) process.exit(1)
  process.exit(code ?? 0)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try {
      child.kill(sig)
    } catch {
      /* 已退出 */
    }
  })
}
