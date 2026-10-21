import { useMemo } from 'react'
import { cardBodyCls, cardCls, cardHeadCls, noteCls, noteTitleCls, tagCls } from '../ui/styles'
import { Icon } from '../ui/icons'
import { ModeOnboarding, type ModeRouteSummary } from './ModeOnboarding'
import { ModeTransferPanel } from './ModeTransferPanel'
import { ResourceModeChip } from './ResourceModeChip'
import { StageTracks } from './StageTracks'
import { useLangModeChoice, useLangModes } from '../../hooks/useLangRoadmap'
import {
  computeTransferPlan,
  requiredTopicIds,
  type LangCode,
  type LangProfile,
  type TopicProfileLite,
  type TopicStageLite,
} from '@openvibe/shared'

/**
 * `apps/web/src/components/dev/ModePanels.tsx` —— **P1e / P1f 四个界面件的挂载处**
 * （`m9-dev-language-roadmap.md` §3.18 / §3.19 / §3.20 / §3.21 · dev-plan §6.6 / §6.7）
 *
 * ## 它是什么
 *
 * 把四个**早就写好、但一直没有挂载**的组件接到**真实读端**上：
 *
 * | 组件 | 规格 | 数据从哪来 |
 * |---|---|---|
 * | `ModeOnboarding` | §3.19 首次进入的一次性提问 | `app_meta` 里的模式选择（**不进 `lang_*`**） |
 * | `ModeTransferPanel` | §3.18 速成 → 精通的转档 | `computeTransferPlan`（shared 的纯计算层） |
 * | `ResourceModeChip` | §3.20 资源的两档模式标记 | `lang_topic_resources` 的**反查** |
 * | `StageTracks` | §3.21 阶段 × 轨道 | `lang_stage_tracks` |
 *
 * ## ⚠️ 为什么挂在这里（开发能力页）
 *
 * 这四个组件都属于「**开发能力**」这条线（§3.5 的页面职责）⇒ 挂在该页，
 * 而不是新开一个页面（新建页面要动导航与路由，超出「把组件接上」的范围）。
 *
 * ## ⚠️ 模式选择**只问一次**（§3.19 第 1 条）
 *
 * 判据是「答过就不再问」⇒ 判据的载体是**服务端存下来的选择**，
 * 不是组件的本地 state ⇒ 刷新页面、换设备，答案都还在。
 *
 * ## ⚠️ 当前模式只有两档（§3.19 只有两个选项）
 *
 * 「熟悉」不是首屏选项（它是「以后要深入再来」里的中间态）⇒
 * 资源标记的 `profile` 取 **`master` 或 `vibe`**，不猜「熟悉」。
 */
const L = {
  section: '学习模式与阶段',
  routesTitle: '两种学法的路线',
  transferTitle: '从速成转档',
  resourcesTitle: '资源与模式',
  resourcesHint: '每条资源标着它在当前模式下是「必学」还是「扩展阅读」。',
  modeMaster: '精通',
  modeVibe: '速成',
  currentMode: (p: LangProfile): string => (p === 'master' ? L.modeMaster : L.modeVibe),
  stageTitle: (n: number): string => `阶段 ${String(n)}`,
  noStage: '这个阶段没有轨道。',
  emptyResources: '还没有资源。',
} as const

export interface ModePanelsProps {
  /** 当前语言（`null` = 还没选语言 ⇒ 转档那部分不渲染） */
  lang: LangCode | null
  /** 当前项目（`null` ⇒ 没有「已点亮」那批数据） */
  projectId: string | null
}

/** 两门语言的路线概览（答「以后要深入再来」时展示）。 */
function useModeRoutes(
  data: { topics: TopicStageLite[]; profiles: TopicProfileLite[] } | undefined,
): ModeRouteSummary[] {
  return useMemo(() => {
    if (data === undefined) return []
    return (['python', 'go'] as const).map((code) => ({
      lang: code,
      masterStations: stationCount(code, 'master', data.topics, data.profiles),
      familiarStations: stationCount(code, 'familiar', data.topics, data.profiles),
    }))
  }, [data])
}

/**
 * **首次进入的一次性提问**（§3.19）—— 单独一个组件，挂到页面**顶部**。
 *
 * ⚠️ **答过就不渲染**（判据载体在服务端：`app_meta` 里的模式选择）
 *   ⇒ 刷新、换设备，答案都还在（§3.19 第 1 条「只问一次」）。
 *
 * ⚠️ **跳过与速成走同一个出口** —— `ModeOnboarding` 内部只有一个 `onAnswer`，
 *   本组件**不另开分支**（DL-38 断的就是「渲染逐字相同」）。
 */
export function ModeOnboardingPanel({ projectId }: { projectId: string | null }) {
  const modes = useLangModes(projectId ?? undefined)
  const choice = useLangModeChoice()
  const data = modes.data
  const routes = useModeRoutes(data)

  if (data === undefined || data.mode_choice !== null) return null

  return (
    <ModeOnboarding
      initialAnswer={null}
      masterRoutes={routes}
      onAnswer={(c) => {
        choice.mutate(c)
      }}
    />
  )
}

/** 某门语言在某模式下的站数（**站数口径与 `computeTransferPlan` 一致**）。 */
function stationCount(
  lang: LangCode,
  mode: 'master' | 'familiar',
  topics: readonly TopicStageLite[],
  profiles: readonly TopicProfileLite[],
): number {
  const stages = new Set<number>()
  if (mode === 'master') {
    for (const t of topics) {
      // ⚠️ 库级条目**不进路线**（DL-12：它的 stage_id 恒为 0）
      if (t.lang === lang && t.kind === 'language') stages.add(t.stage_id)
    }
  } else {
    // ⚠️ **必学集只走 shared 的那一个反查函数**（口径只留一处）
    const required = requiredTopicIds('familiar', profiles)
    for (const t of topics) {
      if (t.lang === lang && t.kind === 'language' && required.has(t.id)) stages.add(t.stage_id)
    }
  }
  return stages.size
}

export function ModePanels({ lang, projectId }: ModePanelsProps) {
  const modes = useLangModes(projectId ?? undefined)
  const data = modes.data

  if (data === undefined) return null

  const currentProfile: LangProfile = data.mode_choice === 'master' ? 'master' : 'vibe'
  const plan =
    lang === null
      ? null
      : computeTransferPlan({
          profile: 'vibe',
          lang,
          litTopicIds: new Set(data.lit_topic_ids),
          topics: data.topics,
          profiles: data.profiles,
        })
  const stageIds = [...new Set(data.stage_tracks.map((t) => t.stage_id))].sort((a, b) => a - b)

  return (
    <section className={cardCls} aria-label={L.section}>
      <div className={cardHeadCls}>
        <Icon name="sparkle" size={14} className="text-ink-faint" />
        <h2 className="text-sm font-semibold text-ink">{L.section}</h2>
        <span className={tagCls}>{L.currentMode(currentProfile)}</span>
      </div>
      <div className={`${cardBodyCls} flex flex-col gap-4`}>
        {/* ⚠️ §3.18：转档**只给位置，不给结论** */}
        {plan !== null ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-ink-muted">{L.transferTitle}</h3>
            <ModeTransferPanel lang={lang as LangCode} plan={plan} />
          </div>
        ) : null}

        {/* ⚠️ §3.21：阶段 × 轨道（逐阶段一节） */}
        {stageIds.map((stageId) => {
          const rows = data.stage_tracks.filter((t) => t.stage_id === stageId)
          if (rows.length === 0) return null
          return (
            <div key={stageId} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-ink-muted">{L.stageTitle(stageId)}</h3>
              <StageTracks stageId={stageId} tracks={rows} />
            </div>
          )
        })}

        {/* ⚠️ §3.20：资源的两档模式标记 */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-ink-muted">{L.resourcesTitle}</h3>
          <p className="text-[11.5px] text-ink-faint">{L.resourcesHint}</p>
          {data.resources.length === 0 ? (
            <p className="text-[13.5px] text-ink-muted">{L.emptyResources}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.resources.slice(0, 12).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <a
                    className="text-[13.5px] text-ink underline decoration-line-strong underline-offset-2"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.name}
                  </a>
                  <ResourceModeChip
                    profile={currentProfile}
                    topicIds={r.topic_ids}
                    profiles={data.profiles}
                    topicTitles={r.topic_titles}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {modes.isError ? (
          <div className={noteCls('warn')}>
            <strong className={noteTitleCls}>模式数据读取失败</strong>
            <p className="text-[11.5px]">模式相关的面板暂时取不到数据，其余功能照常。</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
