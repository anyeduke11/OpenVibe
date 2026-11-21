#!/usr/bin/env node
/**
 * scripts/verify-topbar-cdp.mjs —— 顶栏按钮布局的 CDP 复算（DEV-0217）。
 *
 * ## 它解决什么
 *
 * `btnBase` 的 display 类隔离（DEV-0210）修的是**窄屏下 `hidden` 被静默覆盖**：
 * `btnBase` 里的 `inline-flex` 与调用点的 `hidden` 同属性，而 Tailwind v4 的生成顺序里
 * `inline-flex` 在 `hidden` **之后** ⇒ `hidden` 失效、按钮照样渲染并横向溢出。
 * 这类失效**肉眼与 lint 都看不出来**，只有量实际渲染才知道。
 *
 * `tests/btn-display.test.ts` 断的是**源码文本**（零环境依赖、覆盖所有调用点）；
 * 本脚本补的是**渲染层证据**：真浏览器、真 CSS、真盒模型。两者互补，缺一不可。
 *
 * ## 用法
 *
 * ```sh
 * # 前置：web 产物已构建，且有服务在跑
 * pnpm --filter @openvibe/web build
 * python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/web/dist &
 * node scripts/verify-topbar-cdp.mjs            # 默认 http://127.0.0.1:4173/
 * node scripts/verify-topbar-cdp.mjs --url http://127.0.0.1:5173/
 * node scripts/verify-topbar-cdp.mjs --url http://127.0.0.1:4173/ --dist /tmp/ov-dist-verify
 * ```
 *
 * 退出码：`0` 全部符合预期；`1` 有不符合项（含产物自检失败）。
 *
 * ## 三档视口与判据
 *
 * | 档 | 尺寸 | 判据 |
 * |---|---|---|
 * | narrow | 375×812 | 3 个 ghost 按钮 `w=0,h=0`；主题按钮高 ≥44 |
 * | desktop | 1440×900 | 5 个按钮全部可见（`w>0 && h>0`） |
 * | touch | 375×812，`mobile:true` + 触摸仿真 | 同 narrow，且验 640px 断点按 375 命中 |
 *
 * ## 产物自检先于量测（DEV-0217 收尾第 4 项）
 *
 * 脚本会先查 `dist/index.html` 引用的每个 `/assets/...` 是否真实存在。
 * **这一条是踩过坑才加的**：并行会话的构建会把 `apps/web/dist` 覆盖掉
 * （`index.html` 指向已被下一次构建删掉的 hash），于是脚本一直在测**旧产物** ——
 * 旧产物的布局恰好是对的，脚本就报出「全绿」。**「没抓到」的原因是「根本没测到新东西」**，
 * 而这类失效不报错、只静默给出错的结论。故产物不新鲜时立即报红，不进量测。
 * 用 `--dist` 指定被测产物目录（默认 `apps/web/dist`）。
 *
 * ## 两处 CDP 踩坑（都会静默改变结果，故写进自检）
 *
 * 1. **`/json/version` 给的是 browser target 的 ws**，`Page.enable` 在其上不存在
 *    （`-32601 'Page.enable' wasn't found`）⇒ 必须从 `/json/list` 挑 `type === 'page'`。
 * 2. **`mobile: true` 会撑开布局视口**：实测 `innerWidth` 报 1213 而非 375，而
 *    `document.documentElement.clientWidth` 仍是 375、`min-width:640px` 仍 false。
 *    ⇒ 判据取 **`docClientWidth`**（CSS 媒体查询与 `getBoundingClientRect` 的同一个基准），
 *      并在每档先断言它与设定值一致、再断言 640px 断点的命中情况 —— 不符立即报红，
 *      而不是把错数当成结论输出。
 */
import { spawn, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { readTargets } from './ui-snapshot-targets.mjs'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

const CDP_PORT = 9222
const NAV_SETTLE_MS = 2500

/** web 产物目录（相对本脚本） */
const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'dist')

/**
 * 核对清单（唯一出处）—— `tests/ui-snapshot-targets.json`，与 `scripts/snapshot-ui.mjs` 共用。
 *
 * ⚠️ **不要在本文件里另写一份源码清单**：`snapshot-ui.mjs` 按它落哈希，本脚本按它读哈希。
 *   两处各写一份时，只改一处会让另一处静默失配（表现为「清单里没有该文件的哈希」或
 *   「改了文件却不报红」）—— DEV-0223 收口为共用一份 JSON，DEV-0224 把**读取与结构校验**
 *   也收口到 `scripts/ui-snapshot-targets.mjs`（两处共用同一份校验，结构再变不会漏改）。
 */

/** 共享清单解析后的结果，由 `main()` 里调 `readTargets()` 填充（DEV-0224 收尾第 3 项） */
let HASH_FILES = []
let INVARIANT_DIRS = []

/** 源码哈希清单（受版本控制）—— 由 `pnpm ui:snapshot` 维护 */
const HASH_MANIFEST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tests',
  'ui-source-hashes.json',
)

/**
 * 受监视目录的**存在性不变量**（DEV-0224 收尾第 1 项）。
 *
 * `hashes` 逐份登记时，新增/改名文件不会被发现 —— 改它照样不报红，判据漏掉它。
 * 但「每份都登记」要求把 163 份非测试源码全写进 `hashes`，维护不可行；
 * 故本条只校验 `invariantDirs` **指向的目录真实存在且非空** ——
 * 目录被改名/删除时立即报红，而不是让清单悄悄指向空气。
 *
 * ⚠️ 「新增文件要登记 `hashes`」是**人的责任**，不是本判据能自动覆盖的 ——
 *   判据只能保证「清单本身没指向不存在的目录」，不能保证「清单覆盖了所有文件」。
 *   后者由 DEV_LOG 的潜在风险项显式承担。
 *
 * @returns 不存在的目录说明列表（空 = 通过）
 */
function checkInvariantDirs() {
  const bad = []
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  for (const dir of INVARIANT_DIRS) {
    const abs = join(repoRoot, ...dir.split('/'))
    if (!existsSync(abs)) {
      bad.push(`受监视目录不存在：${abs}\n  ⇒ 清单指向了已改名/删除的目录，请更新 invariantDirs`)
      continue
    }
    const entries = readdirSync(abs, { withFileTypes: true })
    if (entries.length === 0) {
      bad.push(`受监视目录为空：${abs}\n  ⇒ 目录空了，清单的 invariantDirs 该删了`)
    }
  }
  return bad
}

/**
 * 受监视目录的**覆盖判据**（DEV-0226 收尾第 1 项）。
 *
 * `hashes` 逐份登记时，**新增**文件不会被发现 —— 改它照样不报红，判据漏掉它。
 * 判据：受监视目录下**未跟踪（新增）的非测试源码**必须在 `hashes` 里。
 *
 * ⚠️ 为什么只判「未跟踪」而不判「所有文件」：判「所有文件都在册」要求把 163 份源码
 *   全写进 `hashes`，维护不可行（DEV-0225 实测基线立刻红到 `App.tsx`）。
 *   判「新增必须在册」是可满足的 —— 新增时登记一次即可，而已跟踪文件的修改
 *   由自检②的哈希比对负责，不重复管。
 *
 * ⚠️ 依赖 git：非 git 环境下 `git ls-files` 失败 ⇒ 跳过（返回空），不误报。
 *
 * @returns 未登记新增文件的说明列表（空 = 通过）
 */
function checkUnregisteredSources() {
  const bad = []
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  let untracked
  try {
    untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: repoRoot,
      encoding: 'utf8',
    })
  } catch {
    return []
  }
  const SRC_EXT = /\.(ts|tsx|css)$/
  const isTest = (p) => /\.test\.(ts|tsx)$/.test(p)
  for (const line of untracked
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!SRC_EXT.test(line) || isTest(line)) continue
    const inScope = INVARIANT_DIRS.some((d) => line === d || line.startsWith(`${d}/`))
    if (!inScope || HASH_FILES.includes(line)) continue
    bad.push(
      `受监视目录下有新增源码未登记哈希：${line}\n` +
        `  ⇒ 它进了产物却不在自检②的比对范围内，改了不会被发现。\n` +
        `    把它加进 tests/ui-snapshot-targets.json 的 "hashes"，再跑 pnpm ui:snapshot。`,
    )
  }
  return bad
}

/**
 * 产物资源前缀。
 *
 * ⚠️ 抽成常量而不是在正则里写死：`index.html` 的资源前缀由 vite 的 `base`/构建配置决定，
 *   改了配置（例如资源改放 `/static/`）时只改这一处；报错文案里也会点名它，
 *   避免「形态变了却被报成产物缺失」的误读。
 */
const ASSET_PREFIX = '/assets/'

/** 触屏最小可点区（Apple HIG / WCAG 2.5.5 的 44×44） */
const MIN_TOUCH_HEIGHT = 44

const VIEWPORTS = [
  { name: 'narrow', width: 375, height: 812, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'touch', width: 375, height: 812, mobile: true },
]

function parseArgs(argv) {
  const out = { url: 'http://127.0.0.1:4173/', chrome: CHROME_CANDIDATES[0], dist: DIST_DIR }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') out.url = argv[++i]
    else if (argv[i] === '--chrome') out.chrome = argv[++i]
    else if (argv[i] === '--dist') out.dist = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(
        '用法: node scripts/verify-topbar-cdp.mjs [--url <url>] [--chrome <path>] [--dist <dir>]',
      )
      console.log('  --url    被测地址（默认 http://127.0.0.1:4173/）')
      console.log('  --dist   产物目录，用于「index.html 引用的资源是否都存在」自检')
      console.log('           （默认 apps/web/dist；测临时产物时指向那个目录）')
      console.log('  --chrome Chrome/Chromium/Edge 可执行文件路径')
      process.exit(0)
    } else {
      console.error(`未知参数：${argv[i]}`)
      process.exit(2)
    }
  }
  return out
}

function findChrome() {
  return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null
}

async function get_pageWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      // ⚠️ 必须取 **page** target 的 ws，不能取 browser 的（`/json/version`）——
      //   `Page.enable` 在 browser target 上不存在（-32601）。
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* 端口未就绪，重试 */
    }
    await sleep(250)
  }
  throw new Error(`CDP page target 未就绪（:${CDP_PORT}）`)
}

/** 极简 CDP 客户端：id 自增 + 等待对应 id 的响应 */
function makeClient(ws) {
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })
  return {
    send(method, params = {}) {
      const myId = ++id
      return new Promise((resolve, reject) => {
        pending.set(myId, { resolve, reject })
        ws.send(JSON.stringify({ id: myId, method, params }))
      })
    },
  }
}

/**
 * 量测一档视口。
 *
 * @returns {{ name: string, width: number, innerWidth: number, buttons: Array<{label:string,w:number,h:number,x:number}> }}
 */
async function measure(client, vp, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: vp.mobile,
  })
  if (vp.mobile) {
    // 触屏档额外开触摸仿真 —— 只改视口不改输入类型，等于没验「触屏」
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await client.send('Page.navigate', { url })
  await sleep(NAV_SETTLE_MS)

  const r = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('header button, [role="banner"] button, nav button')]
        .map((b) => {
          const r = b.getBoundingClientRect()
          return {
            label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 32),
            w: Math.round(r.width),
            h: Math.round(r.height),
            x: Math.round(r.x),
          }
        })
      return JSON.stringify({
        url: location.href,
        title: document.title,
        innerWidth: innerWidth,
        visualWidth: visualViewport ? Math.round(visualViewport.width) : -1,
        dpr: devicePixelRatio,
        docClientWidth: document.documentElement.clientWidth,
        hasViewportMeta: !!document.querySelector('meta[name=viewport]'),
        smMatches: matchMedia('(min-width: 640px)').matches,
        maxSmMatches: matchMedia('(max-width: 639.98px)').matches,
        buttons: btns,
      })
    })()`,
    returnByValue: true,
  })
  const data = JSON.parse(r.result.value)
  return { name: vp.name, width: vp.width, mobile: vp.mobile, ...data }
}

/**
 * 判据：返回不符合项的说明列表（空 = 通过）。
 *
 * ⚠️ 布局宽度取 **`document.documentElement.clientWidth`**，不取 `innerWidth`：
 *   `mobile: true` 时 Chrome 会把**布局视口**撑开（实测 innerWidth=1213 而 docClient=375），
 *   拿 innerWidth 判会得出「视口不符」的错结论。而 CSS 媒体查询与 `getBoundingClientRect`
 *   都以布局视口为准（实测 touch 档 `min-width:640px` 仍 false）⇒ docClient 才是可比的那个数。
 */
function judge(measured) {
  const bad = []
  const layoutWidth = measured.docClientWidth

  // 视口自检：布局宽度必须与设定值一致，否则本档尺寸不可信
  if (layoutWidth !== measured.width) {
    bad.push(
      `视口自检失败：设定 ${measured.width}，实得 docClientWidth=${layoutWidth}` +
        `（innerWidth=${measured.innerWidth}，visualViewport=${measured.visualWidth}）`,
    )
    return bad
  }

  // 媒体查询断言：`max-sm`（640px 断点）必须按设定宽度命中 —— 这是本脚本真正要验的东西
  const expectSm = measured.width >= 640
  if (measured.smMatches !== expectSm) {
    bad.push(
      `媒体查询断言失败：(min-width:640px)=${measured.smMatches}，预期 ${expectSm}` +
        `（视口 ${measured.width}px）`,
    )
  }

  if (measured.buttons.length === 0) {
    bad.push('页面上找不到顶栏按钮（选择器未命中？页面未渲染？）')
    return bad
  }

  const theme = measured.buttons.filter((b) => b.label === '暖纸' || b.label === '暖夜')
  if (theme.length === 0) bad.push('找不到主题按钮（暖纸/暖夜）')

  // 主题按钮是触屏可点区的主要载体：高度必须 ≥44（DEV-0210 的 min-h-11 口径）
  for (const b of theme) {
    if (b.h > 0 && b.h < MIN_TOUCH_HEIGHT) {
      bad.push(`主题按钮「${b.label}」高度 ${b.h}px < ${MIN_TOUCH_HEIGHT}px（触屏最小可点区）`)
    }
  }

  const overflow = measured.buttons.filter((b) => b.w > 0 && b.x + b.w > layoutWidth)
  for (const b of overflow) {
    bad.push(`「${b.label}」横向溢出：x=${b.x} w=${b.w} ⇒ 右沿 ${b.x + b.w} > ${layoutWidth}`)
  }

  if (measured.name === 'narrow' || measured.name === 'touch') {
    // 窄屏：3 个 ghost 按钮（覆盖地图 / 专家视图 / ⌘K）应被隐藏 —— 这正是 DEV-0210 修的失效点
    const ghost = measured.buttons.filter((b) => !theme.includes(b))
    const visibleGhost = ghost.filter((b) => b.w > 0 || b.h > 0)
    for (const b of visibleGhost) {
      bad.push(`窄屏下「${b.label}」仍可见（w=${b.w} h=${b.h}）—— hidden 可能又被覆盖`)
    }
    if (ghost.length === 0) bad.push('窄屏下找不到 ghost 按钮（选择器未命中？）')
  }

  if (measured.name === 'desktop') {
    for (const b of measured.buttons) {
      if (b.w === 0 || b.h === 0) bad.push(`桌面档「${b.label}」不可见（w=${b.w} h=${b.h}）`)
    }
  }

  return bad
}

/**
 * 产物自检①（引用完整性）：`dist/index.html` 引用的每个资源都必须真实存在。
 *
 * ## 为什么必须有这一条（DEV-0217 收尾第 4 项）
 *
 * 本轮排查「变异没被抓到」时踩到过：`apps/web/dist/index.html` 被**并行会话的构建**
 * 覆盖过（指向一个已被下一次构建删掉的 hash），于是脚本一直在测**旧产物** ——
 * 而旧产物的布局恰好是对的，脚本就报出「全绿」。**「没抓到」的原因是「根本没测到新东西」**，
 * 而这类失效不会报错，只会静默给出错的结论。
 *
 * 判据很朴素：从 `index.html` 抽出资源引用（前缀见 `ASSET_PREFIX`），逐个查存在性。
 * 少一个文件 ⇒ 产物与 html 不一致 ⇒ 立即报红并提示重建，而不是继续量测。
 *
 * @returns 缺失资源的说明列表（空 = 通过）
 */
function checkArtifacts(distDir) {
  const bad = []
  const htmlPath = resolve(distDir, 'index.html')
  if (!existsSync(htmlPath)) {
    return [`产物目录里没有 index.html：${htmlPath}（先跑 pnpm --filter @openvibe/web build）`]
  }
  const html = readFileSync(htmlPath, 'utf8')
  const refRe = new RegExp(`(?:src|href)="(${escapeRe(ASSET_PREFIX)}[^"]+)"`, 'g')
  const refs = [...html.matchAll(refRe)].map((m) => m[1])
  if (refs.length === 0) {
    return [
      `index.html 里找不到任何 ${ASSET_PREFIX} 引用。\n` +
        `  若资源前缀变了（例如改放 /static/），请同步改本脚本的 ASSET_PREFIX 常量。`,
    ]
  }
  for (const ref of refs) {
    const p = resolve(distDir, `.${ref}`)
    if (!existsSync(p)) {
      bad.push(
        `index.html 引用了不存在的资源：${ref}\n` +
          `  期望路径：${p}\n` +
          `  成因通常是「构建被覆盖」或「构建到一半被打断」⇒ 重新构建后再跑`,
      )
    }
  }
  return bad
}

/** 转义正则元字符（`ASSET_PREFIX` 含 `/`，虽不特殊，但常量化的东西就该按常量处理） */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 产物自检②（产物 ↔ 源码同步）：源码哈希必须与受控清单一致。
 *
 * ## 为什么引用完整性不够（DEV-0222 第 1 项）
 *
 * 引用齐全 ≠ 产物是新的。若源码改了但**没重新构建**，`dist` 里躺的还是上一次的东西：
 * 引用齐全、产物自检①通过、源码闸（`btn-display.test.ts`）也没跑 ⇒ 脚本**测到旧产物**
 * 并给出看起来合理的结论。这正是本轮踩过的那个坑的另一半。
 *
 * 判据：把当前源码的 sha256（前 16 位）与 `tests/ui-source-hashes.json` 比对。
 * 不一致 ⇒ 要么源码改了没构建，要么清单没刷新（跑 `pnpm ui:snapshot`）。
 *
 * ⚠️ 哈希取**前 16 位**：够区分版本（2^64 分之一碰撞），又不至于让报错文案长到读不下去。
 *
 * @returns 不同步的说明列表（空 = 通过）
 */
function checkSourceFreshness() {
  const bad = []
  if (!existsSync(HASH_MANIFEST)) {
    return [
      `源码哈希清单不存在：${HASH_MANIFEST}\n` +
        `  跑 \`pnpm ui:snapshot\` 生成后再跑本脚本（清单是「产物按哪版源码构建」的凭据）`,
    ]
  }
  let recorded
  try {
    recorded = JSON.parse(readFileSync(HASH_MANIFEST, 'utf8'))
  } catch (err) {
    return [`源码哈希清单读不懂（JSON 解析失败）：${err.message}`]
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  for (const rel of HASH_FILES) {
    const srcAbs = join(repoRoot, ...rel.split('/'))
    if (!existsSync(srcAbs)) {
      bad.push(`源码文件不存在：${srcAbs}`)
      continue
    }
    const want = recorded[rel]
    if (want === undefined) {
      bad.push(`清单里没有 ${rel} 的哈希 —— 清单该刷新了（跑 \`pnpm ui:snapshot\`）`)
      continue
    }
    const got = createHash('sha256').update(readFileSync(srcAbs)).digest('hex').slice(0, 16)
    if (got !== want) {
      bad.push(
        `源码与产物不同步：${rel}\n` +
          `  清单记录：${want}（上次构建时的源码）\n` +
          `  当前源码：${got}\n` +
          `  ⇒ 源码改了但产物没重新构建。跑 \`pnpm --filter @openvibe/web build\` 后重试；\n` +
          `    若这次改动是刻意的，跑 \`pnpm ui:snapshot\` 刷新清单再构建。`,
      )
    }
  }
  return bad
}

/**
 * 产物自检③（被测地址 ↔ 自检目录）：两者不同目录时给出提示。
 *
 * ## 为什么（DEV-0222 第 2 项）
 *
 * `--url` 是被测地址、`--dist` 是自检目录。两者可能不同（例如 `--url` 指向临时产物、
 * `--dist` 留在默认的 `apps/web/dist`），那时**自检的是 A、量测的是 B** —— 结论会张冠李戴。
 *
 * 判据很宽松：只在这两处**都指向仓外/不同根**时提示，不阻断 —— 因为静态服务可以指向任意目录，
 * 脚本无法从 URL 反推目录，硬判会误伤。提示是给人看的，不是闸。
 *
 * @returns 提示列表（空 = 无需提示）
 */
function checkUrlDistMismatch(url, distDir) {
  const notes = []
  // 仅当 --dist 用的是**默认值**（即调用方没显式指定）而 --url 又不是本地默认地址时提示 ——
  //   显式传了 --dist 说明调用方知道自己比的是哪份产物。
  const urlIsDefault = url === 'http://127.0.0.1:4173/'
  if (!urlIsDefault && resolve(distDir) === resolve(DIST_DIR)) {
    notes.push(
      `注意：--url 是 ${url}，但 --dist 用的是默认的 ${DIST_DIR}。\n` +
        `  自检①②查的是后者，量测的是前者 —— 若两者不是同一份产物，结论会张冠李戴。\n` +
        `  若被测产物在别处，请显式传 --dist <那个目录>。`,
    )
  }
  return notes
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  // 读清单放在 parseArgs 之后：`--help` / 参数错误会先短路，清单坏也救得回（DEV-0224 收尾第 3 项）
  const targets = readTargets(import.meta.url)
  HASH_FILES = targets.hashes
  INVARIANT_DIRS = targets.invariantDirs
  const chromePath = args.chrome ?? findChrome()
  if (!chromePath) {
    console.error('找不到 Chrome/Chromium/Edge，请用 --chrome <path> 指定')
    process.exit(2)
  }

  // 产物自检：先于量测 —— 产物不新鲜时，量出来的尺寸没有意义
  const distDir = args.dist ?? DIST_DIR
  const artifactBad = [
    ...checkArtifacts(distDir),
    ...checkSourceFreshness(),
    ...checkInvariantDirs(),
    ...checkUnregisteredSources(),
  ]
  if (artifactBad.length > 0) {
    console.error('产物自检失败（量测无意义，先修这个）：')
    for (const m of artifactBad) console.error(`  ❌ ${m}`)
    console.error('\n提示：跑 `pnpm --filter @openvibe/web build` 重新构建；')
    console.error('      源码改动是刻意的话，先跑 `pnpm ui:snapshot` 刷新快照与哈希清单。')
    process.exit(1)
  }
  console.log(`产物自检通过（${distDir}）`)

  const mismatchNotes = checkUrlDistMismatch(args.url, distDir)
  for (const n of mismatchNotes) console.log(`⚠️ ${n}`)

  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--user-data-dir=/tmp/chrome-cdp-verify-topbar',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  try {
    const wsUrl = await get_pageWsUrl()
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res)
      ws.addEventListener('error', rej)
    })
    const client = makeClient(ws)
    await client.send('Page.enable')
    await client.send('Runtime.enable')

    let failed = 0
    for (const vp of VIEWPORTS) {
      const m = await measure(client, vp, args.url)
      console.log(
        `\n=== ${m.name}（布局宽 ${m.docClientWidth}px，innerWidth=${m.innerWidth}，` +
          `visual=${m.visualWidth}，min640=${m.smMatches}）===`,
      )
      for (const b of m.buttons) {
        console.log(`  ${b.label || '(无 label)'}  w=${b.w} h=${b.h} x=${b.x}`)
      }
      const bad = judge(m)
      if (bad.length > 0) {
        failed++
        for (const msg of bad) console.log(`  ❌ ${msg}`)
      } else {
        console.log('  ✅ 符合预期')
      }
    }

    ws.close()
    console.log(
      failed === 0
        ? '\nverify-topbar-cdp：全部通过'
        : `\nverify-topbar-cdp：${failed} 档不符合预期`,
    )
    process.exitCode = failed === 0 ? 0 : 1
  } finally {
    chrome.kill()
  }
}

await main()
