import { useState } from 'react'
import { ADAPTER_IDS, type AdapterId } from '@openvibe/shared'
import { agentZh } from '../../i18n/lane-agent'
import { adapterLabel } from './ContextPreview'

/**
 * 接入指引（`m8-agent-panel.md` FR-5.1.4）。
 *
 * ## 两条红线
 *
 * **只生成指令文本，不代执行**（FR-5.1.4）。理由与 PRD-M8 §3.1 技能边界表一致 ——
 * 注入是**人的决定**，agent 与面板都不能替他按下那个键（B21）。
 * ⇒ 本组件**没有**任何会写目标项目目录的调用，只有「生成字符串」与「复制到剪贴板」。
 *
 * **平台清单不在前端硬编码**（FR-5.1.4.1）：清单取 `@openvibe/shared` 的 `ADAPTER_IDS`
 * （那才是单源），标签取 `lane-agent` 的映射表。⚠️ 标签表键类型是 `Record<string, string>`，
 * 增 adapter 而忘加标签时**编译不会红**，显示成 id 本身 ——
 * 该缺口由 §7 的 **WEB-M8E-13** 用例守住（新增 adapter 而无标签 ⇒ 该支红）。
 */

/** 六项单源 ⇒ 每个 adapter 一条 `openvibe pack` 的目标参数。仅生成文本，不执行。 */
export function installCommand(id: AdapterId): string {
  return `openvibe pack export --targets ${id}`
}

export function InstallGuide() {
  const [picked, setPicked] = useState<AdapterId>('claude-code')
  const [copied, setCopied] = useState(false)
  const cmd = installCommand(picked)

  const copy = async (): Promise<void> => {
    // ⚠️ `navigator.clipboard` 在非安全上下文（http 明文）下不存在 ⇒ 必须判，
    // 否则点了按钮静默失败，用户以为复制好了。
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">{agentZh.install.hint}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted">{agentZh.install.pickAdapter}</span>
        {ADAPTER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`rounded-sm border px-1.5 py-0.5 text-xs ${
              id === picked
                ? 'border-accent-line bg-accent-soft text-accent-deep'
                : 'border-line text-ink-muted'
            }`}
            onClick={() => setPicked(id)}
          >
            {adapterLabel(id)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-sm bg-panel-2 px-2 py-1 font-mono text-xs">
          {cmd}
        </code>
        <button
          type="button"
          className="rounded-sm border border-line-strong px-2 py-1 text-xs"
          onClick={() => void copy()}
        >
          {copied ? agentZh.install.copied : agentZh.install.copy}
        </button>
      </div>
    </div>
  )
}
