import type { FlowTemplateOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { btnDanger, btnGhost, chipCls } from '../ui/styles'

/** 模板卡（dev-plan §5.2）：阶段/检查项概览 + 编辑/复制/删除入口 */
export function FlowTemplateCard(props: {
  template: FlowTemplateOut
  projectCount: number
  onEdit: (t: FlowTemplateOut) => void
  onDuplicate: (t: FlowTemplateOut) => void
  onDelete: (t: FlowTemplateOut) => void
}) {
  const { template } = props
  const itemCount = template.stages.reduce((sum, s) => sum + s.checklist.length, 0)
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4">
      <header className="flex items-start gap-2">
        <h3 className="text-sm font-semibold">{template.name}</h3>
        <span
          className={`${chipCls} ml-auto shrink-0 ${
            template.builtin
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-zinc-200 bg-zinc-50 text-zinc-600'
          }`}
        >
          {template.builtin ? zh.flows.builtin : zh.flows.custom}
        </span>
      </header>
      <p className="text-xs text-zinc-500">
        {zh.flows.kinds[template.kind]} · {zh.flows.stageCount(template.stages.length)} ·{' '}
        {zh.flows.itemCount(itemCount)}
      </p>
      <ol className="flex flex-wrap gap-1 text-[11px] text-zinc-600">
        {template.stages.map((s, i) => (
          <li key={s.name} className="rounded border border-zinc-100 bg-zinc-50 px-1.5 py-0.5">
            {String(i + 1)}. {s.name}
          </li>
        ))}
      </ol>
      <footer className="mt-auto flex items-center gap-1.5 pt-1">
        {template.builtin ? (
          <>
            <button className={btnGhost} onClick={() => props.onDuplicate(template)}>
              {zh.flows.actions.duplicate}
            </button>
            <span className="ml-auto text-[11px] text-zinc-400">{zh.flows.builtinReadonly}</span>
          </>
        ) : (
          <>
            <button className={btnGhost} onClick={() => props.onEdit(template)}>
              {zh.flows.actions.edit}
            </button>
            <button className={btnGhost} onClick={() => props.onDuplicate(template)}>
              {zh.flows.actions.duplicate}
            </button>
            <button className={btnDanger} onClick={() => props.onDelete(template)}>
              {zh.flows.actions.del}
            </button>
          </>
        )}
        <span className="ml-auto text-[11px] text-zinc-400">
          {props.projectCount > 0 && zh.flows.inUseBy(props.projectCount)}
        </span>
      </footer>
    </article>
  )
}
