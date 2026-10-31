import { describe, expect, it } from 'vitest'
import { planVerify } from './verify'

/**
 * v0.2.3 批次 B FR-4：三方一致性核验的六态判定（纯函数）。
 * 端到端腿（真 lock/真磁盘/真子进程）在 apps/cli/test/verify.test.ts。
 *
 * ⚠️ **2026-10-31（R0 · 证据诚实）本文件有一处语义变更，不是测试修补**：
 *   旧语义把「本地三项干净但服务端未探测」判成 `CONSISTENT`（退出码 0），
 *   而 PRD v0.2.4 F7 指出这让「没问过服务端」与「真的一致」共享同一个词。
 *   ⇒ 新语义：服务端**不可达**（`probedOnline=false`）时判 `UNVERIFIED`，退出码 2。
 *   ⇒ 「问到了服务端但该包没有导出记录」（`probedOnline=true`）**仍是** `CONSISTENT`
 *     —— 那是确定结论（「没有更新版本」），不是未知。
 */

const base = {
  missing: [] as string[],
  drifted: [] as { path: string; expected: string; actual: string }[],
  markedUnregistered: [] as string[],
  latestExportVersion: null as string | null,
  packVersion: '1.0.0',
  /** 默认：服务端可达（问过了）⇒ 无导出记录是确定结论，不是未知 */
  probedOnline: true,
}

/** 服务端不可达（离线 / 探测失败）时的输入形态 */
const offline = { ...base, probedOnline: false }

describe('planVerify 七态判定（v0.2.3 批次 B FR-4 ＋ v0.2.4 R0 证据诚实）', () => {
  it('CONSISTENT：无任何偏差且已探到服务端（无更新版本）→ 退出码 0', () => {
    const plan = planVerify(base)
    expect(plan.state).toBe('CONSISTENT')
    expect(plan.exitCode).toBe(0)
    expect(plan.fix).toBe('')
  })

  it('⚠️ UNVERIFIED：服务端不可达 ⇒ 不得判 CONSISTENT（这是 R0 的核心判据）', () => {
    // 旧语义在此返回 CONSISTENT + 退出码 0 ⇒ 人以为「AI 读到的就是我认可的最新版」，
    // 实际服务端根本没查。⇒ 新语义必须显式说「未核验」。
    const plan = planVerify(offline)
    expect(plan.state).toBe('UNVERIFIED')
    expect(plan.exitCode).toBe(2)
    expect(plan.reason).toContain('未核验')
    // ⚠️ 文案里不许出现「一致」二字 ⇒ 「一致」与「没问过」不许共享一个词
    expect(plan.reason).not.toContain('一致')
  })

  it('UNVERIFIED：服务端不可达但本地有缺失 ⇒ 仍报 PARTIAL（本地破坏更严重）', () => {
    const plan = planVerify({ ...offline, missing: ['CHECKLIST.md'] })
    expect(plan.state).toBe('PARTIAL')
    expect(plan.exitCode).toBe(2)
  })

  it('UNVERIFIED：服务端不可达但有漂移 ⇒ 仍报 DISK_DRIFT（本地事实优先）', () => {
    const plan = planVerify({
      ...offline,
      drifted: [{ path: 'TERMS.md', expected: 'a'.repeat(64), actual: 'b'.repeat(64) }],
    })
    expect(plan.state).toBe('DISK_DRIFT')
  })

  it('问到了服务端但无导出记录 ⇒ 仍是 CONSISTENT（确定结论，不是未知）', () => {
    // ⚠️ 这条是「不可达」与「没有记录」的**分界**：前者是未知，后者是已知为空。
    //   首次使用（还没导出过标准包）的用户不该被判成异常。
    const plan = planVerify({ ...base, probedOnline: true, latestExportVersion: null })
    expect(plan.state).toBe('CONSISTENT')
    expect(plan.exitCode).toBe(0)
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

  it('优先级链：ORPHAN > DISK_DRIFT > STALE_LOCK > UNVERIFIED（最严重的先报，明细仍全量在列）', () => {
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
    // ⚠️ UNVERIFIED 是**最低**优先级：本地有事实问题时，报事实；本地干净才说「未核验」
    expect(planVerify({ ...offline, latestExportVersion: '2.0.0' }).state).toBe('STALE_LOCK')
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

  it('UNVERIFIED 的修复建议指向「联网后再核」，且不承诺能自动修好', () => {
    const plan = planVerify(offline)
    expect(plan.fix).toMatch(/联网|服务端|token/i)
    // ⚠️ 不可核验不是「本地坏了」⇒ 不该建议 sync/diff（那会误导用户去改好的东西）
    expect(plan.fix).not.toMatch(/^openvibe sync/)
    expect(plan.fix).not.toMatch(/^openvibe diff/)
  })
})
