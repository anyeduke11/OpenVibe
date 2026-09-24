import { describe, expect, it } from 'vitest'
import { fileSha256 } from '../pack/fingerprint'
import { planRetirement, RETIREMENT_STATES } from './retirement'
import type { PackLock } from '@openvibe/shared'

const lockOf = (entries: [string, string, boolean][]): PackLock => ({
  schemaVersion: 1,
  pack: { id: 'pk_x', name: 'x', version: '1.0.0', fingerprint: 'f' },
  injectedAt: '2026-09-24T00:00:00Z',
  files: entries.map(([path, content, managed]) => ({
    path,
    sha256: fileSha256(content),
    managed,
  })),
})

const disk =
  (map: Record<string, string>) =>
  (rel: string): string | null =>
    map[rel] ?? null

describe('planRetirement（m6b FR-6.3 三态 + FOREIGN）', () => {
  it('RT-01: counts 恒含四键且顺序固定，计划按路径码点序可重复', () => {
    const lock = lockOf([
      ['TERMS.md', 't\n', true],
      ['AGENTS.md', 'a\n', true],
    ])
    const p1 = planRetirement({ lock, readDisk: disk({ 'AGENTS.md': 'a\n', 'TERMS.md': 't\n' }) })
    expect(Object.keys(p1.counts)).toEqual([...RETIREMENT_STATES])
    expect(p1.files.map((f) => f.path)).toEqual(['AGENTS.md', 'TERMS.md'])
    expect(
      planRetirement({ lock, readDisk: disk({ 'TERMS.md': 't\n', 'AGENTS.md': 'a\n' }) }),
    ).toEqual(p1)
  })

  it('RT-02: managed 且磁盘==期望 → IN_SYNC + delete', () => {
    const lock = lockOf([['AGENTS.md', 'a\n', true]])
    const p = planRetirement({ lock, readDisk: disk({ 'AGENTS.md': 'a\n' }) })
    expect(p.files[0]).toMatchObject({ state: 'IN_SYNC', action: 'delete', managed: true })
    expect(p.removals).toEqual(['AGENTS.md'])
  })

  it('RT-03: managed 但磁盘被改 → DRIFT，默认 keep；force 才 delete', () => {
    const lock = lockOf([['AGENTS.md', 'a\n', true]])
    const kept = planRetirement({ lock, readDisk: disk({ 'AGENTS.md': '用户手改\n' }) })
    expect(kept.files[0]).toMatchObject({ state: 'DRIFT', action: 'keep' })
    expect(kept.removals).toEqual([])
    const forced = planRetirement({
      lock,
      readDisk: disk({ 'AGENTS.md': '用户手改\n' }),
      force: true,
    })
    expect(forced.files[0]?.action).toBe('delete')
    expect(forced.removals).toEqual(['AGENTS.md'])
  })

  it('RT-04: 磁盘不存在一律 ABSENT（managed 任意），不动盘', () => {
    const lock = lockOf([
      ['A.md', 'a', true],
      ['B.md', 'b', false],
    ])
    const p = planRetirement({ lock, readDisk: disk({}) })
    expect(p.files.map((f) => [f.state, f.action])).toEqual([
      ['ABSENT', 'none'],
      ['ABSENT', 'none'],
    ])
  })

  it('RT-05: managed!==true ⇒ FOREIGN，即使磁盘与期望逐字节相同且 force=true 也不删', () => {
    const lock = lockOf([['CLAUDE.md', 'c\n', false]])
    const input = { lock, readDisk: disk({ 'CLAUDE.md': 'c\n' }) }
    expect(planRetirement(input).files[0]?.state).toBe('FOREIGN')
    expect(planRetirement({ ...input, force: true }).removals).toEqual([])
  })

  it('RT-06: .openvibe/ 下的登记项即使 managed=true 也记 FOREIGN（§6.3 教条）', () => {
    const lock = lockOf([['.openvibe/backup/2026T/CLAUDE.md', 'x', true]])
    const p = planRetirement({
      lock,
      readDisk: disk({ '.openvibe/backup/2026T/CLAUDE.md': 'x' }),
      force: true,
    })
    expect(p.files[0]?.state).toBe('FOREIGN')
    expect(p.removals).toEqual([])
  })

  it('RT-07: lock 缺 managed 字段（被手删）按未受管处理，安全侧', () => {
    const lock = {
      ...lockOf([['AGENTS.md', 'a\n', true]]),
      files: [{ path: 'AGENTS.md', sha256: fileSha256('a\n') }],
    } as unknown as PackLock
    expect(planRetirement({ lock, readDisk: disk({ 'AGENTS.md': 'a\n' }) }).files[0]?.state).toBe(
      'FOREIGN',
    )
  })

  it('RT-08: readDisk 抛错原样上抛（不把读失败当成「已自行退场」）', () => {
    const lock = lockOf([['AGENTS.md', 'a\n', true]])
    expect(() =>
      planRetirement({
        lock,
        readDisk: () => {
          throw new Error('EIO')
        },
      }),
    ).toThrow('EIO')
  })
})
