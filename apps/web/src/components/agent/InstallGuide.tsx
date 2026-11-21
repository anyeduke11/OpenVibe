import { useState } from 'react'
import { ADAPTER_IDS, buildSetupScript, type AdapterId } from '@openvibe/shared'
import { agentZh } from '../../i18n/lane-agent'
import { adapterLabel } from './ContextPreview'

/**
 * 接入指引（`m8-agent-panel.md` FR-5.1.4）—— **多选平台 + 一键复制接入脚本**。
 *
 * ## 它生成什么
 *
 * 一段可整段复制的脚本，含两步：
 * 1. `openvibe sync <项目路径> --target …` —— 把标准包写进项目（**这才是真实接入动作**）；
 * 2. 逐平台的 MCP 配置片段 —— 让 agent 能查项目上下文。
 *
 * ## ⚠️ 三条红线（逐条对应 spec）
 *
 * **只生成文本，不代执行**（FR-5.1.4 / B21）：注入是**人的决定**，面板不替他按键。
 * ⇒ 本组件没有任何写目标目录的调用，只有「生成字符串」与「复制到剪贴板」。
 *
 * **平台清单不在前端硬编码**（FR-5.1.4.1）：清单取 `ADAPTER_IDS`，
 * 各平台的 MCP 配置口径取 `MCP_GUIDE`（`packages/shared`）—— 两处都是单源。
 *
 * **口径诚实**：`MCP_GUIDE` 的每条都带 `source`，且 `verified` 全为 `false`
 * （本机未实测，见 `DEV_LOG` 的「握手差异未实测」登记）。**不把参考当实测**。
 */

/** 单个平台的 sync 靶标（供单平台场景与测试复用） */
export function installCommand(id: AdapterId, projectPath = '.'): string {
  return `openvibe sync ${projectPath} --target ${id}`
}

export function InstallGuide({ projectPath }: { projectPath: string | null }) {
  const [picked, setPicked] = useState<AdapterId[]>(['claude-code'])
  const [copied, setCopied] = useState(false)

  const script = buildSetupScript(projectPath ?? '', picked)

  const toggle = (id: AdapterId): void =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const copy = async (): Promise<void> => {
    // ⚠️ `navigator.clipboard` 在非安全上下文（http 明文）下不存在 ⇒ 必须判，
    // 否则点了按钮静默失败，用户以为复制好了。
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return
    await navigator.clipboard.writeText(script)
    setCopied(true)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">{agentZh.install.hint}</p>

      {/* 多选平台：清单来自 ADAPTER_IDS（单源），标签来自 adapterLabel */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted">{agentZh.install.pickAdapter}</span>
        {ADAPTER_IDS.map((id) => {
          const on = picked.includes(id)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              className={`rounded-sm border px-1.5 py-0.5 text-xs ${
                on
                  ? 'border-accent-line bg-accent-soft text-accent-deep'
                  : 'border-line text-ink-muted'
              }`}
              onClick={() => toggle(id)}
            >
              {adapterLabel(id)}
            </button>
          )
        })}
        <button
          type="button"
          className="rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink-muted"
          onClick={() => setPicked(picked.length === ADAPTER_IDS.length ? [] : [...ADAPTER_IDS])}
        >
          {picked.length === ADAPTER_IDS.length
            ? agentZh.install.clearAll
            : agentZh.install.selectAll}
        </button>
      </div>

      {/* 脚本预览：等宽 + 可横向滚动，长路径不撑破布局 */}
      {picked.length === 0 ? (
        <p className="text-xs text-ink-faint">{agentZh.install.pickOne}</p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-sm bg-panel-2 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-ink-body">
          {script}
        </pre>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-sm border border-line-strong px-2 py-1 text-xs"
          disabled={picked.length === 0}
          onClick={() => void copy()}
        >
          {copied ? agentZh.install.copied : agentZh.install.copy}
        </button>
        <span className="text-[11px] text-ink-faint">{agentZh.install.verifiedNote}</span>
      </div>
    </div>
  )
}
