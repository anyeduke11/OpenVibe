import { z } from 'zod'
import { LOCAL_EVENT_KINDS } from '../constants'

/**
 * 本机事件台账的对外形状（local-event-ledger.md FR-4）。
 *
 * **两处刻意的设计**：
 * 1. **窗内计数与累计计数分列**（FR-7）——只给窗内的话，一个只用过两天的用户
 *    会把「这段时间有 3 次」误读成「本机一直这么安静」。两者必须同时在场。
 * 2. **入参只有 `from`/`to`，没有 `days`**——「最近 N 天」是**随读侧时间漂移**的口径，
 *    同一条记录今天查和明天查答案不同。FR-7 要求边界口径唯一，那就只留绝对日窗。
 */

/**
 * UTC 日戳（`YYYY-MM-DD`）。刻意不接受时间戳与时区偏移 —— `day` 列本身就是 UTC 日。
 *
 * ⚠️ **格式合法不等于日期存在**：`2026-10-32` 能过 `\d{4}-\d{2}-\d{2}` 却不是真实日期，
 * 拿它去查 `day >= '2026-10-32' AND day < ...` 会**静默匹配不到任何行** ——
 * 调用方拿到一个空结果，会读成「这段时间没有事件」。故必须做日历有效性校验。
 */
const DayStamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: '日窗需为 YYYY-MM-DD（UTC 日戳）' })
  .refine(
    (s) => {
      // 用 UTC 构造再读回：读回值与原串不等 ⇒ 该日期不存在（如 02-30、13 月、2026-02-29）
      const d = new Date(`${s}T00:00:00.000Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
    },
    { message: '不是真实存在的日期（如 2026-10-32、2026-13-01、非闰年的 02-29）' },
  )

export const LocalEventsQuery = z
  .object({
    /** 含头 */
    from: DayStamp,
    /** **不含尾** */
    to: DayStamp,
  })
  .refine((v) => v.from <= v.to, {
    message: 'from 不得晚于 to（窗为 [from, to) 含头不含尾）',
    path: ['from'],
  })
export type LocalEventsQuery = z.infer<typeof LocalEventsQuery>

export const LocalEventDayCount = z.object({
  day: DayStamp,
  kind: z.enum(LOCAL_EVENT_KINDS),
  count: z.number().int().nonnegative(),
})

export const LocalEventKindCount = z.object({
  kind: z.enum(LOCAL_EVENT_KINDS),
  count: z.number().int().nonnegative(),
})

export const LocalEventsSummaryOut = z.object({
  /** 窗的边界，原样回显：让调用方不必猜自己传进去的是什么 */
  window: z.object({ from: DayStamp, to: DayStamp, inclusive: z.literal('start-only') }),
  /** 窗内按 kind × day（按 day 倒序、kind 升序，码点序确定性） */
  byDay: z.array(LocalEventDayCount),
  /** 窗内按 kind 汇总 */
  byKind: z.array(LocalEventKindCount),
  /** 窗内计数合计 */
  windowTotal: z.number().int().nonnegative(),
  /** **累计**计数（不受窗限制）——与上一条并存，用户才知道自己看到的是一段还是全部 */
  cumulativeTotal: z.number().int().nonnegative(),
  cumulativeByKind: z.array(LocalEventKindCount),
  /** 窗内实际跨的天数（有事件的天数，不是日历跨度） */
  activeDays: z.number().int().nonnegative(),
})
export type LocalEventsSummaryOut = z.infer<typeof LocalEventsSummaryOut>

export const LocalEventsClearOut = z.object({
  /** 被删掉的行数；**必须回传** ——「清空了 0 条」和「清空了 128 条」对用户是两件事 */
  cleared: z.number().int().nonnegative(),
  clearedAt: z.string(),
})
export type LocalEventsClearOut = z.infer<typeof LocalEventsClearOut>
