import { describe, expect, it } from 'vitest'
import {
  ExitCode,
  SYNC_STATES,
  createPrinter,
  summarizePlan,
  type PlanItem,
  type Printer,
} from '../src/output'

/** 五状态各一条 + IN_SYNC 两条，覆盖 plan 形状与计数 */
const plan: PlanItem[] = [
  { state: 'NEW', path: 'CLAUDE.md', action: 'write', sizeBytes: 1200 },
  { state: 'IN_SYNC', path: '.cursor/rules/core.mdc', action: 'skip' },
  { state: 'IN_SYNC', path: 'AGENTS.md', action: 'skip' },
  { state: 'UPDATE', path: 'TERMS.md', action: 'backup+write' },
  {
    state: 'CONFLICT',
    path: '.cursorrules',
    action: 'overwrite',
    backupPath: '.openvibe/backup/x/.cursorrules',
  },
  { state: 'DRIFT', path: '.claude/commands/x.md', action: 'keep-local' },
]

function harness(opts: { json: boolean; color?: boolean }): {
  printer: Printer
  out: string[]
  err: string[]
} {
  const out: string[] = []
  const err: string[] = []
  const printer = createPrinter({
    command: 'sync',
    json: opts.json,
    color: opts.color ?? false,
    write: (s) => out.push(s),
    writeErr: (s) => err.push(s),
  })
  return { printer, out, err }
}

// ESC 用 fromCharCode 取，正则里不写字面控制字符（eslint no-control-regex）
const ESC = String.fromCharCode(27)
const ANSI = new RegExp(ESC + '[[0-9;]*m', 'g')
const stripAnsi = (s: string): string => s.replace(ANSI, '')

describe('--json 契约与人读渲染（m6b §5.1）', () => {
  it('CLI-JSON-01: --json 模式 stdout 恰好一个可 jq 解析的对象，含五状态全字段', () => {
    const { printer, out, err } = harness({ json: true })
    // --json 模式下人读输出必须完全静默，否则 jq 解析失败
    printer.info('正在注入…')
    printer.plan(plan)
    printer.warn('建议将 .openvibe/backup/ 加入 .gitignore')
    printer.result({ plan, summary: { ...summarizePlan(plan), dryRun: false } })

    expect(out).toHaveLength(1)
    expect(err).toEqual([])
    const parsed = JSON.parse(out[0] ?? '') as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['command', 'plan', 'summary'])
    expect(parsed.command).toBe('sync')

    const items = parsed.plan as Record<string, unknown>[]
    expect(items).toHaveLength(6)
    expect(new Set(items.map((i) => i.state))).toEqual(new Set(SYNC_STATES))
    for (const item of items) {
      expect(typeof item.path).toBe('string')
      expect(typeof item.action).toBe('string')
    }
    expect(items[4]).toMatchObject({ state: 'CONFLICT', backupPath: expect.any(String) })

    expect(parsed.summary).toMatchObject({
      counts: { NEW: 1, IN_SYNC: 2, UPDATE: 1, CONFLICT: 1, DRIFT: 1 },
      dryRun: false,
      warnings: ['建议将 .openvibe/backup/ 加入 .gitignore'],
    })
  })

  it('CLI-JSON-02: 人读模式渲染表格（状态/路径/动作）与计数摘要，且不含 JSON 痕迹', () => {
    const { printer, out } = harness({ json: false })
    printer.plan(plan)
    printer.result({ plan, summary: summarizePlan(plan) })

    const text = out.join('')
    expect(text).toContain('CLAUDE.md')
    expect(text).toContain('backup+write')
    for (const state of SYNC_STATES) expect(text).toContain(state)
    expect(text).toContain('NEW 1')
    expect(text).toContain('IN_SYNC 2')
    expect(text).not.toContain('"state"')
  })

  it('CLI-JSON-03: warn 双通道——人读即时输出，--json 按序折叠进 summary.warnings', () => {
    const h = harness({ json: false })
    h.printer.warn('上报失败，已跳过')
    expect(h.out.join('')).toContain('上报失败')

    const j = harness({ json: true })
    j.printer.warn('a')
    j.printer.warn('a')
    j.printer.warn('b')
    j.printer.result({ summary: {} })
    expect(JSON.parse(j.out[0] ?? '').summary.warnings).toEqual(['a', 'a', 'b'])
  })

  it('CLI-JSON-04: report 通道（scan/diff 用）与 plan 互斥形状', () => {
    const { printer, out } = harness({ json: true })
    const report = [{ file: '.cursorrules', outcome: 'created', title: 'cursor rules' }]
    printer.result({ report, summary: { created: 1, skipped: 0 } })
    const parsed = JSON.parse(out[0] ?? '') as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['command', 'report', 'summary'])
    expect(parsed.report).toEqual(report)
  })

  it('CLI-JSON-05: fail 在 --json 下仍是 stdout 单对象（退出码由调用方决定），人读走 stderr', () => {
    const j = harness({ json: true })
    j.printer.fail('PACK_PATH_ESCAPE', 'manifest 含越界路径 ../evil.txt')
    const parsed = JSON.parse(j.out[0] ?? '') as {
      command: string
      summary: Record<string, unknown>
    }
    expect(parsed.command).toBe('sync')
    expect(parsed.summary.ok).toBe(false)
    expect(parsed.summary.error).toMatchObject({ code: 'PACK_PATH_ESCAPE' })
    expect(j.err).toEqual([])

    const h = harness({ json: false })
    h.printer.fail('UNAUTHORIZED', '程序请求需携带 Authorization: Bearer <token>')
    expect(h.out).toEqual([])
    expect(h.err.join('')).toContain('Bearer')
  })

  it('CLI-JSON-06: 退出码常量与五状态枚举冻结（m6b §5.2 / FR-2.2）', () => {
    expect(ExitCode).toEqual({ ok: 0, error: 1, drift: 2 })
    expect(SYNC_STATES).toEqual(['NEW', 'IN_SYNC', 'UPDATE', 'CONFLICT', 'DRIFT'])
  })

  it('CLI-JSON-07: 仅 color=true 输出 ANSI 转义，去色后文本一致', () => {
    const plain = harness({ json: false, color: false })
    plain.printer.plan([plan[0] as PlanItem])
    const colored = harness({ json: false, color: true })
    colored.printer.plan([plan[0] as PlanItem])

    const coloredText = colored.out.join('')
    expect(coloredText).toContain(ESC)
    expect(stripAnsi(coloredText)).toBe(plain.out.join(''))
  })
})
