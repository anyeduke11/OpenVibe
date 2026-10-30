import type { SkillRow } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'
import { AssetEmpty, AssetError, AssetNoResults, AssetSkeleton } from '../library/AssetStates'
import { Icon } from '../ui/icons'
import { btnGhost, btnPrimary, ledgerHeadCls, ledgerNumCls, tagMonoCls } from '../ui/styles'

/**
 * Skill 台账表（m2 FR-3.1）：来源 / 版本数 / 最近扫描时间 + 编辑与删除入口。
 *
 * 四态齐：改造前 `loading` 这个 prop 收了却从不渲染（加载台账是一张空表，
 * 看起来像「扫不到」），错误态与无结果态则完全缺失。
 *
 * ## 行内三个动作的分工（2026-10-30）
 *
 * | 动作 | 何时可点 | 作用 |
 * |---|---|---|
 * | 下载 | 有 `remoteRef` 且本机尚无目录 | 从远端把内容**真正落盘**（远程导入只建档） |
 * | 备份 | 有本地目录 | 复制一份到 OpenVibe 的 skill 库（agent 卸载后内容还在） |
 * | 恢复 | 有库内副本 | 从库副本写回本地目录 |
 *
 * ⚠️ **下载按钮只在「有远程溯源」时出现**：本地扫描来的条目没有溯源串，
 *   给个点不动的按钮比不给更糟。
 */
export function SkillList(props: {
  items: SkillRow[]
  loading: boolean
  error: string | null
  searching: boolean
  onClearFilters: () => void
  onRetry: () => void
  onEdit: (skill: SkillRow) => void
  onDelete: (skill: SkillRow) => void
  onCreate: () => void
  /** 下载远程 skill 并落盘 */
  onDownload?: (skill: SkillRow) => void
  /** 备份到 skill 库 */
  onBackup?: (skill: SkillRow) => void
  /** 从 skill 库恢复 */
  onRestore?: (skill: SkillRow) => void
  /** 正在执行的动作（skill id），用于禁用按钮 */
  busyId?: string | null
}) {
  const body = () => {
    if (props.loading) return <AssetSkeleton rows={8} />
    if (props.error !== null) return <AssetError message={props.error} onRetry={props.onRetry} />
    if (props.items.length === 0)
      return props.searching ? (
        <AssetNoResults what="Skill" onClear={props.onClearFilters} />
      ) : (
        <AssetEmpty
          message={zh.skills.empty}
          action={
            <button className={btnPrimary} onClick={props.onCreate}>
              <Icon name="plus" size={12} />
              {zh.skills.create.title}
            </button>
          }
        />
      )
    return (
      // `table-fixed` 是这页能看的关键：默认 table-auto 会把列宽让给内容最多的描述列，
      // 右侧固定列被压到中文逐字竖排（「本/地/扫/描」）+ 按钮竖排。这不是数据问题，是栅格算法。
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className={`sticky top-0 z-10 bg-panel text-left ${ledgerHeadCls}`}>
          <tr className="border-b border-line">
            <th className="w-56 px-5 py-1.5">{zh.skills.columns.name}</th>
            <th className="px-2 py-1.5">{zh.skills.columns.description}</th>
            <th className="w-24 px-2 py-1.5">{zh.skills.columns.source}</th>
            <th className="w-14 px-2 py-1.5 whitespace-nowrap text-right">
              {zh.skills.columns.versions}
            </th>
            <th className="w-32 px-2 py-1.5">{zh.skills.columns.installed}</th>
            <th className="w-32 px-2 py-1.5 whitespace-nowrap">{zh.projects.labels.updatedAt}</th>
            {/* 动作列宽随行内动作数增长（下载/备份/恢复/编辑/删除 最多五个）——
                固定宽度 + table-fixed ⇒ 不给够就会把中文压成竖排 */}
            <th className="w-44 px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {props.items.map((s) => (
            <tr key={s.id} className="border-b border-line-hair align-top hover:bg-panel-2">
              <td className="px-5 py-2">
                <button
                  className="block w-full truncate text-left font-medium text-ink-body transition-colors hover:text-accent"
                  onClick={() => props.onEdit(s)}
                >
                  {s.name}
                </button>
              </td>
              <td className="px-2 py-2 text-xs text-ink-muted">
                <span className="line-clamp-2">{s.description}</span>
              </td>
              {/* 来源是元信息 → tag；本地扫描来的才是强调态 */}
              <td className="px-2 py-2">
                <span className={`${tagMonoCls} whitespace-nowrap`}>
                  {zh.skills.sources[s.source]}
                </span>
              </td>
              {/* 数字列：tabular-nums 右对齐，列不跳动（Readability Contract 第 6 条） */}
              <td className={`${ledgerNumCls} px-2 py-2 text-xs text-ink-muted`}>
                {String(s.versionCount)}
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {s.installedTargets.length === 0 && (
                    <span className="text-xs text-ink-faint">{zh.common.none}</span>
                  )}
                  {s.installedTargets.map((t) => (
                    <span key={t} className={`${tagMonoCls} whitespace-nowrap`}>
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className="mono px-2 py-2 text-[11px] whitespace-nowrap text-ink-faint">
                {s.updatedAt}
              </td>
              <td className="px-2 py-2">
                <span className="flex items-center justify-end gap-1">
                  {/* 下载：只有「有远程溯源」才有意义（本地扫描来的没溯源串） */}
                  {s.remoteRef !== null && s.remoteRef !== '' && props.onDownload !== undefined && (
                    <button
                      className={`${btnGhost} shrink-0 px-2`}
                      aria-label={`下载 ${s.name}`}
                      title={zh.skills.library.downloadHint}
                      disabled={props.busyId === s.id}
                      onClick={() => props.onDownload?.(s)}
                    >
                      <Icon name="dl" size={12} />
                    </button>
                  )}
                  {/* 备份到库：有本地目录才备份得动 */}
                  {s.skillDir !== null && props.onBackup !== undefined && (
                    <button
                      className={`${btnGhost} shrink-0 px-2`}
                      aria-label={`备份 ${s.name} 到库`}
                      title={zh.skills.library.backupHint}
                      disabled={props.busyId === s.id}
                      onClick={() => props.onBackup?.(s)}
                    >
                      <Icon name="layers" size={12} />
                    </button>
                  )}
                  {/* 从库恢复：只有库里有副本才有得恢复 */}
                  {s.libraryDir !== null && props.onRestore !== undefined && (
                    <button
                      className={`${btnGhost} shrink-0 px-2`}
                      aria-label={`从库恢复 ${s.name}`}
                      title={zh.skills.library.restoreHint}
                      disabled={props.busyId === s.id}
                      onClick={() => props.onRestore?.(s)}
                    >
                      <Icon name="refresh" size={12} />
                    </button>
                  )}
                  <button
                    className={`${btnGhost} whitespace-nowrap px-2`}
                    onClick={() => props.onEdit(s)}
                  >
                    {zh.flows.actions.edit}
                  </button>
                  <button
                    className={`${btnGhost} shrink-0 px-2`}
                    aria-label={`${zh.flows.actions.del} ${s.name}`}
                    onClick={() => props.onDelete(s)}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <div className="min-h-0 flex-1 overflow-auto">{body()}</div>
}
