// apps/server dev 入口（DEV-0013 C-7/C-8）：复用 bootstrap 的建库/播种/监听/静态托管，
// 令牌保持每次随机（m6b D-3：只有 serve 把 token 持久化进 config.json）。
import { defaultDbPath } from '@openvibe/core'
import { DEFAULT_PORT } from '@openvibe/shared'
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
console.log(`[openvibe] server listening on ${boot.url} (db: ${boot.dbPath})`)
console.log(
  `[openvibe] dev CLI token: ${boot.token}（openvibe serve 才会写入 ~/.openvibe/config.json）`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void boot.close().finally(() => process.exit(0))
  })
}
