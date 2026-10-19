// apps/server dev 入口（DEV-0013 C-7/C-8）：复用 bootstrap 的建库/播种/监听/静态托管，
// 令牌保持每次随机（m6b D-3：只有 serve 把 token 持久化进 config.json）。
import { defaultDbPath } from '@openvibe/core'
import { DEFAULT_PORT, LOOPBACK_HOST, WEB_PORT } from '@openvibe/shared'
import { bootstrap, defaultSeedDir, type BootError, type SeedSummary } from './bootstrap'

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
    port: Number(process.env.PORT ?? DEFAULT_PORT),
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
const webUrl = `http://${LOOPBACK_HOST}:${WEB_PORT}`
const rule = '─'.repeat(58)
console.log(`[openvibe] ${rule}`)
console.log(`[openvibe] 应用入口（浏览器打开这个）  ${webUrl}`)
console.log(`[openvibe] API（脚本直连）            ${boot.url}`)
console.log(`[openvibe] 鉴权走两条通道：浏览器靠 Origin 白名单，脚本靠 Bearer token（下一行）。`)
console.log(
  `[openvibe]   ⚠️ curl 若走 web 代理（:${WEB_PORT}）必须手动带 Origin，否则 401 —— 代理不会替你补这个头：`,
)
console.log(`[openvibe]     curl -H "Origin: ${webUrl}" ${webUrl}/api/terms`)
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
