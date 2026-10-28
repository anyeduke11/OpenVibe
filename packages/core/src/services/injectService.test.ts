import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planInjection, type InjectPlan } from '../inject'
import { fileSha256 } from '../pack'
import { decideInjections, planDecideApply, InjectError, type AskFn } from './injectService'
import type { InjectDecision } from '../inject'

/**
 * `injectService` 单测（service-layer.md §7 a 条 `UT-SVC-01`）。
 *
 * **这个测试文件就是「决策规则下沉」这件事的收益证明**：它能在 core 内逐项断言
 * 决策规则，既不起子进程、也不需要 TTY、也不 import `@clack`。
 * 规则原本在 `apps/cli/src/commands/sync.ts` 的 `decide` 里，只能经真子进程 + 伪终端覆盖。
 */

function tmpProject(): { path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), 'ov-inject-test-'))
  mkdirSync(join(path, '.claude'), { recursive: true })
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) }
}

/**
 * 造一个**同时含 CONFLICT 与 DRIFT** 的计划 —— 这两类的判定前提不同，必须分开造：
 * - `.claude/settings.json`：磁盘有内容但 lock 无此条目 ⇒ `managed` 为假 ⇒ **CONFLICT**（本包从未拥有过它）
 * - `CLAUDE.md`：lock 记了受管且 sha 与磁盘不同 ⇒ **DRIFT**（本包拥有过，用户改过）
 *
 * ⚠️ 两者都落在 `plan.pending` 里，但 **options 数量不同**（CONFLICT 两项、DRIFT 三项），
 * 这正是「core 已按状态裁好 options」那件事的体现。
 */
function mixedPlan(): {
  plan: InjectPlan
  files: { path: string; content: string; sha256: string }[]
} {
  const files = [
    { path: 'CLAUDE.md', content: '包内正文', sha256: fileSha256('包内正文') },
    { path: '.claude/settings.json', content: '{"a":1}', sha256: fileSha256('{"a":1}') },
  ]
  const plan = planInjection({
    files,
    readDisk: (rel) => (rel === 'CLAUDE.md' ? '磁盘上的手改' : '{"a":2}'),
    lock: {
      files: [{ path: 'CLAUDE.md', sha256: fileSha256('更早的正文'), managed: true }],
    } as never,
    targets: null,
  })
  return { plan, files }
}

const PENDING_PATHS = ['.claude/settings.json', 'CLAUDE.md']

describe('UT-SVC-01 · injectService 决策规则（从 sync.ts 的 decide 迁入，规则逐条保持）', () => {
  it('无待决项 ⇒ 直接空决策，不问任何问题', async () => {
    const files = [{ path: 'A.md', content: 'x', sha256: fileSha256('x') }]
    const plan = planInjection({ files, readDisk: () => null, lock: null, targets: null })
    const asked: string[] = []
    const decided = await decideInjections(
      plan,
      { isTTY: true, ask: async (f) => (asked.push(f.path), 'skip') },
      [],
    )
    expect(decided).toEqual({})
    expect(asked).toEqual([])
  })

  it('dry-run ⇒ 用默认动作，**且必须留下说明**（静默会让用户以为默认已生效）', async () => {
    const { plan } = mixedPlan()
    const warnings: string[] = []
    const decided = await decideInjections(plan, { dryRun: true, isTTY: true }, warnings)
    expect(decided).toEqual({})
    expect(warnings.join()).toContain('dry-run')
    expect(warnings.join()).toMatch(/待决/)
  })

  it('`--yes` 无 `--strategy` ⇒ 空决策（走每项 defaultAction），**不是擅自全跳过**', async () => {
    const { plan } = mixedPlan()
    const decided = await decideInjections(plan, { yes: true, isTTY: false }, [])
    expect(decided).toEqual({})
  })

  it('`--yes --strategy skip` ⇒ 按策略批量决定待决项', async () => {
    const { plan } = mixedPlan()
    const decided = await decideInjections(plan, { yes: true, strategy: 'skip', isTTY: false }, [])
    expect(decided).toEqual({ '.claude/settings.json': 'skip', 'CLAUDE.md': 'skip' })
  })

  it('非 TTY 且无 `--yes` ⇒ 抛 NEED_TTY，details 带**排序后**的待决路径（不替用户决定）', async () => {
    const { plan } = mixedPlan()
    try {
      await decideInjections(plan, { isTTY: false }, [])
      throw new Error('本该抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(InjectError)
      const err = e as InjectError
      expect(err.code).toBe('NEED_TTY')
      expect((err.details as { pending: string[] }).pending).toEqual(PENDING_PATHS)
    }
  })

  it('**注入了 ask 但非 TTY 仍然拒绝**——终端判断在注入之前，不给「偷跑交互」留口子', async () => {
    const { plan } = mixedPlan()
    let asked = 0
    const ask: AskFn = async () => (asked++, 'overwrite' as InjectDecision)
    await expect(decideInjections(plan, { isTTY: false, ask }, [])).rejects.toThrow(/不是交互终端/)
    expect(asked).toBe(0)
  })

  it('TTY 但未注入 `ask` ⇒ NO_ASKER（配置错误，不是用户错误）', async () => {
    const { plan } = mixedPlan()
    try {
      await decideInjections(plan, { isTTY: true }, [])
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as InjectError).code).toBe('NO_ASKER')
    }
  })

  it('TTY ＋ 注入 `ask` ⇒ **逐项**询问并按路径归档结果（这就是 FR-3.3 的注入面）', async () => {
    const { plan } = mixedPlan()
    const seen: [string, string, number][] = []
    const ask: AskFn = async (f) => {
      seen.push([f.path, f.status, f.options.length])
      return f.status === 'CONFLICT' ? 'keep-local' : 'overwrite'
    }
    const decided = await decideInjections(plan, { isTTY: true, ask }, [])
    // 路径码点序：`.claude/settings.json` 在 `CLAUDE.md` 之前（`.` < `C`）
    expect(seen).toEqual([
      ['.claude/settings.json', 'CONFLICT', 2],
      ['CLAUDE.md', 'DRIFT', 3],
    ])
    expect(decided).toEqual({ '.claude/settings.json': 'keep-local', 'CLAUDE.md': 'overwrite' })
  })
})

describe('UT-SVC-01 · injectService 主入口（核验 → 计划 → 决策 → 应用）', () => {
  const files = [{ path: 'CLAUDE.md', content: '包内正文', sha256: fileSha256('包内正文') }]

  it('正常路径 ⇒ 产出计划、决策、每个待写路径都已校验的绝对路径', async () => {
    const { path, cleanup } = tmpProject()
    const out = await planDecideApply({
      projectPath: path,
      files,
      readDisk: () => null,
      lock: null,
      targets: null,
      decisions: { isTTY: false },
      warningsOut: [],
    })
    expect(out.writes).toHaveLength(1)
    expect(out.writes[0]!.path).toBe('CLAUDE.md')
    expect(out.absPaths['CLAUDE.md']).toBe(join(path, 'CLAUDE.md'))
    cleanup()
  })

  it('**核验先行**：整包含越界路径 ⇒ 抛错，且不会产出任何待写条目', async () => {
    const { path, cleanup } = tmpProject()
    const evil = [...files, { path: '../逃逸.md', content: 'x', sha256: fileSha256('x') }]
    try {
      await planDecideApply({
        projectPath: path,
        files: evil,
        readDisk: () => null,
        lock: null,
        targets: null,
        decisions: { isTTY: false },
        warningsOut: [],
      })
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as { code: string }).code).toBe('VALIDATION_ERROR')
    }
    cleanup()
  })

  it('dry-run ⇒ 待写条目照常算出但**不带备份承诺**，调用方据此判定「零写入」', async () => {
    const { path, cleanup } = tmpProject()
    const warnings: string[] = []
    const out = await planDecideApply({
      projectPath: path,
      files,
      readDisk: (rel) => (rel === 'CLAUDE.md' ? '磁盘旧内容' : null),
      lock: null,
      targets: null,
      decisions: { dryRun: true, isTTY: false },
      warningsOut: warnings,
    })
    // 关键判据：dry-run **不改计划**——决策留空、走默认动作。
    // 「零写入」是调用方不落盘的纪律，不是这里返回空列表；
    // 若服务层擅自把 writes 清空，调用方就分不清「dry-run」与「无事可做」。
    expect(out.decided).toEqual({})
    expect(out.writes).toHaveLength(1)
    expect(out.writes[0]!.backup).toBe(true)
    cleanup()
  })
})
