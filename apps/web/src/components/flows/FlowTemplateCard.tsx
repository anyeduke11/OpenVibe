import type { FlowTemplateOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  cardBodyCls,
  cardCls,
  cardHeadCls,
  chipTone,
  tagCls,
} from '../ui/styles'

/**
 * 模板卡（dev-plan §5.2）：阶段 / 检查项概览 + 问答运行 / 编辑 / 复制 / 删除入口。
 * 卡头放「运行」这一支主动作（它是这张卡唯一能立刻推进事情的动作），其余进卡体行内次操作。
 */
export function FlowTemplateCard(props: {
  template: FlowTemplateOut
  projectCount: number
  onRun: (t: FlowTemplateOut) => void
  onEdit: (t: FlowTemplateOut) => void
  onDuplicate: (t: FlowTemplateOut) => void
  onDelete: (t: FlowTemplateOut) => void
}) {
  const { template } = props
  const itemCount = template.stages.reduce((sum, s) => sum + s.checklist.length, 0)
  const hasPrompts = template.stages.some((s) => (s.prompt ?? '').trim() !== '')
  return (
    <article className={cardCls}>
      <header className={cardHeadCls}>
        <h3 className="truncate text-sm font-semibold text-ink">{template.name}</h3>
        {/* 「内置 / 自定义」是状态，恒走「图标 + 文字 + 颜色」三通道 */}
        <span
          className={`${chipTone(template.builtin ? 'accent' : 'default')} gap-1 whitespace-nowrap`}
        >
          <Icon name={template.builtin ? 'lock' : 'copy'} size={11} />
          {template.builtin ? zh.flows.builtin : zh.flows.custom}
        </span>
        {hasPrompts && (
          <button
            className={`${btnPrimary} ml-auto h-7 px-2 py-0 text-xs`}
            onClick={() => props.onRun(template)}
          >
            <Icon name="pulse" size={13} />
            {zh.flows.actions.run}
          </button>
        )}
      </header>

      <div className={cardBodyCls}>
        <p className="text-[11px] text-ink-muted">
          {`${zh.flows.kinds[template.kind]} · ${zh.flows.stageCount(template.stages.length)} · ${zh.flows.itemCount(itemCount)}`}
        </p>

        {/* 阶段链是这条模板的骨架信息：tag（纯文字元信息）而不是 chip —— 它没有状态语义 */}
        <ol className="mt-1.5 flex flex-wrap gap-1">
          {template.stages.map((s, i) => (
            <li key={s.name} className={tagCls}>
              {`${String(i + 1)}. ${s.name}`}
            </li>
          ))}
        </ol>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {template.builtin ? (
            <>
              <button
                className={`${btnGhost} h-7 px-2 py-0 text-xs`}
                onClick={() => props.onDuplicate(template)}
              >
                {zh.flows.actions.duplicate}
              </button>
              <span className="text-[11px] text-ink-faint">{zh.flows.builtinReadonly}</span>
            </>
          ) : (
            <>
              <button
                className={`${btnGhost} h-7 px-2 py-0 text-xs`}
                onClick={() => props.onEdit(template)}
              >
                {zh.flows.actions.edit}
              </button>
              <button
                className={`${btnGhost} h-7 px-2 py-0 text-xs`}
                onClick={() => props.onDuplicate(template)}
              >
                {zh.flows.actions.duplicate}
              </button>
              <button
                className={`${btnDanger} ml-auto h-7 px-2 py-0 text-xs`}
                onClick={() => props.onDelete(template)}
              >
                {zh.flows.actions.del}
              </button>
            </>
          )}
          <span className="w-full text-[11px] tabular-nums text-ink-faint">
            {props.projectCount > 0 && zh.flows.inUseBy(props.projectCount)}
          </span>
        </div>
      </div>
    </article>
  )
}
