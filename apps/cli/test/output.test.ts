import { describe, expect, it } from 'vitest'
import {
  ExitCode,
  SYNC_STATES,
  createPrinter,
  emitWarnings,
  splitArgs,
  splitMessage,
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

  it('CLI-JSON-03b: warn 的 detail 走新增键 warningDetails，warnings 元素类型不动', () => {
    // ⚠️ `summary.warnings` 是 --json 对外契约（string[]），诊断原文不能混进去
    const j = harness({ json: true })
    j.printer.warn('注入历史上报失败（服务端不可达）', 'connect ECONNREFUSED')
    j.printer.warn('纯中文提示')
    j.printer.result({ summary: {} })
    const summary = JSON.parse(j.out[0] ?? '').summary as {
      warnings: string[]
      warningDetails?: { index: number; message: string; detail: string }[]
    }
    // warnings 仍是字符串数组（老脚本按 jq '.summary.warnings[]' 读）
    expect(summary.warnings).toEqual(['注入历史上报失败（服务端不可达）', '纯中文提示'])
    // 诊断原文另走 warningDetails，带 index 指回它对应第几条
    expect(summary.warningDetails).toEqual([
      { index: 0, message: '注入历史上报失败（服务端不可达）', detail: 'connect ECONNREFUSED' },
    ])
  })

  it('CLI-JSON-03c: 无诊断信息时不产生 warningDetails 键（无噪声字段）', () => {
    const j = harness({ json: true })
    j.printer.warn('纯中文提示')
    j.printer.result({ summary: {} })
    const summary = JSON.parse(j.out[0] ?? '').summary as Record<string, unknown>
    expect('warningDetails' in summary).toBe(false)
  })

  it('CLI-JSON-03d: 人读模式 warn 的 detail 缩进打印在提示下方', () => {
    const h = harness({ json: false })
    h.printer.warn('注入历史上报失败（服务端不可达）', 'connect ECONNREFUSED')
    const text = h.out.join('')
    expect(text).toContain('提示 注入历史上报失败（服务端不可达）')
    // 诊断原文以两格缩进出现在下一行（与 fail 同一形态）
    expect(text).toContain('  connect ECONNREFUSED')
  })

  it('CLI-JSON-03e: emitWarnings 按同序把 detail 接到对应的 warning 上', () => {
    const j = harness({ json: true })
    emitWarnings(j.printer, {
      warnings: ['第一条', '第二条', '第三条'],
      warningDetails: ['detail 一', undefined, 'detail 三'],
    })
    j.printer.result({ summary: {} })
    const summary = JSON.parse(j.out[0] ?? '').summary as {
      warnings: string[]
      warningDetails?: { index: number; detail: string }[]
    }
    expect(summary.warnings).toEqual(['第一条', '第二条', '第三条'])
    expect(summary.warningDetails?.map((d) => d.index)).toEqual([0, 2])
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

/**
 * 失败文案的双通道（2026-10-29）。
 *
 * **为什么要有这几条**：此前 `printer.fail` 只有一个 `message` 参数，于是
 * 「人话」与「诊断原文」挤在同一个位置——中文终端里会混进 `EACCES: permission denied`
 * 这类英文机器串，而把英文删掉又让排障失去依据（FR-3 要求 ABI/平台/修复命令可见）。
 * 拆成 `message` + `detail` 两个通道后，这里钉住三件事：
 *   ① 判据是**内容**（含中文即人话），不是错误类名清单；
 *   ② 人读模式两个通道都要看得见（否则排障信息就丢了）；
 *   ③ `--json` 把 detail 放进 `summary.error.detail`，无 detail 时不产生噪声字段。
 */
describe('FAIL-SPLIT · 人话与诊断原文分通道', () => {
  it('FAIL-SPLIT-01: 含中文的原文留在人话通道，不降级成 detail', () => {
    expect(splitMessage('缺少 lock 文件，先跑 openvibe sync')).toEqual({
      message: '缺少 lock 文件，先跑 openvibe sync',
    })
  })

  it('FAIL-SPLIT-02: 不含中文的原文降级为 detail，人话位置给中文兜底', () => {
    const s = splitMessage('EACCES: permission denied, open "/x"')
    expect(s.message).toBe('执行失败')
    expect(s.detail).toBe('EACCES: permission denied, open "/x"')
    // 人话通道不得残留英文机器串
    expect(s.message).not.toMatch(/[A-Za-z]/)
  })

  it('FAIL-SPLIT-03: splitArgs 展开后可直接喂给 printer.fail', () => {
    expect(splitArgs('中文原因')).toEqual(['中文原因'])
    expect(splitArgs('spawn xdg-open ENOENT')).toEqual(['执行失败', 'spawn xdg-open ENOENT'])
  })

  it('FAIL-SPLIT-03b: 显式 detail 优先于内容判定（构造者已知它是诊断原文）', () => {
    // 错误类自带的 detail 是「构造者明确放的」；内容判定只是「猜」的。
    // 两者冲突时信前者——否则本仓的中文 message 会被误判成机器串。
    expect(splitArgs('中文原因', 'EACCES: permission denied')).toEqual([
      '中文原因',
      'EACCES: permission denied',
    ])
    // 显式 detail 为空串时退回内容判定
    expect(splitArgs('中文原因', '')).toEqual(['中文原因'])
  })

  it('FAIL-SPLIT-03c: 半中半英的第三方文案 ⇒ 英文句子切进 detail，人话只留中文', () => {
    const s = splitMessage('无法解析 JSON: Unexpected token < in JSON at position 0')
    // 人话通道不得含连续英文单词
    expect(s.message).not.toMatch(/Unexpected/)
    expect(s.message).toContain('无法解析')
    // 诊断原文完整保留
    expect(s.detail).toContain('Unexpected token')
  })

  it('FAIL-SPLIT-03d: 本仓内嵌 URL/路径的文案不得被误切', () => {
    // `URL` 与 URL 不构成「连续单词」⇒ 不算英文句子 ⇒ 原样留在人话通道
    const s = splitMessage('非法 URL: https://example.com/a/b')
    expect(s.detail).toBeUndefined()
    expect(s.message).toBe('非法 URL: https://example.com/a/b')

    const p = splitMessage('读取 /Users/x/y/z 失败')
    expect(p.detail).toBeUndefined()
    expect(p.message).toBe('读取 /Users/x/y/z 失败')
  })

  it('FAIL-SPLIT-03e: 内嵌两三个英文词的短标识不算诊断（无错误特征）', () => {
    // `NODE_MODULE_VERSION 137` 只有两个词，且不带错误特征 ⇒ 不切
    // （判据已从「≥3 词」改为「带错误特征」，见 apps/cli/test/split-calibration.test.ts）
    const s = splitMessage('当前环境：darwin arm64；Node 26.4.0（ABI/NODE_MODULE_VERSION 137）')
    expect(s.detail).toBeUndefined()
    expect(s.message).toContain('NODE_MODULE_VERSION')
  })

  it('FAIL-SPLIT-03j: 修复命令不被误切（判据校准发现过的真实缺陷）', () => {
    // 早先按「≥3 词」判定时，`npm rebuild better-sqlite3` 被整段当英文句子切走——
    // 那是 native-load 三要素诊断里的修复路径，切走了排障就断了。
    const s = splitMessage('在安装目录执行 npm rebuild better-sqlite3')
    expect(s.detail).toBeUndefined()
    expect(s.message).toContain('npm rebuild better-sqlite3')
  })

  it('FAIL-SPLIT-03f: 列表分隔的关键词清单不是句子，整段留在人话通道', () => {
    // ⚠️ 这是 ask 命令的真实文案：闭集关键词用 ` | ` 串联。
    // 早先只按「连续 ≥3 个单词」判定，把七个关键词整段当英文句子切走，
    // 导致报错文案里一个关键词都不剩（apps/cli/test/ask.test.ts 的 CLI-ASK-10 因此变红）。
    const raw =
      '问题词只能是闭集关键词（不接 LLM、不接受自由文本）：status | next | checklist | assets | terms | playbook | logs；收到：什么时候能上线'
    const s = splitMessage(raw)
    expect(s.detail).toBeUndefined()
    for (const k of ['status', 'next', 'checklist', 'assets', 'terms', 'playbook', 'logs'])
      expect(s.message).toContain(k)
  })

  it('FAIL-SPLIT-03g: 子句标点前的标签词留在人话通道，英文句子进 detail', () => {
    // `不是合法 JSON：` 是中文子句，`Unexpected token < in JSON at position 0` 是机器串
    const s = splitMessage('不是合法 JSON：Unexpected token < in JSON at position 0')
    expect(s.message).toContain('不是合法 JSON')
    expect(s.message).not.toContain('Unexpected')
    expect(s.detail).toContain('Unexpected token < in JSON at position 0')
  })

  it('FAIL-SPLIT-03h: 括号裹着的英文诊断整段带走，两边不留残骸', () => {
    // apps/cli/src/pack-source.ts:89 的真实形态：`读不到${label}：${path}（${e.message}）`
    const s = splitMessage(
      "读不到bundle：/tmp/x/bundle.json（EACCES: permission denied, open '/tmp/x/bundle.json'）",
    )
    // 人话通道：路径保留，且不留孤立的左括号
    expect(s.message).toBe('读不到bundle：/tmp/x/bundle.json')
    expect(s.message).not.toContain('（')
    // 诊断通道：整句完整，不缺右括号
    expect(s.detail).toContain('EACCES: permission denied')
    expect(s.detail).toContain("'/tmp/x/bundle.json'")
  })

  it('FAIL-SPLIT-03i: 半角冒号属于英文句内，不把诊断切成两半', () => {
    // `EACCES` 是错误码，与后面的句子同属一条诊断；切开就只剩残句
    const s = splitMessage("读取 /tmp/x 失败：EACCES: permission denied, open '/tmp/x'")
    expect(s.message).toBe('读取 /tmp/x 失败')
    expect(s.detail).toBe("EACCES: permission denied, open '/tmp/x'")
  })

  it('FAIL-SPLIT-04: 人读模式两个通道都打印（诊断原文缩进成块）', () => {
    const h = harness({ json: false })
    const { message, detail } = splitMessage('listen EADDRINUSE: 127.0.0.1:8787')
    h.printer.fail('LISTEN_FAILED', message, detail)
    const text = h.err.join('')
    expect(text).toContain('LISTEN_FAILED')
    expect(text).toContain('执行失败')
    // 诊断原文以两格缩进出现在下一行
    expect(text).toContain('  listen EADDRINUSE: 127.0.0.1:8787')
  })

  it('FAIL-SPLIT-05: --json 把 detail 放进 summary.error，且无 detail 时不多写字段', () => {
    const withDetail = harness({ json: true })
    withDetail.printer.fail('LISTEN_FAILED', '端口 8787 监听失败', 'listen EADDRINUSE')
    const parsed = JSON.parse(withDetail.out.join('')) as {
      summary: { error: { code: string; message: string; detail?: string } }
    }
    expect(parsed.summary.error).toEqual({
      code: 'LISTEN_FAILED',
      message: '端口 8787 监听失败',
      detail: 'listen EADDRINUSE',
    })

    const noDetail = harness({ json: true })
    noDetail.printer.fail('NO_LOCK', '缺少 lock 文件')
    const parsed2 = JSON.parse(noDetail.out.join('')) as {
      summary: { error: Record<string, unknown> }
    }
    expect('detail' in parsed2.summary.error).toBe(false)
  })
})
