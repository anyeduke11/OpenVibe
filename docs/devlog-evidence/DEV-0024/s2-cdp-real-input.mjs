// S-2 探针：裸 CDP 能不能拿到「真实用户动作」证据（dev-plan §15.4-S2 / §14-6 / D21）
// 用法：node docs/devlog-evidence/DEV-0024/s2-cdp-real-input.mjs
// 三条判据各自独立成立才算过（§15.4-S2）：
//   ① clipboard.writeText 下**系统剪贴板真拿到内容**——由进程外 pbpaste 逐字节反查，只看 promise resolve 不算过
//   ② 中文串经 Input.insertText 进受控 input 后，300ms debounce 检索命中
//   ③ Radix Dialog 内键盘 Tab/Enter 驱动焦点转移与确认
// 与现有三段走查驱动器的唯一区别：输入全走 Input.dispatch*（真事件），不再用 el.click()。
// 附带负向对照 N1：证明「合成 click 拿不到剪贴板」不是本探针的运气。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const ROOT = join(tmpdir(), `ov-s2-${String(process.pid)}`)
const HOME = join(ROOT, 'home')
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? '9345')
const SHOT = process.env.SHOTS === '0' ? false : true
// 剪贴板反查通道：macOS 走 pbpaste/pbcopy。本平台是唯一有pasteboard 反查通道的平台；
// 其余平台必须显式 SKIP——「不可判」不等于「通过」（§15.4-S2 判据①的原话）。
const HAS_PASTEBOARD = process.platform === 'darwin'

mkdirSync(HOME, { recursive: true })

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}
let failures = 0
let skipped = 0
// 三条判据各记各的（无头下①必然不过，但②③仍要能单独读出结论；只看汇总 FAIL 数会把这层混掉）
const V = { c1: false, c2: false, c3: false, clip3: false }
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  say(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ` — ${detail}`}`)
  return ok
}
const skip = (label, detail) => {
  skipped += 1
  say(`SKIP ${label} — ${detail}`)
}
const info = (label, detail) => say(`INFO ${label}${detail === '' ? '' : ` — ${detail}`}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 剪贴板读写必须显式带 UTF-8 locale：本机 shell 环境不导出 LANG/LC_CTYPE，
// 裸 pbpaste 会把 CJK 走一遍系统旧码页（实测 `# 日志约定` → `# ־Լ`），
// 于是「产品没写进剪贴板」和「我读错了编码」长得一模一样。见 §15.4-S2 结论。
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

// ---------- 构建 Web（不 build 就是拿旧包验新代码） ----------
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

// ---------- serve（随机端口 + 隔离 HOME；绝不碰同机 8898 的并行项目） ----------
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

// ---------- Chrome / CDP ----------
// HEADLESS=0 起**有头** Chrome：判据①第一次跑在无头下 writeText 成功、页内 readText 也读得到，
// 但 pbpaste 读到的仍是旧哨兵——要分清「无头没有系统剪贴板」与「真输入拿不到剪贴板」这两件不同的事。
const HEADLESS = process.env.HEADLESS !== '0'
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
    // §15.4-S2 判据①点名的开关。未知开关会被 Chrome 静默忽略，
    // 所以「它生效了」不由这里证明，只由 pbpaste 逐字节比对证明。
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
async function waitGoneText(t, ms = 6_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!(await hasText(t))) return true
    await sleep(200)
  }
  return false
}

// 浏览器请求过的 URL：判据②要证明 debounce 真的打了一次带中文 q 的检索请求，
// 光看 DOM 会把「列表恰好还有那几行」当成命中（假绿）。
const requests = []
listeners.push((msg) => {
  if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url)
})

await cdp('Runtime.enable')
await cdp('Page.enable')
await cdp('Network.enable')
// headless=new 默认视口 800×600：深列表里的按钮不放大 + 不滚动就会点到视口外（第一次跑撞过）。
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})
// input 事件计数器：判据②要区分「insertText 没派发 input」与「派发了但 React 没接住」。
// React 的 onChange 对合成中的 input 事件（isComposing=true）是**故意不触发**的（IME 中途不提交），
// 所以还要记 compositionstart/end 与各事件的 isComposing——第一次跑撞到的就是这一条。
// 走 addScriptToEvaluateOnNewDocument，否则每次 Page.navigate 就把计数器清空。
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source:
    `window.__ie = 0; window.__comp = 0; window.__cs = 0; window.__ce = 0;` +
    `addEventListener('input', (e) => { window.__ie += 1; if (e.isComposing) window.__comp += 1 }, true);` +
    `addEventListener('compositionstart', () => { window.__cs += 1 }, true);` +
    `addEventListener('compositionend', () => { window.__ce += 1 }, true);`,
})
try {
  await cdp('Browser.grantPermissions', {
    origin: ORIGIN,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })
  info('clipboard 权限授予', 'clipboardReadWrite + clipboardSanitizedWrite（Browser.grantPermissions）')
} catch (e) {
  info('clipboard 权限授予失败', String(e).slice(0, 200))
}

// ---------- 真输入原语：本探针唯一的新代码 ----------
async function realClick(expr) {
  // ① 滚进视口 ② 命中点校验（elementFromPoint 必须是目标本身或其子孙）③ 再发真事件。
  // 不做②就会把「点到别的元素」记成产品缺陷——第一次跑撞的就是这个。
  await evalJs(`(() => {const el=${expr}; if(el) el.scrollIntoView({block:'center', behavior:'instant'}); return 1})()`)
  await sleep(120)
  const hit = await evalJs(
    `(() => {const el=${expr}; if(!el) return {err:'NO_EL'};` +
      `const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return {err:'ZERO'};` +
      `const x=r.x+r.width/2, y=r.y+r.height/2; const t=document.elementFromPoint(x,y);` +
      `return {x, y, ok: t !== null && (t === el || el.contains(t) || (t.closest && t.closest('button,label') === el)),` +
      ` landed: t ? t.tagName.toLowerCase() + '.' + String(t.textContent ?? '').trim().slice(0,12) : null}})()`,
  )
  if (hit.err !== undefined) throw new Error(`元素不可定位（${hit.err}）：${expr}`)
  if (!hit.ok) throw new Error(`命中点不是目标（落在 ${hit.landed}）：${expr}`)
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
// 「标题为 title 的那一行」里的某个按钮（行内标题按钮 textContent == title）
const rowButtonExpr = (title, btnText) =>
  `(() => {const li=[...document.querySelectorAll('li')].find((l) =>` +
  ` [...l.querySelectorAll('button')].some((b) => b.textContent.trim() === ${JSON.stringify(title)}));` +
  ` if(!li) return null; return [...li.querySelectorAll('button')]` +
  `.find((b) => b.textContent.trim() === ${JSON.stringify(btnText)}) ?? null})()`
const focusInfo = () =>
  evalJs(
    `(() => {const a=document.activeElement; if(!a) return null;` +
      `return {tag:a.tagName.toLowerCase(), text:(a.textContent??'').trim().slice(0,20),` +
      ` inDialog: Boolean(a.closest('[role="dialog"]'))}})()`,
  )
async function realKey(key, vk, code, text) {
  await cdp('Input.dispatchKeyEvent', {
    type: text === undefined ? 'rawKeyDown' : 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    text,
  })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  })
}
const realTab = () => realKey('Tab', 9, 'Tab')
const realEnter = () => realKey('Enter', 13, 'Enter', '\r')
const insertText = (s) => cdp('Input.insertText', { text: s })
// 从当前焦点起连按 Tab，直到命中 predicate（返回跳数；-1 = 没走到）
async function tabUntil(predicateExpr, maxTries = 14) {
  for (let i = 0; i < maxTries; i += 1) {
    const hit = await evalJs(
      `(() => {const a=document.activeElement; return a ? (${predicateExpr})(a) : false})()`,
    )
    if (hit) return i
    await realTab()
    await sleep(90)
  }
  return -1
}

let shotIndex = 0
async function shot(name) {
  if (!SHOT) return
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  shotIndex += 1
  // 两种形态的截图分开存，否则有头那一次会把无头的现场覆盖掉
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
    const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO,
      encoding: 'utf8',
    }).stdout.trim()
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
      .stdout.split('\n').filter(Boolean).length
    // 有头/无头两份日志分开存：判据①的结论按浏览器形态分叉，覆盖写会把对照证据吃掉
    const tag = HEADLESS ? '' : '-headed'
    writeFileSync(
      join(HERE, `s2-cdp-real-input${tag}.txt`),
      `${lines.join('\n')}\n\n# HEAD ${head}（工作树脏 ${String(dirty)} 文件）· node ${process.version} · ${process.platform} · Chrome ${HEADLESS ? 'headless=new' : 'headed'} · 结束于 ${new Date().toISOString()}\n`,
    )
  } catch {
    // 落盘失败不盖住真正的失败原因
  }
}
process.on('exit', flushEvidence)

// ---------- 夹具：一支无变量（判据①）、一支带变量（判据③） ----------
const prompts = JSON.parse((await api('/api/prompts?size=50')).body).items
const plain = prompts.find((p) => p.variables.length === 0)
const withVars = prompts.find((p) => new Set(p.variables).size >= 2)
if (plain === undefined || withVars === undefined) {
  throw new Error('种子缺「无变量」或「≥2 变量」提示词，夹具不成立')
}
const varNames = [...new Set(withVars.variables)]
// 检索串：取带变量那条标题的前 4 个码点，保证「查询命中的就是我要操作的那一行」
const QUERY = [...withVars.title].slice(0, 4).join('')
say(`夹具：①用「${plain.title}」（${String(plain.content.length)} 字符，无变量）`)
say(`      ③用「${withVars.title}」（变量 ${varNames.join(', ')}）`)

const SEARCH_EXPR = `document.querySelector('input[placeholder^="搜索标题"]')`
// 系统剪贴板是用户资产：进门前记下，收工后原样还回去（内容不入日志）
const USER_CLIP = HAS_PASTEBOARD ? pasteboard() : ''

// ================= 判据① =================
say('\n== 判据①：真鼠标点击 → 系统剪贴板（进程外 pbpaste 逐字节反查）')
if (!HAS_PASTEBOARD) {
  skip('判据①', '本平台无 pbpaste/pbcopy 反查通道 ⇒ 不可判，不得当作通过')
} else {
  await go('/library')
  check('提示词库渲染且带变量条目挂出 {{var}}', (await hasText('提示词库')) && (await hasText('{{')))
  info(
    'clipboard API 前置',
    `isSecureContext=${String(await evalJs('window.isSecureContext'))} origin=${ORIGIN} 形态=${HEADLESS ? 'headless' : 'headed'}`,
  )

  // N1 负向对照**必须排在任何真点击之前**：Chrome 的 transient activation 有约 5s 窗口，
  // 真操作之后再合成点击会继承那份激活（第一次有头跑就撞成这样，负向对照直接失效）。
  const SENTINEL2 = `S2-SENTINEL-${String(Date.now())}-SYNTH`
  setPasteboard(SENTINEL2)
  const synth = await evalJs(
    `(() => {const b=${rowButtonExpr(plain.title, '复制')}; if(!b) return 'MISSING'; b.click(); return 'OK'})()`,
  )
  await sleep(1_000)
  const afterSynth = pasteboard()
  const errToast = await hasText('剪贴板不可用')
  info(
    'N1 合成 el.click()（此前无任何真输入）',
    `click()=${synth}，pbpaste 仍为哨兵=${String(afterSynth === SENTINEL2)}，错误 toast=${String(errToast)}`,
  )
  check(
    'N1 负向对照：无任何真输入时，合成点击未写入系统剪贴板（⇒ 现有走查驱动器的 click 不算真输入）',
    synth === 'OK' && afterSynth === SENTINEL2,
    afterSynth === SENTINEL2
      ? '剪贴板未变'
      : `剪贴板被合成点击改成 ${JSON.stringify(afterSynth.slice(0, 30))}`,
  )

  // 判据①本体：真鼠标点击（这份激活是新的一次真事件，不是复用 N1 的那次）
  const SENTINEL = `S2-SENTINEL-${String(Date.now())}-BEFORE`
  setPasteboard(SENTINEL)
  await realClick(rowButtonExpr(plain.title, '复制'))
  const gotToast = await waitForText('已复制到剪贴板', 3_500)
  await sleep(400)
  const after = pasteboard()
  check(
    '判据①：pbpaste 内容 == 提示词正文（不是哨兵旧值，也不只看 promise）',
    after === plain.content,
    `pbpaste ${String(after.length)} 字符，逐字节相等=${String(after === plain.content)}；toast=${String(gotToast)}`,
  )
  check('判据①辅助：toast「已复制到剪贴板」出现', gotToast)
  V.c1 = after === plain.content
  if (after !== plain.content) {
    say(`  pbpaste 前 60：${JSON.stringify(after.slice(0, 60))}`)
    say(`  期望前 60：${JSON.stringify(plain.content.slice(0, 60))}`)
  }

  // 页内读回（辅助通道）：它证明的是渲染进程自己的剪贴板视图，不等于系统剪贴板
  const readBack = await evalJs(
    `navigator.clipboard.readText().then((t) => 'OK:' + t.slice(0, 20)).catch((e) => 'ERR:' + e.name)`,
  )
  info('第二读法 clipboard.readText()（页内视图，非系统剪贴板）', String(readBack))
}

// ================= 判据② =================
say('\n== 判据②：中文经 Input.insertText 进受控 input → 300ms debounce → 检索请求与命中')
if (!HAS_PASTEBOARD) {
  skip('判据②', '与①同批门控（探针整体只在有剪贴板通道的平台跑）')
} else {
  await go('/library')
  await realClick(SEARCH_EXPR)
  // 查询串取自目标标题的前 4 个字：判据②要证「命中该词条」，查询与目标无关就是自欺
  // （第一次跑用「代码审查」去找「复盘报告生成」，②c 的 hit 其实来自未过滤的全量列表）。
  const reqMark = requests.length
  const ieMark = await evalJs('window.__ie')
  await insertText(QUERY)
  await sleep(120)
  const domValue = await evalJs(`(${SEARCH_EXPR})?.value ?? null`)
  const ieNow = await evalJs('window.__ie')
  info(
    'input/composition 计数',
    `input=${String(ieMark)}→${String(ieNow)}（其中 isComposing=true 的 ${String(await evalJs('window.__comp'))} 次），` +
      `compositionstart=${String(await evalJs('window.__cs'))} compositionend=${String(await evalJs('window.__ce'))}`,
  )
  check(
    '判据②a：受控 input 的 value == 中文串（真输入进了 DOM）',
    domValue === QUERY,
    `DOM value=${JSON.stringify(domValue ?? null)}`,
  )
  // debounce 300ms + 一次往返：不能在 187ms 上断言「没发请求」（第一次跑就是这么假红的）。
  // 等「带中文 q 的请求出现」或超时，再等「计数行收窄」，两件事各自有截止线。
  const reqDeadline = Date.now() + 4_000
  let debounceReq
  let waited = 0
  while (Date.now() < reqDeadline) {
    debounceReq = requests
      .slice(reqMark)
      .find((u) => u.includes('/api/prompts') && u.includes(encodeURIComponent(QUERY)))
    if (debounceReq !== undefined) break
    await sleep(150)
    waited += 150
  }
  const totalBefore = prompts.length
  const rowDeadline = Date.now() + 4_000
  let rows = totalBefore
  let totalLine = ''
  while (Date.now() < rowDeadline) {
    rows = await evalJs(
      `[...document.querySelectorAll('li')].filter((l) => [...l.querySelectorAll('button')]` +
        `.some((b) => b.textContent.trim() === '复制')).length`,
    )
    totalLine =
      (await evalJs('document.body.innerText')).split('\n').find((l) => /^共 \d+ 条$/.test(l.trim())) ??
      ''
    if (rows < totalBefore) break
    await sleep(150)
  }
  const hit = await hasText(withVars.title)
  info(
    '检索窗口内捕到的 /api/prompts 请求',
    String(requests.slice(reqMark).filter((u) => u.includes('/api/prompts')).length) + ' 条，样例：' +
      String(requests.slice(reqMark).filter((u) => u.includes('/api/prompts')).pop() ?? '（无）'),
  )
  check(
    '判据②b：debounce 后真的发出了带该中文 q 的检索请求',
    debounceReq !== undefined,
    `等到第 ${String(waited)}ms，请求=${String(debounceReq ?? '未捕获')}`,
  )
  check(
    `判据②c：检索命中标题「${withVars.title}」且列表收窄（${totalLine || '未读到计数行'}）`,
    hit && rows >= 1 && rows < totalBefore,
    `渲染 ${String(rows)} 行 / 全量 ${String(totalBefore)} 条`,
  )
  V.c2 = domValue === QUERY && debounceReq !== undefined && hit && rows >= 1 && rows < totalBefore

  // 第二通路（信息项，不入判据）：逐字符 dispatchKeyEvent(text) 能否表达 CJK
  await realClick(SEARCH_EXPR)
  await evalJs(`(${SEARCH_EXPR}).select()`)
  const reqMark2 = requests.length
  for (const ch of '重构') {
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ch,
      code: 'Key',
      text: ch,
      windowsVirtualKeyCode: 0,
    })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key', windowsVirtualKeyCode: 0 })
  }
  await sleep(900)
  const charValue = await evalJs(`(${SEARCH_EXPR})?.value ?? null`)
  const charRows = await evalJs(
    `[...document.querySelectorAll('li')].filter((l) => [...l.querySelectorAll('button')]` +
      `.some((b) => b.textContent.trim() === '复制')).length`,
  )
  const charTotal =
    (await evalJs('document.body.innerText')).split('\n').find((l) => /^共 \d+ 条$/.test(l.trim())) ?? ''
  const charReq = requests
    .slice(reqMark2)
    .find((u) => u.includes('/api/prompts') && u.includes(encodeURIComponent('重构')))
  info(
    'CJK 第二通路（信息项，不入判据）',
    `逐字符 dispatchKeyEvent(text)="重构" → value=${JSON.stringify(charValue ?? null)}，` +
      `检索请求=${String(charReq !== undefined)}，${charTotal || '未读到计数行'}，渲染 ${String(charRows)} 行`,
  )
}

// ================= 判据③ =================
say('\n== 判据③：Radix Dialog 键盘流（Tab 转移焦点 + Enter 确认并写剪贴板）')
if (!HAS_PASTEBOARD) {
  skip('判据③', '与①同批门控')
} else {
  await go('/library')
  // 先收窄列表再点操作按钮：行少到一屏内，同时验证「检索结果里的行可被真点击驱动」
  await realClick(SEARCH_EXPR)
  await insertText(QUERY)
  await sleep(1_200)
  const SENTINEL3 = `S2-SENTINEL-${String(Date.now())}-DIALOG`
  setPasteboard(SENTINEL3)
  await realClick(rowButtonExpr(withVars.title, '复制'))
  const opened = await waitForText('填写变量（必填）', 8_000)
  check('判据③a：真点击打开 VariableFillModal（Radix Dialog）', opened)
  const inside = await evalJs(
    `(() => {const a=document.activeElement; return {inDialog: Boolean(a?.closest('[role="dialog"]')), tag:a?.tagName.toLowerCase()}})()`,
  )
  check('判据③b：打开后初始焦点在 [role=dialog] 内（FocusScope 生效）', inside.inDialog === true, JSON.stringify(inside))

  const inputExpr = `[...document.querySelectorAll('[role="dialog"] input')]`
  const inputCount = await evalJs(`${inputExpr}.length`)
  check(
    `判据③c：Dialog 内变量输入数 == 变量数（${String(varNames.length)}）`,
    inputCount === varNames.length,
    `实际 ${String(inputCount)}`,
  )

  const values = {}
  for (let i = 0; i < varNames.length; i += 1) {
    const v = `甲乙${String(i)}丙`
    values[varNames[i]] = v
    // 每次先真点击落焦点，再 insertText——否则三段中文会全灌进第一个输入框
    await realClick(`${inputExpr}[${String(i)}]`)
    await insertText(v)
    await sleep(140)
  }
  const back = await evalJs(`${inputExpr}.map((el) => el.value)`)
  check(
    '判据③d：每个变量框各自回写了它的中文（逐框落点正确）',
    back.length === varNames.length && back.every((v, i) => v === values[varNames[i]]),
    JSON.stringify(back),
  )

  const steps = await tabUntil(
    `(a) => a.tagName === 'BUTTON' && a.textContent.trim() === '复制到剪贴板'`,
  )
  const focusNow = await focusInfo()
  check(
    '判据③e：Tab 键把焦点在 Dialog 内逐跳移到「复制到剪贴板」',
    steps >= 0 && focusNow?.text === '复制到剪贴板',
    `走了 ${String(steps + 1)} 跳，落点 ${JSON.stringify(focusNow)}`,
  )
  const enabled = await evalJs(
    `(() => {const b=[...document.querySelectorAll('[role="dialog"] button')]` +
      `.find((x) => x.textContent.trim() === '复制到剪贴板'); return b ? !b.disabled : null})()`,
  )
  check('判据③f：变量填齐后确认按钮从 disabled 变可激活', enabled === true)

  await realEnter()
  const closed = await waitGoneText('填写变量（必填）')
  await sleep(400)
  const clipboard3 = pasteboard()
  const expected = withVars.content.replace(
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g,
    (whole, name) => (values[name] === undefined || values[name] === '' ? whole : values[name]),
  )
  check(
    '判据③g：Enter 键触发确认动作 → Dialog 关闭（键盘完成一次提交）',
    closed,
    `closed=${String(closed)}`,
  )
  const okClip3 = check(
    '判据③h（判据①的键盘入口复采）：Enter 后系统剪贴板 == 变量替换后的预览文本',
    clipboard3 === expected,
    `pbpaste ${String(clipboard3.length)} 字符 vs 期望 ${String(expected.length)} 字符，相等=${String(clipboard3 === expected)}`,
  )
  V.c3 =
    opened &&
    inside.inDialog === true &&
    inputCount === varNames.length &&
    back.length === varNames.length &&
    back.every((v, i) => v === values[varNames[i]]) &&
    steps >= 0 &&
    enabled === true &&
    closed
  V.clip3 = okClip3
  if (clipboard3 !== expected) {
    say(`  pbpaste 前 80：${JSON.stringify(clipboard3.slice(0, 80))}`)
    say(`  期望前 80：${JSON.stringify(expected.slice(0, 80))}`)
  }
  await shot('dialog-keyboard')
}

// ================= 汇总 =================
say('\n== 判据归属（各条独立，任一不过即整体不过）')
say('  ① 剪贴板：以进程外 pbpaste（显式 UTF-8 locale）逐字节比对为准；promise / 页内 readText / toast 只作辅助信号')
say('  ② 中文输入：以「受控 value 回写 + 真发出带中文 q 的请求 + 列表收窄」三件齐为过')
say('  ③ 键盘流：以「Tab 改变焦点落点 + Enter 完成一次提交（Dialog 关闭）」为过；其剪贴板落点单列为 ③h')
const VERDICT = (b) => (b ? '过' : '不过')
say(`  浏览器形态 = ${HEADLESS ? 'headless=new' : 'headed'}`)
say(`  ① 真点击 → 系统剪贴板：${VERDICT(V.c1)}`)
say(`  ② 中文 insertText → debounce 检索：${VERDICT(V.c2)}`)
say(`  ③ Dialog 键盘 Tab/Enter：${VERDICT(V.c3)}（③h 剪贴板落点：${VERDICT(V.clip3)}）`)
// 退出码按形态判：无头下①结构上不可能过（渲染进程剪贴板不接系统 pasteboard），
// 若把①算进无头的成败，这条链在 CI 里永远是红的，就没人读日志了。
const S2_PASS = HEADLESS ? V.c2 && V.c3 : V.c1 && V.c2 && V.c3 && V.clip3
say(
  `结果：FAIL=${String(failures)} SKIP=${String(skipped)} ⇒ ` +
    (S2_PASS
      ? HEADLESS
        ? '无头侧可成立（②③过，①结构上不可判）'
        : '有头侧三条判据全过 → S-2 成立，可扩裸 CDP 驱动器入库'
      : '未全过 → 按 §15.4-S2 退路记为人工录屏缺口'),
)

// 还原剪贴板（只还原纯文本表示；若用户原来复制的是 RTF/图片，本探针无法复原，日志按此口径读）
if (HAS_PASTEBOARD) {
  setPasteboard(USER_CLIP)
  say(`剪贴板已还原为探针开始前内容（${String(USER_CLIP.length)} 字符，纯文本表示）`)
}
flushEvidence()

ws.close()
chromeProc.kill()
serveProc.kill()
// 清理断言只判**自己那两只** pid。`pgrep -f apps/cli/src/index.ts` 会把同机并行会话的
// serve 一并抓进来（DEV-0021⑤(a) 的端口/命令行轨同理），那是未定归属的超集，不能算本探针的孤儿。
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code !== 'ESRCH'
  }
}
for (let i = 0; i < 25 && (alive(serveProc.pid) || alive(chromeProc.pid)); i += 1) await sleep(200)
check(
  '探针结束时无残留本探针子进程（serve + Chrome 双 pid 已判死）',
  !alive(serveProc.pid) && !alive(chromeProc.pid),
  `serve=${String(serveProc.pid)}:${String(alive(serveProc.pid))} chrome=${String(chromeProc.pid)}:${String(alive(chromeProc.pid))}`,
)
rmSync(ROOT, { recursive: true, force: true })
const leftovers = spawnSync('ls', ['-d', join(tmpdir(), 'ov-s2-*')], {
  encoding: 'utf8',
  env: PB_ENV,
})
check(
  '探针临时目录已清空',
  leftovers.stdout.trim() === '',
  leftovers.stdout.trim() === '' ? 'rmSync 后无 ov-s2-* 残留' : leftovers.stdout.trim(),
)
flushEvidence()
process.exit(S2_PASS ? 0 : 1)
