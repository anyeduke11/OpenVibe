// §10-7 统计腿（W-4 · 触发器⑦判定数据）：pack_exported 版本增速探针
//
// 口径（分析文 §10-7 原文）：「Phase 3 前统计 pack_exported 的版本增速（每项目每年几次）」。
// 本仓没有「每项目」的导出面——pack_exports 是**库侧**事实（每次导出一个 (pack, version)），
// 用户侧的消费对照是 injections 表。故本探针给出三个量：
//   ① 导出速率   = pack_exports 总行数 / 观察窗天数（首行导出 → 现在）
//   ② 版本增速   = 每包 distinct 版本数 / 观察窗年数（折算「每包每年几版」）
//   ③ 消费转化   = injections 总行数（导出未被注入 = 版本产出了但没被用户盘消费）
// 判定阈值属 owner（㉝ 的判定腿）；本探针只出数据，不代判触发与否。
//
// 复算：node docs/devlog-evidence/refactor-w4/export-growth-probe.mjs [--db <path>]
// 只读打开（{ readonly: true }），零写入。

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

// better-sqlite3 是 packages/core 的依赖（pnpm 不提升到根）——require 锚到 core 的 package.json
const coreRequire = createRequire(new URL('../../../packages/core/package.json', import.meta.url))
const Database = coreRequire('better-sqlite3')

const dbArgIdx = process.argv.indexOf('--db')
const dbPath =
  dbArgIdx >= 0 ? process.argv[dbArgIdx + 1] : join(homedir(), '.openvibe', 'data', 'openvibe.db')

const db = new Database(dbPath, { readonly: true })

const exports_ = db
  .prepare(
    `SELECT sp.name AS pack_name, pe.version, pe.channel, pe.exported_at
       FROM pack_exports pe JOIN standard_packs sp ON sp.id = pe.pack_id
      ORDER BY pe.exported_at ASC`,
  )
  .all()
const injections = db.prepare('SELECT COUNT(*) AS n FROM injections').get().n
const ledgerPackExported = db
  .prepare(`SELECT COUNT(*) AS n FROM local_events WHERE kind = 'pack_exported'`)
  .get().n

const now = new Date()
const first = exports_.length > 0 ? new Date(exports_[0].exported_at) : null
const windowDays =
  first !== null ? Math.max((now.getTime() - first.getTime()) / 86400000, 0.001) : null

const byPack = new Map()
for (const r of exports_) {
  const list = byPack.get(r.pack_name) ?? []
  list.push(r.version)
  byPack.set(r.pack_name, list)
}

console.log(`db: ${dbPath}`)
console.log(`采样时刻: ${now.toISOString()}`)
console.log(`pack_exports 行数: ${exports_.length}`)
console.log(`injections 行数: ${injections}`)
console.log(
  `local_events[pk_exported] 行数: ${ledgerPackExported}（U-11 写入点 2026-11-20 才落地，历史导出无台账行）`,
)
if (exports_.length === 0) {
  console.log('结论输入: 零样本——观察窗无法定义')
} else {
  console.log(
    `观察窗: ${first.toISOString()} → ${now.toISOString()}（${windowDays.toFixed(1)} 天）`,
  )
  console.log(
    `① 导出速率: ${exports_.length} 次 / ${windowDays.toFixed(1)} 天 = ${(exports_.length / windowDays).toFixed(4)} 次/天`,
  )
  for (const [name, versions] of byPack) {
    const years = windowDays / 365.25
    console.log(
      `② 版本增速[${name}]: ${versions.length} 版 / ${years.toFixed(3)} 年 = ${(versions.length / years).toFixed(2)} 版/年（${versions.join(', ')}）`,
    )
  }
  console.log(`③ 消费转化: injections=${injections}（导出 ${exports_.length} 次中从未被注入消费）`)
}
db.close()
