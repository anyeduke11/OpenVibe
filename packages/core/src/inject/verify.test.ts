import { describe, expect, it } from 'vitest'
import { planVerify } from './verify'

/**
 * v0.2.3 批次 B FR-4：三方一致性核验的六态判定（纯函数）。
 * 端到端腿（真 lock/真磁盘/真子进程）在 apps/cli/test/verify.test.ts。
 */

const base = {
  missing: [] as string[],
  drifted: [] as { path: string; expected: string; actual: string }[],
  markedUnregistered: [] as string[],
  latestExportVersion: null as string | null,
  packVersion: '1.0.0',
}

describe('planVerify 六态判定（v0.2.3 批次 B FR-4）', () => {
  it('CONSISTENT：无任何偏差且无更新版本 → 退出码 0', () => {
    const plan = planVerify(base)
    expect(plan.state).toBe('CONSISTENT')
    expect(plan.exitCode).toBe(0)
    expect(plan.fix).toBe('')
  })

  it('PARTIAL：lock 登记文件缺失 ⇒ 疑似中断，优先于一切（与漂移并存仍报 PARTIAL）', () => {
    const plan = planVerify({
      ...base,
      missing: ['CHECKLIST.md'],
      drifted: [{ path: 'TERMS.md', expected: 'a'.repeat(64), actual: 'b'.repeat(64) }],
    })
    expect(plan.state).toBe('PARTIAL')
    expect(plan.exitCode).toBe(2)
    expect(plan.reason).toContain('疑似上次注入中断')
    expect(plan.fix).toContain('sync --dry-run')
  })

  it('ORPHAN：带标记的未登记产物，无缺失时成立', () => {
    const plan = planVerify({ ...base, markedUnregistered: ['MINI.md'] })
    expect(plan.state).toBe('ORPHAN')
    expect(plan.exitCode).toBe(2)
    expect(plan.fix).toContain('sync')
  })

  it('DISK_DRIFT：有漂移、无缺失、无弃儿', () => {
    const plan = planVerify({
      ...base,
      drifted: [{ path: 'TERMS.md', expected: 'a'.repeat(64), actual: 'b'.repeat(64) }],
    })
    expect(plan.state).toBe('DISK_DRIFT')
    expect(plan.exitCode).toBe(2)
    expect(plan.fix).toContain('openvibe diff')
  })

  it('STALE_LOCK：服务端有更新导出版本（本地完全一致）', () => {
    const plan = planVerify({ ...base, latestExportVersion: '1.1.0' })
    expect(plan.state).toBe('STALE_LOCK')
    expect(plan.exitCode).toBe(2)
    expect(plan.newer).toEqual({ from: '1.0.0', to: '1.1.0' })
  })

  it('同版本或更旧版本不判 STALE_LOCK（compareSemver 口径）', () => {
    expect(planVerify({ ...base, latestExportVersion: '1.0.0' }).state).toBe('CONSISTENT')
    expect(planVerify({ ...base, latestExportVersion: '0.9.0' }).state).toBe('CONSISTENT')
  })

  it('优先级链：ORPHAN > DISK_DRIFT > STALE_LOCK（最严重的先报，明细仍全量在列）', () => {
    const drifted = [{ path: 'TERMS.md', expected: 'a'.repeat(64), actual: 'b'.repeat(64) }]
    const all = planVerify({
      ...base,
      markedUnregistered: ['MINI.md'],
      drifted,
      latestExportVersion: '2.0.0',
    })
    expect(all.state).toBe('ORPHAN')
    expect(all.drifted).toEqual(drifted)
    expect(all.newer).toEqual({ from: '1.0.0', to: '2.0.0' })

    expect(planVerify({ ...base, drifted, latestExportVersion: '2.0.0' }).state).toBe('DISK_DRIFT')
  })

  it('修复建议只指向既有命令（verify 自身永不写盘）', () => {
    for (const plan of [
      planVerify({ ...base, missing: ['x'] }),
      planVerify({ ...base, markedUnregistered: ['y'] }),
      planVerify({ ...base, drifted: [{ path: 'z', expected: 'a', actual: 'b' }] }),
      planVerify({ ...base, latestExportVersion: '9.9.9' }),
    ]) {
      expect(plan.fix).not.toContain('verify 写')
      expect(plan.fix).toMatch(/sync|diff/)
    }
  })
})
