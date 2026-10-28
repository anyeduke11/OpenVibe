import type { TermRecommendationsResponse } from '@openvibe/shared'
import { cardCls, chipTone, skelCls, tagCls } from '../ui/styles'

/**
 * m3 FR-6 · 「本项目该掌握」的呈现。
 *
 * ⚠️ **本组件刻意不显示任何 AI 字样**。FR-6.3.3 最后一行是本 spec 最重的一条：
 * 降级时**不得**把基线结果包装成 AI 的输出。P3 只有基线层，所以界面上根本
 * 不存在「AI 推荐」这个标签 —— 不是条件渲染隐藏，是**没有这段代码**。
 * P4 落地时必须同时补上「source === 'ai' 才显示 AI 标记」的正向分支，
 * 否则那条判据（AI-M3T-03）没有可被证伪的对照。
 */

const REASON_LABEL: Record<
  TermRecommendationsResponse['items'][number]['reasons'][number]['kind'],
  string
> = {
  checklist: '清单命中',
  stage: '阶段名',
  skill: '绑定 Skill',
  domain: '领域重合',
}

export interface TermRecommendationPanelProps {
  data: TermRecommendationsResponse | undefined
  loading: boolean
  error: unknown
}

export function TermRecommendationPanel({ data, loading, error }: TermRecommendationPanelProps) {
  if (loading) {
    return (
      <section className={`${cardCls} px-4 py-3`} aria-busy="true">
        <p className="text-xs font-semibold text-ink-muted">本项目该掌握的术语</p>
        <div className={`${skelCls} mt-2 h-12`} />
      </section>
    )
  }

  if (error !== null && error !== undefined) {
    return (
      <section className={cardCls}>
        <p className="px-4 py-3 text-xs text-warn">术语推荐读取失败：{String(error)}</p>
      </section>
    )
  }

  const items = data?.items ?? []
  const domains = data?.projectDomains ?? []

  return (
    <section className={cardCls} aria-label="本项目该掌握的术语">
      <header className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <h2 className="text-xs font-semibold text-ink-muted">本项目该掌握的术语</h2>
        {data !== undefined ? (
          <span className="text-[11px] text-ink-faint">
            {`门槛 ${data.threshold} · 上限 ${data.limit}`}
          </span>
        ) : null}
      </header>

      {domains.length > 0 ? (
        <p className="px-4 pt-1 text-[11px] text-ink-faint">
          {`项目领域由阶段名与绑定 Skill 反推：${domains.join('、')}`}
        </p>
      ) : null}

      <div className="px-4 py-2.5">
        {items.length === 0 ? (
          <p className="text-[11.5px] text-ink-faint">
            {domains.length === 0
              ? '推不出项目领域，先给项目配几个阶段名（阶段名本身命中术语时才会推出领域）。'
              : '当前项目的清单与绑定 Skill 里没有出现词库里的术语，没有够门槛的推荐。'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.termId} className="flex items-start gap-2">
                <span className={`${tagCls} shrink-0`}>{item.level}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink-body">
                    {item.zh}
                    {item.en !== null && item.en !== '' ? (
                      <span className="ml-1.5 text-[11px] text-ink-faint">{item.en}</span>
                    ) : null}
                  </p>
                  {/* FR-6.4：必须显示「为什么推给你」——没有这句用户无从判断该不该信 */}
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {item.reasons
                      .map((r) =>
                        r.kind === 'domain'
                          ? `${REASON_LABEL[r.kind]}「${r.text}」`
                          : `${REASON_LABEL[r.kind]}：${r.text}`,
                      )
                      .join('　')}
                  </p>
                </div>
                <span
                  className={`${chipTone('info')} shrink-0`}
                >{`${item.score.toFixed(1)} 分`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
