// T8 开箱体验真机走查驱动器（onboarding §5 验收 1/2/2b/3/4/5/5b）
// 用法：node docs/devlog-evidence/DEV-0019/onboarding-walk.mjs
// 自己构建 apps/web、起 serve（随机端口 + 隔离 OPENVIBE_HOME）与 headless Chrome（裸 CDP），
// 因此可在任意干净环境重跑；证据（日志 + PNG + 网络清单）写进本目录。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const ROOT = join(tmpdir(), `ov-onb-walk-${String(process.pid)}`)
const HOME = join(ROOT, 'home')
const DEMO = join(ROOT, 'demo-project')
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9333')
const SHOT = process.env.SHOTS === '0' ? false : true

mkdirSync(HOME, { recursive: true })
mkdirSync(DEMO, { recursive: true })

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  say(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ` — ${detail}`}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const WALK_BOOT = Date.now()

// ---------- 先构建 Web：serve 打的是 apps/web/dist，不 build 就是拿旧包验新代码 ----------
say('构建 apps/web …')
const build = spawn('pnpm --filter @openvibe/web build', {
  cwd: REPO,
  env: process.env,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let buildOut = ''
build.stdout.on('data', (d) => {
  buildOut += String(d)
})
build.stderr.on('data', (d) => {
  buildOut += String(d)
})
const buildCode = await new Promise((r) => {
  build.on('close', r)
})
if (buildCode !== 0) {
  console.log(buildOut)
  throw new Error(`apps/web 构建失败（退出码 ${String(buildCode)}）`)
}
// T8f 拆包后 vite 一次打十几行 chunk，最后一行未必是入口——按 index.html 引用的文件名取，
// 否则日志里会出现「构建完成 347.45 kB」这种其实是 CodeMirror 懒加载分包的误导性数字。
const entryChunk = /src="\/?(assets\/[^"]+\.js)"/.exec(
  readFileSync(join(REPO, 'apps/web/dist/index.html'), 'utf8'),
)?.[1]
const buildLine =
  buildOut
    .split('\n')
    .find((l) => entryChunk !== undefined && l.includes(entryChunk) && l.includes('kB')) ??
  (buildOut.split('\n').filter((l) => l.includes('kB') && l.includes('gzip')).pop() ?? '')
say(`  构建完成 ${buildLine.trim()}`)

// ---------- serve ----------
// onb-1 计时（dev-plan 映射表「演练录屏计时」）：从 serve 起表到 diff 收表算「用户侧 5 分钟」，
// 构建 apps/web 单独计入——它对应干净环境的首次 npx 下载，本地重跑时是热缓存，不代表用户耗时。
const WALK_START = Date.now()
const BUILD_MS = WALK_START - WALK_BOOT
const serveProc = spawn(
  process.execPath,
  ['--import', 'tsx', join(REPO, 'apps/cli/src/index.ts'), '--json', 'serve', '--port', '0'],
  { cwd: REPO, env: { ...process.env, OPENVIBE_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] },
)
let serveOut = ''
serveProc.stdout.on('data', (d) => {
  serveOut += String(d)
})
serveProc.stderr.on('data', (d) => {
  serveOut += String(d)
})
let serveInfo = null
for (let i = 0; i < 120 && serveInfo === null; i += 1) {
  await sleep(250)
  try {
    serveInfo = JSON.parse(serveOut)
  } catch {
    serveInfo = null
  }
}
if (serveInfo === null) {
  console.log(serveOut)
  throw new Error('serve --json 未输出摘要')
}
const BASE = serveInfo.summary.url
say(`serve ${BASE} firstRun=${String(serveInfo.summary.firstRun)} home=${HOME}`)

// serve 只给浏览器发会话 cookie；驱动器的裸 fetch 属「程序请求」，必须带 Bearer
const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${serveInfo.summary.token}`, ...init?.headers },
  })
  return { code: res.status, body: await res.text() }
}
const json = async (path, method, body) => {
  const res = await api(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.code >= 400)
    throw new Error(`${method} ${path} → ${String(res.code)} ${res.body.slice(0, 200)}`)
  return JSON.parse(res.body)
}

// ---------- Chrome / CDP ----------
const chromeProc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${String(CDP_PORT)}`,
    `--user-data-dir=${join(ROOT, 'chrome-profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
async function waitForTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${String(CDP_PORT)}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page !== undefined) return page
    } catch {
      // Chrome 还没起
    }
    await sleep(250)
  }
  throw new Error('Chrome 未就绪')
}
const target = await waitForTarget()

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let seq = 0
const pending = new Map()
const listeners = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.id !== undefined) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    if (p !== undefined) p.resolve(msg)
  } else {
    for (const l of listeners) l(msg)
  }
}
const send = (method, params = {}) =>
  new Promise((resolvePromise) => {
    seq += 1
    pending.set(seq, { resolve: resolvePromise })
    ws.send(JSON.stringify({ id: seq, method, params }))
  })
const cdp = async (method, params = {}) => {
  const msg = await send(method, params)
  if (msg.error !== undefined) throw new Error(`${method}: ${JSON.stringify(msg.error)}`)
  return msg.result
}
const evalJs = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails !== undefined) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
const text = () => evalJs('document.body.innerText')
const hasText = (t) => evalJs(`document.body.innerText.includes(${JSON.stringify(t)})`)
async function waitForText(t, ms = 15_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await hasText(t)) return true
    await sleep(200)
  }
  return false
}
const clickText = (t, scope = 'button') =>
  evalJs(
    `(() => {const b=[...document.querySelectorAll(${JSON.stringify(scope)})]` +
      `.find((e) => e.textContent.trim().includes(${JSON.stringify(t)}));` +
      `if (!b) return 'MISSING'; b.click(); return 'OK'})()`,
  )

// 零外联断言的证据：走查期间浏览器发起过的全部请求；inflight 用来判定「页面已 settle」，
// 否则「某元素不存在」的断言可能只是查询还没回来（假绿）。
const requests = new Set()
const inflight = new Set()
listeners.push((msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    requests.add(msg.params.request.url)
    inflight.add(msg.params.requestId)
  } else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
    inflight.delete(msg.params.requestId)
  }
})
async function waitIdle(settle = 400, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const seen = requests.size
    await sleep(settle)
    if (inflight.size === 0 && requests.size === seen) return true
  }
  return false
}
async function waitGone(t, ms = 10_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!(await hasText(t))) return true
    await sleep(200)
  }
  return false
}

// 证据必须落盘，哪怕走查中途抛异常——否则失败现场只剩一句报错
function flushEvidence() {
  try {
    writeFileSync(join(HERE, 'onboarding-walk-network.txt'), `${[...requests].sort().join('\n')}\n`)
    writeFileSync(join(HERE, 'onboarding-walk-log.txt'), `${lines.join('\n')}\n`)
  } catch {
    // 落盘失败不盖住真正的失败原因
  }
}
process.on('exit', flushEvidence)

await cdp('Runtime.enable')
await cdp('Page.enable')
await cdp('Network.enable')
let shotIndex = 0
async function shot(name) {
  if (!SHOT) return
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  shotIndex += 1
  const file = join(HERE, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  say(`  截图 ${file.replace(`${REPO}/`, '')}`)
}
const go = async (path) => {
  await cdp('Page.navigate', { url: `${BASE}${path}` })
  await sleep(900)
}

// ---------- 走查 ----------
say('\n== 验收 1/3：首启顶栏（向导条 + 飞轮 0 值占位）')
await go('/library')
check('顶栏出现向导条', await waitForText('开箱三步'))
check('飞轮 0 值显示占位而非 0（§4.3）', await hasText('待产生'))
const step1 = await text()
say(`  步①文案：${step1.split('\n').filter((l) => l.includes('提示词') || l.includes('术语') || l.includes('模板')).join(' / ')}`)
check(
  '步①为真实库存计数',
  step1.includes('提示词 20 条') && step1.includes('术语 104 条') && step1.includes('流程模板 3 条'),
)
await shot('step1-assets')

say('\n== 验收 3：步②与 preview API 同源')
await clickText('下一步')
check('进入步②', await waitForText('看一个标准包长什么样'))
await sleep(1_200)
const step2 = await text()
const fingerprint = (step2.match(/指纹\s*([0-9a-f]{64})/) ?? [])[1] ?? ''
let apiFingerprint = ''
let defaultPackId = ''
try {
  const packs = JSON.parse((await api('/api/packs')).body)
  const def = packs.items.find((p) => p.name === 'default')
  defaultPackId = def.id
  const res = await api(`/api/packs/${def.id}/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: '1.0.0' }),
  })
  if (res.code !== 200) say(`  preview 返回 ${String(res.code)}：${res.body.slice(0, 160)}`)
  apiFingerprint = JSON.parse(res.body).fingerprint
} catch (e) {
  say(`  API 侧读取失败：${String(e)}`)
}
check(
  '向导渲染的指纹 == POST /api/packs/:id/preview 指纹',
  fingerprint !== '' && fingerprint === apiFingerprint,
  `${fingerprint.slice(0, 12)} vs ${apiFingerprint.slice(0, 12)}`,
)
check('步②渲染出文件树', step2.includes('CLAUDE.md') && step2.includes('TERMS.md'))
await shot('step2-preview')

say('\n== 验收 2b：未注入不点亮 → sync 后自动点亮（D11）')
await clickText('下一步')
check('进入步③', await waitForText('注入试试'))
const step3 = await text()
const syncLine = (step3.match(/npx openvibe-cli sync [^\n]*/) ?? [''])[0]
const suggested = (syncLine.match(/"([^"]+)"/) ?? [])[1] ?? ''
say(`  建议命令：${syncLine}`)
// 向导给的是「建议」路径；驱动器据此建目录，保证 sync 与探测打同一个地方
const demoDir = suggested === '' ? DEMO : suggested
mkdirSync(demoDir, { recursive: true })
say(`  夹具目录：${demoDir}`)
await clickText('我已注入')
await waitIdle()
check('未注入时「注入完成」不点亮', !(await hasText('已注入 default@')))
await waitForText('尚未注入', 8_000)
const hintLine = ((await text()).split('\n').find((l) => l.includes('尚未注入')) ?? '（无提示）').trim()
say(`  未注入提示：${hintLine}`)
check(
  '未注入给出诚实提示且点明缺哪个文件',
  hintLine.includes('尚未注入') && hintLine.includes('pack.lock.json'),
)
await shot('step3-waiting')

const t0 = Date.now()
const sync = spawn(
  process.execPath,
  ['--import', 'tsx', join(REPO, 'apps/cli/src/index.ts'), '--json', 'sync', demoDir, '--pack', 'default', '--yes'],
  { cwd: REPO, env: { ...process.env, OPENVIBE_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] },
)
let syncOut = ''
sync.stdout.on('data', (d) => {
  syncOut += String(d)
})
sync.stderr.on('data', (d) => {
  syncOut += String(d)
})
const syncCode = await new Promise((r) => {
  sync.on('close', r)
})
let syncSummary = null
try {
  syncSummary = JSON.parse(syncOut).summary
} catch {
  say(`  sync 输出不可解析：${syncOut.slice(0, 200)}`)
}
// 圈数按 project_path 与项目 local_path 对账，夹具必须用 sync 实际记下的那个路径
const injectedPath = syncSummary?.projectPath ?? demoDir
say(
  `  sync 退出码 ${String(syncCode)}；产物 ${existsSync(join(demoDir, 'CLAUDE.md')) ? 'CLAUDE.md 在位' : '缺 CLAUDE.md'}；summary ${JSON.stringify(syncSummary)}`,
)
const autoLit = await waitForText('已注入 default@', 12_000)
check('lock 探测自动点亮（无人工点击）', autoLit, `耗时 ${String(Date.now() - t0)}ms`)
check('点亮后给出 diff 引导', await hasText('openvibe-cli diff'))
await shot('step3-injected')

// ---------- onb-1：≤3 条命令 / ≤5 分钟 + 六平台产物清单逐条在位 ----------
say('\n== 验收 1（onb-1）：产物清单与演练计时')
const PRODUCTS = [
  'CLAUDE.md',
  'AGENTS.md',
  'CODEBUDDY.md',
  'MINI.md',
  '.cursor/rules/openvibe.mdc',
  '.trae/rules/openvibe.md',
  'TERMS.md',
  'CHECKLIST.md',
  '.openvibe/pack.lock.json',
]
const absent = PRODUCTS.filter((p) => !existsSync(join(demoDir, p)))
check(`九项产物齐备（六平台 + TERMS/CHECKLIST + lock）`, absent.length === 0, absent.join(', '))
for (const p of PRODUCTS) {
  const size = existsSync(join(demoDir, p)) ? statSync(join(demoDir, p)).size : -1
  say(`  · ${p} ${size >= 0 ? `${String(size)}B` : '缺失'}`)
}
const diffRun = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(REPO, 'apps/cli/src/index.ts'), '--json', 'diff', demoDir],
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, OPENVIBE_HOME: HOME } },
)
let diffSummary = null
try {
  diffSummary = JSON.parse(diffRun.stdout).summary
} catch {
  say(`  diff 输出不可解析：${String(diffRun.stdout).slice(0, 200)}${String(diffRun.stderr).slice(0, 200)}`)
}
check(
  '第 3 条命令 diff 判 clean（exit 0）',
  diffRun.status === 0 && diffSummary?.clean === true,
  `exit=${String(diffRun.status)} ${JSON.stringify(diffSummary)}`,
)
const loopMs = Date.now() - WALK_START
say(
  `  命令数 3：openvibe-cli serve --open → sync <dir> --pack default → diff <dir>；` +
    `用户侧耗时 ${((loopMs - BUILD_MS) / 1000).toFixed(1)}s（构建 ${((BUILD_MS / 1000).toFixed(1))}s 另计，对应干净环境首次 npx 下载）`,
)
check('serve→diff ≤5 分钟', loopMs <= 5 * 60_000, `${(loopMs / 1000).toFixed(1)}s 含构建`)

say('\n== 验收 5b：一次性询问卡（declined 后刷新不再出现）')
await clickText('完成向导')
const askShown = await waitForText('开启匿名统计？', 8_000)
check('首次注入后出现询问卡', askShown)
check('向导条完成后消失', await waitGone('开箱三步'))
const flywheel = await text()
say(`  完成后飞轮：${flywheel.split('\n').find((l) => l.includes('飞轮面板')) ?? '（未找到）'}`)
await shot('ask-card')
await clickText('暂不')
await go('/library')
await waitIdle()
check('选「暂不」后刷新不再询问', !(await hasText('开启匿名统计？')))
const te = JSON.parse((await api('/api/settings/telemetry')).body)
check('declined 落本地标记', te.askState === 'declined' && te.enabled === false, JSON.stringify(te))

say('\n== 验收 2：跳过/重置')
await go('/settings')
check('设置页渲染', await waitForText('匿名统计'))
check('设置页含预置包与备份说明', (await hasText('预置演示包')) && (await hasText('备份说明')))
await shot('settings')
await clickText('重新显示向导')
await sleep(700)
await go('/library')
check('重置后向导重新出现', await waitForText('开箱三步'))
await clickText('跳过')
await go('/library')
await waitIdle()
check('跳过后向导条消失', !(await hasText('开箱三步')))
const onb = JSON.parse((await api('/api/settings')).body)
check('跳过写入完成标记', onb.onboardingDone === true)
await shot('after-skip')

say('\n== 验收 4：完整一圈的口径与顶栏真实数字（onb-4 + §4.3 非 0 侧）')
try {
  const flowId = (JSON.parse((await api('/api/flow-templates')).body).items ?? [])[0].id
  const proj = await json('/api/projects', 'POST', {
    name: '飞轮夹具',
    localPath: injectedPath,
    flowTemplateId: flowId,
  })
  await json(`/api/projects/${proj.id}`, 'PATCH', {
    standardPackId: defaultPackId,
    standardPackVersion: '1.0.0',
  })
  const logRow = await json(`/api/projects/${proj.id}/devlog`, 'POST', {
    type: 'DEV',
    title: '回流一条提示词',
    body: '把注入后发现的问题写回资产。',
  })
  const assetId = (JSON.parse((await api('/api/prompts?size=1')).body).items ?? [])[0].id
  await json(`/api/projects/${proj.id}/devlog/${logRow.id}/assets`, 'POST', { assetId })
  const stats = JSON.parse((await api('/api/stats')).body)
  say(`  /api/stats：${JSON.stringify(stats)}`)
  check('注入记录已上报', stats.injections >= 1, JSON.stringify(stats))
  check('有导出+有注入+有回流 → loops=1（按项目去重）', stats.loops === 1 && stats.reflows === 1)
  await go('/library')
  const band = String(await evalJs(`document.querySelector('[aria-label="飞轮面板"]').innerText`))
  say(`  顶栏飞轮：${band.replace(/\n/g, ' / ')}`)
  check('顶栏渲染真实数字（非占位）', /飞轮圈数\s*1/.test(band) && /回流\s*1/.test(band))
  await shot('flywheel-loop')

  const del = await api(`/api/projects/${proj.id}`, { method: 'DELETE' })
  if (del.code >= 400) throw new Error(`DELETE 项目 → ${String(del.code)} ${del.body.slice(0, 160)}`)
  const dropped = JSON.parse((await api('/api/stats')).body)
  say(`  删掉夹具项目后：${JSON.stringify(dropped)}`)
  check('回流链断则圈数与回流回落为 0', dropped.loops === 0 && dropped.reflows === 0)
  await go('/library')
  const bandAfter = String(await evalJs(`document.querySelector('[aria-label="飞轮面板"]').innerText`))
  check('顶栏回落到占位（§4.3 双向）', /飞轮圈数\s*待产生/.test(bandAfter))
  await shot('flywheel-dropped')
} catch (e) {
  check('完整一圈走查', false, String(e))
}

say('\n== 验收 5：零外联（关闭态）')
const hosts = new Set([...requests].map((u) => new URL(u).host))
say(`  浏览器请求过的 host：${[...hosts].join(', ')}`)
check(
  '全部请求只指向本机',
  [...hosts].every((h) => h.startsWith('127.0.0.1')),
  `${requests.size} 个请求`,
)

say(`\n结果：${failures === 0 ? '全部通过' : `${String(failures)} 条失败`}`)
flushEvidence()

ws.close()
chromeProc.kill()
serveProc.kill()
process.exit(failures === 0 ? 0 : 1)
