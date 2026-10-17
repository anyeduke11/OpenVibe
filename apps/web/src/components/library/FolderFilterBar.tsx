import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { lane } from '../../i18n/lane-assets'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import { CHIP_TONES, chipCls, chipPressed } from '../ui/styles'

// 与 TagFilterBar 同一条纪律：chipCls 与两种形制各自带 border / bg / text 三个色类，
// 叠加只会让 Tailwind 任意挑一个生效（顺序不由源码决定），所以选中与未选中在**形制层**
// 择一，三元不散进 JSX。
const toggleChip = (on: boolean): string =>
  `${chipCls} shrink-0 transition-colors ${on ? chipPressed : `${CHIP_TONES.default} hover:bg-panel`}`

/** 路径 → chip 文案：去掉前导斜杠；根目录走 i18n 键，不硬编码 */
const labelOf = (path: string): string =>
  path === '/' ? zh.folderTree.root : path.replace(/^\//, '')

/**
 * 排序：**按层级连片**，同层按 zh-CN 名序。
 *
 * 不是为了「父先子后」——实测 `localeCompare(path)` 对每一对父子路径都返回正数，
 * 即父路径本来就排在子路径前面（`'/尽调'` vs `'/尽调/b'`、`'/c'` vs `'/c/B/a/A'`、
 * `'/报告'` vs `'/报告/2024'` 逐对验过）。深度比较真正买到的是**同层连片**：
 * 纯 `localeCompare` 会把 `/尽调`、`/尽调/b`、`/审查`、`/审查/尽调/审查`、`/b`…
 * 这样长短交替，横向轨道里「这一段是第二层」读不出来，读成「文件夹名随机穿插」。
 * 先比深度让同层相邻，再交给 `localeCompare` 定名序。
 */
const byDepthThenName = (a: string, b: string): number => {
  const d = a.split('/').length - b.split('/').length
  return d !== 0 ? d : a.localeCompare(b, 'zh-CN')
}

/**
 * 文件夹横向筛选条（m1 FR-3.2 的**呈现形态**，owner 2026-10-17 裁定由左侧竖排树改横排）。
 *
 * 原先是左侧 `w-52` 竖排路径树，改造后收进页头下方的 `AssetFilterBar` 轨道，与标签
 * 筛选同排。三条取舍：
 *
 *  1. **扁平 chip 而非缩进**：横排轨道里缩进不表达层级——没有可对照的纵向轴，
 *     缩进多少全凭读者自己猜。改为 chip 文案直接给完整路径（`投研/尽调`），
 *     归属一眼可辨，也不必展开就能筛到深层文件夹。排序按层级连片（见 `byDepthThenName`），
 *     同层的 chip 挨在一起，横向读下来才知道「这一段是第二层」。
 *  2. **超量折叠**：文件夹数随用户资产增长，与 `TagFilterBar` 同一口径只露前 `limit` 个，
 *     选中的那个永远补在末尾——筛完的项被折叠藏起来，用户只会觉得「筛没了」。
 *  3. **根目录 chip 常显**：`paths` 只含**已有提示词**的路径，全部不在根时它本不该出现；
 *     但它同时是「把提示词移回根目录」的唯一落点，所以无条件渲染（与改造前的树一致）。
 *
 * 过滤语义**未变**：仍是 `folder_path` 精确匹配（选父目录**不含**其子目录），
 * 与服务端 `repos/prompts.ts` 的 `folder_path = ?` 一致。
 *
 * 文案**不新增 i18n 键**：`全部` 复用 `zh.library.filters.all`（与状态/平台两个 select 同源），
 * `更多` / `收起` 复用 `lane.row`（与标签条同源）。理由是 `i18n/zh.ts` 正被并行会话重构，
 * 往里加键必然混稿，而这两处已有同义键、语义完全对得上。
 */
export function FolderFilterBar(props: {
  paths: string[]
  selected: string | undefined
  onToggle: (path: string | undefined) => void
  /** 把提示词行拖到某个 chip 上 → 移动到该文件夹（原生 HTML5 DnD，不引拖拽库） */
  onDropPrompt: (promptId: string, folderPath: string) => void
  limit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const limit = props.limit ?? 8

  const all = useMemo(() => [...props.paths].sort(byDepthThenName), [props.paths])
  if (all.length === 0) return null

  const selectedIdx = props.selected === undefined ? -1 : all.indexOf(props.selected)
  const collapsible = all.length > limit
  const shown =
    !collapsible || expanded
      ? all
      : selectedIdx >= limit
        ? [...all.slice(0, limit), all[selectedIdx] as string]
        : all.slice(0, limit)
  const hidden = all.length - shown.length

  // 每个 chip 都是落点。drop 时读 text/plain 拿 promptId —— 与改造前 FolderTree 同一约定。
  const dropProps = (path: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDragOver(path)
    },
    onDragLeave: () => setDragOver((cur) => (cur === path ? null : cur)),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain')
      setDragOver(null)
      if (id !== '') props.onDropPrompt(id, path)
    },
  })

  const chip = (path: string) => {
    const on = props.selected === path
    return (
      <button
        {...dropProps(path)}
        key={path}
        type="button"
        aria-pressed={on}
        title={path}
        className={`${toggleChip(on)} max-w-[28ch] ${dragOver === path ? 'ring-1 ring-accent' : ''}`}
        onClick={() => props.onToggle(on ? undefined : path)}
      >
        <span className="truncate">{labelOf(path)}</span>
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={zh.folderTree.title}
      className="flex min-w-0 items-center gap-1.5"
    >
      <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
        <Icon name="folder" size={11} />
        {zh.folderTree.title}
      </span>

      {/* 「全部」= 不按文件夹筛。它不是落点：拖到这儿该去哪没有答案。 */}
      <button
        type="button"
        aria-pressed={props.selected === undefined}
        title={zh.library.filters.all}
        className={toggleChip(props.selected === undefined)}
        onClick={() => props.onToggle(undefined)}
      >
        {zh.library.filters.all}
      </button>

      {chip('/')}
      {shown.map((p) => chip(p))}

      {collapsible && !expanded && (
        <button
          type="button"
          className={`${chipCls} shrink-0 ${CHIP_TONES.default} hover:bg-panel`}
          onClick={() => setExpanded(true)}
        >
          {lane.row.more} +{String(hidden)}
        </button>
      )}
      {collapsible && expanded && (
        <button
          type="button"
          className={`${chipCls} shrink-0 ${CHIP_TONES.default} hover:bg-panel`}
          onClick={() => setExpanded(false)}
        >
          {lane.row.fewer}
        </button>
      )}

      <span className="shrink-0 text-[11px] leading-relaxed text-ink-faint">
        {zh.folderTree.dropHint}
      </span>
    </div>
  )
}
