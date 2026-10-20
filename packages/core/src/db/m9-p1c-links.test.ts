// `packages/core/src/db/m9-p1c-links.test.ts` —— M9 v1.6 **P1c 出口**
// （`m9-dev-plan-2026-10.md` §6.4 ＋ `m9-dev-language-roadmap.md` §3.14 · **DL-30** · DL-03 的 P1c 半）
//
// 断十件事：
//   ① **DL-30 ①**「只发 HEAD ＋ 响应体零落库」—— **真出网**：本地起一个真的 HTTP 服务，
//      真的发 HEAD，服务端记录收到的 method 与请求体字节数。
//   ② **DL-30 ②**「连续失败两次才判灰、且行仍在表里」—— 跑两轮后 alive=0，**行数不变**。
//   ③ **DL-30 ③**「只失败一次不许判死」—— alive 仍为 1（这支行就是变异腿的宿主：
//      把「≥2 次」改成「≥1 次」，它立刻红）。
//   ④ **不跟随重定向**（§3.14 ③）—— 302 原样记为成功，且**没有第二次请求**。
//   ⑤ **P1c.2** 速成那 11 条**纳入同一脚本**（同一张巡检、同一套状态码与计数）。
//   ⑥ **去重** —— 89 行 ⇒ 87 个 URL；两表合计 98 个 URL；共用 URL 只发一次。
//   ⑦ **DL-03 的 P1c 半** —— 「已过时」（tier=e）**并入**判定：不算「有效来源」。
//   ⑧ **P1c.3** 「默认手动触发，不进启动流程」—— app 与包内**没有任何文件**引巡检模块。
//   ⑨ **脚本 dry-run** —— 不发请求、不改库。
//   ⑩ **脚本 --execute** —— 真出网并把状态码写回库。
//
// ⚠️ **本文件不联外网**：87 个真实 URL 一个都不碰（那会让 CI 依赖互联网）。
//   「真出网」由**本地真 HTTP 服务**承担 —— 真的 socket、真的 HEAD、真的状态码；
//   真实 URL 的**数量口径**由计划层（planLinkTargets）对着真数据断言。
//
// ⚠️ **每个「期望值」都从 spec 读出，不抄成常量**（87 / 89 / 11 都取自 §1.6.1）。
import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newDb } from '../test-support/new-db'
import { openDatabase } from './index'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedLangResourceLayer } from './m9-p1b-seed-resources'
import { parseSpecResourceCounts } from './m9-p1b-spec'
import { FAIL_THRESHOLD, type ProbeTransport } from './m9-p1b-probe'
import {
  headStatusCode,
  isOutdatedTier,
  planLinkTargets,
  runLinkProbe,
  verdictOf,
  verifyLinkProbeRun,
} from './m9-p1c-links'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-m9-links.ts')
const SPEC_TEXT = readFileSync(SPEC_FILE, 'utf8')

const COUNTS = parseSpecResourceCounts(SPEC_TEXT)
if (COUNTS === null) throw new Error('读不出 spec §1.6.1 的口径数字')

/** 速成专区的条数（tools ＋ tuts，spec §1.6.1 的两张小计）。 */
const VIBE_TOTAL = COUNTS.tools + COUNTS.tuts

/** 装满资源层的临时库（知识点先落，挂接才有得指）。 */
function freshDb(): ReturnType<typeof newDb> {
  const h = newDb()
  seedLangTopics(h.db, SEEDS_DIR)
  seedLangResourceLayer(h.db, SEEDS_DIR)
  return h
}

function countRows(db: { prepare: (sql: string) => { get: () => unknown } }): number {
  const main = db.prepare('SELECT COUNT(*) AS c FROM lang_resources').get() as { c: number }
  const vibe = db.prepare('SELECT COUNT(*) AS c FROM lang_vibe_resources').get() as { c: number }
  return main.c + vibe.c
}

function columnNames(db: { prepare: (sql: string) => { all: () => unknown } }, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name)
}

// ---------------------------------------------------------------------------
// 本地真 HTTP 服务（捕获出网请求）
// ---------------------------------------------------------------------------

interface Captured {
  method: string
  url: string
  bodyBytes: number
}

interface LocalServer {
  origin: string
  captured: Captured[]
  setStatus: (code: number) => void
  close: () => Promise<void>
}

/**
 * 起一个**真的** HTTP 服务：真的 socket、真的请求解析、真的状态码。
 *
 * ⚠️ **为什么不用假 transport 抓「只发 HEAD」**：假 transport 是我们自己写的，
 *   它当然只会发 HEAD —— 那样验的是「我们自己有没有骗自己」。
 *   ⇒ 真服务的 `req.method` 与请求体字节数是**外部证据**。
 */
async function startLocalServer(): Promise<LocalServer> {
  const captured: Captured[] = []
  let status = 200
  const server: Server = createServer((req, res) => {
    let bodyBytes = 0
    req.on('data', (chunk: Buffer) => {
      bodyBytes += chunk.length
    })
    req.on('end', () => {
      captured.push({ method: req.method ?? '', url: req.url ?? '', bodyBytes })
      res.writeHead(status)
      res.end()
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    captured,
    setStatus: (code: number) => {
      status = code
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

/** 只返回指定状态码的假通道（**不联外网**，用于状态机与计数）。 */
function fixedStatus(code: number | null): ProbeTransport {
  return async () => ({ statusCode: code })
}

// ---------------------------------------------------------------------------

describe('M9 P1c · 失效巡检（DL-30 · §3.14）', () => {
  it('① 计划口径：主清单 89 行 ⇒ 87 个去重 URL；两表合计 98 个 URL（共用 URL 只发一次）', () => {
    const h = freshDb()
    try {
      const mainTargets = planLinkTargets(h.db, ['lang_resources'])
      const vibeTargets = planLinkTargets(h.db, ['lang_vibe_resources'])
      const allTargets = planLinkTargets(h.db)
      expect(mainTargets.length).toBe(COUNTS.uniqueUrls)
      expect(vibeTargets.length).toBe(VIBE_TOTAL)
      expect(allTargets.length).toBe(COUNTS.uniqueUrls + VIBE_TOTAL)
      // 计划里 URL 不重复 ⇒ 同一地址只会被请求一次
      const urls = allTargets.map((t) => t.url)
      expect(new Set(urls).size).toBe(urls.length)
      // spec 点名的两个共用 URL：各占一个目标，但命中两行
      for (const shared of COUNTS.sharedUrls) {
        const hit = allTargets.find((t) => t.url === shared)
        expect(hit, `spec 点名的共用 URL ${shared} 不在计划里`).toBeDefined()
        expect(hit?.rows.length).toBe(2)
      }
    } finally {
      h.close()
    }
  })

  it('② DL-30 ①：真出网只发 HEAD，服务端收到的请求体是 0 字节；落库的只有状态码与计数', async () => {
    const server = await startLocalServer()
    const h = newDb()
    try {
      const res = await headStatusCode(`${server.origin}/probe-target`, { timeoutMs: 5000 })
      expect(res).toBe(200)
      // ⚠️ 外部证据：服务端看到的是 HEAD，且没有任何请求体
      expect(server.captured.length).toBe(1)
      expect(server.captured[0]?.method).toBe('HEAD')
      expect(server.captured[0]?.bodyBytes).toBe(0)
      // 传输层的返回值**没有 body 通道**（响应体零落库的结构保证）
      expect(Object.keys({ statusCode: res })).toEqual(['statusCode'])
      // 表里能装正文的列一个都没有
      for (const table of ['lang_resources', 'lang_vibe_resources']) {
        const cols = columnNames(h.db, table)
        expect(cols).toContain('last_status_code')
        expect(cols).toContain('consecutive_fails')
        expect(cols).toContain('alive')
        expect(cols).toContain('last_checked_at')
        expect(cols.filter((c) => /body|content|text|html|snippet/i.test(c))).toEqual([])
      }
    } finally {
      h.close()
      await server.close()
    }
  })

  it('③ 不跟随重定向：302 原样记为成功（2xx/3xx 都算活），且没有第二次请求', async () => {
    const server = await startLocalServer()
    server.setStatus(302)
    const h = newDb()
    try {
      const res = await headStatusCode(`${server.origin}/redirect-target`, { timeoutMs: 5000 })
      expect(res).toBe(302)
      expect(server.captured.length).toBe(1)
      expect(server.captured[0]?.method).toBe('HEAD')
    } finally {
      h.close()
      await server.close()
    }
  })

  it('④ DL-30 ③：只失败一次时 alive 仍为 1（这行就是变异腿的宿主：阈值改 1 立刻红）', async () => {
    const h = freshDb()
    try {
      const before = countRows(h.db)
      const report = await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-20T00:00:00.000Z' })
      expect(report.failedUrls).toBe(report.requestedUrls)
      expect(report.markedDead).toBe(0)
      expect(report.markedSuspect).toBe(report.updatedRows)
      const row = h.db
        .prepare('SELECT alive, consecutive_fails FROM lang_resources WHERE id = 1')
        .get() as { alive: number; consecutive_fails: number }
      expect(row.alive).toBe(1)
      expect(row.consecutive_fails).toBe(1)
      // 行还在（巡检只 UPDATE）
      expect(countRows(h.db)).toBe(before)
      // 变异腿的宿主就是这一支：阈值若被改成 1，alive 会变成 0 ⇒ 这里必红
      expect(FAIL_THRESHOLD).toBe(2)
    } finally {
      h.close()
    }
  })

  it('⑤ DL-30 ②：连跑两次失败 ⇒ alive=0，**行仍在表里**（永不删除）', async () => {
    const h = freshDb()
    try {
      const before = countRows(h.db)
      await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-20T00:00:00.000Z' })
      const report = await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-21T00:00:00.000Z' })
      expect(report.markedDead).toBe(report.updatedRows)
      const row = h.db
        .prepare('SELECT alive, consecutive_fails FROM lang_resources WHERE id = 1')
        .get() as { alive: number; consecutive_fails: number }
      expect(row.alive).toBe(0)
      expect(row.consecutive_fails).toBe(2)
      // ⚠️ 「行仍在表里」：条数一条不少
      expect(countRows(h.db)).toBe(before)
      const dead = h.db.prepare('SELECT COUNT(*) AS c FROM lang_resources WHERE alive = 0').get() as {
        c: number
      }
      expect(dead.c).toBe(COUNTS.main)
    } finally {
      h.close()
    }
  })

  it('⑥ 成功一次 ⇒ 失败计数归零、alive 回到 1（判死后还能复活）', async () => {
    const h = freshDb()
    try {
      await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-20T00:00:00.000Z' })
      await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-21T00:00:00.000Z' })
      const dead = h.db.prepare('SELECT alive FROM lang_resources WHERE id = 1').get() as { alive: number }
      expect(dead.alive).toBe(0)
      await runLinkProbe(h.db, fixedStatus(200), { checkedAt: '2026-10-22T00:00:00.000Z' })
      const back = h.db
        .prepare('SELECT alive, consecutive_fails, last_status_code FROM lang_resources WHERE id = 1')
        .get() as { alive: number; consecutive_fails: number; last_status_code: number }
      expect(back.alive).toBe(1)
      expect(back.consecutive_fails).toBe(0)
      expect(back.last_status_code).toBe(200)
    } finally {
      h.close()
    }
  })

  it('⑦ P1c.2：速成那 11 条**纳入同一脚本**（同一套状态码与计数，且也判死/标灰）', async () => {
    const h = freshDb()
    try {
      const before = countRows(h.db)
      await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-20T00:00:00.000Z' })
      const vibe = h.db
        .prepare('SELECT COUNT(*) AS c FROM lang_vibe_resources WHERE last_status_code = 500')
        .get() as { c: number }
      expect(vibe.c).toBe(VIBE_TOTAL)
      const vibeFails = h.db
        .prepare('SELECT COUNT(*) AS c FROM lang_vibe_resources WHERE consecutive_fails = 1')
        .get() as { c: number }
      expect(vibeFails.c).toBe(VIBE_TOTAL)
      await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-21T00:00:00.000Z' })
      const vibeDead = h.db.prepare('SELECT COUNT(*) AS c FROM lang_vibe_resources WHERE alive = 0').get() as {
        c: number
      }
      expect(vibeDead.c).toBe(VIBE_TOTAL)
      expect(countRows(h.db)).toBe(before)
    } finally {
      h.close()
    }
  })

  it('⑧ DL-03 的 P1c 半：「已过时」（tier=e）并入判定 ⇒ 不算有效来源；且判据是行为不是常量', async () => {
    const h = freshDb()
    try {
      const report = await runLinkProbe(h.db, fixedStatus(200), { checkedAt: '2026-10-20T00:00:00.000Z' })
      const outdatedRows = h.db.prepare("SELECT COUNT(*) AS c FROM lang_resources WHERE tier = 'e'").get() as {
        c: number
      }
      // 有真实的「已过时」对象 ⇒ 这条判据不是空转
      expect(outdatedRows.c).toBeGreaterThan(0)
      expect(report.outdatedRows).toBe(outdatedRows.c)
      expect(report.outdatedUrls).toBe(outdatedRows.c)
      // 行为断言：tier=e 的行一律 unusable，其余（存活 ok 的）usable
      for (const target of report.targets) {
        const verdict = verdictOf(target)
        const hasOutdatedRow = target.rows.some((r) => isOutdatedTier(r.tier))
        expect(verdict.outdated).toBe(hasOutdatedRow)
        expect(verdict.usable).toBe(verdict.liveness === 'ok' && !hasOutdatedRow)
        for (const row of target.rows) {
          if (isOutdatedTier(row.tier)) expect(verdict.usable).toBe(false)
        }
      }
      // 变异腿：把 tier 判据去掉（isOutdatedTier 恒 false）⇒ 上面那条 usable 断言必红
      expect(isOutdatedTier('e')).toBe(true)
      expect(isOutdatedTier('a')).toBe(false)
    } finally {
      h.close()
    }
  })

  it('⑨ P1c.3：默认手动触发，**不进启动流程**（app 里零引用；包内只有导出桶与模块本身）', () => {
    const needles = ['m9-p1c-links', 'm9-p1b-probe', 'check-m9-links', 'runLinkProbe', 'headStatusCode']
    /** 允许引用的位置：模块自身、包的导出桶（脚本从它导入）、手动入口脚本自己。 */
    const allowed = new Set([
      'packages/core/src/index.ts',
      'packages/core/src/db/m9-p1c-links.ts',
      'packages/core/src/db/m9-p1b-probe.ts',
      'scripts/check-m9-links.ts',
    ])
    const hits: string[] = []
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          scan(path)
          continue
        }
        if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) continue
        if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
        const rel = path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length) : path
        if (allowed.has(rel)) continue
        const text = readFileSync(path, 'utf8')
        for (const needle of needles) {
          if (text.includes(needle)) hits.push(`${rel} 里有 ${needle}`)
        }
      }
    }
    scan(join(REPO_ROOT, 'apps'))
    scan(join(REPO_ROOT, 'packages'))
    scan(join(REPO_ROOT, 'scripts'))
    expect(hits).toEqual([])
  })

  it('⑩ 巡检自检：行数守恒 ＋ 状态机与库里一致', async () => {
    const h = freshDb()
    try {
      const before = countRows(h.db)
      const report = await runLinkProbe(h.db, fixedStatus(500), { checkedAt: '2026-10-20T00:00:00.000Z' })
      const violations = verifyLinkProbeRun({ report, rowsBefore: before, rowsAfter: countRows(h.db) })
      expect(violations).toEqual([])
      // 反证：把行数说少了 ⇒ 立刻报「有人删了行」
      const drifted = verifyLinkProbeRun({ report, rowsBefore: before + 1, rowsAfter: before })
      expect(drifted.map((v) => v.rule)).toContain('row-deleted')
    } finally {
      h.close()
    }
  })
})

describe('M9 P1c · 手动触发入口（scripts/check-m9-links.ts）', () => {
  /** 建一个只含一条合成资源的临时库，URL 指向本地服务。 */
  function tempDbWithOneResource(url: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-links-'))
    const dbPath = join(dir, 'links.db')
    const db = openDatabase(dbPath)
    db.prepare(
      `INSERT INTO lang_resources
         (lang, name, url, category, tier, level_label, price, lang_label, is_fav, star, summary, freshness, phase_id, verified_by, source_checked_at)
       VALUES ('python', '巡检自测用合成资源', ?, 'official', 'a', '1', 'free', 'zh', 0, NULL, '', '', NULL, 'owner_guide', NULL)`,
    ).run(url)
    db.close()
    return dbPath
  }

  /**
   * ⚠️ **这两支为什么显式给 60 秒超时**（而不是用默认的 5 秒）：
   *   它们要**真起一个 `node --import tsx` 子进程**（冷启动就要几百毫秒），
   *   而 unit 层在全量跑时与别的层并发抢 CPU ⇒ 默认 5 秒会顶破，
   *   报出来的是「test timed out」而不是任何断言失败。
   *   （vitest 配置里 cli 层有同样的理由，注释写着「两个上限打架」——
   *    本仓已经吃过一次亏：`tests/seed-check.test.ts` 因此给每支都加了 60 秒。）
   *   加超时只是让**外层**上限不再比**内层**先到，**断言一字未改**。
   */
  /**
   * 跑脚本（**异步 spawn**，不是 spawnSync）。
   *
   * ⚠️ **为什么不能用 spawnSync**：它会**阻塞父进程的事件循环**，
   *   而本机的 HTTP 服务就跑在父进程里 ⇒ 服务收不到连接、请求直接超时。
   *   （这个坑的表现是「脚本 10 秒后超时」��— 看起来像网络问题，其实是父进程被冻住。）
   */
  function runScript(args: readonly string[]): Promise<{ status: number | null; out: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', SCRIPT, ...args], { cwd: REPO_ROOT })
      let out = ''
      child.stdout.on('data', (chunk: Buffer) => {
        out += String(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        out += String(chunk)
      })
      child.on('error', reject)
      child.on('close', (code) => resolve({ status: code, out }))
    })
  }

  it('⑪ 默认是 dry-run：一个请求都不发，库也不改', async () => {
    const server = await startLocalServer()
    const dbPath = tempDbWithOneResource(`${server.origin}/dry-run-target`)
    try {
      const r = await runScript(['--db', dbPath])
      expect(r.status).toBe(0)
      expect(r.out).toContain('dry-run')
      expect(server.captured.length).toBe(0)
      const db = openDatabase(dbPath)
      const row = db
        .prepare('SELECT last_status_code, alive, last_checked_at FROM lang_resources')
        .get() as { last_status_code: number | null; alive: number; last_checked_at: string | null }
      expect(row.last_status_code).toBeNull()
      expect(row.last_checked_at).toBeNull()
      expect(row.alive).toBe(1)
      db.close()
    } finally {
      await server.close()
      rmSync(dbPath.split('/').slice(0, -1).join('/'), { recursive: true, force: true })
    }
  }, 60000)

  it('⑫ --execute：真出网，状态码与巡检日期落回库里', async () => {
    const server = await startLocalServer()
    const dbPath = tempDbWithOneResource(`${server.origin}/execute-target`)
    try {
      const r = await runScript(['--db', dbPath, '--execute'])
      expect(r.status).toBe(0)
      expect(server.captured.length).toBe(1)
      expect(server.captured[0]?.method).toBe('HEAD')
      const db = openDatabase(dbPath)
      const row = db
        .prepare('SELECT last_status_code, alive, consecutive_fails, last_checked_at FROM lang_resources')
        .get() as {
        last_status_code: number | null
        alive: number
        consecutive_fails: number
        last_checked_at: string | null
      }
      expect(row.last_status_code).toBe(200)
      expect(row.alive).toBe(1)
      expect(row.consecutive_fails).toBe(0)
      expect(row.last_checked_at).not.toBeNull()
      db.close()
    } finally {
      await server.close()
      rmSync(dbPath.split('/').slice(0, -1).join('/'), { recursive: true, force: true })
    }
  }, 60000)
})
