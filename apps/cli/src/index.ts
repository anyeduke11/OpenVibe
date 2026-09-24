import { Command, InvalidArgumentError } from 'commander'
import { serveAction } from './commands/serve'
import { askWithClack, syncAction, type SyncOutcome } from './commands/sync'
import { scanAction, type ScanOutcome } from './commands/scan'
import { diffAction, type DiffOutcome } from './commands/diff'
import { cleanAction, type CleanOutcome } from './commands/clean'
import { createPrinter, ExitCode, type Printer, type ReportRow } from './output'
import { clientFromConfig } from './client'
import { resolveConfig } from './config'
import { askTelemetryOnce, reportEvent, type AskReason, type ReportReason } from './telemetry'
import { INJECT_DECISIONS, type InjectDecision } from '@openvibe/core'
import { ADAPTER_IDS, DEFAULT_PORT, compareCodeUnit, type AdapterId } from '@openvibe/shared'
import { CLI_VERSION } from './version'

/**
 * openvibe CLI 入口（m6b §3）：全局旗标 --server/--token/--json 经 config.ts 的发现链解析，
 * 命令只做编排与渲染，业务逻辑留在 packages/core 或 server API。
 */

interface GlobalOptions {
  server?: string
  token?: string
  json?: boolean
}

function printerFor(command: string, global: GlobalOptions): Printer {
  return createPrinter({ command, json: global.json === true })
}

function parsePort(raw: string): number {
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidArgumentError(`不是合法端口（0–65535，0 表示随机）：${raw}`)
  }
  return port
}

function parseStrategy(raw: string): InjectDecision {
  if (!(INJECT_DECISIONS as readonly string[]).includes(raw)) {
    throw new InvalidArgumentError(`不是合法策略（${INJECT_DECISIONS.join(' / ')}）：${raw}`)
  }
  return raw as InjectDecision
}

/** --target 可重复（commander 变长参数），每个值单独校验，坏值早失败 */
function collectTargets(raw: string, prev: unknown): AdapterId[] {
  if (!(ADAPTER_IDS as readonly string[]).includes(raw)) {
    throw new InvalidArgumentError(`未知平台：${raw}（可选 ${ADAPTER_IDS.join(' / ')}）`)
  }
  const list = Array.isArray(prev) ? (prev as AdapterId[]) : []
  return [...list, raw as AdapterId]
}

/** serve 常驻：SIGINT/SIGTERM 到达即收敛，退出码 0 */
function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => resolve())
  })
}

async function runServe(
  cmd: { port: number; open?: boolean },
  global: GlobalOptions,
): Promise<void> {
  const printer = printerFor('serve', global)
  const json = global.json === true
  try {
    const r = await serveAction({
      port: cmd.port,
      open: cmd.open === true,
      appVersion: CLI_VERSION,
      warn: (message) => printer.warn(message),
    })
    printer.info(`openvibe ${CLI_VERSION} 已启动：${r.url}`)
    printer.info(`Web UI ${r.url}    配置 ${r.configPath}${r.firstRun ? '（首启生成）' : ''}`)
    for (const [bundle, status] of Object.entries(r.seed.bundles)) {
      printer.info(
        `种子 ${bundle}: ${status} +${r.seed.created[bundle] ?? 0} ~${r.seed.updated[bundle] ?? 0} 跳过${r.seed.skipped[bundle] ?? 0}`,
      )
    }
    // 提示已由 serveAction 的 warn 回调即时带出，此处不再重播 r.warnings
    printer.info(r.web.served ? `Web 产物 ${r.web.root}` : '未托管 Web 产物，仅提供 API')
    // §11.5 的透明度要求：上报通道是否 armed 要在启动信息里看得见，不必去翻 config.json。
    // --json 下走 summary.warnings，stdout 仍只有那一个对象（m6b §5 契约）。
    const egress =
      r.telemetry.endpoint === ''
        ? '未配上报端点，事件只留在本地队列（不外发）'
        : `每 ${String(r.telemetry.intervalMs / 1000)}s 批量上报至 ${r.telemetry.endpoint}`
    if (json) printer.warn(`匿名统计：${egress}`)
    else printer.info(`匿名统计：${egress}；开关以设置页为准，关闭时连入队都不会发生`)
    printer.info('按 Ctrl-C 停止')
    // --json：serve 的收尾在关闭时，故监听成功后立即出唯一对象，供脚本取 url/token
    printer.result({
      summary: {
        ok: true,
        url: r.url,
        token: r.token,
        configPath: r.configPath,
        firstRun: r.firstRun,
        webServed: r.web.served,
        telemetry: r.telemetry,
      },
    })
    await waitForShutdown()
    await r.close()
    process.exit(ExitCode.ok)
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string }
    const code =
      err.name === 'BootError'
        ? (err.code ?? 'BOOT_FAILED')
        : err.name === 'ConfigError'
          ? 'CONFIG_ERROR'
          : 'SERVE_FAILED'
    printer.fail(code, err.message ?? String(e))
    process.exit(ExitCode.error)
  }
}

interface SyncCmdOptions {
  pack?: string
  file?: string
  dir?: string
  dryRun?: boolean
  yes?: boolean
  strategy?: InjectDecision
  /** commander 的 collectTargets 已逐项校验过，这里就是 AdapterId[] */
  target: AdapterId[]
}

/** §6.1「报告违规项」：core 聚合的三类违规逐条落地，人读看得见、--json 进 warnings */
function violationLines(details: unknown): string[] {
  const d = details as
    | {
        invalidPaths?: string[]
        escapingPaths?: string[]
        oversizedFiles?: { path: string; bytes: number }[]
      }
    | undefined
  const lines: string[] = []
  for (const p of d?.invalidPaths ?? []) lines.push(`非法路径（绝对/含 .. 或反斜杠）：${p}`)
  for (const p of d?.escapingPaths ?? []) lines.push(`解析后逃逸项目根：${p}`)
  for (const f of d?.oversizedFiles ?? []) lines.push(`单文件超 512KB：${f.path}（${f.bytes}B）`)
  return lines
}

/** 执行结果表：与 plan（计划）分列，写没写、备份在哪、为何跳过都在这里 */
function reportRowsOf(outcome: SyncOutcome): ReportRow[] {
  const rows: ReportRow[] = [
    ...outcome.writes.map((w) => ({
      path: w.path,
      state: w.status,
      action: 'write',
      backupPath: w.backupPath,
    })),
    ...outcome.skipped.map((s) => ({ path: s.path, state: s.status, action: 'skip', why: s.why })),
  ]
  return rows.sort((a, b) => compareCodeUnit(String(a.path), String(b.path)))
}

async function runSync(
  projectPath: string,
  cmd: SyncCmdOptions,
  global: GlobalOptions,
): Promise<void> {
  const printer = printerFor('sync', global)
  const json = global.json === true
  const isTTY = process.stdout.isTTY === true
  try {
    const config = resolveConfig({ server: global.server, token: global.token })
    for (const w of config.warnings) printer.warn(w)
    // 令牌缺失 → 不建客户端：--file/--dir 的离线注入本就不该碰服务端
    const client = config.token === null ? undefined : clientFromConfig(config)
    let telemetry: { reported: ReportReason; ask: AskReason } | null = null

    const outcome = await syncAction(
      {
        projectPath,
        ...(cmd.pack === undefined ? {} : { pack: cmd.pack }),
        ...(cmd.file === undefined ? {} : { file: cmd.file }),
        ...(cmd.dir === undefined ? {} : { dir: cmd.dir }),
        dryRun: cmd.dryRun === true,
        yes: cmd.yes === true,
        ...(cmd.strategy === undefined ? {} : { strategy: cmd.strategy }),
        targets: cmd.target,
      },
      {
        ...(client ? { client } : {}),
        isTTY,
        ask: askWithClack,
        onInjected: async (pack) => {
          const r = await reportEvent(client, 'pack_injected', `${pack.name}@${pack.version}`)
          const a = await askTelemetryOnce(client, r.settings, { isTTY, json })
          telemetry = { reported: r.reason, ask: a.reason }
          if (a.asked)
            printer.info(
              `遥测：pack_injected ${r.sent ? '已入队' : `未上报（${r.reason}）`}，询问结果 ${a.reason}`,
            )
        },
      },
    )

    for (const w of outcome.warnings) printer.warn(w)
    printer.plan(outcome.rows)
    for (const hint of outcome.hints) printer.info(`提示 ${hint}`)
    if (outcome.backupRoot) printer.info(`备份 ${outcome.backupRoot}`)
    if (outcome.lockPath) printer.info(`lock ${outcome.lockPath}`)

    printer.result({
      plan: outcome.rows,
      report: reportRowsOf(outcome),
      summary: {
        ok: true,
        projectPath: outcome.projectPath,
        pack: outcome.pack,
        dryRun: outcome.dryRun,
        counts: outcome.counts,
        pending: outcome.plan.pending.length,
        written: outcome.writes.length,
        skipped: outcome.skipped.length,
        lockPath: outcome.lockPath,
        backupRoot: outcome.backupRoot,
        injectionReported: outcome.injectionReported,
        telemetry,
        hints: outcome.hints,
        exitCode: outcome.exitCode,
      },
    })
    process.exit(outcome.exitCode)
  } catch (e) {
    const err = e as { code?: string; details?: unknown; message?: string }
    for (const line of violationLines(err.details)) printer.warn(line)
    printer.fail(err.code ?? 'SYNC_FAILED', err.message ?? String(e))
    process.exit(ExitCode.error)
  }
}

function clientFrom(global: GlobalOptions, printer: Printer) {
  const config = resolveConfig({ server: global.server, token: global.token })
  for (const w of config.warnings) printer.warn(w)
  return config.token === null ? undefined : clientFromConfig(config)
}

interface ScanCmdOptions {
  skills?: boolean
  project?: string
  /** commander 的累积式选项：--roots a --roots b / --roots a,b 都收 */
  roots?: string[]
}

function scanRows(outcome: ScanOutcome): ReportRow[] {
  return [
    ...outcome.probed.map((path) => ({
      path,
      kind: 'rule-file',
      action: outcome.prompts.find((p) => p.title === path)?.action ?? 'unknown',
    })),
    ...outcome.skillsRoots.map((path) => ({ path, kind: 'skill-root', action: 'scan' })),
  ]
}

async function runScan(cmd: ScanCmdOptions, global: GlobalOptions): Promise<void> {
  const printer = printerFor('scan', global)
  try {
    const client = clientFrom(global, printer)
    const outcome = await scanAction(
      {
        skills: cmd.skills === true,
        ...(cmd.project === undefined ? {} : { project: cmd.project }),
        ...(cmd.roots && cmd.roots.length > 0 ? { roots: cmd.roots } : {}),
      },
      client ? { client } : {},
    )
    for (const w of outcome.warnings) printer.warn(w)
    for (const row of outcome.prompts)
      printer.info(
        `${row.action === 'created' ? '新增' : '跳过'} ${row.title}${row.reason ? `（${row.reason}）` : ''}`,
      )
    for (const hint of outcome.hints) printer.info(`提示 ${hint}`)
    printer.result({
      report: scanRows(outcome),
      summary: {
        ok: true,
        server: client?.serverUrl ?? null,
        skills: outcome.skills,
        skillsRoots: outcome.skillsRoots,
        probed: outcome.probed,
        prompts: outcome.prompts,
        // 键名不叫 counts：printer 一见 counts 就渲染注入侧的五状态表
        tally: {
          probed: outcome.probed.length,
          created: outcome.prompts.filter((p) => p.action === 'created').length,
          skipped: outcome.prompts.filter((p) => p.action === 'skipped').length,
        },
        hints: outcome.hints,
        exitCode: ExitCode.ok,
      },
    })
    process.exit(ExitCode.ok)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    printer.fail(err.code ?? 'SCAN_FAILED', err.message ?? String(e))
    process.exit(ExitCode.error)
  }
}

function diffRows(outcome: DiffOutcome): ReportRow[] {
  return [
    ...outcome.drifted.map((d) => ({
      path: d.path,
      state: 'drifted',
      expected: d.expected,
      actual: d.actual,
    })),
    ...outcome.missing.map((path) => ({ path, state: 'missing' })),
  ]
}

async function runDiff(projectPath: string, global: GlobalOptions): Promise<void> {
  const printer = printerFor('diff', global)
  try {
    const client = clientFrom(global, printer)
    const outcome = await diffAction({ projectPath }, client ? { client } : {})
    for (const w of outcome.warnings) printer.warn(w)
    printer.info(
      `包 ${outcome.pack.name}@${outcome.pack.version}：跟踪 ${outcome.tracked} 项，漂移 ${outcome.drifted.length}，缺失 ${outcome.missing.length}`,
    )
    for (const d of outcome.drifted)
      printer.info(
        `漂移 ${d.path}（lock ${d.expected.slice(0, 8)} → 磁盘 ${d.actual.slice(0, 8)}）`,
      )
    for (const m of outcome.missing) printer.info(`缺失 ${m}`)
    for (const hint of outcome.hints) printer.info(`提示 ${hint}`)
    printer.result({
      report: diffRows(outcome),
      summary: {
        ok: outcome.exitCode === ExitCode.ok,
        projectPath: outcome.projectPath,
        lockPath: outcome.lockPath,
        pack: outcome.pack,
        injectedAt: outcome.injectedAt,
        tracked: outcome.tracked,
        clean: outcome.clean,
        drifted: outcome.drifted,
        missing: outcome.missing,
        outdated: outcome.outdated,
        probedOnline: outcome.probedOnline,
        hints: outcome.hints,
        exitCode: outcome.exitCode,
      },
    })
    process.exit(outcome.exitCode)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    printer.fail(err.code ?? 'DIFF_FAILED', err.message ?? String(e))
    process.exit(ExitCode.error)
  }
}

/** 行即 FR-6.10 的那四个键；未备份的项 `backupPath` 为 undefined，JSON.stringify 会省掉这个键 */
function cleanRows(outcome: CleanOutcome): ReportRow[] {
  return outcome.report
    .map(({ path, state, action, backupPath }) => ({ path, state, action, backupPath }))
    .sort((a, b) => compareCodeUnit(String(a.path), String(b.path)))
}

interface CleanCmdOptions {
  dryRun?: boolean
  yes?: boolean
  force?: boolean
}

async function runClean(
  projectPath: string,
  cmd: CleanCmdOptions,
  global: GlobalOptions,
): Promise<void> {
  const printer = printerFor('clean', global)
  const isTTY = process.stdout.isTTY === true
  try {
    const outcome = await cleanAction(
      {
        projectPath,
        dryRun: cmd.dryRun === true,
        yes: cmd.yes === true,
        force: cmd.force === true,
      },
      { isTTY },
    )
    for (const w of outcome.warnings) printer.warn(w)
    for (const row of outcome.report)
      printer.info(
        `${row.state.padEnd(8)} ${row.path}${row.backupPath ? `  备份 ${row.backupPath}` : ''}`,
      )
    const s = outcome.summary
    printer.info(
      `删除 ${String(s.inSyncRemoved + s.driftForced)}（受管未改动 ${String(s.inSyncRemoved)} / --force ${String(s.driftForced)}），` +
        `保留 ${String(s.driftKept)}，已自行退场 ${String(s.absent)}，非我方文件 ${String(s.foreign)}（永不删除）`,
    )
    if (s.backedUpTo) printer.info(`备份 ${s.backedUpTo}`)
    printer.info(
      s.cleaned ? '已删除 pack.lock.json；.openvibe/ 与备份目录保留' : 'pack.lock.json 未动',
    )
    for (const hint of outcome.hints) printer.info(`提示 ${hint}`)
    // 键名不叫 counts：printer 一见 counts 就渲染注入侧的 SYNC_STATES 五态表，clean 是四态
    // `ok` 必须**从退出码推导**，与 `runDiff`（`:337` `ok: outcome.exitCode === ExitCode.ok`）同式。
    // 写死 `ok: true` 的话，「有 DRIFT 残留 ⇒ 退出码 2」那一轮会在 JSON 里同时报 `ok: true` 与 `exitCode: 2`，
    // 机器读者只能挑一个信——而 `--json` 的全部意义就是不必挑。契约支 CLI-CLEAN-11b 钉这条。
    printer.result({
      report: cleanRows(outcome),
      summary: { ok: outcome.exitCode === ExitCode.ok, ...s, exitCode: outcome.exitCode },
    })
    process.exit(outcome.exitCode)
  } catch (e) {
    const err = e as { code?: string; details?: unknown; message?: string }
    for (const line of violationLines(err.details)) printer.warn(line)
    printer.fail(err.code ?? 'CLEAN_FAILED', err.message ?? String(e))
    process.exit(ExitCode.error)
  }
}

/** roots 允许逗号分隔与重复旗标，交给 scanAction 去重保序 */
function collectRoots(raw: string, prev: unknown): string[] {
  const list = Array.isArray(prev) ? (prev as string[]) : []
  return [
    ...list,
    ...raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
}

export function buildProgram(): Command {
  const program = new Command()
  program
    .name('openvibe')
    .description('OpenVibe（灵典）——本地提示词库、术语库与标准包注入 CLI')
    .version(CLI_VERSION)
    .option('--server <url>', `服务端地址（默认 http://127.0.0.1:${DEFAULT_PORT}）`)
    .option('--token <token>', 'CLI Bearer 令牌')
    .option('--json', '机器可读输出：stdout 只有一个 JSON 对象')

  program
    .command('serve')
    .description('启动本地服务（API + Web UI），首启生成配置与令牌')
    .option('-p, --port <port>', `监听端口（默认 ${DEFAULT_PORT}）`, parsePort, DEFAULT_PORT)
    .option('--open', '启动后自动打开系统浏览器')
    .action(async (opts: { port: number; open?: boolean }) => {
      await runServe(opts, program.opts<GlobalOptions>())
    })

  program
    .command('sync')
    .description('把标准包注入项目（三重保护：默认预览+确认，覆盖前自动备份）')
    .argument('<projectPath>', '目标项目目录')
    .option('--pack <name[@version]>', '服务端标准包（缺省取该项目登记的包）')
    .option('--file <bundle>', '离线注入：单个 bundle JSON 文件')
    .option('--dir <packDir>', '离线注入：目录导出（openvibe.pack.json + files/）')
    .option('--dry-run', '只打印计划表，零写入零备份')
    .option('--yes', '跳过交互确认（配合 --strategy 批量处置冲突）')
    .option(
      '--strategy <strategy>',
      `CONFLICT/DRIFT 批量处置：${INJECT_DECISIONS.join(' | ')}`,
      parseStrategy,
    )
    .option(
      '--target <adapter>',
      `只写入指定平台产物（可重复）：${ADAPTER_IDS.join(' / ')}`,
      collectTargets,
      [],
    )
    .action(async (projectPath: string, opts: SyncCmdOptions) => {
      await runSync(projectPath, opts, program.opts<GlobalOptions>())
    })

  program
    .command('scan')
    .description('扫描 skill 目录 / 项目规则文件并登记进服务端（无离线模式）')
    .option('--skills', '调服务端 skill 扫描（默认扫描标准 skill 目录）')
    .option('--roots <dir>', 'skill 扫描根目录（可重复，或用逗号分隔）', collectRoots, [])
    .option(
      '--project <path>',
      '探测并导入项目规则文件（.cursorrules / .cursor/rules/*.mdc / CLAUDE.md / AGENTS.md）',
    )
    .action(async (opts: ScanCmdOptions) => {
      await runScan(opts, program.opts<GlobalOptions>())
    })

  program
    .command('diff')
    .description('比对项目产物与 pack.lock.json，并探测是否有更新的导出版本')
    .argument('<projectPath>', '目标项目目录')
    .action(async (projectPath: string) => {
      await runDiff(projectPath, program.opts<GlobalOptions>())
    })

  program
    .command('clean')
    .description('退场：删除当前 lock 登记且未被改动的受管文件（删除前一律备份）')
    .argument('<projectPath>', '目标项目目录')
    .option('--dry-run', '只打印三态计划表，零写入零删除')
    .option('--yes', '确认默认动作（不升级为全删：要连改过的文件一起删得给 --force）')
    .option('--force', '连 DRIFT（用户注入后改过）的文件一并删除，改后内容先进备份目录')
    .action(async (projectPath: string, opts: CleanCmdOptions) => {
      await runClean(projectPath, opts, program.opts<GlobalOptions>())
    })

  return program
}

// 本文件即 bin 入口（package.json → ./src/index.ts），被 import 时不会走到这里
await buildProgram().parseAsync()
