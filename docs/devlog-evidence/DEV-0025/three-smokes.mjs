// P1.1/T11 三条冒烟：把 §2b·T11 的三个场景接到 DEV-0024 的裸 CDP 真输入骨架上
// 用法：node docs/devlog-evidence/DEV-0025/three-smokes.mjs            （无头）
//       HEADLESS=0 CDP_PORT=9351 node docs/devlog-evidence/DEV-0025/three-smokes.mjs   （有头）
//
// 三条各自独立判定，任一不过即整体不过（口径同 dev-plan §15.4-S2）：
//   SM-1 导入→复制：真点击开弹窗 → 真点击「选择文件…」→ 注入一个磁盘 .md → 导入报告 →
//        真中文检索命中该条 → 真点击该行「复制」→ **pbpaste 逐字节 == 那个 .md 文件的字节**
//   SM-2 术语搜索→TERMS.md：真中文 insertText 检索 → 收窄命中 → 真点击勾选 → 真点击「生成 TERMS.md」→
//        Dialog 内 <pre> 文本 == 服务端 render-terms-md 的 content → 真点击「复制全文」→ pbpaste == 同一字节
//   SM-3 向导三步：三步全用真点击推进（含 sync 后 lock 探测自动点亮）→ 真点击「完成向导」→
//        询问卡真点击「暂不」→ 刷新不再询问
//
// 两条写死在代码里的诚实约束（都来自 DEV-0024 的实测）：
//   ① 系统剪贴板只在**有头** Chrome 可证：无头下这些腿记 SKIP，不记 PASS。
//   ② OS 文件选择弹窗 CDP 驱动不了（也不该在用户屏幕上弹）。这里真点击「选择文件…」，
//      用 Page.setInterceptFileChooserDialog 收下 Page.fileChooserOpened 事件——**该事件发生本身**
//      就是「按钮真接线」的证据；随后 DOM.setFileInputFiles 从浏览器输入管线注入文件（Playwright 同路径），
//      React 的 onChange 是真的，后续解析、入库、渲染、复制全走真实路径。
// 键盘流（Tab 焦点转移 / Enter 提交）不在本驱动器里重复取证——那是 DEV-0024 判据③已经单独证过的
// **能力**；本文件跑的是**场景链**，输入只用真鼠标点击 + Input.insertText。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const ROOT = join(tmpdir(), `ov-smoke-${String(process.pid)}`)
const HOME = join(ROOT, 'home')
const FIX = join(ROOT, 'fixtures')
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9350')
const SHOT = process.env.SHOTS === '0' ? false : true
const HEADLESS = process.env.HEADLESS !== '0'
const HAS_PASTEBOARD = process.platform === 'darwin'

mkdirSync(HOME, { recursive: true })
mkdirSync(FIX, { recursive: true })

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}
let failures = 0
let skipped = 0
const V = { sm1: true, sm2: true, sm3: true }
const fail = () => {
  failures += 1
}
// leg = 该断言是否依赖系统剪贴板：无头下这类腿不可判 ⇒ SKIP，绝不当过
const check = (label, ok, detail = '', leg = false) => {
  if (leg && (!HAS_PASTEBOARD || HEADLESS)) {
    skipped += 1
    say(`SKIP ${label} — 系统剪贴板腿在${HAS_PASTEBOARD ? '无头' : '本平台'}不可判，不得记为通过`)
    return true
  }
  if (!ok) {
    fail()
    if (label.startsWith('SM-1')) V.sm1 = false
    else if (label.startsWith('SM-2')) V.sm2 = false
    else if (label.startsWith('SM-3')) V.sm3 = false
  }
  say(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ` — ${detail}`}`)
  return ok
}
const info = (label, detail) => say(`INFO ${label}${detail === '' ? '' : ` — ${detail}`}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// pbcopy/pbpaste 必须显式 UTF-8 locale，否则 CJK 走旧码页，「产品没写」与「我读错编码」同形
const PB_ENV = {
  ...process.env,
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  LC_CTYPE: 'en_US.UTF-8',
}
const pasteboard = () => {
  const r = spawnSync('pbpaste', { encoding: 'utf8', env: PB_ENV })
  if (r.status !== 0) throw new Error(`pbpaste 退出码 ${String(r.status)}`)
  return r.stdout
}
const setPasteboard = (s) => {
  const r = spawnSync('pbcopy', { input: s, encoding: 'utf8', env: PB_ENV })
  if (r.status !== 0) throw new Error(`pbcopy 退出码 ${String(r.status)}`)
}

// ---------- 构建 Web ----------
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

// ---------- serve（随机端口 + 隔离 HOME；绝不碰同机并行项目的端口） ----------
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
const ORIGIN = new URL(BASE).origin
say(`serve ${BASE} home=${HOME}`)

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${serveInfo.summary.token}`, ...init?.headers },
  })
  return { code: res.status, body: await res.text() }
}
const apiUrl = async (path, method, body) => {
  const res = await api(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.code >= 400) throw new Error(`${method} ${path} → ${String(res.code)} ${res.body.slice(0, 200)}`)
  return JSON.parse(res.body)
}

// ---------- Chrome / CDP ----------
say(`浏览器形态：${HEADLESS ? 'headless=new（无头）' : 'headed（可见窗口）'}`)
const chromeProc = spawn(
  CHROME,
  [
    ...(HEADLESS ? ['--headless=new'] : []),
    `--remote-debugging-port=${String(CDP_PORT)}`,
    `--user-data-dir=${join(ROOT, 'chrome-profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--clipboard-sanitized-write',
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
async function waitGoneText(t, ms = 8_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!(await hasText(t))) return true
    await sleep(200)
  }
  return false
}
const bodyText = () => evalJs('document.body.innerText')

const requests = []
listeners.push((msg) => {
  if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url)
})

await cdp('Runtime.enable')
await cdp('Page.enable')
await cdp('DOM.enable')
await cdp('Network.enable')
// 无头默认视口 800×600：屏外元素会点空，深列表里的行尤其如此
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})
try {
  await cdp('Browser.grantPermissions', {
    origin: ORIGIN,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })
  info('clipboard 权限授予', 'clipboardReadWrite + clipboardSanitizedWrite')
} catch (e) {
  info('clipboard 权限授予失败', String(e).slice(0, 200))
}

// ---------- 真输入原语（与 DEV-0024 同一套；两份各自独立可跑，未抽公共模块） ----------
async function realClick(expr, what = '按钮') {
  await evalJs(
    `(() => {const el=${expr}; if(el) el.scrollIntoView({block:'center', behavior:'instant'}); return 1})()`,
  )
  await sleep(140)
  // landed 取 elementsFromPoint 前 3 层：只报最上层元素名的话，「被谁盖住」这件事还得再跑一遍才知道
  const hit = await evalJs(
    `(() => {const el=${expr}; if(!el) return {err:'NO_EL'};` +
      `const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return {err:'ZERO'};` +
      `const x=r.x+r.width/2, y=r.y+r.height/2; const t=document.elementFromPoint(x,y);` +
      `const nm=(e)=>e.tagName.toLowerCase()+(e.getAttribute('aria-label') ? '[aria-label='+e.getAttribute('aria-label')+']' : '')` +
      `+':'+String(e.textContent ?? '').trim().replace(/\\s+/g,' ').slice(0,14);` +
      `const chain=[...document.elementsFromPoint(x,y)].slice(0,3).map(nm).join(' < ');` +
      `return {x, y, ok: t !== null && (t === el || el.contains(t) || (t.closest && t.closest('label') === el)),` +
      ` landed: t ? chain : 'EMPTY'}})()`,
  )
  if (hit.err !== undefined) throw new Error(`元素不可定位（${hit.err}）[${what}]：${expr}`)
  if (!hit.ok) throw new Error(`命中点不是目标 [${what}] 命中链 ${hit.landed}：${expr}`)
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y })
  await cdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: hit.x,
    y: hit.y,
    button: 'left',
    clickCount: 1,
    buttons: 1,
  })
  await cdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: hit.x,
    y: hit.y,
    button: 'left',
    clickCount: 1,
  })
}
const insertText = (s) => cdp('Input.insertText', { text: s })
const btnExpr = (t) =>
  `(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(t)}))()`
// 弹窗内按钮必须按 [role="dialog"] 作用域查：toast 的关闭键文案也是「关闭」
// （apps/web/src/components/ui/Toaster.tsx:53-59），而 #root 在 DOM 序上早于 body 末尾的弹窗
// portal —— 全局按文本 find 会先命中 toast，而它被弹窗的 z-40 overlay 盖住，真点击必然命不中目标。
// 顺带排除 disabled：预览按钮在字节到位前是禁用的，点一个禁用按钮再问「剪贴板为何不变」是自坑。
const dlgBtnExpr = (t) =>
  `(() => [...document.querySelectorAll('[role="dialog"] button')].find` +
  `((b) => b.textContent.trim() === ${JSON.stringify(t)} && !b.disabled))()`
// 提示词库某一行里的按钮（行内标题按钮 textContent == title）
const rowButtonExpr = (title, btnText) =>
  `(() => {const li=[...document.querySelectorAll('li')].find((l) =>` +
  ` [...l.querySelectorAll('button')].some((b) => b.textContent.trim() === ${JSON.stringify(title)}));` +
  ` if(!li) return null; return [...li.querySelectorAll('button')]` +
  `.find((b) => b.textContent.trim() === ${JSON.stringify(btnText)}) ?? null})()`
async function waitForNode(expr, ms = 8_000, what = '元素') {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const ok = await evalJs(`(() => {const el=${expr}; return el ? 1 : 0})()`)
    if (ok) return true
    await sleep(200)
  }
  throw new Error(`等不到${what}：${expr.slice(0, 90)}`)
}
// 点一个「现在还不存在」的按钮：先轮询再真点击，避免把渲染时差记成产品缺陷
async function realClickWhenReady(expr, ms = 8_000, what = '按钮') {
  await waitForNode(expr, ms, what)
  await realClick(expr, what)
}
const SEARCH_LIB = `document.querySelector('input[placeholder^="搜索标题"]')`
const SEARCH_TERMS = `document.querySelector('input[placeholder^="搜索中文名"]')`

let shotIndex = 0
async function shot(name) {
  if (!SHOT) return
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  shotIndex += 1
  const file = join(
    HERE,
    `${String(shotIndex).padStart(2, '0')}-${HEADLESS ? '' : 'headed-'}${name}.png`,
  )
  writeFileSync(file, Buffer.from(data, 'base64'))
  say(`  截图 ${file.replace(`${REPO}/`, '')}`)
}
async function go(path) {
  await cdp('Page.navigate', { url: `${BASE}${path}` })
  await sleep(1_400)
}

function flushEvidence() {
  try {
    const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
      .stdout.trim()
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
      .stdout.split('\n').filter(Boolean).length
    const tag = HEADLESS ? '' : '-headed'
    writeFileSync(
      join(HERE, `three-smokes${tag}.txt`),
      `${lines.join('\n')}\n\n# HEAD ${head}（工作树脏 ${String(dirty)} 文件）· node ${process.version} · ${process.platform} · Chrome ${HEADLESS ? 'headless=new' : 'headed'} · 结束于 ${new Date().toISOString()}\n`,
    )
  } catch {
    // 落盘失败不盖住真正的失败原因
  }
}
process.on('exit', flushEvidence)

// ---------- 夹具 ----------
// SM-1 用一支唯一中文标题的 .md 落盘再导入：md 导入器规则是 title 取一级标题、content 为**全文字节**，
// 于是「剪贴板应该是什么」有一个进程外可算的权威答案（就是那个文件本身）。
const TAG = Date.now().toString(36).slice(-5)
const MD_TITLE = `冒烟导入夹具${TAG}`
const MD_BODY = `# ${MD_TITLE}\n\n这是三条冒烟 SM-1 的夹具正文。\n第二行用来验证换行与 CJK 一起进剪贴板时不丢字节。\n`
const MD_PATH = join(FIX, `${MD_TITLE}.md`)
writeFileSync(MD_PATH, MD_BODY, 'utf8')
const ON_DISK = readFileSync(MD_PATH, 'utf8')
const Q1 = [...MD_TITLE].slice(0, 6).join('')
say(`夹具：SM-1 用磁盘文件 ${MD_PATH.replace(ROOT, '<ROOT>')}（${String(ON_DISK.length)} 字符）`)

// ---------- N1 负向对照：必须排在任何真输入之前（activation 会继承前一次真手势） ----------
say('\n== N1 负向对照：合成 el.click() 拿不到系统剪贴板')
const USER_CLIP = HAS_PASTEBOARD ? pasteboard() : ''
const SENTINEL = `SMOKE-SENTINEL-${TAG}-SYNTH`
if (HAS_PASTEBOARD) setPasteboard(SENTINEL)
await go('/library')
await waitForText('提示词库', 10_000)
const plainTarget = (JSON.parse((await api('/api/prompts?size=50')).body).items ?? []).find(
  (p) => p.variables.length === 0,
)
if (plainTarget === undefined) throw new Error('种子缺无变量提示词，N1 夹具不成立')
const synthClick = await evalJs(
  `(() => {const b=${rowButtonExpr(plainTarget.title, '复制')}; if(!b) return 'NO_EL'; b.click(); return 'OK'})()`,
)
await sleep(900)
const clipAfterSynth = HAS_PASTEBOARD ? pasteboard() : ''
check(
  'N1 合成点击未写入系统剪贴板（⇒ 现有走查驱动器的 click 不算真输入）',
  !HAS_PASTEBOARD ? true : clipAfterSynth === SENTINEL,
  `click()=${String(synthClick)} 剪贴板未变=${String(clipAfterSynth === SENTINEL)}`,
)

// ================= SM-1 导入 → 复制 =================
say('\n== SM-1 导入→复制（真点击 + file chooser 注入 + 真中文检索 + 真点击复制 → pbpaste）')
try {
  await realClick(btnExpr('导入'))
  check('SM-1a 真点击「导入」打开导入弹窗', await waitForText('导入提示词', 8_000))

  let chooser = null
  const onChooser = (msg) => {
    if (msg.method === 'Page.fileChooserOpened') chooser = msg.params
  }
  listeners.push(onChooser)
  await cdp('Page.setInterceptFileChooserDialog', { enabled: true })
  await realClick(dlgBtnExpr('选择文件…'), '选择文件…')
  for (let i = 0; i < 40 && chooser === null; i += 1) await sleep(100)
  check(
    'SM-1b 真点击「选择文件…」触发浏览器 file chooser（按钮真接线）',
    chooser !== null,
    chooser === null ? '未收到 Page.fileChooserOpened' : `mode=${String(chooser.mode)}`,
  )
  if (chooser === null) throw new Error('file chooser 未触发，无法注入文件')
  await cdp('DOM.setFileInputFiles', { files: [MD_PATH], backendNodeId: chooser.backendNodeId })
  await cdp('Page.setInterceptFileChooserDialog', { enabled: false })
  const idx = listeners.indexOf(onChooser)
  if (idx >= 0) listeners.splice(idx, 1)

  check(
    'SM-1c 导入报告：新建 1 条、跳过 0 条',
    await waitForText('导入完成：新建 1 条，跳过 0 条', 12_000),
  )
  // 把「为什么必须按弹窗作用域查」留成现场证据：全局数一下 textContent 恰为「关闭」的按钮各有几个、长在哪
  info(
    '页内「关闭」按钮候选',
    JSON.stringify(
      await evalJs(
        `(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '关闭')` +
          `.map((b) => {const r=b.getBoundingClientRect(); return {` +
          ` host: b.closest('[role="dialog"]') ? 'dialog' : 'root（toast/页面流）',` +
          ` aria: b.getAttribute('aria-label'),` +
          ` rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]}}))()`,
      ),
    ),
  )
  await realClick(dlgBtnExpr('关闭'), '弹窗关闭')
  check('SM-1d 真点击「关闭」收起弹窗', await waitGoneText('导入提示词', 6_000))

  requests.length = 0
  await realClick(SEARCH_LIB)
  await insertText(Q1)
  const reqSeen = Date.now()
  let hitReq = ''
  while (Date.now() < reqSeen + 4_000) {
    hitReq = requests.find((u) => u.includes('q=') && decodeURIComponent(u).includes(Q1)) ?? ''
    if (hitReq !== '') break
    await sleep(100)
  }
  check(
    'SM-1e 中文检索真发出了带该 q 的请求',
    hitReq !== '',
    hitReq === '' ? `窗口内 0 条命中（共 ${String(requests.length)} 条请求）` : hitReq.slice(0, 120),
  )
  check(
    `SM-1f 列表收窄到刚导入那条「${MD_TITLE}」`,
    await waitForText(MD_TITLE, 8_000),
  )
  const dbRow = (JSON.parse((await api(`/api/prompts?size=20&q=${encodeURIComponent(MD_TITLE)}`)).body).items ?? []).find((p) => p.title === MD_TITLE)
  check(
    'SM-1g 服务端存回的 content 与磁盘字节逐字节相等',
    dbRow !== undefined && dbRow.content === ON_DISK,
    dbRow === undefined ? 'API 查不到该条' : `服务端 ${String(dbRow.content.length)} 字符 / 磁盘 ${String(ON_DISK.length)} 字符`,
  )

  if (HAS_PASTEBOARD) setPasteboard(SENTINEL)
  await realClick(rowButtonExpr(MD_TITLE, '复制'))
  let clip1 = SENTINEL
  const dl1 = Date.now() + 4_000
  while (Date.now() < dl1) {
    clip1 = HAS_PASTEBOARD ? pasteboard() : ''
    if (clip1 === ON_DISK) break
    await sleep(150)
  }
  check(
    'SM-1h 真点击「复制」后系统剪贴板 == 磁盘 .md 字节',
    clip1 === ON_DISK,
    `pbpaste ${String(clip1.length)} 字符 / 期望 ${String(ON_DISK.length)} 字符`,
    true,
  )
  await shot('sm1-import-copy')
} catch (e) {
  V.sm1 = false
  fail()
  say(`FAIL SM-1 异常中断 — ${String(e).slice(0, 300)}`)
}

// ================= SM-2 术语搜索 → TERMS.md → 复制全文 =================
say('\n== SM-2 术语搜索→TERMS.md（真中文检索 + 真点击勾选 + 生成 + 复制 → pbpaste）')
try {
  await go('/terms')
  check('SM-2a 术语库渲染', await waitForText('术语', 10_000))
  const terms = (JSON.parse((await api('/api/terms')).body).items ?? []).filter(
    (t) => typeof t.zh === 'string' && [...t.zh].length >= 4,
  )
  if (terms.length === 0) throw new Error('种子术语不足，SM-2 夹具不成立')
  const term = terms.find((t) => !/[{{}}]/.test(String(t.definition ?? ''))) ?? terms[0]
  const Q2 = [...term.zh].slice(0, 4).join('')
  const aria = `document.querySelector('input[aria-label=${JSON.stringify(term.zh)}]')`
  say(`  夹具：术语「${String(term.zh)}」/ 检索串「${Q2}」`)

  requests.length = 0
  await realClick(SEARCH_TERMS)
  await insertText(Q2)
  const dl2 = Date.now() + 4_000
  let req2 = ''
  while (Date.now() < dl2) {
    req2 = requests.find((u) => u.includes('/api/terms/search') && decodeURIComponent(u).includes(Q2)) ?? ''
    if (req2 !== '') break
    await sleep(100)
  }
  check('SM-2b 中文检索真发出了 /api/terms/search 请求', req2 !== '', req2.slice(0, 120))
  check(
    'SM-2c 结果表里出现该术语的勾选框（aria-label 即中文名）',
    await evalJs(`(() => {const el=${aria}; return el ? 1 : 0})()`) === 1,
    `术语「${String(term.zh)}」`,
  )
  await realClick(aria)
  check('SM-2d 真点击勾选后底部报「已选 1 条」', await waitForText('已选 1 条', 6_000))
  const renderBtn = `(() => {const b=[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '生成 TERMS.md'); return b && !b.disabled ? b : null})()`
  await realClickWhenReady(renderBtn, 6_000, '生成 TERMS.md')
  check('SM-2e 真点击「生成 TERMS.md」开预览', await waitForText('复制全文', 10_000))

  const orderBy = await evalJs(
    `(() => {const s=[...document.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === '排序'); return s ? s.value : 'en-alpha'})()`,
  )
  const rendered = await apiUrl('/api/terms/render-terms-md', 'POST', {
    termIds: [term.id],
    orderBy,
  })
  const mdBytes = String(rendered.content ?? '')
  // <pre> 只在字节到位后才渲染（TermsMdPreview.tsx:48 的 content !== '' 条件），
  // 而「复制全文」按钮从首帧就在（只是 disabled）—— 所以 SM-2e 过了不等于预览已就绪，必须轮询等它出现。
  const PRE_EXPR =
    `(() => {const d=document.querySelector('[role="dialog"]'); const p=d ? d.querySelector('pre') : null;` +
    ` return p ? p.textContent : null})()`
  let preText = null
  const dlPre = Date.now() + 10_000
  while (Date.now() < dlPre) {
    preText = await evalJs(PRE_EXPR)
    if (preText !== null && preText !== '') break
    await sleep(200)
  }
  check(
    'SM-2f 预览 <pre> 文本 == 服务端 render-terms-md 字节',
    preText === mdBytes && mdBytes.includes(String(term.zh)),
    preText === null
      ? '10 s 内预览 <pre> 未出现（内容未就绪）'
      : `DOM ${String(preText.length)} 字符 / API ${String(mdBytes.length)} 字符 · orderBy=${String(orderBy)}`,
  )

  if (HAS_PASTEBOARD) setPasteboard(SENTINEL)
  await realClick(dlgBtnExpr('复制全文'), '复制全文')
  let clip2 = SENTINEL
  const dl3 = Date.now() + 4_000
  while (Date.now() < dl3) {
    clip2 = HAS_PASTEBOARD ? pasteboard() : ''
    if (clip2 === mdBytes) break
    await sleep(150)
  }
  check(
    'SM-2g 真点击「复制全文」后系统剪贴板 == 服务端 TERMS.md 字节',
    clip2 === mdBytes,
    `pbpaste ${String(clip2.length)} 字符 / 期望 ${String(mdBytes.length)} 字符`,
    true,
  )
  await shot('sm2-terms-md')
  await realClick(dlgBtnExpr('关闭'), '弹窗关闭')
  // 清掉搜索态，免得 SM-3 的页面文本被残留过滤影响
  await go('/library')
} catch (e) {
  V.sm2 = false
  fail()
  say(`FAIL SM-2 异常中断 — ${String(e).slice(0, 300)}`)
}

// ================= SM-3 向导三步（真点击推进 + sync 点亮 + 询问卡） =================
say('\n== SM-3 开箱向导三步：全程真点击')
try {
  await go('/library')
  check('SM-3a 顶栏向导条在位', await waitForText('开箱三步', 10_000))
  await realClick(btnExpr('下一步'))
  check('SM-3b 真点击推进到步②', await waitForText('看一个标准包长什么样', 8_000))
  await sleep(1_200)
  const step2 = await bodyText()
  check(
    'SM-3c 步②渲染出文件树与指纹（与 preview API 同源）',
    step2.includes('CLAUDE.md') && /[0-9a-f]{64}/.test(step2),
    `指纹 ${(step2.match(/([0-9a-f]{64})/) ?? [''])[0].slice(0, 12)}…`,
  )
  await realClick(btnExpr('下一步'))
  check('SM-3d 真点击推进到步③', await waitForText('注入试试', 8_000))

  const step3 = await bodyText()
  const syncLine = (step3.match(/npx openvibe-cli sync [^\n]*/) ?? [''])[0]
  const demoDir = (syncLine.match(/"([^"]+)"/) ?? [])[1] ?? ''
  if (demoDir === '') throw new Error('步③没给出建议目录，夹具不成立')
  mkdirSync(demoDir, { recursive: true })
  info('步③建议命令', syncLine.slice(0, 120))
  const sync = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      join(REPO, 'apps/cli/src/index.ts'),
      '--json',
      'sync',
      demoDir,
      '--pack',
      'default',
      '--yes',
    ],
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
    info('sync 输出不可解析', syncOut.slice(0, 160))
  }
  const litByPolling = await waitForText('已注入 default@', 20_000)
  check(
    'SM-3e sync 后 lock 探测自动点亮（无人工点击，D11）',
    syncCode === 0 && litByPolling,
    `sync 退出码 ${String(syncCode)} · 点亮=${String(litByPolling)} · summary ${JSON.stringify(syncSummary ?? {}).slice(0, 160)}`,
  )
  await shot('sm3-wizard-injected')

  await realClick(btnExpr('完成向导'))
  check('SM-3f 真点击「完成向导」出现一次性询问卡', await waitForText('开启匿名统计？', 10_000))
  await realClick(btnExpr('暂不'))
  check('SM-3g 真点击「暂不」后向导条消失', await waitGoneText('开箱三步', 8_000))
  await go('/library')
  check('SM-3h 刷新后不再询问（declined 落本地标记）', !(await hasText('开启匿名统计？')))
  const te = JSON.parse((await api('/api/settings/telemetry')).body)
  check(
    'SM-3i 询问结果与后端一致',
    te.askState === 'declined' && te.enabled === false,
    JSON.stringify(te),
  )
  rmSync(demoDir, { recursive: true, force: true })
} catch (e) {
  V.sm3 = false
  fail()
  say(`FAIL SM-3 异常中断 — ${String(e).slice(0, 300)}`)
}

// ================= 汇总 =================
say('\n== 判据归属（三条各自独立）')
say('  SM-1：导入报告新建 1 条 + 服务端 content == 磁盘字节 + 真点击复制后 pbpaste == 磁盘字节')
say('  SM-2：真发出中文检索请求 + 结果含该术语 + 预览 == 服务端字节 + 真点击复制后 pbpaste == 同一字节')
say('  SM-3：三步全真点击推进 + sync 后自动点亮 + 真点击完成/暂不且刷新不再询问')
say(
  `  SM-1=${V.sm1 ? '过' : '不过'} SM-2=${V.sm2 ? '过' : '不过'} SM-3=${V.sm3 ? '过' : '不过'}`,
)
say(
  `结果：FAIL=${String(failures)} SKIP=${String(skipped)} · 形态=${HEADLESS ? 'headless=new' : 'headed'} ⇒ ` +
    (HEADLESS
      ? '无头侧剪贴板腿按设计为 SKIP（不可判不等于通过），其余腿须 FAIL=0'
      : failures === 0 && skipped === 0
        ? '有头侧三条冒烟全过 → §2b·T11 的冒烟证据可自动化留档'
        : '有头侧未全过 → 该条仍留「本版未验证」缺口'),
)
flushEvidence()

if (HAS_PASTEBOARD) {
  setPasteboard(USER_CLIP)
  say(`剪贴板已还原为起跑前内容（${String(USER_CLIP.length)} 字符，纯文本表示）`)
}
flushEvidence()
ws.close()
chromeProc.kill()
serveProc.kill()
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code !== 'ESRCH'
  }
}
for (let i = 0; i < 25 && (alive(serveProc.pid) || alive(chromeProc.pid)); i += 1) await sleep(200)
// 清理断言只判**自己那两只** pid：同机并行会话的 serve 是未定归属的超集，不算本驱动器的孤儿
check(
  '驱动器结束时无残留本进程子进程（serve + Chrome 双 pid 已判死）',
  !alive(serveProc.pid) && !alive(chromeProc.pid),
  `serve=${String(serveProc.pid)}:${String(alive(serveProc.pid))} chrome=${String(chromeProc.pid)}:${String(alive(chromeProc.pid))}`,
)
// 清理计数必须真读目录：`spawnSync('ls', ['…/ov-smoke-*'])` 不过 shell，通配符不会被展开，
// ls 直接报 No such file or directory ⇒ stdout 为空 ⇒ 永远报「0 个」，是一条假安慰。
const leftovers = readdirSync(tmpdir())
  .filter((n) => n.startsWith('ov-smoke-'))
  .map((n) => join(tmpdir(), n))
info('本机 ov-smoke-* 临时目录（rmSync 前）', `${String(leftovers.length)} 个 ${leftovers.join(' ')}`)
rmSync(ROOT, { recursive: true, force: true })
info(
  '本进程临时目录已删',
  `${String(existsSync(ROOT) ? 'FAIL 仍在' : '已不存在')}；其余为并行会话遗留（未定归属，不算本驱动器孤儿）`,
)
process.exit(failures === 0 ? 0 : 1)
