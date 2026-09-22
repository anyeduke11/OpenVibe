import { describe, expect, it } from 'vitest'
import { fileSha256 } from '../pack/fingerprint'
import { applyDecisions, diffPackLock, planInjection, strategyToDecisions } from './planner'
import type { PackLock } from '@openvibe/shared'
import type { PackFileWithHash, PlanInput } from './planner'

const B = (s: string): string => `${s}\n`

const CLAUDE_PACK = B('# 包内 CLAUDE.md（1.1.0）')
const CLAUDE_INJECTED = B('# 上次注入的 CLAUDE.md（1.0.0）')
const TERMS_BODY = B('# 术语表 63 条')
const AGENTS_USER = B('# 用户自己的 AGENTS.md')
const AGENTS_PACK = B('# 包内 AGENTS.md')
const CURSOR_PACK = B('# 包内 .cursor 规则')
const CURSOR_INJECTED = B('# 上次注入的 .cursor 规则')
const CURSOR_USER = B('# 用户手改过的 .cursor 规则')
const SKILLS_PACK = B('# Skill 清单')

function f(path: string, content: string): PackFileWithHash {
  return { path, content, sha256: fileSha256(content) }
}

function diskOf(files: Record<string, string>): (path: string) => string | null {
  return (path) => {
    const v = files[path]
    return v === undefined ? null : v
  }
}

function lockOf(entries: readonly [path: string, injected: string, managed?: boolean][]): PackLock {
  return {
    schemaVersion: 1,
    pack: { id: 'pk_x', name: 'default', version: '1.0.0', fingerprint: 'a'.repeat(64) },
    injectedAt: '2026-09-20T02:11:00Z',
    files: entries.map(([path, injected, managed]) => ({
      path,
      sha256: fileSha256(injected),
      managed: managed ?? true,
    })),
  }
}

/** 五状态各命中一次（m6b FR-2.2 全表覆盖） */
function fiveStateInput(overrides: Partial<PlanInput> = {}): PlanInput {
  const pack: PackFileWithHash[] = [
    f('SKILLS.md', SKILLS_PACK), // 磁盘不存在 → NEW
    f('TERMS.md', TERMS_BODY), // 磁盘内容一致 → IN_SYNC
    f('CLAUDE.md', CLAUDE_PACK), // 受管且磁盘 == 注入时内容 → UPDATE
    f('AGENTS.md', AGENTS_PACK), // 磁盘存在且非受管、内容不同 → CONFLICT
    f('.cursor/rules/openvibe.mdc', CURSOR_PACK), // 受管但被手改 → DRIFT
  ]
  return {
    files: pack,
    readDisk: diskOf({
      'TERMS.md': TERMS_BODY,
      'CLAUDE.md': CLAUDE_INJECTED,
      'AGENTS.md': AGENTS_USER,
      '.cursor/rules/openvibe.mdc': CURSOR_USER,
    }),
    lock: lockOf([
      ['TERMS.md', TERMS_BODY],
      ['CLAUDE.md', CLAUDE_INJECTED],
      ['.cursor/rules/openvibe.mdc', CURSOR_INJECTED],
    ]),
    targets: null,
    ...overrides,
  }
}

function pick(plan: ReturnType<typeof planInjection>, path: string) {
  const file = plan.files.find((x) => x.path === path)
  if (!file) throw new Error(`计划缺少文件 ${path}`)
  return file
}

describe('UT-INJECT-PLAN-01 · 五状态机全表（m6b FR-2.2）', () => {
  const plan = planInjection(fiveStateInput())

  it('每类状态命中一次，counts 恒含全部五键', () => {
    expect(Object.keys(plan.counts).sort()).toEqual(
      ['CONFLICT', 'DRIFT', 'IN_SYNC', 'NEW', 'UPDATE'].sort(),
    )
    expect(plan.counts).toEqual({ NEW: 1, IN_SYNC: 1, UPDATE: 1, CONFLICT: 1, DRIFT: 1 })
  })

  it('NEW：写入且不备份；IN_SYNC：跳过；UPDATE：备份后写入', () => {
    expect(pick(plan, 'SKILLS.md')).toMatchObject({
      status: 'NEW',
      diskSha256: null,
      lockSha256: null,
      managed: false,
      defaultAction: 'write',
      options: [],
    })
    expect(pick(plan, 'TERMS.md')).toMatchObject({
      status: 'IN_SYNC',
      defaultAction: 'skip',
      options: [],
    })
    expect(pick(plan, 'CLAUDE.md')).toMatchObject({
      status: 'UPDATE',
      managed: true,
      defaultAction: 'backup-write',
      options: [],
    })
  })

  it('CONFLICT 二选一（覆盖默认）；DRIFT 三选一（以包为准默认）→ 都进 pending', () => {
    expect(pick(plan, 'AGENTS.md')).toMatchObject({
      status: 'CONFLICT',
      managed: false,
      lockSha256: null,
      defaultAction: 'backup-write',
      options: ['overwrite', 'skip'],
      defaultDecision: 'overwrite',
    })
    expect(pick(plan, '.cursor/rules/openvibe.mdc')).toMatchObject({
      status: 'DRIFT',
      managed: true,
      defaultAction: 'backup-write',
      options: ['overwrite', 'keep-local', 'skip'],
      defaultDecision: 'overwrite',
    })
    expect(plan.pending.map((p) => p.path)).toEqual(['.cursor/rules/openvibe.mdc', 'AGENTS.md'])
  })

  it('内容一致优先于受管判定（用户把漂移改回与包一致 → IN_SYNC，不再问）', () => {
    const p = planInjection(
      fiveStateInput({
        readDisk: diskOf({
          'TERMS.md': TERMS_BODY,
          'CLAUDE.md': CLAUDE_PACK,
          'AGENTS.md': AGENTS_PACK,
          '.cursor/rules/openvibe.mdc': CURSOR_PACK,
        }),
      }),
    )
    expect(pick(p, 'CLAUDE.md').status).toBe('IN_SYNC')
    expect(pick(p, 'CLAUDE.md').lockSha256).toBe(fileSha256(CLAUDE_INJECTED))
    expect(pick(p, '.cursor/rules/openvibe.mdc').status).toBe('IN_SYNC')
    expect(p.counts).toEqual({ NEW: 1, IN_SYNC: 4, UPDATE: 0, CONFLICT: 0, DRIFT: 0 })
  })

  it('计划按路径码点序且可重复（同一输入两次规划字节相同）', () => {
    expect(plan.files.map((x) => x.path)).toEqual([
      '.cursor/rules/openvibe.mdc',
      'AGENTS.md',
      'CLAUDE.md',
      'SKILLS.md',
      'TERMS.md',
    ])
    expect(JSON.stringify(plan)).toBe(JSON.stringify(planInjection(fiveStateInput())))
  })

  it('无 lock（首次注入）→ 磁盘已有即 CONFLICT，缺失即 NEW（§7.5 交互确认路径）', () => {
    const first = planInjection(fiveStateInput({ lock: null }))
    expect(first.counts).toEqual({ NEW: 1, IN_SYNC: 1, UPDATE: 0, CONFLICT: 3, DRIFT: 0 })
    for (const path of ['AGENTS.md', '.cursor/rules/openvibe.mdc']) {
      expect(pick(first, path).managed).toBe(false)
      expect(pick(first, path).lockSha256).toBeNull()
    }
  })
})

describe('UT-INJECT-PLAN-02 · --target 过滤（m6b FR-2.7）', () => {
  it('范围外文件不写入、不询问，但状态照常判定', () => {
    const plan = planInjection(
      fiveStateInput({ targets: ['.cursor/rules/openvibe.mdc', 'TERMS.md'] }),
    )
    expect(pick(plan, 'AGENTS.md')).toMatchObject({
      status: 'CONFLICT',
      inScope: false,
      defaultAction: 'skip',
    })
    expect(plan.pending.map((p) => p.path)).toEqual(['.cursor/rules/openvibe.mdc'])
    expect(pick(plan, '.cursor/rules/openvibe.mdc')).toMatchObject({
      inScope: true,
      status: 'DRIFT',
    })
  })

  it('targets 给定时范围外一律 skip（applyDecisions 不产出写入）', () => {
    const plan = planInjection(fiveStateInput({ targets: ['SKILLS.md'] }))
    const res = applyDecisions(plan, contentMap(fiveStateInput()), {})
    expect(res.writes.map((w) => w.path)).toEqual(['SKILLS.md'])
    expect(res.skipped.map((s) => s.path)).toEqual([
      '.cursor/rules/openvibe.mdc',
      'AGENTS.md',
      'CLAUDE.md',
      'TERMS.md',
    ])
    expect(res.skipped.find((s) => s.path === 'AGENTS.md')?.why).toContain('--target')
  })
})

function contentMap(input: PlanInput): Record<string, string> {
  return Object.fromEntries(input.files.map((x) => [x.path, x.content]))
}

describe('UT-INJECT-PLAN-03 · 决策落地（applyDecisions / --strategy）', () => {
  const plan = planInjection(fiveStateInput())
  const contents = contentMap(fiveStateInput())

  it('默认决策：CONFLICT/DRIFT 均按覆盖写入并备份，NEW 无备份，IN_SYNC 跳过', () => {
    const res = applyDecisions(plan, contents, {})
    expect(res.writes.map((w) => [w.path, w.backup])).toEqual([
      ['.cursor/rules/openvibe.mdc', true],
      ['AGENTS.md', true],
      ['CLAUDE.md', true],
      ['SKILLS.md', false],
    ])
    expect(res.writes.find((w) => w.path === 'SKILLS.md')?.content).toBe(SKILLS_PACK)
    expect(res.skipped.map((s) => s.path)).toEqual(['TERMS.md'])
  })

  it('DRIFT 三选：keep-local 保留本地（不写不备份）；skip 同理但语义不同', () => {
    const keep = applyDecisions(plan, contents, {
      '.cursor/rules/openvibe.mdc': 'keep-local',
    })
    expect(keep.writes.map((w) => w.path)).toEqual(['AGENTS.md', 'CLAUDE.md', 'SKILLS.md'])
    expect(keep.skipped.find((s) => s.path === '.cursor/rules/openvibe.mdc')?.why).toContain(
      '保留本地',
    )
  })

  it('CONFLICT 选 skip；keep-local 不适用于 CONFLICT（降级为 skip，m6b FR-2.4）', () => {
    for (const decision of ['skip', 'keep-local'] as const) {
      const res = applyDecisions(plan, contents, { 'AGENTS.md': decision })
      expect(res.writes.map((w) => w.path)).not.toContain('AGENTS.md')
      expect(res.skipped.find((s) => s.path === 'AGENTS.md')?.why).toContain('冲突')
    }
  })

  it('--strategy 批量处置全部待决项；非待决项的决策一律忽略', () => {
    const plan2 = planInjection(fiveStateInput())
    expect(strategyToDecisions(plan2, 'keep-local')).toEqual({
      '.cursor/rules/openvibe.mdc': 'keep-local',
      'AGENTS.md': 'keep-local',
    })
    const res = applyDecisions(plan2, contents, {
      ...strategyToDecisions(plan2, 'skip'),
      'SKILLS.md': 'keep-local',
    })
    expect(res.writes.map((w) => w.path)).toEqual(['CLAUDE.md', 'SKILLS.md'])
    expect(res.skipped.length).toBe(3)
  })

  it('包内缺内容 → 明确报错，不静默写空文件', () => {
    const partial: Record<string, string | undefined> = { ...contents, 'CLAUDE.md': undefined }
    expect(() => applyDecisions(plan, partial, {})).toThrow(/缺少文件内容/)
  })
})

describe('UT-INJECT-PLAN-04 · diff 的磁盘比对（m6b FR-5.2）', () => {
  const lock = lockOf([
    ['CLAUDE.md', CLAUDE_INJECTED],
    ['TERMS.md', TERMS_BODY],
    ['SKILLS.md', SKILLS_PACK],
  ])

  it('全部一致 → clean', () => {
    const out = diffPackLock(
      lock,
      diskOf({ 'CLAUDE.md': CLAUDE_INJECTED, 'TERMS.md': TERMS_BODY, 'SKILLS.md': SKILLS_PACK }),
    )
    expect(out).toMatchObject({ clean: true, drifted: [], missing: [] })
  })

  it('手改 + 删除分别归入 drifted / missing', () => {
    const out = diffPackLock(lock, diskOf({ 'CLAUDE.md': B('# 我手改了'), 'TERMS.md': TERMS_BODY }))
    expect(out.clean).toBe(false)
    expect(out.drifted).toEqual([
      {
        path: 'CLAUDE.md',
        expected: fileSha256(CLAUDE_INJECTED),
        actual: fileSha256(B('# 我手改了')),
      },
    ])
    expect(out.missing).toEqual(['SKILLS.md'])
  })

  it('未受管项（managed=false）同样比对——lock 里登记了期望哈希', () => {
    const out = diffPackLock(
      { ...lock, files: [{ path: 'X.md', sha256: fileSha256('a'), managed: false }] },
      diskOf({ 'X.md': 'b' }),
    )
    expect(out.drifted[0]?.path).toBe('X.md')
  })
})
