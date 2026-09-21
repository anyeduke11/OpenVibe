// apps/server dev 入口（DEV-0013 C-7/C-8）：最小可跑启动序列——
// openDatabase(~/.openvibe/data/openvibe.db，OPENVIBE_HOME 可覆盖) → buildApp → listen 127.0.0.1:8787。
// 完整八步 bootstrap（config.json token 持久化/播种/静态托管/日志）随 T7 serve 命令落地（design §4/§11）。
import { defaultDbPath, openDatabase } from '@openvibe/core'
import { buildApp } from './app'

const db = openDatabase(defaultDbPath())
const { app, token } = await buildApp({ db })

const port = Number(process.env.PORT ?? 8787)
await app.listen({ host: '127.0.0.1', port })
console.log(`[openvibe] server listening on http://127.0.0.1:${port} (db: ${defaultDbPath()})`)
console.log(`[openvibe] dev CLI token: ${token}（T7 起写入 ~/.openvibe/config.json）`)
