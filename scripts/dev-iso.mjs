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
 * ## 端口被占 ⇒ 自动换一组再来（2026-10-31 增补）
 *
 * 端口 0（内核分配）只对 **API** 有效：服务端能自己听随机端口，
 * 但 **web** 端口必须**事先定死** —— vite 的 `strictPort` 要求它绑定成功，
 * 而浏览器要按那个地址打开页面。
 *
 * ⇒ 用「先 listen(0) 拿到一个空闲端口 → close → 用它」的经典做法。
 * ⚠️ 这里有**竞态窗口**（探到之后、真正 listen 之前，端口可能被别处占走）：
 *   本仓的失败表现是 vite 直接报错退出（strictPort）⇒ 不会静默漂移，
 *   但代价是「人读报错、手动重跑」。
 *
 * ⇒ 现在**自动恢复**：起进程时盯着输出里的端口冲突信号
 *   （`is already in use` / `EADDRINUSE`），撞上了就**换一组端口重试**
 *   （最多 `PORT_RETRY_LIMIT` 次），并把重试打印出来。
 *   分配与重试的实现见 `scripts/iso-ports.mjs`（可单测）。
 *
 * ## 数据目录
 *
 * 落在 `/tmp/ov-iso-<随机>` ⇒ 与真实 `~/.openvibe` 完全分开。
 * ⚠️ **不会自动清理**：沙箱里有播种出来的库文件与导出件，
 *   自动删掉会让人以为「跑过的东西还在」——需要时由人手动删。
 *
 * ## 与 `dev:all` 的关系
 *
 * 本脚本**不自己起进程**，只算覆盖值然后交给 `dev-all.mjs` ⇒
 * 进程组管理（Ctrl-C 清干净孙进程）那套逻辑只有一份，不重复实现。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectPortConflict, pickPortPair, withPortRetry } from './iso-ports.mjs'
import { spawnIsolated } from './isolated-home.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const home = mkdtempSync(join(tmpdir(), 'ov-iso-'))

/** 当前在跑的子进程（Ctrl-C 要转给它） */
let current = null

/**
 * 起一次 `dev-all.mjs`，等它退出，并回报「这次是不是端口冲突」。
 *
 * ⚠️ **为什么自己 tee 一遍输出**（而不是 `stdio: 'inherit'`）：
 *   端口冲突的信号只出现在**输出文本里**（vite 的 `is already in use`、
 *   node 的 `EADDRINUSE`）⇒ 要判它就得读到它。
 *   读到之后照样原样转出去 ⇒ 人看到的输出与之前一致。
 */
function attempt(ports) {
  return new Promise((resolveAttempt) => {
    console.log('─'.repeat(64))
    console.log('[dev:iso] 隔离实例（数据与端口都不碰真实环境）')
    console.log(`[dev:iso]   数据目录：${home}`)
    console.log(`[dev:iso]   API 端口：${ports.api}`)
    console.log(`[dev:iso]   web 端口：${ports.web}  ← 浏览器打开 http://127.0.0.1:${ports.web}`)
    console.log('[dev:iso]   真实环境未受影响：~/.openvibe 与 :8787 都保持原样')
    console.log(`[dev:iso]   沙箱不会自动清理（跑完要删就删：${home}）`)
    console.log('─'.repeat(64))

    // ⚠️ `OPENVIBE_HOME` 由守卫决定（先断言、再投递）⇒ 与横幅里印的「数据目录」必然同一个
    const child = spawnIsolated('node', [join(ROOT, 'scripts', 'dev-all.mjs')], home, {
      cwd: ROOT,
      env: {
        OPENVIBE_API_PORT: String(ports.api),
        OPENVIBE_WEB_PORT: String(ports.web),
      },
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
      label: 'dev:iso 沙箱 home',
    })
    current = child

    // ⚠️ **冲突信号要「流式锁存」而不是事后扫全量**：vite 的报错出现在起动阶段，
    //   而它后面还跟着 dev-all 的收尾日志 ⇒ 只看「最后一屏」会把真正的信号挤出去。
    //   一旦认出来就记住，之后无论再输出什么都不影响判定。
    let conflict = false
    // 保留一小段尾巴：报错文案可能被切成两块（"EADDRIN" + "INUSE"）⇒ 跨块拼一下再判
    let tail = ''
    const observe = (chunk) => {
      if (conflict) return
      if (detectPortConflict(tail + chunk)) {
        conflict = true
        return
      }
      tail = (tail + chunk).slice(-256)
    }
    child.stdout.on('data', (d) => {
      observe(d.toString())
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      observe(d.toString())
      process.stderr.write(d)
    })

    child.on('exit', (code, signal) => {
      current = null
      resolveAttempt({
        conflict,
        // 被信号杀掉算失败（退出码 1）——「人主动收工」走的是另一条路
        code: signal !== null ? 1 : (code ?? 0),
      })
    })
  })
}

// Ctrl-C / SIGTERM 要转给子进程（否则 Ctrl-C 只杀了本脚本，dev 进程留在后台占端口）
// ⚠️ **必须在 await 之前注册**：`process.exit` 是同步终止，注册在它之后就等于没注册。
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (current === null) return
    try {
      current.kill(sig)
    } catch {
      /* 已退出 */
    }
  })
}

const result = await withPortRetry({
  allocate: () => pickPortPair(),
  attempt,
  onRetry: ({ attempt: n, limit, ports }) => {
    console.log(
      `[dev:iso] ⚠️ 端口被占用（API ${ports.api} / web ${ports.web}），换一组重试（${n}/${limit}）`,
    )
  },
})

if (result.exhausted) {
  console.error(
    `[dev:iso] ✗ 连续 ${result.attempts} 次都撞上端口被占 ⇒ 放弃（换一组端口再试，或先停掉占着端口的进程）`,
  )
}
// ⚠️ **用 `exitCode` 而不是 `process.exit()`**：输出改成 tee 之后，
//   stdout 可能是异步写的（被重定向到管道时）⇒ `process.exit` 会把尾巴截断。
//   事件循环自然排空时 Node 会自己 flush 完再按 exitCode 退出。
process.exitCode = result.code ?? 0
