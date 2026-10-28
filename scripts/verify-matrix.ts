/**
 * scripts/verify-matrix.ts —— v0.2.3 批次 A FR-2 的复验矩阵工具（spec `v023-a-launch.md`）。
 *
 * 命令清单单源取自 `CLI_COMMANDS`（packages/shared/src/cli-commands.ts），永不手抄——
 * 新增/改名命令后矩阵自动跟上（漂移闸 cliCommands.api.test.ts 管注册处，本脚本管矩阵面）。
 *
 * 用法：
 *   tsx scripts/verify-matrix.ts --emit            打印复验矩阵 markdown 骨架（含全部命令 + 离线注入行）
 *   tsx scripts/verify-matrix.ts --run [--entry <cli.ts 路径> | --bin <cli.js 路径>]
 *                                                  起临时 serve + 临时项目，跑可自动化的本地子集，
 *                                                  其余命令如实标 manual（需已注册项目 / 干净机安装路径）
 *
 * --run 的判定口径：每条命令记录 pass / fail / manual；有任一 fail ⇒ 退出码 1。
 * 本脚本只编排，不断言业务语义（那是 163 个测试文件的事）——它回答的是
 * 「在目标入口上，九/十条命令能不能真的跑起来」。
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CLI_COMMANDS } from '@openvibe/shared'

interface MatrixRow {
  command: string
  args: string[]
  expectExit: number[] | null
  status: 'pass' | 'fail' | 'manual'
  note: string
}

const args = process.argv.slice(2)
const mode = args.includes('--run') ? 'run' : args.includes('--emit') ? 'emit' : null
const entryFlagIdx = args.indexOf('--entry')
const binFlagIdx = args.indexOf('--bin')
const target =
  entryFlagIdx >= 0 ? args[entryFlagIdx + 1] : binFlagIdx >= 0 ? args[binFlagIdx + 1] : null
const useBin = binFlagIdx >= 0

if (mode === null) {
  console.error(
    '用法：tsx scripts/verify-matrix.ts --emit | --run [--entry <cli.ts> | --bin <cli.js>]',
  )
  process.exit(1)
}

const MANIFEST_DATE = new Date().toISOString().slice(0, 10)

function baseRows(): MatrixRow[] {
  const rows: MatrixRow[] = CLI_COMMANDS.map((cmd) => ({
    command: cmd.name,
    args: [],
    expectExit: null,
    status: 'manual' as const,
    note: `usage: ${cmd.usage}`,
  }))
  // 离线注入是 README 承诺的独立能力面，单独一行
  rows.push({
    command: 'sync --file（离线注入）',
    args: [],
    expectExit: null,
    status: 'manual',
    note: '需先导出 bundle.json；断网执行 sync <dir> --file bundle.json',
  })
  return rows
}

if (mode === 'emit') {
  const lines = [
    `## 复验矩阵（生成于 ${MANIFEST_DATE}，命令清单单源：CLI_COMMANDS）`,
    '',
    '| 平台 | 命令 | 结果 | 备注 |',
    '|---|---|---|---|',
    ...baseRows().flatMap((r) =>
      ['<平台A>', '<平台B>'].map((p) => `| ${p} | \`${r.command}\` |  | ${r.note} |`),
    ),
    '',
    '> 安装路径两条各验一次：`npm i -g <tarball>` 与 `npx openvibe-cli --version`。',
    '> 环境口径：无全局缓存、无本仓 node_modules 残留（spec v023-a FR-2.1）。',
  ]
  console.log(lines.join('\n'))
  process.exit(0)
}

/* ────────────────────────── --run：可自动化子集 ────────────────────────── */

const roots: string[] = []
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

if (target === null) {
  console.error('--run 需要 --entry <cli.ts 路径> 或 --bin <cli.js 路径>')
  process.exit(1)
}

const cliArgs = (cmdArgs: string[]): string[] =>
  useBin ? [target as string, ...cmdArgs] : ['--import', 'tsx', target as string, ...cmdArgs]

function runCli(
  cmdArgs: string[],
  home: string,
  timeoutMs = 30_000,
): { status: number; out: string } {
  const res = spawnSync(process.execPath, cliArgs(cmdArgs), {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
  })
  return { status: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

async function waitForServe(child: ChildProcess, home: string): Promise<string | null> {
  // serve --json 在监听成功后打印唯一 JSON 对象（summary.url）；等它，最多 20s
  return new Promise((resolveWait) => {
    let buf = ''
    const timer = setTimeout(() => {
      child.kill()
      resolveWait(null)
    }, 20_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      buf += String(chunk)
      const start = buf.indexOf('{')
      if (start >= 0) {
        try {
          const parsed = JSON.parse(buf.slice(start)) as { summary?: { url?: string } }
          if (parsed.summary?.url) {
            clearTimeout(timer)
            resolveWait(parsed.summary.url)
          }
        } catch {
          /* 还没收全，继续等 */
        }
      }
    })
    child.on('exit', () => {
      clearTimeout(timer)
      // 兜底：--json 没拿到就试 config.json（serve 首启会写 serverUrl）
      try {
        const cfg = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')) as {
          serverUrl?: string
        }
        resolveWait(cfg.serverUrl ?? null)
      } catch {
        resolveWait(null)
      }
    })
  })
}

async function run(): Promise<number> {
  const home = tempDir('ov-matrix-home-')
  const project = join(tempDir('ov-matrix-proj-'), 'proj')
  mkdirSync(project, { recursive: true })

  const rows = baseRows()
  const byName = (name: string): MatrixRow | undefined => rows.find((r) => r.command === name)

  console.log(
    `# 复验矩阵实跑（${MANIFEST_DATE}，入口：${useBin ? 'bin' : 'tsx 源码'} ${target}）\n`,
  )

  // serve：起临时服务
  const serveChild = spawn(process.execPath, cliArgs(['serve', '--port', '0', '--json']), {
    env: { ...process.env, OPENVIBE_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const url = await waitForServe(serveChild, home)
  const serveRow = byName('serve')
  if (serveRow) {
    serveRow.status = url ? 'pass' : 'fail'
    serveRow.note = url ? `listening at ${url}` : '20s 内未取得监听地址'
  }
  if (!url) {
    serveChild.kill()
    printAndFinish(rows)
    return 1
  }

  const check = (name: string, cmdArgs: string[], expectExit: number[], note: string): void => {
    const row = byName(name)
    if (!row) return
    const res = runCli(cmdArgs, home)
    row.args = cmdArgs
    row.expectExit = expectExit
    row.status = expectExit.includes(res.status) ? 'pass' : 'fail'
    row.note = `${note}；退出码 ${res.status}`
  }

  // 默认包由 serve 首启播种组装；先干跑（零写入）再真注入
  check('sync', ['sync', project, '--pack', 'default', '--dry-run'], [0], 'dry-run 预览')
  check('sync', ['sync', project, '--pack', 'default'], [0], '真实注入')
  check('diff', ['diff', project], [0], '注入后应 clean')
  check('verify', ['verify', project], [0], '注入后应 CONSISTENT')
  check('scan', ['scan', '--project', project], [0, 2], '项目规则文件登记')
  check('clean', ['clean', project, '--dry-run'], [0, 2], 'dry-run 退场计划')

  serveChild.kill()
  printAndFinish(rows)

  const failed = rows.filter((r) => r.status === 'fail').length
  return failed > 0 ? 1 : 0
}

function printAndFinish(rows: MatrixRow[]): void {
  console.log('| 命令 | 结果 | 明细 |')
  console.log('|---|---|---|')
  for (const r of rows) {
    const note = r.expectExit ? `${r.note}（期望退出码 ${r.expectExit.join('/')}）` : r.note
    console.log(`| \`${r.command}\` | ${r.status} | ${note} |`)
  }
  const manual = rows.filter((r) => r.status === 'manual').map((r) => r.command)
  if (manual.length > 0) {
    console.log(`\nmanual（需人工环境，如实标注未验证）：${manual.join('、')}`)
  }
}

run()
  .then((code) => {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true })
    process.exit(code)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
