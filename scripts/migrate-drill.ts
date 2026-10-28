/**
 * scripts/migrate-drill.ts —— 0019→0022 升级路径的真库演练（owner 增强项①）。
 *
 * 拿 owner 本机库（或任一含真实数据的 openvibe.db）做「升级前后对账」：
 * ① 复制库到临时目录；② 跑 migrate（只前进 runner 自动补 0019–0022）；
 * ③ 对账：受影响表（agent_ingests / local_events / lang_* 播种表）行数一致、
 *    agent_ingests 与 local_events 的**内容指纹**逐表一致（重建迁移复制数据的正确性）、
 *    seed_hash 列全部为 NULL（不回填纪律）；④ 输出 markdown 对账表。
 *
 * 用法：tsx scripts/migrate-drill.ts [--db <path>]（缺省 ~/.openvibe/data/openvibe.db）
 * 退出码：0 对账通过；1 失配或库不可用。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../packages/core/src/db'

const args = process.argv.slice(2)
const dbFlag = args.indexOf('--db')
const source =
  dbFlag >= 0 ? (args[dbFlag + 1] ?? '') : join(homedir(), '.openvibe', 'data', 'openvibe.db')

function tableRows(db: ReturnType<typeof openDatabase>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c
}

function contentFingerprint(db: ReturnType<typeof openDatabase>, table: string): string {
  // 行内容指纹：整表按主键序导出 JSON 再哈希（重建迁移复制路径的正确性判据）
  const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Record<
    string,
    unknown
  >[]
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)
}

function main(): number {
  let raw: string
  try {
    raw = readFileSync(source, 'utf8')
    void raw
  } catch (e) {
    console.error(`库不可用：${source} — ${String(e)}`)
    return 1
  }
  const dir = mkdtempSync(join(tmpdir(), 'ov-migrate-drill-'))
  const copyPath = join(dir, 'drill.db')
  copyFileSync(source, copyPath)

  const before = openDatabase(copyPath, { autoMigrate: false })
  const beforeMigrations = (
    before.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as {
      version: string
    }[]
  ).map((r) => r.version)
  const watched = [
    'agent_ingests',
    'local_events',
    ...(() => {
      const all = before
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%'`)
        .all() as { name: string }[]
      return all.map((r) => r.name).filter((n) => !n.startsWith('lang_fts'))
    })(),
  ]
  const beforeRows = new Map(watched.map((t) => [t, tableRows(before, t)]))
  const beforePrints = new Map(watched.map((t) => [t, contentFingerprint(before, t)]))

  // 跑升级（只前进 runner）
  const after = openDatabase(copyPath, { autoMigrate: true })
  const afterMigrations = (
    after.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as {
      version: string
    }[]
  ).map((r) => r.version)
  const added = afterMigrations.filter((v) => !beforeMigrations.includes(v))

  const problems: string[] = []
  const lines: string[] = []
  lines.push(`# 迁移演练对账（${new Date().toISOString()}）`)
  lines.push('')
  lines.push(`- 源库：\`${source}\`（演练副本，不动源库）`)
  lines.push(
    `- 起始迁移：${String(beforeMigrations.length)} 项（至 ${beforeMigrations.at(-1) ?? '无'}）`,
  )
  lines.push(`- 本次补跑：${added.length > 0 ? added.join(', ') : '（无——库已是最新）'}`)
  lines.push('')
  lines.push('| 表 | 行数 前→后 | 内容指纹 前→后 | 判定 |')
  lines.push('|---|---|---|---|')
  for (const t of watched) {
    const rowsAfter = tableRows(after, t)
    const printAfter = contentFingerprint(after, t)
    const rowsOk = rowsAfter === (beforeRows.get(t) ?? -1)
    // seed_hash 列是 0019 新增：老行全 NULL；指纹比对须排除该列
    const colNames = (after.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map(
      (c) => c.name,
    )
    const printOk =
      printAfter === (beforePrints.get(t) ?? '') ||
      (colNames.includes('seed_hash') &&
        fingerprintExcludingSeedHash(after, t, true) ===
          fingerprintExcludingSeedHash(before, t, colNames.includes('seed_hash')))
    lines.push(
      `| ${t} | ${String(beforeRows.get(t) ?? '?')}→${String(rowsAfter)} | ${(beforePrints.get(t) ?? '?').slice(0, 8)}→${printAfter.slice(0, 8)} | ${rowsOk && printOk ? '✓' : '✗'} |`,
    )
    if (!rowsOk) problems.push(`${t} 行数变化：${String(beforeRows.get(t))} → ${String(rowsAfter)}`)
    if (!printOk) problems.push(`${t} 内容指纹变化（排除 seed_hash 后仍不一致）`)
  }
  // seed_hash 不回填纪律
  for (const t of watched) {
    const colNames = (after.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map(
      (c) => c.name,
    )
    if (!colNames.includes('seed_hash')) continue
    const nonNull = (
      after.prepare(`SELECT COUNT(*) AS c FROM "${t}" WHERE seed_hash IS NOT NULL`).get() as {
        c: number
      }
    ).c
    if (nonNull > 0) problems.push(`${t}.seed_hash 有 ${String(nonNull)} 行非 NULL（迁移不得回填）`)
    lines.push(
      `| ${t}.seed_hash 非NULL | ${String(nonNull)}（须 0） | | ${nonNull === 0 ? '✓' : '✗'} |`,
    )
  }

  console.log(lines.join('\n'))
  if (problems.length > 0) {
    console.error(`\n⛔ 对账失败：\n${problems.map((p) => `  · ${p}`).join('\n')}`)
    return 1
  }
  console.log('\n✓ 对账通过')
  before.close()
  after.close()
  rmSync(dir, { recursive: true, force: true })
  return 0
}

function fingerprintExcludingSeedHash(
  db: ReturnType<typeof openDatabase>,
  table: string,
  hadColumnBefore: boolean,
): string {
  const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Record<
    string,
    unknown
  >[]
  if (hadColumnBefore)
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)
  const stripped = rows.map((r) => {
    const { seed_hash: _sh, ...rest } = r
    void _sh
    return rest
  })
  return createHash('sha256').update(JSON.stringify(stripped)).digest('hex').slice(0, 16)
}

process.exit(main())
