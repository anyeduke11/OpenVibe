import type { ReactNode } from 'react'
import { lane } from '../../i18n/lane-assets'
import { Icon } from '../ui/icons'
import { inputCls, proseCls } from '../ui/styles'

/**
 * 资产域四页统一的页头（DESIGN.md Layout：每屏 `.vh` 标题区）。
 *
 * 结构固定三段，顺序即优先级：
 *  1. 左：h1 + 一句话说明（同列）。说明必须说清**这页解决什么问题**，不是复述标题。
 *  2. 右：动作区——搜索框与**唯一一个** btnPrimary 主动作同排（DESIGN.md button-primary
 *     只给「使生效」类动词，页头最多一个，其余低频动作收进下方的工具区或抽屉）。
 *  3. 下：可选的单行筛选条，由 `filters` 传入（见 AssetFilterBar）。
 *
 * 收紧的是**高度**：h1 26px 与说明共占一行，筛选条另起一行且自身不换行，
 * 因此正文列表不再被页头挤到首屏之下（改造前筛选区独占三行、标签平铺数十个）。
 *
 * h1 字号取 26px 而非 DESIGN.md 阶梯的 30px：本轮同批的 WorkbenchPage / GrowthPage
 * 已用 `text-[26px] tracking-tight`，四页与它们对齐，30px 会让资产域比工作台高一档。
 */
export function AssetPageHead(props: {
  title: string
  hint: string
  actions?: ReactNode
  filters?: ReactNode
}) {
  return (
    <header className="shrink-0 border-b border-line-hair bg-panel">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2 px-5 pt-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-semibold leading-[1.25] tracking-tight text-ink max-sm:text-[25px]">
            {props.title}
          </h1>
          {/* 68ch 行长闸门：说明是正文，不许被宽屏拉成一整行 */}
          <p className={`mt-1 text-[13.5px] leading-relaxed text-ink-muted ${proseCls}`}>
            {props.hint}
          </p>
        </div>
        {props.actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div>
        )}
      </div>
      {props.filters !== undefined && (
        <div className="border-t border-line-hair px-5 py-1.5">{props.filters}</div>
      )}
    </header>
  )
}

/**
 * 单行筛选条：横向滚动、永不换行。
 *
 * 改造前这里是 `flex-wrap` 的三行区（两个 select + 几十个标签 chip 平铺），正文被顶到
 * 折叠线以下。这里收成一条 `overflow-x-auto` + `whitespace-nowrap` 的轨道：
 * 滚动优先于换行——标签数量随用户资产增长，换行会让页头高度不可预测。
 */
export function AssetFilterBar(props: {
  children: ReactNode
  /** 轨道右端的「生效中 + 清除」，永远钉在滚动区外，滚到哪儿都够得着 */
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap py-0.5">
        {props.children}
      </div>
      {props.trailing !== undefined && <div className="flex shrink-0 items-center gap-1.5">{props.trailing}</div>}
    </div>
  )
}

/** 筛选条里的分隔竖线（轨道内的分组视觉，非颜色单义） */
export function FilterDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
}

/**
 * 页头搜索框：清空按钮内嵌在右侧（改造前只能逐字删），
 * 与唯一的主动作同排，符合「搜索框与主按钮同排」的密度口径。
 */
export function AssetSearchBox(props: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  widthClass?: string
}) {
  return (
    <div className={`relative ${props.widthClass ?? 'w-64'}`}>
      <input
        className={`${inputCls} pr-7`}
        placeholder={lane.state.searchPlaceholder}
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.value !== '' && (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink-body"
          aria-label={lane.state.clearFilters}
          onClick={() => props.onChange('')}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  )
}
