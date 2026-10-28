// packages/core/src/inject/consistency.test.ts —— UT-SVC-03（service-layer.md FR-2 的三分支表）。
//
// 断两件事：
// ① 合一的比对规则本身：排序口径 / 缺失判定 / managed 的处理（FR-2.1 逐字保持既有语义）；
// ② 三个既有调用点各自映射回自己旧形态时的**分叉点**——分叉是刻意保留的（FR-2.2：
//    CLI 文案、planRows 行形态、--force 语义一字不变），本文件把分叉钉在明处，
//    免得下一个来的人以为「合了就该三处输出一样」而去改既有断言。
import { describe, expect, it } from 'vitest'
import type { PackLock } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'
import { CONSISTENCY_STATES, verifyAgainstLock, type DeclaredFile } from './consistency'
import { diffPackLock, summarizeDiff } from './planner'
import { planRetirement, RETIREMENT_STATES } from './retirement'

const disk =
  (map: Record<string, string>) =>
  (rel: string): string | null =>
    map[rel] ?? null

const declaredOf = (entries: readonly (readonly [string, string, boolean])[]): DeclaredFile[] =>
  entries.map(([path, content, managed]) => ({
    path,
    sha256: fileSha256(content),
    managed,
  }))

const lockOf = (entries: readonly (readonly [string, string, boolean])[]): PackLock => ({
  schemaVersion: 1,
  pack: { id: 'pk_x', name: 'x', version: '1.0.0', fingerprint: 'f' },
  injectedAt: '2026-09-24T00:00:00Z',
  files: declaredOf(entries).map((d) => ({ path: d.path, sha256: d.sha256, managed: d.managed })),
})

describe('UT-SVC-03 · verifyAgainstLock 的三分支表（FR-2.1）', () => {
  it('CS-01: 七行分支逐行断言——缺失先判、未受管不判 DRIFT、sha 不符才 DRIFT', () => {
    const declared = declaredOf([
      ['A-absent-managed.md', 'a\n', true],
      ['B-absent-unmanaged.md', 'b\n', false],
      ['C-sync.md', 'c\n', true],
      ['D-drift.md', 'd\n', true],
      ['E-unmanaged-same.md', 'e\n', false],
      ['F-unmanaged-diff.md', 'f\n', false],
      ['.openvibe/backup/G-internal.md', 'g\n', true],
    ])
    const rows = verifyAgainstLock(
      declared,
      disk({
        'C-sync.md': 'c\n',
        'D-drift.md': '用户手改\n',
        'E-unmanaged-same.md': 'e\n',
        'F-unmanaged-diff.md': '用户手改\n',
        '.openvibe/backup/G-internal.md': 'g\n',
      }),
    )
    expect(rows.map((r) => [r.path, r.state])).toEqual([
      // 码点序：'.'(46) < 'A'(65) < … < 'F'(70)，所以 `.openvibe/` 那行排在最前
      // `.openvibe/` 下即使 managed=true 也记 FOREIGN，**不落到 IN_SYNC/DRIFT**
      ['.openvibe/backup/G-internal.md', 'FOREIGN'],
      // 缺失优先于 managed：managed=false 的登记项在盘上不存在时仍是「缺」
      ['A-absent-managed.md', 'ABSENT'],
      ['B-absent-unmanaged.md', 'ABSENT'],
      ['C-sync.md', 'IN_SYNC'],
      ['D-drift.md', 'DRIFT'],
      // 未受管（哪怕逐字节相同）⇒ FOREIGN，**不落到 IN_SYNC/DRIFT**
      ['E-unmanaged-same.md', 'FOREIGN'],
      ['F-unmanaged-diff.md', 'FOREIGN'],
    ])
  })

  it('CS-02: 声明侧哈希与实算哈希原样回传（调用方拿 declaredSha256 当 drifted.expected）', () => {
    const [row] = verifyAgainstLock(
      declaredOf([['AGENTS.md', '期望内容\n', true]]),
      disk({ 'AGENTS.md': '实算内容\n' }),
    )
    expect(row).toMatchObject({
      path: 'AGENTS.md',
      state: 'DRIFT',
      declaredSha256: fileSha256('期望内容\n'),
      diskSha256: fileSha256('实算内容\n'),
      managed: true,
      internal: false,
    })
  })

  it('CS-03: 码点序而非 locale 序，且不改入参数组', () => {
    const paths = ['a.md', '中.md', 'B.md', 'Z.md']
    const declared = declaredOf(paths.map((p) => [p, `${p}\n`, true] as const))
    const snapshot = declared.map((d) => d.path)
    const rows = verifyAgainstLock(declared, disk({}))
    // 'B'(66) < 'Z'(90) < 'a'(97) < '中'(20013)；localeCompare 会给出 a,B,Z,中 —— 排错就红
    expect(rows.map((r) => r.path)).toEqual(['B.md', 'Z.md', 'a.md', '中.md'])
    expect(declared.map((d) => d.path)).toEqual(snapshot)
  })

  it('CS-04: readDisk 抛错原样上抛，不转译成 ABSENT（读失败 ≠ 文件不在）', () => {
    expect(() =>
      verifyAgainstLock(declaredOf([['AGENTS.md', 'a\n', true]]), () => {
        throw new Error('EIO')
      }),
    ).toThrow('EIO')
  })

  it('CS-05: 单一状态词表——与退场侧导出的是同一个数组、顺序固定', () => {
    expect(RETIREMENT_STATES).toBe(CONSISTENCY_STATES)
    expect([...CONSISTENCY_STATES]).toEqual(['IN_SYNC', 'DRIFT', 'ABSENT', 'FOREIGN'])
  })
})

describe('UT-SVC-03 · 三条既有路径对同一输入的映射（FR-2.2）', () => {
  const entries = [
    ['AGENTS.md', '包内容\n', true],
    ['SKILLS.md', '包内容2\n', true],
    ['TERMS.md', '包内容3\n', true],
    ['UNMANAGED.md', '包内容4\n', false],
  ] as const
  const lock = lockOf(entries)
  const onDisk = disk({
    'AGENTS.md': '包内容\n',
    'SKILLS.md': '用户手改\n',
    'UNMANAGED.md': '用户手改\n',
  })

  it('CS-06: 缺失 / 一致 / 不符三态，三条路径各自的映射与既有形态一致', () => {
    const rows = verifyAgainstLock(
      lock.files.map((e) => ({ path: e.path, sha256: e.sha256, managed: e.managed })),
      onDisk,
    )
    const diff = diffPackLock(lock, onDisk)
    const clean = planRetirement({ lock, readDisk: onDisk })

    expect(rows.map((r) => [r.path, r.state])).toEqual([
      ['AGENTS.md', 'IN_SYNC'],
      ['SKILLS.md', 'DRIFT'],
      ['TERMS.md', 'ABSENT'],
      // 未受管 + 磁盘被改：合一后的规则记 FOREIGN（不判 DRIFT）
      ['UNMANAGED.md', 'FOREIGN'],
    ])

    // planner 侧：diff 的形态——FR-2.3 改判后**直接输出四态**，
    // 「受管漂移」与「未受管被改」分列（此前后者混进 drifted，用户分不出）
    const sum = summarizeDiff(diff)
    expect(sum.missing).toEqual(['TERMS.md'])
    expect(sum.clean).toBe(false)
    expect(sum.drifted).toEqual([
      { path: 'SKILLS.md', expected: fileSha256('包内容2\n'), actual: fileSha256('用户手改\n') },
    ])
    expect(sum.foreign).toEqual([{ path: 'UNMANAGED.md', actual: fileSha256('用户手改\n') }])

    // retirement 侧：四态原样 + action 映射原样（--force 未给 ⇒ DRIFT 只 keep）
    expect(clean.files.map((f) => [f.path, f.state, f.action])).toEqual([
      ['AGENTS.md', 'IN_SYNC', 'delete'],
      ['SKILLS.md', 'DRIFT', 'keep'],
      ['TERMS.md', 'ABSENT', 'none'],
      ['UNMANAGED.md', 'FOREIGN', 'none'],
    ])
    expect(clean.removals).toEqual(['AGENTS.md'])
    expect(planRetirement({ lock, readDisk: onDisk, force: true }).removals).toEqual([
      'AGENTS.md',
      'SKILLS.md',
    ])
  })

  it('CS-07: 分叉点是刻意的——同一未受管条目，退场记 FOREIGN 不删，diff 仍如实报出差异', () => {
    const only = lockOf([['UNMANAGED.md', '包内容4\n', false]])
    const onDiskOnly = disk({ 'UNMANAGED.md': '用户手改\n' })
    // 退场：未受管 ⇒ 不删（--force 也不删）
    expect(planRetirement({ lock: only, readDisk: onDiskOnly, force: true }).removals).toEqual([])
    // diff：lock 既已登记期望哈希，差异**必须报出来**（既有 UT-INJECT-PLAN-04 第 3 例）。
    // FR-2.3 改判后它落 `foreign` 列而不是 `drifted` 列 —— **「不报」才是错，分在哪列不是错**。
    const sum = summarizeDiff(diffPackLock(only, onDiskOnly))
    expect(sum.foreign).toEqual([{ path: 'UNMANAGED.md', actual: fileSha256('用户手改\n') }])
    expect(sum.drifted).toEqual([])
    expect(sum.clean).toBe(false)
  })

  it('CS-08: 验签侧依赖的不变量——受管声明下的 `.openvibe/` 路径仍是 FOREIGN，但哈希照样可比', () => {
    // apps/cli/src/pack-source.ts 的映射靠这一条：不豁免 FOREIGN，逐字比哈希。
    // 若哪天比对规则不再回传 diskSha256，或 FOREIGN 不再带实算哈希，整包验签会漏比该路径。
    const rows = verifyAgainstLock(
      [{ path: '.openvibe/x.md', sha256: fileSha256('声明\n'), managed: true }],
      disk({ '.openvibe/x.md': '声明\n' }),
    )
    expect(rows[0]?.state).toBe('FOREIGN')
    expect(rows[0]?.internal).toBe(true)
    // pack-source 的判据：diskSha256 !== declaredSha256 ⇒ modified
    expect(rows[0]?.diskSha256 !== rows[0]?.declaredSha256).toBe(false)

    const tampered = verifyAgainstLock(
      [{ path: '.openvibe/x.md', sha256: fileSha256('声明\n'), managed: true }],
      disk({ '.openvibe/x.md': '被篡改\n' }),
    )
    expect(tampered[0]?.state).toBe('FOREIGN')
    expect(tampered[0]?.diskSha256 !== tampered[0]?.declaredSha256).toBe(true)
  })
})
