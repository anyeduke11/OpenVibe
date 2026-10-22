import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../../api/client'
import { Section } from './SettingsSections'
import { tagCls } from '../ui/styles'
import { btnGhost } from '../ui/styles'

/**
 * 设置页的**「源码出网记录」**区（增强 1 · dev-plan §6.11 后的增强项）。
 *
 * ## 它是什么
 *
 * 列出「**哪些项目出网过、出网过几次**」。
 *
 * ## ⚠️ 为什么单独一区，而不是挂在「源码授权记忆」下面
 *
 * 出网**不等于**被记住过：用户当次勾了片段发出去、但没点「记住」⇒
 * 这一笔在 `lang_source_shares` 里，却**不在** `lang_source_consent` 里。
 * ⇒ 若把计数挂在「被记住过的项目」列表上，**当次授权的出网会整段消失**
 *   —— 恰好是最该被看见的那部分（§3.9）。
 *
 * ## ⚠️ 清除记忆**不改变**这里的数字
 *
 * 记忆是「下次的默认选择」，出网是「已经发生的事实」⇒
 * 清除记忆不撤销历史。本区**只读**，没有清除按钮。
 *
 * ## ⚠️ 这里只显示**计数**，不含任何源码内容
 *
 * `lang_source_shares` 里本来就没有内容列（只存计数 ＋ 授权来源）
 * ⇒ 这一区能显示的东西，**天然**不含片段正文与文件路径。
 */
const L = {
  title: '源码出网记录',
  hint: '每一次出网都记了一笔（只存条数与授权来源，不存代码内容）。「清除授权记忆」只影响下次的默认勾选，不撤销这里的历史。计数分三类：记忆带过去 / 自己又全勾了一遍 / 用户自己勾的。',
  empty: '还没有任何出网记录。',
  shareCount: (n: number) => `出网 ${String(n)} 次`,
  snippetTotal: (n: number) => `累计 ${String(n)} 条片段`,
  lastAt: '最近',
  /**
   * ⚠️ **三类是「细分」**（owner 2026-10-22 裁决四：加一列区分「记忆带过去」与「用户自己全勾」）。
   *
   * ⚠️ **「记忆带过去」这个说法在这一栏里指「记忆起了作用」**（`memory_applied`），
   *   **不含**「用户自己又全勾了一遍」（`user_reticked`）——
   *   两者在二分里**都**记成 `remembered`，审计时分不开 ⇒ 才有了这三类。
   */
  memoryApplied: (n: number) => `记忆带过去 ${String(n)} 次`,
  userReticked: (n: number) => `自己又全勾 ${String(n)} 次`,
  selfTicked: (n: number) => `用户自己勾 ${String(n)} 次`,
  dailyTitle: '按日明细',
  dailyHint: '按 UTC 日聚合的出网分类计数（审计问法：「这个月有多少次是用户自己全勾的」）。',
  dailyOpen: '展开按日明细',
  dailyClose: '收起按日明细',
  dailyEmpty: '这段时间没有出网记录。',
  dailyDay: (d: string) => d,
  dailyProject: (p: string) => p,
  providerTitle: '按 provider 分组',
  providerHint:
    '按「哪一家 provider 答的」聚合（复盘问法：「哪一家更准、哪一家更贵」）。provider 配置改过之后，改之前出的网会归到「未知」那一组 —— 不会并进现在这家。',
  providerOpen: '展开按 provider 分组',
  providerClose: '收起按 provider 分组',
  providerEmpty: '这段时间没有出网记录。',
  /** ⚠️ **provider 标识为空 = 未知**（配置改之前出的网）⇒ 不许显示成空白 */
  providerUnknown: '未知',
  providerModel: (m: string) => m,
  providerUsage: (n: number) => `用量 ${String(n)} token`,
  providerUsageUnknown: '用量未知',
  providerUsagePartial: (known: number, total: number) => `（已知 ${String(known)}/${String(total)} 次）`,
} as const

interface ShareSummaryItem {
  project_id: string
  share_count: number
  snippet_total: number
  topic_total: number
  last_shared_at: string
  explicit_tick_count: number
  remembered_count: number
  /** 细分：记忆起了作用（§3.9 的 `consent_detail`） */
  memory_applied_count: number
  /** 细分：记忆是「全发」，但用户自己又全勾了一遍 */
  user_reticked_count: number
}

interface ShareByProviderItem {
  provider: string
  model: string
  share_count: number
  snippet_total: number
  usage_total_tokens: number | null
  usage_known_count: number
}

interface ShareDailyItem {
  day: string
  project_id: string
  share_count: number
  snippet_total: number
  memory_applied_count: number
  user_reticked_count: number
  self_ticked_count: number
}

/** UTC 日（与 `shared/utils.ts` 的 `dayOf` 同口径 —— 不另写一个本机日形态）。 */
function utcDay(offsetDays = 0): string {
  const t = Date.now() - offsetDays * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * **按日明细**（折叠在「源码出网记录」区里）。
 *
 * ⚠️ **窗口是显式绝对窗口**（`from` / `to` 传给服务端）——
 *   不给「近 N 天」那种相对窗口：相对 `date('now')` 的读端会**随日历漂移**。
 *   ⚠️ 默认的 30 天只是**默认窗口**（跟着今天走是 UI 的正常行为，不是判据）。
 */
function ShareDailyTable() {
  const from = utcDay(30)
  const to = utcDay(-1)
  const daily = useQuery({
    queryKey: ['lang-share-daily', from, to],
    queryFn: () =>
      apiJson<{ daily: ShareDailyItem[] }>(
        `/api/lang/source/share-daily?from=${from}&to=${to}`,
      ),
    staleTime: 30_000,
  })
  const rows = daily.data?.daily ?? []

  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-muted">{L.dailyEmpty}</p>
  }
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {rows.map((r) => (
        <li
          key={`${r.day}-${r.project_id}`}
          className="flex flex-wrap items-center gap-2 border-b border-line-hair pb-1 last:border-b-0"
        >
          <span className="mono text-[12px] text-ink">{L.dailyDay(r.day)}</span>
          <span className="mono text-[12px] text-ink-muted">{L.dailyProject(r.project_id)}</span>
          <span className={tagCls}>{L.shareCount(r.share_count)}</span>
          <span className="text-[11.5px] text-ink-faint">
            {`${L.memoryApplied(r.memory_applied_count)} · ${L.userReticked(r.user_reticked_count)} · ${L.selfTicked(r.self_ticked_count)}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * **按 provider 分组**（折叠在「源码出网记录」区里 · owner 2026-10-22 增强 1）。
 *
 * ⚠️ **窗口是显式绝对窗口**（与「按日明细」同款）⇒ 不随日历漂移。
 * ⚠️ **「未知」那一组必须显示出来** —— provider 配置改过 ⇒ 改之前出的网没有标识
 *   ⇒ 悄悄并进现在这家 = 假数。
 */
function ShareByProviderTable() {
  const from = utcDay(30)
  const to = utcDay(-1)
  const groups = useQuery({
    queryKey: ['lang-share-by-provider', from, to],
    queryFn: () =>
      apiJson<{ groups: ShareByProviderItem[] }>(
        `/api/lang/source/share-by-provider?from=${from}&to=${to}`,
      ),
    staleTime: 30_000,
  })
  const rows = groups.data?.groups ?? []

  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-muted">{L.providerEmpty}</p>
  }
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {rows.map((r) => (
        <li
          key={`${r.provider}|${r.model}`}
          className="flex flex-wrap items-center gap-2 border-b border-line-hair pb-1 last:border-b-0"
        >
          <span className="mono text-[12px] text-ink">
            {r.provider === '' ? L.providerUnknown : r.provider}
          </span>
          {r.model !== '' && (
            <span className="mono text-[12px] text-ink-muted">{L.providerModel(r.model)}</span>
          )}
          <span className={tagCls}>{L.shareCount(r.share_count)}</span>
          <span className="text-[11.5px] text-ink-muted">{L.snippetTotal(r.snippet_total)}</span>
          <span className="text-[11.5px] text-ink-faint">
            {r.usage_total_tokens === null
              ? L.providerUsageUnknown
              : `${L.providerUsage(r.usage_total_tokens)}${
                  r.usage_known_count < r.share_count
                    ? ` ${L.providerUsagePartial(r.usage_known_count, r.share_count)}`
                    : ''
                }`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SourceShareSection() {
  const [dailyOpen, setDailyOpen] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const list = useQuery({
    queryKey: ['lang-share-summary'],
    queryFn: () =>
      apiJson<{ summaries: ShareSummaryItem[] }>('/api/lang/source/share-summary'),
  })

  const items = list.data?.summaries ?? []

  return (
    <Section
      title={L.title}
      icon="dl"
      hint={L.hint}
      aside={
        <span className={tagCls}>{`${String(items.length)} 个项目`}</span>
      }
      foot={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnGhost}
            aria-expanded={dailyOpen}
            onClick={() => setDailyOpen((v) => !v)}
          >
            {dailyOpen ? L.dailyClose : L.dailyOpen}
          </button>
          <button
            type="button"
            className={btnGhost}
            aria-expanded={providerOpen}
            onClick={() => setProviderOpen((v) => !v)}
          >
            {providerOpen ? L.providerClose : L.providerOpen}
          </button>
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="text-[13.5px] text-ink-muted">{L.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((s) => (
            <li
              key={s.project_id}
              className="flex flex-wrap items-center gap-2 border-b border-line-hair pb-1.5 last:border-b-0"
            >
              <span className="mono text-[13px] text-ink">{s.project_id}</span>
              <span className={tagCls}>{L.shareCount(s.share_count)}</span>
              <span className="text-[11.5px] text-ink-muted">
                {L.snippetTotal(s.snippet_total)}
              </span>
              <span className="text-[11.5px] text-ink-faint">
                {`${L.memoryApplied(s.memory_applied_count)} · ${L.userReticked(s.user_reticked_count)} · ${L.selfTicked(s.explicit_tick_count)}`}
              </span>
              <span className="ml-auto text-[11.5px] text-ink-faint">
                {`${L.lastAt} ${s.last_shared_at}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dailyOpen && (
        <div className="mt-3 border-t border-line-hair pt-2">
          <p className="text-[12.5px] text-ink-muted">{L.dailyHint}</p>
          <ShareDailyTable />
        </div>
      )}
      {providerOpen && (
        <div className="mt-3 border-t border-line-hair pt-2">
          <p className="text-[12.5px] text-ink-muted">{L.providerHint}</p>
          <ShareByProviderTable />
        </div>
      )}
    </Section>
  )
}
