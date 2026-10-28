import { useState } from 'react'
import { Icon, type IconName } from '../ui/icons'
import { chipTone, type ChipTone } from '../ui/styles'
import {
  requiredTopicIds,
  resourceModeLabel,
  type LangProfile,
  type ResourceModeLabel,
  type TopicProfileLite,
} from '@openvibe/shared'

/**
 * M9 v1.6 **P1e.3 · 资源页两档模式标记**（`m9-dev-plan-2026-10.md` §6.6 · **DL-39**）。
 *
 * ## 它是什么
 *
 * 资源页每行一个轻量标记，**由「必学知识点集合」反查派生**（§3.20）：
 *
 * ```
 * resource.rlabel(profile) = 覆盖了 ≥1 条 profile.required 的知识点 ? '本模式必学' : '仅扩展阅读'
 * ```
 *
 * ## ⚠️ 为什么**只有两档**（DL-39 的反证腿）
 *
 * §3.20 当场修正过自己上一版的方案：原写三档「精通用 / 熟悉用 / 仅扩展阅读」，
 * 但 DL-33 保证 `familiar.required ⊆ master.required` ⇒ 「熟悉用」在本版**恒为空、
 * 永远不会出现**。**造一个永不出现的档位是最容易写进实现又最难被发现的错。**
 * ⇒ 两档的取值由 `@openvibe/shared` 的 `ResourceModeLabel` **类型**收死，
 *   本组件不许另写第三档，也不许另写一份文案。
 *
 * ⚠️ **P1d 之后 §3.20 的口径补注**（owner 2026-10-20 裁定待裁 #6「真正分开」）：
 *   冷门六条补建后 `master.required`（78）**严格大于** `familiar.required`（72）；
 *   但 `familiar.required ⊆ master.required` **仍然成立**（实测：熟悉必学而精通不必学 = 0）
 *   ⇒ 「熟悉用」**仍是恒空分支** ⇒ **两档实施不仅正确，理由还更强**：
 *   它不必等第三档的取值来源落地。
 *   ⚠️ P1d 曾把这句写成「不再是子集」—— 那是把包含方向说反了，已于 2026-10-20 订正。
 *
 * ## ⚠️ **不新建反向索引**（§3.20）
 *
 * 判定走的是「当前 profile 的必学集合」这一份**已经在手**的集合，**不需要额外索引** ——
 * 反向索引一旦能反向认领知识点，它就会开始定义路线。
 *
 * ## ⚠️ 标记**随模式切换即时重算**，不许要求刷新
 *
 * 本组件在 render 里现算（不缓存、不 memo 到旧模式）⇒ 换 `profile` 立刻变。
 *
 * ## ⚠️ chip 恒是「图标 + 文字」
 *
 * DESIGN.md：chip 承载状态 ⇒ 永远图标 + 文字 + 颜色三通道，不靠颜色单义承载语义。
 */
const TONE: Record<ResourceModeLabel, ChipTone> = {
  本模式必学: 'accent',
  仅扩展阅读: 'default',
}

const ICON: Record<ResourceModeLabel, IconName> = {
  本模式必学: 'check',
  仅扩展阅读: 'book',
}

export interface ResourceModeChipProps {
  /** 当前模式（换它即重算，不需刷新） */
  profile: LangProfile
  /** 这条资源挂接的知识点 id（`lang_topic_resources` 是「知识点 → 资源」单向 ⇒ 这里是反查出来的） */
  topicIds: readonly number[]
  /** 全部「知识点 × 模式」行（`lang_topic_profiles`） */
  profiles: readonly TopicProfileLite[]
  /** 挂接知识点的标题（点开时逐条列出） */
  topicTitles?: readonly { id: number; title: string }[]
}

export function ResourceModeChip(props: ResourceModeChipProps) {
  const { profile, topicIds, profiles, topicTitles = [] } = props
  const [open, setOpen] = useState(false)

  // ⚠️ 现算，不缓存 —— 换模式即换标记（§3.20）
  const label = resourceModeLabel(profile, topicIds, profiles)

  // 点开时列出「这条覆盖了本模式必学里的哪几条」—— 复用既有挂接，不另存清单（§3.20）
  const required = requiredTopicIds(profile, profiles)
  const covered = topicIds.filter((id) => required.has(id))
  const titleOf = (id: number): string => topicTitles.find((t) => t.id === id)?.title ?? `#${id}`

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        aria-expanded={open}
        className={chipTone(TONE[label])}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={ICON[label]} size={12} />
        {label}
      </button>
      {open && (
        <span className="flex flex-col gap-0.5 text-xs text-ink-muted">
          {covered.length === 0 ? (
            <span>这条没有覆盖本模式必学里的知识点</span>
          ) : (
            covered.map((id) => <span key={id}>{titleOf(id)}</span>)
          )}
        </span>
      )}
    </span>
  )
}
