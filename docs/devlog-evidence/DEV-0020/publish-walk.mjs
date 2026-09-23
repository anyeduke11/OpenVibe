// T9a 发布形态干净环境演练驱动器（onboarding §7 验收 1 的「npx 形态」半边 + dev-plan §9-T9 的 dry-run 校验）
// 用法：node docs/devlog-evidence/DEV-0020/publish-walk.mjs
//
// 与 DEV-0019 三段走查的分工：那三段证的是**仓库形态**（`node --import tsx apps/cli/src/index.ts`），
// 本段证的是**用户拿到的形态**——真 `npm pack` 出 tarball、装进空目录、只跑装出来的 bin。
// 这条链在 T9 之前从未被执行过（`apps/cli` 是 private 且无构建产物，见 DEV-0019 之后的 T9 开工盘点）。
//
// 唯一的沙箱替身：better-sqlite3 的原生 .node 不从网络取预编译包，而是复用本机 pnpm store 里
// 已构建好的同一版本（装包时 pnpm 11 默认 Ignored build scripts）。日志里如实打出这一点。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const RUN = process.pid
const ROOT = join(tmpdir(), `ov-pub-walk-${String(RUN)}`)
const STAGE = join(REPO, 'apps', 'cli', 'pkg')
const CONSUMER = join(ROOT, 'consumer')
const HOME = join(ROOT, 'home')
const DEMO = join(ROOT, 'demo-project')
const WALK_BOOT = Date.now()

mkdirSync(CONSUMER, { recursive: true })
mkdirSync(HOME, { recursive: true })
mkdirSync(DEMO, { recursive: true })

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}
let failures = 0
let checks = 0
const check = (label, ok, detail = '') => {
  checks += 1
  if (!ok) failures += 1
  say(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ` — ${detail}`}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (cwd, file, args, env) => spawnSync(file, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' })
const killTree = (pid) => {
  try {
    process.kill(pid)
  } catch {
    /* 已退出 */
  }
}
const logPath = join(HERE, 'publish-walk.txt')

say(`# T9a 发布形态演练 · 沙箱 ${ROOT}`)
say(`# node ${process.version} · ${new Date().toISOString()}`)

// ---------- 1. 构建 + pack ----------
const build = run(REPO, 'pnpm', ['pkg:cli'])
const buildOut = `${build.stdout ?? ''}${build.stderr ?? ''}`
if (build.status !== 0) {
  say(buildOut)
  throw new Error(`pnpm pkg:cli 失败（退出码 ${String(build.status)}）`)
}
const pkgLine = /\[pkg:cli\] (.*)/.exec(buildOut)?.[1] ?? '(未打出摘要行)'
say(`§1 产物构建：${pkgLine}`)
const esbuildWarn = /(\d+) 条 esbuild 警告/.exec(pkgLine)
check(
  '构建无 esbuild 警告',
  esbuildWarn !== null && Number(esbuildWarn[1]) === 0,
  `警告 ${esbuildWarn?.[1] ?? '?'} 条`,
)

const packR = run(STAGE, 'npm', ['pack', '--pack-destination', ROOT, '--silent'])
const tarName = (packR.stdout ?? '').trim().split('\n').pop() ?? ''
const tarball = join(ROOT, tarName)
check('npm pack 出 tarball', existsSync(tarball), tarName)
const tarBytes = existsSync(tarball) ? statSync(tarball).size : 0
say(`  tarball ${tarName} = ${(tarBytes / 1_000_000).toFixed(2)} MB（含 Web 产物与 seed 拷贝）`)

// tar 清单：`files: ['dist']` 有没有真把三类运行时资产都装进去——migrations 就是这一层漏过的
const listing = run(ROOT, 'tar', ['-tzf', tarball])
if (listing.status === 0) {
  const entries = (listing.stdout ?? '').split('\n').filter(Boolean)
  const inPkg = (p) => entries.some((e) => e === `package/${p}`)
  check('tarball 含 dist/cli.js', inPkg('dist/cli.js'))
  check('tarball 含 dist/web/index.html', inPkg('dist/web/index.html'))
  check('tarball 含 dist/seed/terms.json', inPkg('dist/seed/terms.json'))
  const sql = entries.filter((e) => /^package\/dist\/migrations\/.*\.sql$/.test(e))
  check('tarball 含 dist/migrations/*.sql', sql.length >= 3, `${String(sql.length)} 个`)
  check('tarball 含 README 与 LICENSE', inPkg('README.md') && inPkg('LICENSE'))
} else {
  say('SKIP tarball 清单校验（本平台无 tar）')
}

// 清单：暂存包必须已经把 workspace 内部依赖摘干净
const stagedManifest = JSON.parse(readFileSync(join(STAGE, 'package.json'), 'utf8'))
const srcVersion = /export const CLI_VERSION = '([^']+)'/.exec(
  readFileSync(join(REPO, 'apps', 'cli', 'src', 'version.ts'), 'utf8'),
)?.[1]
check('发布名与 bin 按 D17', stagedManifest.name === 'openvibe-cli' && stagedManifest.bin.openvibe === './dist/cli.js')
check('版本号三处同源', stagedManifest.version === srcVersion, `pkg=${String(stagedManifest.version)} src=${String(srcVersion)}`)
check(
  '清单无 workspace 残留依赖',
  Object.keys(stagedManifest.dependencies).join(',') === 'better-sqlite3',
  JSON.stringify(stagedManifest.dependencies),
)
check(
  '发布包内自带 Web 与 seed',
  existsSync(join(STAGE, 'dist/web/index.html')) && existsSync(join(STAGE, 'dist/seed/terms.json')),
)
check(
  '发布包内自带迁移脚本目录',
  existsSync(join(STAGE, 'dist/migrations')) &&
    readdirSync(join(STAGE, 'dist/migrations')).filter((f) => f.endsWith('.sql')).length >= 3,
)

// ---------- 2. 装进空目录 ----------
const W_INSTALL = Date.now()
run(CONSUMER, 'pnpm', ['init'])
const add = run(CONSUMER, 'pnpm', ['add', tarball, '--prefer-offline'])
const addOut = `${add.stdout ?? ''}${add.stderr ?? ''}`
const BIN = join(CONSUMER, 'node_modules/.bin/openvibe')
// pnpm 10+ 默认拒跑依赖的 install 脚本，并以退出码 1 结束（npm/npx 会跑 prebuild-install，不受影响）。
// 这不是打包缺陷，是安装器口径——写进日志当发布说明素材，而不是让驱动器被状态码误杀。
const ignoredBuilds = addOut.includes('ERR_PNPM_IGNORED_BUILDS')
check('tarball 装进空目录', add.status === 0 || (ignoredBuilds && existsSync(BIN)), `exit=${String(add.status)}`)
check('bin 已生成且可执行', existsSync(BIN))
if (ignoredBuilds) {
  say(
    '  安装器口径：pnpm 拒跑 better-sqlite3 的 install 脚本并以退出码 1 结束' +
      '（ERR_PNPM_IGNORED_BUILDS）；npm/npx 用户走 prebuild-install 取预编译包，不受影响。',
  )
}

// 原生 binding：pnpm 11 默认不跑 install 脚本 → 复用本机 store 里已构建的同版本
const findBindingRoot = (base) => {
  const store = join(base, 'node_modules/.pnpm')
  if (!existsSync(store)) return null
  const dir = readdirSync(store).find((d) => d.startsWith('better-sqlite3@'))
  return dir === undefined ? null : { version: dir.split('@')[1], path: join(store, dir, 'node_modules/better-sqlite3') }
}
const installed = findBindingRoot(CONSUMER)
const local = findBindingRoot(REPO)
if (installed !== null && local !== null && installed.version === local.version) {
  const from = join(local.path, 'build')
  const to = join(installed.path, 'build')
  if (existsSync(from)) rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
  check(
    '原生 binding 就位（本机 store 同版本复用，非网络下载）',
    existsSync(join(to, 'Release/better_sqlite3.node')),
    `better-sqlite3@${installed.version}`,
  )
} else {
  check(
    '原生 binding 就位（本机 store 同版本复用，非网络下载）',
    false,
    `消费者=${installed?.version ?? '?'} vs 仓库=${local?.version ?? '?'} — 版本不一致须改用 npm 安装取预编译包`,
  )
}
const INSTALL_MS = Date.now() - W_INSTALL
say(`§2 安装耗时 ${INSTALL_MS} ms（tarball → node_modules/.bin/openvibe）`)

const ver = run(CONSUMER, BIN, ['--version'])
check('--version 报当前版本', (ver.stdout ?? '').trim() === String(stagedManifest.version), (ver.stdout ?? '').trim())
const help = run(CONSUMER, BIN, ['--help'])
check(
  '四命令齐（serve/sync/scan/diff）',
  ['serve', 'sync', 'scan', 'diff'].every((c) => (help.stdout ?? '').includes(c)),
)
check('--open 旗标在发布包里可见', (help.stdout ?? '').includes('--open') || (run(CONSUMER, BIN, ['serve', '--help']).stdout ?? '').includes('--open'))

// ---------- 3. 起装出来的 serve（干净 HOME） ----------
const WALK_START = Date.now()
const SETUP_MS = WALK_START - WALK_BOOT
const serveProc = spawn(BIN, ['--json', 'serve', '--port', '0'], {
  cwd: CONSUMER,
  env: { ...process.env, OPENVIBE_HOME: HOME },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serveOut = ''
// 断言中途抛错也不能把 serve 留在机器上（上一轮的孤儿进程就是这么来的）
process.on('exit', () => {
  if (serveProc.exitCode === null) killTree(serveProc.pid)
})
serveProc.stdout.on('data', (d) => {
  serveOut += String(d)
})
serveProc.stderr.on('data', (d) => {
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
if (info === null) {
  say(serveOut)
  throw new Error('发布形态 serve 未输出摘要')
}
// --json 的信封是 {command, summary:{ok,...}}，失败时 summary 换成 {ok:false,error:{code,message}}。
// 原样打出再抛错：上一轮的 MIGRATION_FAILED 就是被下一行的 undefined 属性盖成了 TypeError
if (info.summary?.ok !== true) {
  say(serveOut.trim())
  throw new Error(
    `发布形态 serve 失败：${String(info.summary?.error?.code ?? '?')} ${String(info.summary?.error?.message ?? '')}`,
  )
}
const BASE = info.summary.url
say(`§3 serve ${BASE} firstRun=${String(info.summary.firstRun)} home=${HOME.replace(ROOT, '沙箱')}`)
// T9a-1 的正身：web 产物从 <pkg>/dist/web 解析得到，而不是仓库里的 apps/web/dist
check('发布包托管了 Web 产物（webServed=true）', info.summary.webServed === true)
check(
  '零外联结构闸门（未配端点即不外发）',
  info.summary.telemetry?.endpoint === '',
  JSON.stringify(info.summary.telemetry),
)

const index = await fetch(`${BASE}/`)
const indexHtml = await index.text()
const entryChunk = /src="\/?(assets\/[^"]+\.js)"/.exec(indexHtml)?.[1]
check('GET / 回 index.html 200', index.status === 200 && indexHtml.includes('id="root"'), `HTTP ${String(index.status)}`)
const asset = await fetch(`${BASE}/${String(entryChunk)}`)
const assetBytes = Number((await asset.arrayBuffer()).byteLength)
check('入口 chunk 可下载且非空', asset.status === 200 && assetBytes > 100_000, `${entryChunk} ${assetBytes} B`)
const spa = await fetch(`${BASE}/settings`)
check('SPA 深链路回 index.html（serve 的 fallback）', spa.status === 200 && (await spa.text()).includes('id="root"'))

const health = await (await fetch(`${BASE}/api/health`)).json()
check('/api/health ok', health.status === 'ok', JSON.stringify(health))
const auth = { headers: { authorization: `Bearer ${String(info.summary.token)}` } }
const stats = await (await fetch(`${BASE}/api/stats`, auth)).json()
say(`  /api/stats：${JSON.stringify(stats)}`)
const termList = await (await fetch(`${BASE}/api/terms`, auth)).json()
// seed 从 dist/seed 读：这条断言就是「发布包里那份拷贝真被播种进 SQLite」
check('发布包 seed 播种 ≥100 词条', termList.total >= 100, `terms=${String(termList.total)}`)
check('首启自动组装 default 包', stats.packs >= 1, `packs=${String(stats.packs)}`)

// ---------- 4. 第三条命令：sync + 九项产物 + diff ----------
// 必须带 OPENVIBE_HOME：serve 用的是沙箱 home，sync/diff 否则去读真实 ~/.openvibe 的端点与令牌
const sync = run(CONSUMER, BIN, ['--json', 'sync', DEMO, '--pack', 'default', '--yes'], {
  OPENVIBE_HOME: HOME,
})
let syncSummary = null
const syncRaw = `${String(sync.stdout)}${String(sync.stderr)}`.trim()
try {
  syncSummary = JSON.parse(String(sync.stdout)).summary
} catch {
  say(`  sync 原始输出：${syncRaw.slice(0, 600)}`)
}
check('sync 退出码 0', sync.status === 0, `exit=${String(sync.status)}`)
const products = [
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
const sizes = products.map((p) => {
  const abs = join(DEMO, p)
  return { p, bytes: existsSync(abs) ? statSync(abs).size : -1 }
})
for (const s of sizes) check(`产物在位 ${s.p}`, s.bytes > 0, `${String(s.bytes)} B`)
say(`  sync 摘要 written=${String(syncSummary?.written)} lock=${String(syncSummary?.lockPath ?? '').replace(ROOT, '沙箱')}`)

const diff = run(CONSUMER, BIN, ['--json', 'diff', DEMO], { OPENVIBE_HOME: HOME })
let diffClean = false
try {
  diffClean = JSON.parse(String(diff.stdout)).summary.clean === true
} catch {
  /* 摘要解析失败即不 clean */
}
check('diff 判 clean（注入产物与包一致）', diffClean && diff.status === 0, `exit=${String(diff.status)}`)
const WALK_MS = Date.now() - WALK_START
say(`§4 用户侧耗时 ${(WALK_MS / 1000).toFixed(1)} s（serve 起表 → diff 收表），命令数 3：serve --open / sync / diff`)
check('onb-1 计时 ≤5 分钟', WALK_MS <= 300_000, `${(WALK_MS / 1000).toFixed(1)} s`)
check(
  '构建+pack+装包段另计（对应 npx 首次下载）',
  SETUP_MS > 0,
  `${(SETUP_MS / 1000).toFixed(1)} s，其中装包 ${(INSTALL_MS / 1000).toFixed(1)} s`,
)

// ---------- 5. 收尾：进程回收 ----------
killTree(serveProc.pid)
for (let i = 0; i < 40 && serveProc.exitCode === null; i += 1) await sleep(250)
check('发布形态 serve 已退出', serveProc.exitCode !== null, `exit=${String(serveProc.exitCode)}`)
const probe = spawnSync('pgrep', ['-f', 'openvibe-cli'], { encoding: 'utf8' })
if (probe.error !== undefined || probe.status === null) {
  say('SKIP 残留进程扫描（本平台无 pgrep，win32 走上面的 exitCode 断言）')
} else {
  const left = probe.stdout.trim()
  check('走查结束时无残留 openvibe-cli 进程', left === '', `残留 pid=[${left.replace(/\n/g, ' ')}]`)
}

say(`\n合计 ${String(checks)} 项断言，FAIL ${String(failures)} 项`)
writeFileSync(
  logPath,
  `${lines.join('\n')}\n\n# HEAD ${run(REPO, 'git', ['rev-parse', '--short', 'HEAD']).stdout.trim()} · 结束于 ${new Date().toISOString()}\n`,
)
say(`日志 → ${logPath.replace(`${REPO}/`, '')}`)
rmSync(ROOT, { recursive: true, force: true })
if (failures > 0) process.exit(1)
