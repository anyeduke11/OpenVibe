// apps/server dev 入口（DEV-0013 C-7/C-8）：复用 bootstrap 的建库/播种/监听/静态托管，
// 令牌保持每次随机（m6b D-3：只有 serve 把 token 持久化进 config.json）。
import { defaultDbPath } from '@openvibe/core'
import {
  API_PORT_ENV,
  DEFAULT_PORT,
  LOOPBACK_HOST,
  WEB_PORT,
  WEB_PORT_ENV,
  resolvePort,
} from '@openvibe/shared'
import { bootstrap, defaultSeedDir, type BootError, type SeedSummary } from './bootstrap'

/**
 * 本次实例的**实际**端口（2026-10-30：dev 隔离实例）。
 *
 * `OPENVIBE_API_PORT` 覆盖监听端口，`OPENVIBE_WEB_PORT` 覆盖横幅里那个「应用入口」。
 * 两者与 vite 侧读**同名**变量 ⇒ server 监听、vite 代理目标、浏览器入口三者必然一致。
 *
 * ⚠️ 非法值大声失败（`resolvePort` 抛错 ⇒ 进程退出）：静默回落会让用户以为自己在
 *   隔离端口上跑，实际连的是真实实例 ⇒ 写库写进真实数据而他毫不知情。
 */
const apiPort = resolvePort(process.env[API_PORT_ENV], DEFAULT_PORT)
const webPort = resolvePort(process.env[WEB_PORT_ENV], WEB_PORT)

function seedLines(seed: SeedSummary): string[] {
  return Object.entries(seed.bundles).map(
    ([bundle, status]) =>
      `seed ${bundle}: ${status} +${seed.created[bundle] ?? 0} ~${seed.updated[bundle] ?? 0} 跳过${seed.skipped[bundle] ?? 0}`,
  )
}

let boot: Awaited<ReturnType<typeof bootstrap>>
try {
  boot = await bootstrap({
    dbPath: defaultDbPath(),
    seedDir: defaultSeedDir(),
    port: apiPort,
  })
} catch (e) {
  const err = e as BootError
  console.error(`[openvibe] 启动失败 [${err.code ?? 'UNKNOWN'}] ${err.message}`)
  process.exit(1)
}

for (const line of [...seedLines(boot.seed), ...boot.seed.warnings, ...boot.warnings]) {
  console.log(`[openvibe] ${line}`)
}

/**
 * 启动横幅（2026-10-19 新增）。
 *
 * ⚠️ **为什么必须打横幅**：原先只有一行「server listening on <API 端口>」，而那是 **API 口** ——
 *    浏览器打开它打不到界面，只能看到一坨 JSON 或一个 401。第一次起服务的人看到这行，
 *    合理推断是「server 挂了」，然后花时间排查端口。**日志没写错，只是它只说了一半。**
 *
 * ⚠️ **端口一律取自 shared 常量**，不在这里拼字符串：横幅若自己硬写端口，
 *    它就会在别人改端口后继续说一个过期地址 —— 而这正是它本该防止的那类误解。
 *    ⚠️ 本文件的**注释里也不许出现端口数字**：`tests/dev-ports.test.ts` 扫的是整份文本，
 *    散文里写一个数字会让守卫红，而那次红的修复方式是把措辞改掉，不是把守卫放松。
 */
const webUrl = `http://${LOOPBACK_HOST}:${String(webPort)}`
const rule = '─'.repeat(58)
console.log(`[openvibe] ${rule}`)
/**
 * 应用入口按「server 是否自己托管 web 产物」决定（2026-11-10）。
 *
 * 生产形态下 server 用 `@fastify/static` 托管 `apps/web/dist`（design §4 步骤 7）
 * ⇒ 页面与 API **同端口同源**，入口就是 `boot.url`。
 * 若产物缺失（`web.served === false`），server 只提供 API（m6b D-1 的降级），
 * 此时代理式入口是 vite 那个端口 —— 如实印出来，不假装页面在。
 */
if (boot.web.served) {
  console.log(`[openvibe] 应用入口（浏览器打开这个）  ${boot.url}`)
  console.log(`[openvibe] 页面与 API 同源（server 托管 web 产物）`)
} else {
  console.log(`[openvibe] 应用入口（浏览器打开这个）  ${webUrl}`)
  console.log('[openvibe]   ⚠️ 未找到 web 产物，本进程只提供 API；请先构建 web')
}
console.log(`[openvibe] API（脚本直连）            ${boot.url}`)
console.log(`[openvibe] 鉴权走两条通道：浏览器靠 Origin 白名单，脚本靠 Bearer token（下一行）。`)
/**
 * curl 提示按入口口径给（2026-11-10）。
 *
 * 生产形态（`web.served`）下页面与 API 同源 ⇒ 直接打 `boot.url` 即可；
 * 产物缺失时才回落到 vite 那个端口，此时确实要经代理。
 */
if (boot.web.served) {
  console.log(`[openvibe]   ⚠️ curl 必须手动带 Origin，否则 401（同源也要带，浏览器会自动带）：`)
  console.log(`[openvibe]     curl -H "Origin: ${boot.url}" ${boot.url}/api/terms`)
} else {
  console.log(
    `[openvibe]   ⚠️ curl 若走 web 代理（:${String(webPort)}）必须手动带 Origin，否则 401 —— 代理不会替你补这个头：`,
  )
  console.log(`[openvibe]     curl -H "Origin: ${webUrl}" ${webUrl}/api/terms`)
}
console.log(`[openvibe] ${rule}`)
console.log(`[openvibe] db: ${boot.dbPath}`)
console.log(
  `[openvibe] dev CLI token: ${boot.token}（openvibe serve 才会写入 ~/.openvibe/config.json）`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void boot.close().finally(() => process.exit(0))
  })
}
