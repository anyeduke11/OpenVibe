// T8f 路由级分包真机走查驱动器（design §11.3「Web 主包」+ dev-plan §9-T8「浏览器走查重跑懒加载页」）
// 用法：node docs/devlog-evidence/DEV-0019/lazy-chunk-walk.mjs
// 自己构建 apps/web、起 serve（随机端口 + 隔离 OPENVIBE_HOME）与 headless Chrome（裸 CDP），
// 因此可在任意干净环境重跑；证据（日志 + 带字节的网络清单 + PNG）写进本目录。
//
// 为什么按「内容标记」而不是 chunk 名判定重库：vite 产物名带 hash，改名即失效。
// 驱动先在落盘产物里搜 CodeMirror / react-markdown 的特征串，锁定它们各自的 chunk 文件名，
// 再用真实网络事件断言「首屏没下它、用到它的那一步才下」。
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const DIST = join(REPO, 'apps/web/dist')
const ROOT = join(tmpdir(), `ov-lazy-walk-${String(process.pid)}`)
const HOME = join(ROOT, 'home')
const PROJ = join(ROOT, 'project')
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9344')
const SHOT = process.env.SHOTS === '0' ? false : true

/** 预算：入口 + index.html 直接引用的 JS；首屏 JS 占总分包字节的比例上限 */
const ENTRY_REF_MAX_BYTES = 320_000
const FIRST_LOAD_MAX_RATIO = 0.4
/** 拆分前基线（DEV-0018 实测：单个 1,155,623 字节产物） */
const BASELINE_BYTES = 1_155_623

mkdirSync(HOME, { recursive: true })
mkdirSync(PROJ, { recursive: true })

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
const kb = (n) => `${(n / 1000).toFixed(2)}kB`

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
say('  构建完成')

// ---------- 产物盘点：入口引用面 + 按内容标记锁定重库所在 chunk ----------
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const scriptSrcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)].map((m) => m[1])
const preloadSrcs = [
  ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]*href="([^"]+\.js)"[^>]*rel="modulepreload"/g),
].map((m) => m[1])
const assetBytesOf = (rel) => statSync(join(DIST, rel.replace(/^\//, ''))).size

const MARKERS = [
  { marker: 'cm-content', label: 'CodeMirror 编辑器' },
  { marker: 'remarkPlugins', label: 'react-markdown 预览' },
]
const chunkFiles = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
const chunkBytes = Object.fromEntries(
  chunkFiles.map((f) => [f, statSync(join(DIST, 'assets', f)).size]),
)
const totalJsBytes = chunkFiles.reduce((a, f) => a + chunkBytes[f], 0)
/** 每个重库落在哪些 chunk 上（可能多块），键名用 /assets/xxx.js 形式便于与网络 URL 对齐 */
const heavyChunks = new Map()
for (const { marker, label } of MARKERS) {
  const hits = chunkFiles.filter((f) => readFileSync(join(DIST, 'assets', f)).includes(marker))
  heavyChunks.set(
    label,
    hits.map((f) => `/assets/${f}`),
  )
}

say('\n== 验收 0：产物盘点')
say(
  `  ${chunkFiles.length} 个 JS 分包，合计 ${kb(totalJsBytes)}（拆分前单包 ${kb(BASELINE_BYTES)}）`,
)
for (const f of [...chunkFiles].sort((a, b) => chunkBytes[b] - chunkBytes[a]).slice(0, 6)) {
  say(`  · ${f} ${kb(chunkBytes[f])}`)
}
for (const [label, list] of heavyChunks) {
  say(
    `  ${label} → ${list.map((p) => `${p.split('/').pop()} ${kb(assetBytesOf(p))}`).join(' + ') || '（未找到）'}`,
  )
}
check(
  '两个重库都能在产物里定位到（否则下面的懒加载断言会假绿）',
  [...heavyChunks.values()].every((l) => l.length > 0),
)
check('index.html 只有一个入口 <script>', scriptSrcs.length === 1, scriptSrcs.join(', '))
const entryRefBytes = [...scriptSrcs, ...preloadSrcs].reduce((a, p) => a + assetBytesOf(p), 0)
check(
  `入口引用面 ${kb(entryRefBytes)} ≤ ${kb(ENTRY_REF_MAX_BYTES)}`,
  entryRefBytes <= ENTRY_REF_MAX_BYTES,
  `modulepreload ${preloadSrcs.length} 条${preloadSrcs.length === 0 ? '' : `：${preloadSrcs.join(', ')}`}`,
)
check(
  '入口引用面不含重库',
  [...heavyChunks.values()].every(
    (list) => ![...scriptSrcs, ...preloadSrcs].some((p) => list.includes(p)),
  ),
)

// ---------- serve ----------
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
say(`serve ${BASE} home=${HOME}`)

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
mkdirSync(join(ROOT, 'project'), { recursive: true })
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
      const list = await (await fetch(`http://127.0.0.1:${String(CDP_PORT)}/json/list`)).json()
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
const hasText = (t) => evalJs(`document.body.innerText.includes(${JSON.stringify(t)})`)
async function waitForText(t, ms = 15_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await hasText(t)) return true
    await sleep(200)
  }
  return false
}
const h1 = () => evalJs(`document.querySelector('main h1')?.innerText ?? ''`)
async function waitForH1(t, ms = 15_000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = String(await h1())
    if (last.includes(t)) return last
    await sleep(200)
  }
  return last
}
const clickText = (t, scope = 'button') =>
  evalJs(
    `(() => {const b=[...document.querySelectorAll(${JSON.stringify(scope)})]` +
      `.find((e) => e.textContent.trim().includes(${JSON.stringify(t)}));` +
      `if (!b) return 'MISSING'; b.click(); return 'OK'})()`,
  )
const hasEditor = () => evalJs(`document.querySelector('.cm-editor') !== null`)

// 网络台账：URL → 传输字节 + 状态；游标用来切「哪一步之后新下载了什么」。
// 只有首次加载（全新 profile，无缓存）的字节数可信，后续导航按 URL 集合判定。
const netLog = []
const requests = new Set()
const inflight = new Map()
const docResponses = []
const loadFailures = []
const exceptions = []
const consoleErrors = []
listeners.push((msg) => {
  const p = msg.params
  if (msg.method === 'Network.requestWillBeSent') {
    requests.add(p.request.url)
    inflight.set(p.requestId, { url: p.request.url, type: p.type })
  } else if (msg.method === 'Network.responseReceived') {
    const rec = inflight.get(p.requestId)
    if (rec !== undefined) {
      rec.status = p.response.status
      if (p.type === 'Document') docResponses.push({ url: rec.url, status: p.response.status })
    }
  } else if (msg.method === 'Network.loadingFinished') {
    const rec = inflight.get(p.requestId)
    inflight.delete(p.requestId)
    if (rec !== undefined) netLog.push({ ...rec, bytes: p.encodedDataLength })
  } else if (msg.method === 'Network.loadingFailed') {
    const rec = inflight.get(p.requestId)
    inflight.delete(p.requestId)
    if (rec !== undefined) loadFailures.push(`${rec.url} ${p.errorText}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(
      `${p.exceptionDetails?.text ?? ''} ${p.exceptionDetails?.exception?.description ?? ''}`.trim(),
    )
  } else if (
    msg.method === 'Runtime.consoleAPICalled' &&
    (p.type === 'error' || p.type === 'warning')
  ) {
    consoleErrors.push(
      `${p.type}: ${(p.args ?? []).map((a) => a.value ?? a.description).join(' ')}`,
    )
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
let cursor = 0
/** 自游标起新出现的 JS 请求（URL + 字节） */
function jsSince() {
  const slice = netLog.slice(cursor)
  cursor = netLog.length
  return slice.filter((r) => r.url.endsWith('.js'))
}
async function waitForSelector(sel, ms = 15_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await evalJs(`document.querySelector(${JSON.stringify(sel)}) !== null`)) return true
    await sleep(250)
  }
  return false
}
async function waitForGone(sel, ms = 10_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await evalJs(`document.querySelector(${JSON.stringify(sel)}) === null`)) return true
    await sleep(200)
  }
  return false
}
const isHeavy = (url, label) => heavyChunks.get(label).some((p) => url.endsWith(p))
const heavyLabelsDownloaded = (list) =>
  [...heavyChunks.keys()].filter((label) => list.some((r) => isHeavy(r.url, label)))

// 证据必须落盘，哪怕走查中途抛异常——否则失败现场只剩一句报错
function flushEvidence() {
  try {
    const network = netLog
      .map((r) => `${String(r.status ?? '-')} ${String(r.bytes ?? 0).padStart(9)} ${r.url}`)
      .join('\n')
    writeFileSync(join(HERE, 'lazy-chunk-walk-network.txt'), `${network}\n`)
    writeFileSync(join(HERE, 'lazy-chunk-walk-log.txt'), `${lines.join('\n')}\n`)
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
say('\n== 验收 1：首屏只下入口 + 当页分包，不下重库')
await go('/library')
await waitIdle()
const firstLoad = jsSince()
const firstLoadBytes = firstLoad.reduce((a, r) => a + r.bytes, 0)
const ratio = firstLoadBytes / totalJsBytes
say(
  `  首屏 JS ${firstLoad.length} 个请求 / ${kb(firstLoadBytes)}，占总分包 ${(ratio * 100).toFixed(1)}%`,
)
for (const r of firstLoad.sort((a, b) => b.bytes - a.bytes).slice(0, 6)) {
  say(`    ${kb(r.bytes).padStart(10)} ${r.url.replace(BASE, '')}`)
}
check(
  `首屏 JS ${kb(firstLoadBytes)} ≤ 总分包的 ${String(Math.round(FIRST_LOAD_MAX_RATIO * 100))}%`,
  ratio <= FIRST_LOAD_MAX_RATIO,
  `拆分前该比例是 100%（${kb(BASELINE_BYTES)} 全在首屏）`,
)
check(
  '首屏未下载 CodeMirror / react-markdown',
  heavyLabelsDownloaded(firstLoad).length === 0,
  heavyLabelsDownloaded(firstLoad).join(', ') || '（干净）',
)
check('首屏 DOM 里没有 .cm-editor', (await hasEditor()) === false)
await shot('library-first-load')

say('\n== 验收 2：九条路由真·直达（走 serve 的 SPA fallback，懒加载页照渲染）')
const flowId = (JSON.parse((await api('/api/flow-templates')).body).items ?? [])[0]?.id
const proj = await json('/api/projects', 'POST', { name: '分包走查夹具', flowTemplateId: flowId })
const packId = (JSON.parse((await api('/api/packs')).body).items ?? []).find(
  (p) => p.name === 'default',
)?.id
const ROUTES = [
  ['/library', '提示词库'],
  ['/terms', '术语库'],
  ['/skills', 'Skill 台账'],
  ['/flows', '流程模板'],
  ['/projects', '项目工作台'],
  [`/projects/${proj.id}`, '分包走查夹具'],
  ['/packs', '标准包'],
  ['/packs/new', '组装向导'],
  ...(packId === undefined ? [] : [[`/packs/${packId}/edit`, '编辑标准包']]),
  ['/settings', '设置'],
]
const seenJs = new Set(firstLoad.map((r) => r.url))
const routeHeavy = new Set()
for (const [path, marker] of ROUTES) {
  const docCount = docResponses.length
  await go(path)
  await waitIdle()
  const got = String(await waitForH1(marker))
  const doc = docResponses.slice(docCount)[0]
  const arrived = jsSince()
  const fresh = arrived.filter((r) => !seenJs.has(r.url))
  for (const r of fresh) seenJs.add(r.url)
  for (const label of heavyLabelsDownloaded(arrived)) routeHeavy.add(label)
  check(
    `直达 ${path} 渲染「${marker}」`,
    got.includes(marker) && doc?.status === 200,
    `document ${String(doc?.status)}，新下载 JS ${fresh.length} 个`,
  )
  if (path === '/settings') await shot('settings')
}
check(
  '页面本身不拉重库（重库只在编辑器/预览挂载时落地）',
  routeHeavy.size === 0,
  [...routeHeavy].join(' / ') || '（干净）',
)
say(
  `  十条路由累计请求 JS ${seenJs.size} 个 / ${kb(
    [...seenJs].reduce((a, u) => a + (chunkBytes[u.split('/assets/')[1]] ?? 0), 0),
  )}`,
)

say('\n== 验收 3：重库随挂载点落地（先立「不带编辑器的抽屉」对照）')
await go('/terms')
await waitIdle()
jsSince()
const termClicked = await clickText('新建词条')
const termShown = await waitForText('定义（Markdown，≤4KB）', 8_000)
const termJs = jsSince()
check(
  '对照：词条抽屉（纯 textarea）不拉任何重库',
  termClicked === 'OK' &&
    termShown &&
    heavyLabelsDownloaded(termJs).length === 0 &&
    (await hasEditor()) === false,
  `按钮 ${String(termClicked)}，抽屉 ${String(termShown)}，本次落地 JS ${termJs.length} 个`,
)
await shot('term-drawer-no-editor')
await clickText('取消')

await go('/library')
await waitIdle()
jsSince()
check('打开提示词抽屉前仍无 .cm-editor', (await hasEditor()) === false)
const openResult = await clickText('新建提示词')
check(
  '抽屉打开',
  openResult === 'OK' && (await waitForText('正文（Markdown）', 8_000)),
  String(openResult),
)
const cmOk = await waitForSelector('.cm-editor', 15_000)
await waitIdle()
const drawerJs = jsSince()
say(
  `  打开抽屉触发的 JS：${
    drawerJs.map((r) => `${r.url.replace(BASE, '')} ${kb(r.bytes)}`).join('，') || '（无）'
  }`,
)
check('.cm-editor 出现在 DOM', cmOk)
check(
  '抽屉挂载后才下载 CodeMirror',
  isAny(drawerJs, 'CodeMirror 编辑器'),
  pickUrl('CodeMirror 编辑器').replace(BASE, ''),
)
check(
  'react-markdown 也只随预览挂载落地（预览默认开启，故与抽屉同批）',
  isAny(drawerJs, 'react-markdown 预览') &&
    !firstLoad.some((r) => isHeavy(r.url, 'react-markdown 预览')),
  pickUrl('react-markdown 预览').replace(BASE, ''),
)
await shot('editor-lazy')

const previewToggled = await clickText('预览', 'label')
check(
  '取消勾选「预览」后预览区消失（渲染确实受控）',
  previewToggled === 'OK' && (await waitForGone('.html-md', 6_000)) === true,
  String(previewToggled),
)

say('\n== 验收 4：全程无异常、无失败请求、零外联')
check('无未捕获异常', exceptions.length === 0, exceptions.slice(0, 3).join(' | ') || '（0 条）')
check(
  '无 console 报错',
  consoleErrors.filter((l) => l.startsWith('error')).length === 0,
  consoleErrors.slice(0, 3).join(' | ') || '（0 条）',
)
check('无失败请求', loadFailures.length === 0, loadFailures.slice(0, 3).join(' | ') || '（0 条）')
const hosts = new Set([...requests].map((u) => new URL(u).host))
check(
  '全部请求只指向本机',
  [...hosts].every((h) => h.startsWith('127.0.0.1')),
  [...hosts].join(', '),
)

function pickUrl(label) {
  const first = heavyChunks.get(label)[0]
  return first === undefined ? '' : `${BASE}${first}`
}
function isAny(list, label) {
  return list.some((r) => isHeavy(r.url, label))
}

const totalTransferred = netLog.reduce((a, r) => a + r.bytes, 0)
say(
  `\n  整轮传输合计 ${kb(totalTransferred)}（> 分包总量 ${kb(totalJsBytes)}：每换一条路由都重新加载文档，
  命中缓存的分包也会被重新计一次；判懒加载看的是上面的「按阶段新下载」，不是这一行）`,
)
say(`\n结果：${failures === 0 ? '全部通过' : `${String(failures)} 条失败`}`)
flushEvidence()

await api(`/api/projects/${proj.id}`, { method: 'DELETE' }).catch(() => undefined)
ws.close()
chromeProc.kill()
serveProc.kill()
process.exit(failures === 0 ? 0 : 1)
