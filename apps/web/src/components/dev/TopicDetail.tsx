import { Link } from 'react-router-dom'
import { Icon } from '../ui/icons'
import { chipTone, noteCls, noteTitleCls, proseCls, tagCls } from '../ui/styles'
import { MasteryChip } from './MasteryChip'
import { COLD_TOPIC_NOTE, type TopicDetailOut } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.3 · 知识点详情**（`m9-dev-language-roadmap.md` §3.5 / §3.7 / §3.12 / §3.15
 *   · dev-plan §6.9 P3.3）
 *
 * ## 它是什么
 *
 * 一个知识点的详情：**三段**（步骤 / 样例 / 原理解析）＋ **差异**（两门语言差在哪）
 * ＋ **外链**（去哪儿补这条）＋ **术语挂接**（跳到术语库）。
 *
 * ## ⚠️ 缺的那一段**不渲染**，不填自撰文案
 *
 * §3.17 第 5 条的同款纪律：源里没有的东西不许自撰填充 —— 界面在为空时整段不出现。
 *
 * ## ⚠️ 冷门知识点的补充说明常驻
 *
 * §6.3 第 2 条：「详情页必须写明『**本项目永远可能用不到它**（冷门知识点）』」
 * ⇒ 零证据时显示这句（文案在 `@openvibe/shared` 的 `COLD_TOPIC_NOTE`，口径只留一处）。
 */
const L = {
  steps: '步骤',
  example: '样例',
  principle: '原理解析',
  deltas: '两门语言的差异',
  resources: '去哪儿补这条',
  terms: '相关术语',
  noDeltas: '这一条没有登记语言差异。',
  noResources: '这一条还没有挂接学习资源。',
  noTerms: '这一条没有挂接术语。',
  open: '打开',
  coldNote: COLD_TOPIC_NOTE,
  station: (n: number) => `第 ${String(n)} 站`,
  loading: '正在读这个知识点…',
  empty: '选左边一条知识点看详情。',
  roleLabels: { primary: '首选', backup: '备选', practice: '练习' } as Record<string, string>,
} as const

export interface TopicDetailProps {
  detail: TopicDetailOut | null
  loading: boolean
}

export function TopicDetail({ detail, loading }: TopicDetailProps) {
  if (loading) {
    return <p className="text-sm text-ink-muted">{L.loading}</p>
  }
  if (detail === null) {
    return <p className="text-sm text-ink-muted">{L.empty}</p>
  }

  const sections: { title: string; body: string | null }[] = [
    { title: L.steps, body: detail.content.steps },
    { title: L.example, body: detail.content.example },
    { title: L.principle, body: detail.content.principle },
  ]

  return (
    <article aria-label="知识点详情" className="flex min-w-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-ink">{detail.title}</h2>
        <MasteryChip state={detail.state} />
        <span className="text-[11.5px] text-ink-faint">{L.station(detail.stage_no)}</span>
      </header>

      {detail.state === 'unused' ? (
        <div className={noteCls('info')}>
          <strong className={noteTitleCls}>关于这一条</strong>
          {L.coldNote}
        </div>
      ) : null}

      {sections.map((s) =>
        s.body === null ? null : (
          <section key={s.title} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-ink-muted">{s.title}</h3>
            <div className={`${proseCls} text-sm leading-[1.7] text-ink-body`}>{s.body}</div>
          </section>
        ),
      )}

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-ink-muted">{L.deltas}</h3>
        {detail.deltas.length === 0 ? (
          <p className="text-sm text-ink-faint">{L.noDeltas}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {detail.deltas.map((d) => (
              <li key={d.aspect} className="rounded-md border border-line bg-panel px-2.5 py-2">
                <span className={tagCls}>{d.aspect}</span>
                <p className="mt-1 text-sm leading-[1.7] text-ink-body">{d.summary}</p>
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  {d.since_version}
                  {d.until_version === null ? '' : ` — ${d.until_version}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-ink-muted">{L.resources}</h3>
        {detail.resources.length === 0 ? (
          <p className="text-sm text-ink-faint">{L.noResources}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {detail.resources.map((r) => (
              <li key={`${r.role}|${r.name}`}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${chipTone('default')} no-underline hover:border-line-strong`}
                >
                  <Icon name="dl" size={12} />
                  {r.name}
                  <span className="text-ink-faint">{L.roleLabels[r.role] ?? r.role}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-ink-muted">{L.terms}</h3>
        {detail.terms.length === 0 ? (
          <p className="text-sm text-ink-faint">{L.noTerms}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {detail.terms.map((t) => (
              <li key={t.term_id}>
                <Link
                  to="/terms"
                  className={`${chipTone('default')} no-underline hover:border-line-strong`}
                >
                  <Icon name="term" size={12} />
                  {t.zh}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
