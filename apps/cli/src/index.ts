import { Command, InvalidArgumentError } from 'commander'
import { serveAction } from './commands/serve'
import { askWithClack, syncAction, type SyncOutcome } from './commands/sync'
import { createPrinter, ExitCode, type Printer, type ReportRow } from './output'
import { clientFromConfig } from './client'
import { resolveConfig } from './config'
import { askTelemetryOnce, reportEvent, type AskReason, type ReportReason } from './telemetry'
import { INJECT_DECISIONS, type InjectDecision } from '@openvibe/core'
import { ADAPTER_IDS, DEFAULT_PORT, compareCodeUnit, type AdapterId } from '@openvibe/shared'

/**
 * openvibe CLI 入口（m6b §3）：全局旗标 --server/--token/--json 经 config.ts 的发现链解析，
 * 命令只做编排与渲染，业务逻辑留在 packages/core 或 server API。
 */

export const CLI_VERSION = '0.0.0'

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

  return program
}

// 本文件即 bin 入口（package.json → ./src/index.ts），被 import 时不会走到这里
await buildProgram().parseAsync()
