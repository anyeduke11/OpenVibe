import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { HOOKS_RUN_REL } from '@openvibe/core'
import type { HookDef } from '@openvibe/shared'
import { runHooks, type HookRunRecord } from '../src/commands/hooks'

/**
 * N3 钩子执行引擎单测（docs/specs/n3-hooks.md FR-4.3/FR-4.4/FR-4.6）。
 * 覆盖：成功、continue 失败不阻断、pre block 中止、post block 非零、超时、留痕。
 */

const roots: string[] = []

function sandbox(): string {
  const root = join(
    process.cwd(),
    `.tmp-hooks-${Date.now()}-${roots.length}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function readLedger(cwd: string): HookRunRecord[] {
  const abs = join(cwd, HOOKS_RUN_REL)
  try {
    return readFileSync(abs, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as HookRunRecord)
  } catch {
    return []
  }
}

const okHook = (
  name: string,
  command: string,
  failPolicy: HookDef['failPolicy'] = 'continue',
): HookDef => ({
  name,
  command,
  timeoutMs: 30000,
  failPolicy,
})

describe('runHooks 执行引擎', () => {
  it('FR-4.6: 成功钩子留痕一行，字段完整且 ok=true', async () => {
    const cwd = sandbox()
    const result = await runHooks('pre', [okHook('echo', 'echo hello')], { cwd })
    expect(result.blocked).toBe(false)
    expect(result.hasFailure).toBe(false)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]!.ok).toBe(true)
    expect(result.records[0]!.exitCode).toBe(0)
    expect(result.records[0]!.phase).toBe('pre')
    expect(result.records[0]!.name).toBe('echo')

    const ledger = readLedger(cwd)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.command).toBe('echo hello')
    expect(typeof ledger[0]!.durationMs).toBe('number')
    expect(typeof ledger[0]!.ts).toBe('string')
    expect(ledger[0]!.timedOut).toBe(false)
  })

  it('FR-4.3: continue 失败不阻断，后续钩子仍执行', async () => {
    const cwd = sandbox()
    const result = await runHooks('post', [okHook('fail', 'exit 1'), okHook('ok2', 'echo done')], {
      cwd,
    })
    expect(result.blocked).toBe(false)
    expect(result.hasFailure).toBe(true)
    expect(result.records).toHaveLength(2)
    expect(result.records[0]!.ok).toBe(false)
    expect(result.records[1]!.ok).toBe(true)
  })

  it('FR-4.3: pre block 失败即中止，后续钩子不执行', async () => {
    const cwd = sandbox()
    const result = await runHooks(
      'pre',
      [okHook('block-fail', 'exit 1', 'block'), okHook('after', 'echo x')],
      { cwd },
    )
    expect(result.blocked).toBe(true)
    expect(result.hasFailure).toBe(true)
    // block 失败后立即停止，后续钩子不执行
    expect(result.records).toHaveLength(1)
    expect(result.records[0]!.name).toBe('block-fail')
  })

  it('FR-4.3: post block 失败不中止后续钩子，仅置 hasFailure', async () => {
    const cwd = sandbox()
    const result = await runHooks(
      'post',
      [okHook('block-fail', 'exit 1', 'block'), okHook('after', 'echo x')],
      { cwd },
    )
    expect(result.blocked).toBe(false)
    expect(result.hasFailure).toBe(true)
    // post 阶段 block 不停止后续钩子（落盘已完成，无回滚）
    expect(result.records).toHaveLength(2)
    expect(result.records[0]!.ok).toBe(false)
    expect(result.records[1]!.ok).toBe(true)
  })

  it('FR-4.4: 超时被杀、按失败处置、留痕 timedOut=true', async () => {
    const cwd = sandbox()
    const slow: HookDef = {
      name: 'sleep',
      command: 'sleep 5',
      timeoutMs: 200,
      failPolicy: 'continue',
    }
    const result = await runHooks('pre', [slow], { cwd })
    expect(result.hasFailure).toBe(true)
    expect(result.records[0]!.timedOut).toBe(true)
    expect(result.records[0]!.ok).toBe(false)

    const ledger = readLedger(cwd)
    expect(ledger[0]!.timedOut).toBe(true)
    expect(ledger[0]!.ok).toBe(false)
  })

  it('FR-4.6: 留痕不可写时仅警告、不阻断执行', async () => {
    const cwd = sandbox()
    // 把 .openvibe 预置成文件，令 hooks-run.jsonl 无法写入
    writeFileSync(join(cwd, '.openvibe'), 'not a dir')
    const warnings: string[] = []
    const result = await runHooks('pre', [okHook('echo', 'echo hi')], {
      cwd,
      onWarning: (m) => warnings.push(m),
    })
    expect(result.records[0]!.ok).toBe(true)
    expect(warnings.some((w) => w.includes('留痕写入失败'))).toBe(true)
  })
})
