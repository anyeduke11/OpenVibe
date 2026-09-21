// apps/server dev 入口（DEV-0013 C-7/C-8）：最小可跑启动序列——
// openDatabase(~/.openvibe/data/openvibe.db，OPENVIBE_HOME 可覆盖) → 幂等播种 → buildApp → listen 127.0.0.1:8787。
// 完整八步 bootstrap（config.json token 持久化/静态托管/日志）随 T7 serve 命令落地（design §4/§11）。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultDbPath, openDatabase, runSeed } from '@openvibe/core'
import { buildApp } from './app'

const db = openDatabase(defaultDbPath())
// DEV-0014 C-12：种子在 dev 入口按 design §15 幂等加载（T7 起并入八步 bootstrap 第 4 步）
const seedDir =
  process.env.OPENVIBE_SEED_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')
for (const r of runSeed(db, seedDir)) {
  if (r.status !== 'skipped' || r.warnings.length > 0) {
    console.log(`[openvibe] seed ${r.bundle}: ${r.status} +${r.created} ~${r.updated} 跳过${r.skipped}`)
    for (const w of r.warnings) console.log(`[openvibe]   warning: ${w}`)
  }
}

const { app, token } = await buildApp({ db })

const port = Number(process.env.PORT ?? 8787)
await app.listen({ host: '127.0.0.1', port })
console.log(`[openvibe] server listening on http://127.0.0.1:${port} (db: ${defaultDbPath()})`)
console.log(`[openvibe] dev CLI token: ${token}（T7 起写入 ~/.openvibe/config.json）`)
