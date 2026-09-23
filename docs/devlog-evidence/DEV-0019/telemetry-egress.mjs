// 遥测外发闭环的真机走查（T8d，design §11.5 / dev-plan §4.6）
//
// 与单测的分工：vitest 用注入的 fetchImpl 证明分支正确（TF-01..13），这里证的是
// 「真 serve 进程 + 真 60s 定时器 + 真 HTTP 接收端」这条生产形状的路径：
//   ① config.json 手配的 telemetryEndpoint 被 serve 读入并回显（且重写不丢）
//   ② 开关打开后，事件在 ~60s 内自动到达接收端，库里 sent_at 被盖章
//   ③ 关掉开关再入队，接收端计数一动不动——「关闭即零外联」量出来而不是说出来
//   ④ 未配端点时两种输出模式都如实说「不外发」（§11.5 透明度）
//
// 跑法（约 150s，含两个 60s 窗口）：
//   node --import tsx docs/devlog-evidence/DEV-0019/telemetry-egress.mjs
// 产物：同目录 telemetry-egress-log.txt

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '@openvibe/core'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const LOG = join(HERE, 'telemetry-egress-log.txt')
const lines = []
const t0 = Date.now()
const say = (s) => {
  const line = `[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s] ${s}`
  lines.push(line)
  console.log(line)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: ok === true })
  say(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`)
}
// 无论如何退出都把日志落盘，免得一次崩溃丢掉 150s 的证据
process.on('exit', () => {
  const passed = results.filter((r) => r.ok).length
  lines.push(`\n合计 ${String(passed)}/${String(results.length)} PASS`)
  writeFileSync(LOG, `${lines.join('\n')}\n`)
})

const HOME = mkdtempSync(join(tmpdir(), 'ov-tel-egress-home-'))
let adapter = null
let serve = null

function spawnLine(proc, re, timeoutMs, what) {
  return new Promise((resolve, reject) => {
    let buf = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`${what} 未在 ${String(Math.round(timeoutMs / 1000))}s 内就绪：${buf}`))
    }, timeoutMs)
    proc.stdout.on('data', (d) => {
      buf += String(d)
      const m = re.exec(buf)
      if (!m || settled) return
      settled = true
      clearTimeout(timer)
      resolve(m)
    })
    proc.stderr.on('data', (d) => {
      buf += String(d)
    })
  })
}

try {
  // ---------- ① 接收端：仓库里那份 worker.js，经 node:http 外壳真监听 ----------
  adapter = spawn(process.execPath, [join(REPO, 'deploy/telemetry/adapter-node.mjs'), '0'], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const adapterOrigin = (await spawnLine(adapter, /http:\/\/127\.0\.0\.1:\d+/, 10_000, '接收端'))[0]
  const endpoint = `${adapterOrigin}/collect/demo-token`
  say(`接收端 ${adapterOrigin}（上报路径带随机段，端点地址即凭据）`)

  const summary = async (day) => {
    const res = await fetch(`${adapterOrigin}/summary?day=${day}`)
    return (await res.json())
  }

  // ---------- ② 手配 config.json 后真起 serve ----------
  writeFileSync(
    join(HOME, 'config.json'),
    JSON.stringify({
      serverUrl: 'http://127.0.0.1:8787',
      token: 'f'.repeat(64),
      port: 8787,
      telemetryEndpoint: endpoint,
    }),
    { mode: 0o600 },
  )
  serve = spawn(
    process.execPath,
    ['--import', 'tsx', join(REPO, 'apps/cli/src/index.ts'), '--json', 'serve', '--port', '0'],
    { cwd: REPO, env: { ...process.env, OPENVIBE_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let serveOut = ''
  serve.stdout.on('data', (d) => {
    serveOut += String(d)
  })
  serve.stderr.on('data', (d) => {
    serveOut += String(d)
  })
  let info = null
  for (let i = 0; i < 160 && info === null; i += 1) {
    await sleep(250)
    try {
      info = JSON.parse(serveOut)
    } catch {
      info = null
    }
  }
  if (info === null) throw new Error(`serve --json 未输出摘要：${serveOut}`)
  const BASE = info.summary.url
  const bearer = { authorization: `Bearer ${info.summary.token}` }
  say(`serve ${BASE} firstRun=${String(info.summary.firstRun)}`)

  check('serve 读入手配的端点并回显', info.summary.telemetry?.endpoint === endpoint, JSON.stringify(info.summary.telemetry))
  const saved = JSON.parse(readFileSync(join(HOME, 'config.json'), 'utf8'))
  check('重写 config.json 未抹掉端点', saved.telemetryEndpoint === endpoint)
  // --json 下人读文案一律折叠进 summary.warnings（m6b §5.1），stdout 仍是单个对象
  check(
    '--json 启动信息公开上报通道',
    (info.summary.warnings ?? []).join(' | ').includes('批量上报至'),
    JSON.stringify(info.summary.warnings),
  )

  const api = async (path, method, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...bearer, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { code: res.status, json: await res.json() }
  }
  const enqueue = async (event, value) => (await api('/api/telemetry/events', 'POST', { event, value })).json

  // ---------- ③ 开关关着：入队被服务端第三道闸门挡住 ----------
  const offEnq = await enqueue('pack_injected', 'default@1.0.0')
  check('默认关闭时连队列都不写', offEnq.queued === false && offEnq.reason === 'disabled', JSON.stringify(offEnq))

  // ---------- ④ 打开开关，等真 60s 定时器把事件送出去 ----------
  const today = new Date().toISOString().slice(0, 10)
  await api('/api/settings/telemetry', 'POST', { enabled: true })
  await enqueue('pack_injected', 'default@1.0.0')
  await enqueue('flow_template_used', 'spec-driven')
  await enqueue('project_active', '1')

  const db = openDatabase(join(HOME, 'data', 'openvibe.db'), { autoMigrate: false })
  const queue = () =>
    db.prepare('SELECT event, value, sent_at AS sentAt FROM telemetry_events ORDER BY id').all()
  const pending = () => queue().filter((r) => r.sentAt === null).length
  check('打开后三条待发送', pending() === 3, `pending=${String(pending())}`)

  let delivered = 0
  for (let i = 0; i < 100; i += 1) {
    await sleep(1000)
    delivered = (await summary(today)).total ?? 0
    if (delivered >= 3) break
  }
  check('60s 内三条真到达接收端', delivered === 3, `total=${String(delivered)}`)
  check('送达的行才盖 sent_at', queue().filter((r) => r.sentAt !== null).length === 3, `共 ${String(queue().length)} 行`)

  // ---------- ⑤ 关掉开关再入队：既不进队列，也不出网 ----------
  await api('/api/settings/telemetry', 'POST', { enabled: false })
  const off2 = await enqueue('pack_injected', 'should-not-leave')
  check('关闭后入队被服务端挡住', off2.queued === false && off2.reason === 'disabled', JSON.stringify(off2))
  check('关闭态带外事件根本没进队列', queue().find((r) => r.value === 'should-not-leave') === undefined)

  const before = (await summary(today)).total ?? 0
  await sleep(10_000)
  check('关掉后队列仍是那三行（已发不回收）', queue().length === 3, `rows=${String(queue().length)}`)
  // 覆盖一整个 60s 窗口：真定时器在关闭态必须一个字节都不发
  let after = before
  for (let i = 0; i < 75; i += 1) {
    await sleep(1000)
    after = (await summary(today)).total ?? 0
    if (after > before) break
  }
  check('第二个 60s 窗口内计数未增（零外联）', after === before, `total ${String(before)}→${String(after)}`)
  db.close()

  // ---------- ⑥ 未配端点：--json 与人读两种模式各自怎么说 ----------
  serve.kill('SIGTERM')
  await sleep(1500)
  serve = null
  const HOME2 = mkdtempSync(join(tmpdir(), 'ov-tel-egress-bare-'))
  const serveArgs = (json) => [
    '--import',
    'tsx',
    join(REPO, 'apps/cli/src/index.ts'),
    ...(json ? ['--json'] : []),
    'serve',
    '--port',
    '0',
  ]
  serve = spawn(process.execPath, serveArgs(true), {
    cwd: REPO,
    env: { ...process.env, OPENVIBE_HOME: HOME2 },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out2 = ''
  serve.stdout.on('data', (d) => {
    out2 += String(d)
  })
  serve.stderr.on('data', (d) => {
    out2 += String(d)
  })
  let bare = null
  for (let i = 0; i < 160 && bare === null; i += 1) {
    await sleep(250)
    try {
      bare = JSON.parse(out2)
    } catch {
      bare = null
    }
  }
  if (bare === null) throw new Error(`裸 serve 未输出摘要：${out2}`)
  check('未配端点时 telemetry.endpoint 为空串', bare.summary.telemetry?.endpoint === '')
  check(
    '--json 未配端点时如实说「不外发」',
    (bare.summary.warnings ?? []).join(' | ').includes('不外发'),
    JSON.stringify(bare.summary.warnings),
  )
  serve.kill('SIGTERM')
  serve = null

  // 人读模式：提示是给真人看的，必须真出现在 stdout 上，且说清「不外发」
  const HOME3 = mkdtempSync(join(tmpdir(), 'ov-tel-egress-human-'))
  serve = spawn(process.execPath, serveArgs(false), {
    cwd: REPO,
    env: { ...process.env, OPENVIBE_HOME: HOME3 },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out3 = ''
  let out3err = ''
  serve.stdout.on('data', (d) => {
    out3 += String(d)
  })
  serve.stderr.on('data', (d) => {
    out3err += String(d)
  })
  for (let i = 0; i < 160 && !out3.includes('按 Ctrl-C 停止'); i += 1) await sleep(250)
  serve.kill('SIGTERM')
  serve = null
  const humanLine = out3.split('\n').find((l) => l.includes('匿名统计')) ?? ''
  check('人读模式启动信息如实说「不外发」', humanLine.includes('不外发'), humanLine.trim())
  check(
    '人读模式仍打出 Web 产物行（未被本次改动误删）',
    out3.includes('Web 产物') || out3.includes('未托管 Web 产物'),
  )
  check('人读模式 stdout 干净（无 warn 前缀、无 JSON 对象）', !out3.includes('[warn]') && !out3.includes('"summary"'))
  check('人读模式未把提示漏到 stderr', !out3err.includes('匿名统计'), out3err.trim())
  rmSync(HOME2, { recursive: true, force: true })
  rmSync(HOME3, { recursive: true, force: true })
} finally {
  serve?.kill('SIGTERM')
  adapter?.kill('SIGTERM')
  await sleep(300)
  rmSync(HOME, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
say(failed === 0 ? `全部 ${String(results.length)} 条通过` : `${String(failed)} 条失败`)
process.exit(failed === 0 ? 0 : 1)
