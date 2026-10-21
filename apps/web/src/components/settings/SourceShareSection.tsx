import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../../api/client'
import { Section } from './SettingsSections'
import { tagCls } from '../ui/styles'

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
  hint: '每一次出网都记了一笔（只存条数与授权来源，不存代码内容）。「清除授权记忆」只影响下次的默认勾选，不撤销这里的历史。',
  empty: '还没有任何出网记录。',
  shareCount: (n: number) => `出网 ${String(n)} 次`,
  snippetTotal: (n: number) => `累计 ${String(n)} 条片段`,
  lastAt: '最近',
  explicit: (n: number) => `当次勾选 ${String(n)} 次`,
  remembered: (n: number) => `记忆带过去 ${String(n)} 次`,
} as const

interface ShareSummaryItem {
  project_id: string
  share_count: number
  snippet_total: number
  topic_total: number
  last_shared_at: string
  explicit_tick_count: number
  remembered_count: number
}

export function SourceShareSection() {
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
                {`${L.explicit(s.explicit_tick_count)} · ${L.remembered(s.remembered_count)}`}
              </span>
              <span className="ml-auto text-[11.5px] text-ink-faint">
                {`${L.lastAt} ${s.last_shared_at}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
