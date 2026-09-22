import { Command, InvalidArgumentError } from 'commander'
import { serveAction } from './commands/serve'
import { createPrinter, ExitCode, type Printer } from './output'
import { DEFAULT_PORT } from '@openvibe/shared'

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

  return program
}

// 本文件即 bin 入口（package.json → ./src/index.ts），被 import 时不会走到这里
await buildProgram().parseAsync()
