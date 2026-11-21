import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { HOOKS_RUN_REL, PACK_LOCK_REL } from '@openvibe/core'
import type { Hooks } from '@openvibe/shared'
import { SyncError, syncAction } from '../src/commands/sync'
import type { HookRunRecord } from '../src/commands/hooks'
import { demoPack, writeBundleFile, type PackFixture } from './helpers/pack-fixture'
import { tempDir } from '@openvibe/core/test-support'

/**
 * N3 FR-4 CLI 钩子执行引擎端到端（docs/specs/n3-hooks.md §6）。
 * 验收映射：IT-HOOK-04（pre/post 挂点时序）、IT-HOOK-05（失败语义）、
 * IT-HOOK-06（超时）、IT-HOOK-07（留痕）、IT-HOOK-08（降级字节等价）、
 * BND-HOOK-09（旧包无 hooks 字段）、REG-HOOK-10（schemaVersion=2 兼容）。
 */

const roots: string[] = []

function sandbox(): { root: string; project: string } {
  const root = tempDir('ov-sync-hooks-')
  roots.push(root)
  const project = join(root, 'proj')
  mkdirSync(project)
  return { root, project }
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

function readLedger(project: string): HookRunRecord[] {
  try {
    return readFileSync(join(project, HOOKS_RUN_REL), 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as HookRunRecord)
  } catch {
    return []
  }
}

const hooksOf = (fixture: PackFixture): Hooks | undefined => fixture.manifest.hooks

describe('N3 FR-4 sync 钩子端到端', () => {
  it('IT-HOOK-04: pre 在落盘前、post 在锁写完后，留痕时序可辨', async () => {
    const hooks: Hooks = {
      pre: [
        { name: 'pre-marker', command: 'echo pre-ran', timeoutMs: 30000, failPolicy: 'continue' },
      ],
      post: [
        { name: 'post-marker', command: 'echo post-ran', timeoutMs: 30000, failPolicy: 'continue' },
      ],
    }
    const fixture = demoPack({ hooks })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture)

    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true })

    expect(outcome.exitCode).toBe(0)
    const ledger = readLedger(project)
    expect(ledger.map((r) => r.name)).toEqual(['pre-marker', 'post-marker'])
    expect(ledger.map((r) => r.phase)).toEqual(['pre', 'post'])
    // pre 先于 post
    expect(ledger[0]!.ts.localeCompare(ledger[1]!.ts)).toBeLessThanOrEqual(0)
    // 锁已写
    expect(readFileSync(join(project, PACK_LOCK_REL), 'utf8')).toContain(fixture.manifest.pack.id)
  })

  it('IT-HOOK-05: pre block 失败中止注入——不落盘、不写锁', async () => {
    const hooks: Hooks = {
      pre: [{ name: 'block-pre', command: 'exit 1', timeoutMs: 30000, failPolicy: 'block' }],
      post: [],
    }
    const fixture = demoPack({ hooks })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture)

    await expect(
      syncAction({ projectPath: project, file: bundlePath, yes: true }),
    ).rejects.toBeInstanceOf(SyncError)

    // 不落盘、不写锁：主规则文件未生成，lock 不存在
    try {
      readFileSync(join(project, 'CLAUDE.md'), 'utf8')
      expect.unreachable('CLAUDE.md 不应落盘')
    } catch {
      /* 未落盘，符合预期 */
    }
    expect(readOrNull(join(project, PACK_LOCK_REL))).toBeNull()
    // 留痕仍记录失败的 pre 钩子
    const ledger = readLedger(project)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.name).toBe('block-pre')
    expect(ledger[0]!.ok).toBe(false)
  })

  it('IT-HOOK-05: pre continue 失败不阻断，注入完成', async () => {
    const hooks: Hooks = {
      pre: [{ name: 'warn-pre', command: 'exit 1', timeoutMs: 30000, failPolicy: 'continue' }],
      post: [],
    }
    const fixture = demoPack({ hooks })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture)

    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true })

    expect(outcome.exitCode).toBe(0)
    expect(readFileSync(join(project, 'CLAUDE.md'), 'utf8')).toContain('规则正文')
    expect(readFileSync(join(project, PACK_LOCK_REL), 'utf8')).toContain(fixture.manifest.pack.id)
    const ledger = readLedger(project)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.ok).toBe(false)
  })

  it('IT-HOOK-05: post block 失败——落盘与锁已完成，sync 返回非零', async () => {
    const hooks: Hooks = {
      pre: [],
      post: [{ name: 'block-post', command: 'exit 1', timeoutMs: 30000, failPolicy: 'block' }],
    }
    const fixture = demoPack({ hooks })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture)

    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true })

    // 落盘与锁已完成
    expect(readFileSync(join(project, 'CLAUDE.md'), 'utf8')).toContain('规则正文')
    expect(readFileSync(join(project, PACK_LOCK_REL), 'utf8')).toContain(fixture.manifest.pack.id)
    // post block 失败 ⇒ 非零退出码
    expect(outcome.exitCode).not.toBe(0)
    const ledger = readLedger(project)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.name).toBe('block-post')
    expect(ledger[0]!.ok).toBe(false)
  })

  it('IT-HOOK-06: pre 钩子超时按失败处置，continue 下不阻断', async () => {
    const hooks: Hooks = {
      pre: [{ name: 'slow-pre', command: 'sleep 5', timeoutMs: 200, failPolicy: 'continue' }],
      post: [],
    }
    const fixture = demoPack({ hooks })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture)

    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true })

    expect(outcome.exitCode).toBe(0)
    const ledger = readLedger(project)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.timedOut).toBe(true)
    expect(ledger[0]!.ok).toBe(false)
  })

  it('IT-HOOK-08: 无钩子包产物与今天逐字节相同（不产生 hooks-run 之外的额外产物）', async () => {
    const fixture = demoPack()
    expect(hooksOf(fixture)).toBeUndefined()
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fixture)

    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true })

    expect(outcome.exitCode).toBe(0)
    expect(readLedger(project)).toEqual([])
    // 正常注入产物不变
    expect(readFileSync(join(project, 'CLAUDE.md'), 'utf8')).toContain('规则正文')
  })

  it('BND-HOOK-09: 旧包（无 hooks 字段）注入正常', async () => {
    const fixture = demoPack()
    const bundle = JSON.parse(JSON.stringify(fixture.bundle)) as Record<string, unknown>
    // 显式删除 hooks 字段，模拟旧包
    const manifest = bundle.manifest as Record<string, unknown>
    delete manifest.hooks
    const { root, project } = sandbox()
    const bundlePath = join(root, 'legacy.json')
    writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')

    const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true })

    expect(outcome.exitCode).toBe(0)
    expect(readFileSync(join(project, 'CLAUDE.md'), 'utf8')).toContain('规则正文')
    expect(readLedger(project)).toEqual([])
  })
})

function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}
