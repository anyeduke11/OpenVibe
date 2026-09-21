import type { SkillRow } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'
import { btnGhost, btnPrimary, chipCls } from '../ui/styles'

/** 台账列表（m2 FR-3.1）：来源 / 版本数 / 最近扫描时间 + 编辑与删除入口 */
export function SkillList(props: {
  items: SkillRow[]
  loading: boolean
  onEdit: (skill: SkillRow) => void
  onDelete: (skill: SkillRow) => void
  onCreate: () => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-5">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs text-zinc-500">
          <tr>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">{zh.skills.columns.name}</th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.skills.columns.description}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.skills.columns.source}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 text-right font-medium">
              {zh.skills.columns.versions}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.skills.columns.installed}
            </th>
            <th className="border-b border-zinc-100 py-2 font-medium">{zh.projects.labels.updatedAt}</th>
            <th className="border-b border-zinc-100 py-2" />
          </tr>
        </thead>
        <tbody>
          {props.items.map((s) => (
            <tr key={s.id} className="align-top hover:bg-zinc-50">
              <td className="max-w-56 border-b border-zinc-100 py-2 pr-3 font-medium text-zinc-800">
                {s.name}
              </td>
              <td className="max-w-md border-b border-zinc-100 py-2 pr-3 text-xs text-zinc-600">
                <span className="line-clamp-2">{s.description}</span>
              </td>
              <td className="border-b border-zinc-100 py-2 pr-3">
                <span
                  className={`${chipCls} ${
                    s.source === 'local'
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                  }`}
                >
                  {zh.skills.sources[s.source]}
                </span>
              </td>
              <td className="border-b border-zinc-100 py-2 pr-3 text-right text-xs text-zinc-600">
                {String(s.versionCount)}
              </td>
              <td className="border-b border-zinc-100 py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  {s.installedTargets.length === 0 && (
                    <span className="text-xs text-zinc-400">{zh.common.none}</span>
                  )}
                  {s.installedTargets.map((t) => (
                    <span key={t} className={`${chipCls} mono border-zinc-200 bg-white text-zinc-600`}>
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className="border-b border-zinc-100 py-2 pr-3 text-[11px] text-zinc-400">
                {s.updatedAt}
              </td>
              <td className="border-b border-zinc-100 py-2 text-right">
                <button className={btnGhost} onClick={() => props.onEdit(s)}>
                  {zh.flows.actions.edit}
                </button>
                <button
                  className={`${btnGhost} ml-1 text-red-600 hover:border-red-200 hover:bg-red-50`}
                  onClick={() => props.onDelete(s)}
                >
                  {zh.flows.actions.del}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!props.loading && props.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-zinc-500">
          <p>{zh.skills.empty}</p>
          <button className={btnPrimary} onClick={props.onCreate}>
            {zh.skills.create.title}
          </button>
        </div>
      )}
    </div>
  )
}
