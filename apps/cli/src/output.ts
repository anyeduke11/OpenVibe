import pc from 'picocolors'

/**
 * CLI 输出单出口（m6b §5.1）：`--json` 时 stdout 只有一个可被 jq 解析的对象，
 * 人读文案（进度、表格、提示）一律静默；提示类信息走 warn()，在 --json 下折叠进 summary.warnings。
 * 退出码由命令自己决定，Printer 不碰 process.exit。
 */

export const ExitCode = { ok: 0, error: 1, drift: 2 } as const
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode]

/** 五状态（m6b FR-2.2），顺序即表格与计数的固定顺序 */
export const SYNC_STATES = ['NEW', 'IN_SYNC', 'UPDATE', 'CONFLICT', 'DRIFT'] as const
export type SyncState = (typeof SYNC_STATES)[number]

export interface PlanItem {
  state: SyncState
  path: string
  action: string
  sizeBytes?: number
  backupPath?: string
  /** --target 过滤后本次是否在写入范围内（范围外一律 skip） */
  inScope?: boolean
}

export type ReportRow = Record<string, unknown>
export type Summary = Record<string, unknown>

export interface CliEnvelope {
  command: string
  plan?: PlanItem[]
  report?: ReportRow[]
  summary: Summary
}

export interface PrinterOptions {
  command: string
  json: boolean
  write?: (chunk: string) => void
  writeErr?: (chunk: string) => void
  /** 缺省跟随 picocolors 对当前环境的支持判定；每个 printer 各自持有，不共享全局色状态 */
  color?: boolean
}

export interface Printer {
  readonly mode: 'json' | 'human'
  /** 人读进度/说明；--json 下静默 */
  info(line: string): void
  /** 非致命提示；人读即时输出，--json 按序收集进 summary.warnings */
  warn(message: string): void
  /** 计划表；人读渲染，--json 下由 result() 带出 */
  plan(items: PlanItem[]): void
  /** 唯一收尾出口 */
  result(envelope: Omit<CliEnvelope, 'command'>): void
  /** 失败出口：--json 仍是 stdout 单对象（脚本据 summary.ok 判断），人读走 stderr */
  fail(code: string, message: string): void
  warnings(): string[]
}

const STATE_WIDTH = 8 // 'CONFLICT'.length
const PATH_WIDTH = 40
const pad = (s: string, width: number): string =>
  s.length >= width ? s : s + ' '.repeat(width - s.length)

/** 计划数组 → 五状态计数（五类恒在，顺序固定）+ 需实际写入条数 */
export function summarizePlan(items: PlanItem[]): {
  counts: Record<SyncState, number>
  pending: number
} {
  const counts = Object.fromEntries(SYNC_STATES.map((s) => [s, 0])) as Record<SyncState, number>
  for (const item of items) counts[item.state] += 1
  return { counts, pending: items.filter((i) => i.action !== 'skip').length }
}

export function createPrinter(options: PrinterOptions): Printer {
  const write = options.write ?? ((s: string) => void process.stdout.write(s))
  const writeErr = options.writeErr ?? ((s: string) => void process.stderr.write(s))
  const colors = pc.createColors(options.color ?? pc.isColorSupported)
  const collected: string[] = []
  const { command, json } = options

  const paint = (state: SyncState, text: string): string => {
    switch (state) {
      case 'NEW':
        return colors.green(text)
      case 'IN_SYNC':
        return colors.dim(text)
      case 'UPDATE':
        return colors.cyan(text)
      case 'CONFLICT':
        return colors.yellow(text)
      case 'DRIFT':
        return colors.magenta(text)
    }
  }

  return {
    mode: json ? 'json' : 'human',
    info(line) {
      if (!json) write(`${line}\n`)
    },
    warn(message) {
      collected.push(message)
      if (!json) write(`${colors.yellow('提示')} ${message}\n`)
    },
    plan(items) {
      if (json) return
      write(`${pad('状态', STATE_WIDTH)} ${pad('路径', PATH_WIDTH)} 动作\n`)
      for (const item of items) {
        const backup = item.backupPath ? `  备份 ${item.backupPath}` : ''
        write(
          `${paint(item.state, pad(item.state, STATE_WIDTH))} ${pad(item.path, PATH_WIDTH)} ${item.action}${backup}\n`,
        )
      }
    },
    result(envelope) {
      if (json) {
        const summary: Summary = { ...envelope.summary }
        if (collected.length > 0) summary.warnings = [...collected]
        const out: CliEnvelope = {
          command,
          ...(envelope.plan ? { plan: envelope.plan } : {}),
          ...(envelope.report ? { report: envelope.report } : {}),
          summary,
        }
        write(`${JSON.stringify(out, null, 2)}\n`)
        return
      }
      const counts = envelope.summary.counts as Partial<Record<SyncState, number>> | undefined
      if (counts)
        write(`${SYNC_STATES.map((s) => `${paint(s, s)} ${counts[s] ?? 0}`).join('  ')}\n`)
    },
    fail(code, message) {
      if (json) {
        const summary: Summary = { ok: false, error: { code, message } }
        if (collected.length > 0) summary.warnings = [...collected]
        write(`${JSON.stringify({ command, summary }, null, 2)}\n`)
        return
      }
      writeErr(`${colors.red('错误')} [${code}] ${message}\n`)
    },
    warnings: () => [...collected],
  }
}
