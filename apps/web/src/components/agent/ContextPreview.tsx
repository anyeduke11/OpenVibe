import { useState } from 'react'
import { CONTEXT_FIELDS, type ProjectContextOut } from '@openvibe/shared'
import { agentZh, AGENT_ADAPTER_LABELS } from '../../i18n/lane-agent'
import { useProjectContext } from '../../hooks/useAgentIngests'
import { noteCls } from '../ui/styles'

/**
 * 上下文预览（`m8-agent-panel.md` FR-5.1.3）。
 *
 * ## 三条硬纪律，逐条对应 spec
 *
 * **FR-5.1.3.1 · `truncated` 必须可见。** ⚠️ 出参里 `truncated` 是**数组**（`TruncationNote[]`），
 * 不是布尔 —— 所以判据是 `length > 0`，不是 `=== true`。写成布尔判断会**永远为假**，
 * 于是裁剪静默发生，而 spec 要的正是「不得静默截断」。
 *
 * **FR-5.1.2.1 · 内容不可信。** 本区显示的是 `detail` 等服务端拼好的说明串，
 * 全部按**纯文本**渲染（`{…}` 而非 `dangerouslySetInnerHTML`）。
 *
 * **字段段名单一出处。** 六个段名直接取 `CONTEXT_FIELDS`，不在前端另写一份
 * —— 那正是 FR-3.3 用 422 拒非法段名要守的东西，前端复制一份即第二真源。
 */

export function ContextPreview(props: { projectId: string | null }) {
  // 默认不裁剪（undefined = 服务端给默认集）；用户勾选后才带 ?fields=
  const [picked, setPicked] = useState<readonly string[] | undefined>(undefined)
  const q = useProjectContext(props.projectId, picked)

  if (q.isLoading) return <p className="py-3 text-sm text-ink-faint">{agentZh.context.loading}</p>
  // ⚠️ 取数失败**不在本区自造 error 空态** —— 三态空态由列表区统一管（FR-5.4），
  // 两处各造一套会让「哪一块坏了」说不清。这里只报一行不阻断。
  if (q.isError) return <p className="py-3 text-xs text-ink-faint">{agentZh.context.readFailed}</p>
  if (!q.data) return null

  return (
    <div className="space-y-2">
      <FieldPicker picked={picked} onChange={setPicked} />
      <TruncatedBanner data={q.data} />
      <p className="text-xs text-ink-muted">
        {agentZh.context.charCount(measure(q.data), q.data.fields.length)}
      </p>
    </div>
  )
}

function FieldPicker(props: {
  picked: readonly string[] | undefined
  onChange: (v: readonly string[] | undefined) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-muted">{agentZh.context.fieldsLabel}</span>
      <button
        type="button"
        className={chip(props.picked === undefined)}
        onClick={() => props.onChange(undefined)}
      >
        {agentZh.context.fieldsAll}
      </button>
      {CONTEXT_FIELDS.map((f) => (
        <button
          key={f}
          type="button"
          className={chip(props.picked?.includes(f) ?? false)}
          onClick={() => props.onChange(toggle(props.picked, f))}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

/**
 * 裁剪说明条（FR-5.1.3.1）。
 *
 * **为什么逐条列出而不是只说一句「已截断」**：调用方（也包括人）需要知道
 * **丢的是哪一段、丢了多少**——`detail` 已经是服务端拼好的人读说明，直接显示即可，
 * 不要在前端二次拼文案（那会与服务层的口径漂移）。
 */
function TruncatedBanner(props: { data: ProjectContextOut }) {
  if (props.data.truncated.length === 0) return null
  return (
    <div className={`${noteCls('warn')} space-y-1`}>
      <p className="text-xs font-medium">{agentZh.context.truncatedBanner}</p>
      <ul className="list-disc pl-4 text-xs">
        {props.data.truncated.map((t) => (
          <li key={`${t.section}-${t.detail}`}>
            {t.section} · {t.detail}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 接入指引的 adapter 清单（FR-5.1.4.1：**不在前端硬编码平台清单**）。
 *
 * ⚠️ 标签表 `AGENT_ADAPTER_LABELS` 的键类型是 `Record<string, string>`，
 * 所以**编译期不会**因为 `ADAPTER_IDS` 增项而红 —— 增项时这里会显示成 `undefined`。
 * 这是已知缺口：要把类型收紧成 `Record<AdapterId, string>` 就得让 lane 文件 import
 * `@openvibe/shared`，那会给 i18n 层加一条对 shared 的依赖（现形制是 i18n 不依赖业务包）。
 * ⇒ 交给 §7 的 WEB-M8E-13 用例守住（新增 adapter 而无标签 ⇒ 该支红）。
 */
export function adapterLabel(id: string): string {
  return AGENT_ADAPTER_LABELS[id] ?? id
}

function chip(on: boolean): string {
  return `rounded-sm border px-1.5 py-0.5 text-xs ${
    on ? 'border-accent-line bg-accent-soft text-accent-deep' : 'border-line text-ink-muted'
  }`
}

function toggle(picked: readonly string[] | undefined, f: string): readonly string[] | undefined {
  if (picked === undefined) return [f]
  return picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f]
}

/** 粗略量级：只用于给人数「这次拿到了多少」，不参与任何判定，故不追求精确 */
function measure(d: ProjectContextOut): number {
  try {
    return JSON.stringify(d).length
  } catch {
    return 0
  }
}
