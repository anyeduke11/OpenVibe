import type { PlaybookMatch, PlaybookOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { AssetEmpty, AssetError, AssetNoResults, AssetSkeleton } from '../library/AssetStates'
import { Highlight, rangesOf } from '../ui/Highlight'
import { LedgerShell, RowActions } from '../ui/LedgerTable'
import { Icon, type IconName } from '../ui/icons'
import { btnPrimary, chipTone, ledgerHeadCls, tagCls } from '../ui/styles'

export interface PlaybookRowView {
  playbook: PlaybookOut
  matches: PlaybookMatch[]
}

/** 状态 = 三通道（图标 + 文字 + 颜色） */
const STATUS: Record<PlaybookOut['status'], { cls: string; icon: IconName }> = {
  draft: { cls: chipTone('default'), icon: 'doc' },
  published: { cls: chipTone('ok'), icon: 'check' },
}

/**
 * 技巧台账表（DESIGN.md 内容面 = 台账密度 + 可读性）。
 * 四态齐：加载走骨架、错误给 note + 重试、无结果给「清除筛选」、真空给「新建技巧」。
 * 超长内容在单元格内两行截断呈现——截断只发生在展示层，入库字节与渲染字节不受影响（m4 §6.8）。
 */
export function PlaybooksTable(props: {
  rows: PlaybookRowView[]
  selected: string[]
  loading: boolean
  error: string | null
  filtered: boolean
  onClearFilters: () => void
  onRetry: () => void
  onCreate: () => void
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onEdit: (playbook: PlaybookOut) => void
  onDelete: (playbook: PlaybookOut) => void
}) {
  const { rows, selected } = props
  const selectedSet = new Set(selected)
  const allShown = rows.length > 0 && rows.every((r) => selectedSet.has(r.playbook.id))

  const body = () => {
    if (props.loading) return <AssetSkeleton rows={8} />
    if (props.error !== null) return <AssetError message={props.error} onRetry={props.onRetry} />
    if (rows.length === 0)
      return props.filtered ? (
        <AssetNoResults what="技巧" onClear={props.onClearFilters} />
      ) : (
        <AssetEmpty
          message={zh.playbooks.empty}
          action={
            <button className={btnPrimary} onClick={props.onCreate}>
              <Icon name="plus" size={12} />
              {zh.playbooks.newPlaybook}
            </button>
          }
        />
      )
    return (
      // `table-fixed`：七列的 `w-*` 才是承诺；table-auto 会让「正确做法」吃掉全部余量，
      // 把状态 chip 挤到中文竖排。正确做法是唯一弹性列，其余按声明宽。
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className={`sticky top-0 z-10 bg-panel text-left ${ledgerHeadCls}`}>
          <tr className="border-b border-line">
            <th className="w-8 px-5 py-1.5" />
            <th className="w-56 px-2 py-1.5">{zh.playbooks.columns.scenario}</th>
            <th className="w-56 px-2 py-1.5">{zh.playbooks.columns.problem}</th>
            <th className="px-2 py-1.5">{zh.playbooks.columns.practice}</th>
            {/* 反例弱色一档（DESIGN.md Components：反例不得与正确做法争视觉权重） */}
            <th className="w-48 px-2 py-1.5">{zh.playbooks.columns.antiPractice}</th>
            <th className="w-24 px-2 py-1.5 whitespace-nowrap">{zh.playbooks.columns.verified}</th>
            {/* 状态列要装下「chip + 编辑 + 删除」三件，窄了内容会溢出到视口外 */}
            <th className="w-44 px-2 py-1.5 whitespace-nowrap">{zh.playbooks.columns.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ playbook, matches }) => {
            const status = STATUS[playbook.status]
            return (
              <tr
                key={playbook.id}
                className={`border-b border-line-hair align-top hover:bg-panel-2 ${
                  selectedSet.has(playbook.id) ? 'bg-accent-soft' : ''
                }`}
              >
                <td className="px-5 py-2">
                  <input
                    type="checkbox"
                    aria-label={playbook.scenario}
                    checked={selectedSet.has(playbook.id)}
                    onChange={() => props.onToggle(playbook.id)}
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    className="text-left text-[15px] font-semibold leading-tight text-ink-body transition-colors hover:text-accent"
                    onClick={() => props.onEdit(playbook)}
                  >
                    <Highlight text={playbook.scenario} ranges={rangesOf(matches, 'scenario')} />
                  </button>
                  {/* 标签是元信息 → tag，不是 chip */}
                  {playbook.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {playbook.tags.map((t) => (
                        <span key={t} className={tagCls}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-ink-body">
                  <Highlight text={playbook.problem} ranges={rangesOf(matches, 'problem')} />
                </td>
                <td className="px-2 py-2 text-ink-body">
                  <div className="line-clamp-3">
                    <Highlight text={playbook.practice} ranges={rangesOf(matches, 'practice')} />
                  </div>
                </td>
                <td className="px-2 py-2 text-xs text-ink-muted">
                  {playbook.antiPractice === '' ? (
                    <span className="text-ink-faint">{zh.playbooks.antiPracticeNone}</span>
                  ) : (
                    <div className="line-clamp-3">
                      <Highlight
                        text={playbook.antiPractice}
                        ranges={rangesOf(matches, 'antiPractice')}
                      />
                    </div>
                  )}
                </td>
                {/* 亲测有效用文字标注，不用颜色单义（m4 FR-4.3） */}
                <td className="px-2 py-2">
                  {playbook.verified ? (
                    <span className={`${chipTone('ok')} gap-1`}>
                      <Icon name="check" size={11} />
                      {zh.playbooks.verifiedMark}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-faint">{zh.playbooks.unverifiedMark}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <span className={`${status.cls} shrink-0 gap-1 whitespace-nowrap`}>
                      <Icon name={status.icon} size={11} />
                      {zh.playbooks.status[playbook.status]}
                    </span>
                    <RowActions
                      label={playbook.scenario}
                      onEdit={() => props.onEdit(playbook)}
                      onDelete={() => props.onDelete(playbook)}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <LedgerShell
      allShown={allShown}
      count={selected.length}
      text={zh.playbooks.selection}
      onToggleAll={() => props.onSelectAll(allShown ? [] : rows.map((r) => r.playbook.id))}
      onClear={() => props.onSelectAll([])}
    >
      {body()}
    </LedgerShell>
  )
}
