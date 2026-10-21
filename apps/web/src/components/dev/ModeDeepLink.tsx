import { useEffect, useState } from 'react'
import { Icon } from '../ui/icons'
import { noteCls, noteTitleCls } from '../ui/styles'
import { resolveProfileFromHash, type LangProfile } from '@openvibe/shared'

/**
 * M9 v1.6 **P1f.4 · 模式页深链落档**（`m9-dev-plan-2026-10.md` §6.7 · **DL-43**）。
 *
 * ## 它是什么
 *
 * §3.21 第 5 条：配套方案的每条轨道带 `links` 指回本指南的锚点 ⇒ 本模块的模式页需要
 * **稳定可深链的锚点**（`#mode-vibe` / `#mode-master` / `#mode-familiar`），
 * 且**打开某一档时要真的落在那一档**（不是「进入后再自己点一次」）。
 *
 * ## ⚠️ **URL 片段优先于** §3.19 的 onboarding 默认模式
 *
 * 这是**一条会让实现者想反着写的规则**（直觉是「onboarding 先问、锚点后覆盖」）：
 * 用户是**从别人给的链接进来的**，那个链接指向哪一档，就该落哪一档。
 * ⇒ 判据 DL-43 把它钉死。
 *
 * ## ⚠️ 片段变化要跟得上
 *
 * 模式页可能在同一文档里切档（不改路由、只改 hash）⇒ 必须听 `hashchange`。
 */
export interface ModeDeepLinkProps {
  /** 三档各自的内容 */
  views: Record<LangProfile, React.ReactNode>
  /** 深链来源（默认读 `window.location.hash`；测试可注入） */
  hashSource?: () => string
  /** 没有深链时的默认档（§3.19 的 onboarding 默认） */
  fallbackProfile?: LangProfile
  /** 落档变化时的回调（P3 可用它同步侧栏） */
  onProfileChange?: (profile: LangProfile) => void
}

export function ModeDeepLink(props: ModeDeepLinkProps) {
  const { views, fallbackProfile = 'vibe', onProfileChange, hashSource } = props
  const readHash = (): string => (hashSource ?? (() => window.location.hash))()

  const [profile, setProfile] = useState<LangProfile>(
    () => resolveProfileFromHash(readHash()) ?? fallbackProfile,
  )

  useEffect(() => {
    const onHashChange = (): void => {
      // ⚠️ **与初次渲染读同一处**（`readHash`）—— 注入源只管一半的话，
      //   「首次落档」与「切档落点」会走两套口径。
      const next = resolveProfileFromHash(readHash()) ?? fallbackProfile
      setProfile(next)
      onProfileChange?.(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [fallbackProfile, onProfileChange, hashSource])

  return (
    <section aria-label="模式内容" data-profile={profile}>
      {views[profile]}
    </section>
  )
}

/**
 * 深链锚点的提示条（**可选**）：让用户知道自己是从哪一档进来的。
 *
 * ⚠️ 单独抽出来是因为它**只在深链命中时**才出现 ——
 *   直接进入（无深链）时多一行「你从 #mode-master 进来」是纯噪音。
 */
export function ModeDeepLinkHint(props: { profile: LangProfile; hash: string }): React.ReactNode {
  const { profile, hash } = props
  if (resolveProfileFromHash(hash) === null) return null
  return (
    <div className={noteCls('info')}>
      <strong className={noteTitleCls}>深链落档</strong>
      <span className="inline-flex items-center gap-1">
        <Icon name="target" size={12} />
        {hash} ⇒ {profile}
      </span>
    </div>
  )
}
