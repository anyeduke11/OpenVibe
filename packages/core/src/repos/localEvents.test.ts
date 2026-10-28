import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'
import { LocalEventsRepo, dayOf } from './localEvents'
import type { LocalEventKind } from '@openvibe/shared'

/**
 * `LocalEventsRepo` 直测。
 *
 * 此前该 repo 只有**顺带**覆盖（`agentIngest.test.ts` 里清空的两值断言、
 * `telemetry-flush.test.ts` 里 countAll > 0），`record` / 时间窗 / 累计 三处**无直测**。
 * 本文件补齐，并把 FR-7 的两条硬判据钉死：
 * ① 边界口径 `[from, to)` **含头不含尾**；
 * ② **窗内计数与累计计数可区分**。
 */

const KIND = 'stage_view_switched' as LocalEventKind

/** 造一条指定 UTC 日的事件（day 由 repo 从 now 派生，故直接传该日的 Date） */
function at(repo: LocalEventsRepo, day: string, kind: LocalEventKind = KIND): number {
  return repo.record({ kind, projectId: 'prj_1' }, new Date(`${day}T12:00:00.000Z`))
}

describe('LocalEventsRepo · record（唯一写入点，FR-3）', () => {
  it('落库返回自增 id，且 `day` 由 UTC 日戳派生而非本机日', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    const id = repo.record({ kind: KIND, projectId: 'prj_1' }, new Date('2026-10-15T23:30:00.000Z'))
    const row = h.db
      .prepare('SELECT id, day, created_at FROM local_events WHERE id = ?')
      .get(id) as {
      id: number
      day: string
      created_at: string
    }
    // 本机时区偏移也改不掉它：日戳必须恒等于 toISOString().slice(0,10)
    expect(row.day).toBe('2026-10-15')
    expect(dayOf(new Date('2026-10-15T23:30:00.000Z'))).toBe('2026-10-15')
    expect(row.created_at).toBe('2026-10-15T23:30:00.000Z')
    h.close()
  })

  it('`payload` 缺省写成 `{}` 而不是 NULL（读侧不必判空）', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    repo.record({ kind: KIND }, new Date('2026-10-15T00:00:00.000Z'))
    const row = h.db.prepare('SELECT payload_json FROM local_events').get() as {
      payload_json: string
    }
    expect(JSON.parse(row.payload_json)).toEqual({})
    h.close()
  })
})

describe('LocalEventsRepo · 时间窗（FR-7：`[from, to)` 含头不含尾）', () => {
  it('**含头不含尾**：`from` 当天计入，`to` 当天**不**计入', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    at(repo, '2026-10-10')
    at(repo, '2026-10-11') // = from ⇒ 应计入
    at(repo, '2026-10-12') // = to   ⇒ 应**不**计入
    at(repo, '2026-10-13') // 窗外

    const rows = repo.summaryInWindow('2026-10-11', '2026-10-12')
    expect(rows).toEqual([{ kind: KIND, day: '2026-10-11', count: 1 }])
    h.close()
  })

  it('跨日：窗内 3 天各 1 条，`byDay` 按 day 倒序（码点序确定性）', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    at(repo, '2026-10-10')
    at(repo, '2026-10-11')
    at(repo, '2026-10-12')
    expect(repo.summaryInWindow('2026-10-01', '2026-10-13').map((r) => r.day)).toEqual([
      '2026-10-12',
      '2026-10-11',
      '2026-10-10',
    ])
    h.close()
  })

  it('from 晚于 to ⇒ 422（不是空数组 —— 静默返回空会让调用方以为「这段时间没事件」）', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    try {
      repo.summaryInWindow('2026-10-12', '2026-10-10')
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as { code: string }).code).toBe('VALIDATION_ERROR')
      expect((e as Error).message).toContain('from 晚于 to')
    }
    h.close()
  })

  it('零宽窗（`from === to`）⇒ 空数组，不是全量', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    at(repo, '2026-10-10')
    expect(repo.summaryInWindow('2026-10-10', '2026-10-10')).toEqual([])
    h.close()
  })
})

describe('LocalEventsRepo · 累计与窗内可区分（FR-7 第二条）', () => {
  it('`cumulativeByKind` **不受时间窗限制**，窗外的老事件也在内', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    at(repo, '2026-09-01') // 远在窗外
    at(repo, '2026-10-11')
    at(repo, '2026-10-11')
    at(repo, '2026-10-11', 'flow_template_run')

    const window = repo.summaryInWindow('2026-10-11', '2026-10-12')
    const windowTotal = window.reduce((s, r) => s + r.count, 0)
    const cumulative = repo.cumulativeByKind()

    expect(windowTotal).toBe(3)
    // 累计含窗外那条 ⇒ 4。若两者相等，用户就分不出「我只看了一段」还是「一直这么多」
    expect(cumulative.reduce((s, r) => s + r.count, 0)).toBe(4)
    expect(cumulative).toEqual([
      { kind: 'flow_template_run', count: 1 },
      { kind: KIND, count: 3 },
    ])
    h.close()
  })

  it('台账为空时两个口径都是 0（不是 undefined、不是 null）', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    expect(repo.summaryInWindow('2026-10-01', '2026-11-01')).toEqual([])
    expect(repo.cumulativeByKind()).toEqual([])
    expect(repo.countAll()).toBe(0)
    h.close()
  })
})

describe('LocalEventsRepo · 一键清空（FR-3.2）', () => {
  it('全表归零**且回传删掉的条数**', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    at(repo, '2026-10-10')
    at(repo, '2026-10-11')
    at(repo, '2026-10-11')
    expect(repo.clearAll()).toBe(3)
    expect(repo.countAll()).toBe(0)
    h.close()
  })

  it('**清空本身不产生「清空事件」行** —— 否则台账凭空多一条，与「归零」自相矛盾', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    at(repo, '2026-10-10')
    repo.clearAll()
    expect(repo.countAll()).toBe(0)
    // 再记一条 ⇒ 仍是 1，不因清空动作多出一行
    at(repo, '2026-10-12')
    expect(repo.countAll()).toBe(1)
    h.close()
  })

  it('对空表清空 ⇒ 回 0，不是报错也不是 undefined', () => {
    const h = newDb()
    const repo = new LocalEventsRepo(h.db)
    expect(repo.clearAll()).toBe(0)
    h.close()
  })
})
