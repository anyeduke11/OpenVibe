import { useState } from 'react'
import { cardBodyCls, cardCls, cardHeadCls, h1Cls, h1SubCls } from '../components/ui/styles'
import { Icon } from '../components/ui/icons'
import { StageColumn } from '../components/dev/StageColumn'
import { TopicLayer } from '../components/dev/TopicLayer'
import { TopicDetail } from '../components/dev/TopicDetail'
import { DualPlanTimeline } from '../components/dev/DualPlanTimeline'
import { LanguageCompare } from '../components/dev/LanguageCompare'
import { PracticePrinciples } from '../components/dev/PracticePrinciples'
import { useLangRoadmap, useLangTopic } from '../hooks/useLangRoadmap'
import { LANG_CODES, LANGUAGE_ASPECTS, type LangCode } from '@openvibe/shared'

/**
 * M9 v1.6 **P3 · 「开发能力」页**（`m9-dev-language-roadmap.md` §3.5 · dev-plan §6.9 P3）。
 *
 * ## 它是什么
 *
 * 侧栏 `assets` 组里紧跟「术语」之后的那一项：**开发能力**。
 * 六处界面里的「知识点页」＋「两门对照」都在这一页（源码解读抽屉是 P4）。
 *
 * ## ⚠️ 首屏是**一门语言一个卡片**（§3.5）
 *
 * 「不做语言列表页 —— 那又是一层点击」⇒ 卡片直接放在首屏，卡片上写
 * 「N 个知识点 / 你在第 M 站」。
 *
 * ## ⚠️ 「你在第 M 站」只给**位置**，不给**结论**（§3.18）
 *
 * 文案是「**你站到第 M 站**」——⚠️ **不许写「你已完成第 M 站」**：
 * 点亮一条知识点 ≠ 完成那一站（§3.18 的核心纪律）。
 *
 * ## ⚠️ 掌握度只认「用过」
 *
 * 三态文案取自 `@openvibe/shared`（P2 落的）⇒ 页面里不另写一遍。
 */
const L = {
  title: '开发能力',
  sub: '按项目里的真实代码痕迹，标出这门语言你用到过哪些知识点。',
  langNames: { python: 'Python', go: 'Go' } as Record<LangCode, string>,
  topicCount: (n: number) => `${String(n)} 个知识点`,
  station: (n: number) => `你站到第 ${String(n)} 站`,
  pick: '看这条语言的路线',
  dualPlan: '双修规划',
  compare: '两门对照',
  principles: '练习原则',
  loadFailed: '路线读不出来——先确认本机库已播种 M9 知识点。',
} as const

/**
 * Go 的「选学」提示语**引用对照表**（§3.22.2：「并发模型」与「典型领域」两行
 * 正是 owner 把 Go 定为选学的理由 ⇒ 提示语不许另写一句）。
 *
 * ⚠️ **维度名取自表，不在本文件另写一份** —— 改了对照表，这一行跟着改。
 */
const GO_HINT_ASPECTS = ['并发模型', '典型领域'] as const
const goHint = `选学依据：${GO_HINT_ASPECTS.map(
  (n) => LANGUAGE_ASPECTS.find((a) => a.aspect === n)?.aspect ?? n,
).join(' · ')}（见下方对照表）`

export function DevAbilityPage() {
  const [lang, setLang] = useState<LangCode | null>(null)
  const [stageNo, setStageNo] = useState<number | null>(null)
  const [topicId, setTopicId] = useState<number | null>(null)

  const views = {
    python: useLangRoadmap('python'),
    go: useLangRoadmap('go'),
  }
  const current = lang === null ? null : views[lang].data ?? null
  const detail = useLangTopic(topicId)

  const station =
    current === null || stageNo === null
      ? null
      : (current.stations.find((s) => s.stage_no === stageNo) ?? null)

  return (
    <div className="px-7 py-6">
      <h1 className={h1Cls}>{L.title}</h1>
      <p className={h1SubCls}>{L.sub}</p>

      {/* 首屏：两门语言各一张卡片（§3.5） */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {LANG_CODES.map((code) => {
          const v = views[code].data
          const on = code === lang
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              className={`${cardCls} min-w-[236px] px-3.5 py-3 text-left transition-colors ${
                on ? 'border-accent-line bg-accent-soft' : 'hover:border-line-strong'
              }`}
              onClick={() => {
                setLang(code)
                setStageNo(null)
                setTopicId(null)
              }}
            >
              <span className="flex items-center gap-2">
                <Icon name="compass" size={15} className="text-ink-faint" />
                <span className="text-sm font-semibold text-ink">{L.langNames[code]}</span>
                {code === 'go' ? (
                  <span className="text-[11.5px] text-ink-faint">{goHint}</span>
                ) : null}
              </span>
              {v === undefined ? (
                <span className="mt-1 block text-[13.5px] text-ink-faint">{L.loadFailed}</span>
              ) : (
                <>
                  <span className="mt-1 block text-[13.5px] text-ink-muted">
                    {L.topicCount(v.topic_count)} · {L.station(v.current_stage)}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-faint">{L.pick}</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* 主视图：左站列 ＋ 右当前层（§3.5） */}
      {current !== null ? (
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <StageColumn
              stations={current.stations}
              currentStage={current.current_stage}
              selectedStage={stageNo}
              onSelect={(n) => {
                setStageNo(n)
                setTopicId(null)
              }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <TopicLayer
                station={station ?? current.stations.find((s) => s.stage_no === current.current_stage) ?? null}
                selectedTopicId={topicId}
                onSelectTopic={setTopicId}
              />
              <TopicDetail detail={detail.data ?? null} loading={detail.isLoading} />
            </div>
          </div>

          {/* 三块静态面板（§3.22） */}
          <div className="flex flex-col gap-4">
            <section className={cardCls} aria-label={L.dualPlan}>
              <div className={cardHeadCls}>
                <Icon name="layers" size={14} className="text-ink-faint" />
                <h2 className="text-sm font-semibold text-ink">{L.dualPlan}</h2>
              </div>
              <div className={cardBodyCls}>
                <DualPlanTimeline />
              </div>
            </section>

            <section className={cardCls} aria-label={L.compare}>
              <div className={cardHeadCls}>
                <Icon name="flow" size={14} className="text-ink-faint" />
                <h2 className="text-sm font-semibold text-ink">{L.compare}</h2>
              </div>
              <div className={cardBodyCls}>
                <LanguageCompare />
              </div>
            </section>

            <section className={cardCls} aria-label={L.principles}>
              <div className={cardHeadCls}>
                <Icon name="sparkle" size={14} className="text-ink-faint" />
                <h2 className="text-sm font-semibold text-ink">{L.principles}</h2>
              </div>
              <div className={cardBodyCls}>
                <PracticePrinciples />
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}
