import { Section } from './SettingsSections'
import { tagCls } from '../ui/styles'
import { toast } from '../ui/Toaster'
import { useLangModeChoice, useLangModes } from '../../hooks/useLangRoadmap'
import type { ModeChoice } from '@openvibe/shared'

/**
 * 设置页的**「学习模式」**区（§3.19 第 1 条的另一半）。
 *
 * ## 为什么要有这一区
 *
 * §3.19 第 1 条：「**只问一次** —— 答过就不再问（**可在设置页重选**，
 * 但不在每次进入时再问一遍）」。
 * ⇒ 只做「首屏问一次」而**不给重选入口**，等于把「答错」变成**不可挽回**：
 *   选了速成的人半年后想深入，界面上**没有任何地方**能改（首屏已经不再问了）。
 * ⇒ 这一区就是那个「唯一能改的地方」。
 *
 * ## ⚠️ 模式选择**不进 `lang_*`**
 *
 * §3.19 第 3 条：选项属用户偏好，**不得写进 `lang_topic_state`**，
 * 也不得进 `lang_profiles` 派生任何状态 ⇒ 落点由服务端处理（`app_meta`），
 * 界面**不自己存**。
 */
const L = {
  title: '学习模式',
  hint: '这一条决定「学哪些、先学哪个、看到多深」，不影响掌握度判定。改完立即生效。',
  vibe: '直接带着 AI 写项目，我只需要看懂它在写什么',
  master: '我要系统学这门语言',
  current: '当前',
  saved: '已更新学习模式。',
  failed: '保存失败。',
} as const

export function LangModeSection() {
  const modes = useLangModes()
  const choice = useLangModeChoice()
  const current = modes.data?.mode_choice ?? null

  const pick = (value: ModeChoice): void => {
    choice.mutate(value, {
      onSuccess: () => {
        toast(L.saved)
      },
      onError: () => {
        toast(L.failed)
      },
    })
  }

  return (
    <Section
      title={L.title}
      icon="compass"
      hint={L.hint}
      aside={current === null ? null : <span className={tagCls}>{L.current}</span>}
    >
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[13.5px] text-ink-body">
          <input
            type="radio"
            name="m9-lang-mode"
            checked={current === 'vibe'}
            disabled={choice.isPending}
            onChange={() => {
              pick('vibe')
            }}
          />
          {L.vibe}
        </label>
        <label className="flex items-center gap-2 text-[13.5px] text-ink-body">
          <input
            type="radio"
            name="m9-lang-mode"
            checked={current === 'master'}
            disabled={choice.isPending}
            onChange={() => {
              pick('master')
            }}
          />
          {L.master}
        </label>
      </div>
    </Section>
  )
}
