import type { ReactNode } from 'react'
import { h1Cls, h1SubCls, proseCls } from './styles'

/**
 * 版式原语（原型 `docs/prototypes/灵典-全功能Demo-成长视角-20261107.html` 的版式层）。
 *
 * ## 为什么有这一层
 *
 * 原型把页面拆成固定几件：**页头（`.vh`）+ 筛选行（`.filters`）+ 卡片（`.card`）+
 * 统计格（`.stat`）+ 行列表（`.rows`）+ 空态（`.empty`）+ 骨架（`.skel`）+ 分段（`.seg`）**。
 * 现有实现把这些**类组合**散在 62 个文件里（`cardCls` / `chipTone` / `segCls` … 共 299 处调用），
 * 于是同一件事有两三种写法：有的页把动作放页头右侧，有的放筛选行右侧；有的卡片有底栏，有的没有。
 *
 * 本文件把那几件收成**组件**，让「一个页面长什么样」由组件组合决定，而不是每页各拼一遍。
 * 类组合本身仍在 `styles.ts`（单一出处不变）—— 本层只做**结构**，不做样式。
 *
 * ## 与原型的对应
 *
 * | 原型 | 本层 |
 * |---|---|
 * | `.vh`（h1 + 说明 + 动作行） | `PageHead` |
 * | `.filters` | `FilterBar` |
 * | `.card` / `.hd` / `.bd` / `.ft` | `Card` |
 * | `.stat` | `Stat` / `StatGrid` |
 * | `.rows` / `.row` | `Rows` / `Row` |
 * | `.seg` | `Seg` |
 * | `.empty` | `EmptyState` |
 * | `.skel` | `Skeleton` |
 * | `.note` | `Note` |
 * | `.pro`（专家视图才显示） | `ProBlock` |
 */

/** 类名拼接：只在有值时出现，避免 `undefined` 进 class 属性 */
function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' ')
}

/* ── 页头 ─────────────────────────────────────────────────────────── */

/**
 * 页头 = 标题 + 一句说明 + 右侧动作（原型 `.vh`）。
 *
 * `actions` 与 `filters` 分开的理由：动作是**对本页数据的操作**（新建 / 导入导出），
 * 筛选是**改变所见范围**（搜索 / 分段 / 下拉）。原型把两者分行，读的人一眼分清
 * 「能做什么」与「正在看什么」。
 */
export function PageHead(props: {
  title: string
  hint?: string
  actions?: ReactNode
  filters?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className={h1Cls}>{props.title}</h1>
          {props.hint !== undefined && props.hint !== '' && (
            <p className={`${h1SubCls} ${proseCls}`}>{props.hint}</p>
          )}
        </div>
        {props.actions !== undefined && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div>
        )}
      </div>
      {props.filters !== undefined && <FilterBar>{props.filters}</FilterBar>}
    </div>
  )
}

/** 筛选行：搜索框 + 分段 + 下拉 + 尾部动作，允许换行（原型 `.filters`） */
export function FilterBar(props: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{props.children}</div>
}

/* ── 卡片 ─────────────────────────────────────────────────────────── */

/**
 * 卡片 = 可选头（标题 + 右侧动作）+ 体 + 可选底栏（原型 `.card`）。
 *
 * `pad={false}` 用于「体自己是列表」的卡片（行列表自带左右内距，再套一层就是双重内距）。
 */
export function Card(props: {
  /** 预制卡头（如 `LedgerCardHead`）：给了它就不再走 title/icon/headRight */
  head?: ReactNode
  title?: ReactNode
  icon?: ReactNode
  headRight?: ReactNode
  pad?: boolean
  foot?: ReactNode
  className?: string
  children: ReactNode
}) {
  const pad = props.pad ?? true
  const hasHead =
    props.head !== undefined || props.title !== undefined || props.headRight !== undefined
  return (
    <section className={cx('rounded-md border border-line bg-panel shadow-1', props.className)}>
      {props.head !== undefined
        ? props.head
        : hasHead && (
            <div className="flex min-h-11 flex-wrap items-center gap-2.5 border-b border-line-hair px-3.5 py-2.5">
              {props.icon}
              {props.title !== undefined && (
                <h2 className="text-sm font-semibold text-ink">{props.title}</h2>
              )}
              {props.headRight !== undefined && (
                <div className="ml-auto flex flex-wrap items-center gap-2">{props.headRight}</div>
              )}
            </div>
          )}
      <div className={pad ? 'px-3.5 py-3' : ''}>{props.children}</div>
      {props.foot !== undefined && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-hair px-3.5 py-2.5">
          {props.foot}
        </div>
      )}
    </section>
  )
}

/* ── 统计格 ───────────────────────────────────────────────────────── */

/**
 * 统计格（原型 `.stat`）：键 12px ink-faint / 值 27px 600 / 注 12px ink-muted。
 * `hero` 只给北极星那一格 —— 强调底全站只此一处（DESIGN.md stat）。
 */
export function Stat(props: { k: string; v: ReactNode; m?: ReactNode; hero?: boolean }) {
  return (
    <div
      className={cx(
        'rounded-md border border-line bg-panel px-3.5 py-3 shadow-1',
        props.hero && 'border-accent-line bg-accent-soft',
      )}
    >
      <div className="text-xs text-ink-faint">{props.k}</div>
      <div className="text-[27px] font-semibold leading-[1.3] tabular-nums text-ink">{props.v}</div>
      {props.m !== undefined && <div className="text-xs text-ink-muted">{props.m}</div>}
    </div>
  )
}

/** 统计格栅格：`cols` 由**数据量**给，不写死（原型 g2/g3/g4/g5 的语义） */
export function StatGrid(props: { cols?: 2 | 3 | 4 | 5; children: ReactNode }) {
  const cols = props.cols ?? 3
  return (
    <div
      className={cx(
        'grid gap-3.5',
        cols === 2 && 'grid-cols-2',
        cols === 3 && 'grid-cols-3 max-sm:grid-cols-2',
        cols === 4 && 'grid-cols-4 max-sm:grid-cols-2',
        cols === 5 && 'grid-cols-5 max-sm:grid-cols-2',
      )}
    >
      {props.children}
    </div>
  )
}

/* ── 行列表 ───────────────────────────────────────────────────────── */

/**
 * 行列表（原型 `.rows`）：自带描边与圆角，行间 hairline。
 * `Row` 的 `selected` 用于主从双栏的「当前项」高亮（`aria-selected`）。
 */
export function Rows(props: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel">{props.children}</div>
  )
}

export function Row(props: {
  selected?: boolean
  className?: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <div
      role={props.onClick !== undefined ? 'button' : undefined}
      tabIndex={props.onClick !== undefined ? 0 : undefined}
      aria-selected={props.selected}
      onClick={props.onClick}
      onKeyDown={
        props.onClick !== undefined
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                props.onClick?.()
              }
            }
          : undefined
      }
      className={cx(
        'flex w-full items-center gap-2.5 border-b border-line-hair px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-panel-2',
        props.selected && 'bg-accent-soft text-accent-deep',
        props.onClick !== undefined && 'cursor-pointer',
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

/* ── 分段控件 ─────────────────────────────────────────────────────── */

/**
 * 分段控件（原型 `.seg`）。
 *
 * `ariaLabel` 必填：一排外观相同的按钮，读屏必须能说出它们在分什么段。
 * 段数由 `options` 给 —— 不写死三档（同 `segCls` 的既有纪律）。
 */
export function Seg<T extends string>(props: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      className="inline-flex flex-wrap gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5"
    >
      {props.options.map((o) => {
        const on = o.value === props.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => props.onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-xs transition-colors',
              on ? 'bg-panel font-medium text-ink shadow-1' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── 空态 / 骨架 ──────────────────────────────────────────────────── */

/**
 * 空态（原型 `.empty`）：虚线框 + 一句话 + 一个下一步动作。
 *
 * ⚠️ 文案不是「暂无数据」—— DESIGN.md 明确空态要给**下一步**（同 `emptyHintCls` 的既有纪律）。
 */
export function EmptyState(props: { hint: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong px-4 py-6 text-sm text-ink-faint">
      <p>{props.hint}</p>
      {props.action !== undefined && <div className="mt-1">{props.action}</div>}
    </div>
  )
}

/** 骨架（原型 `.skel`）：只做渐隐，不做位移（DESIGN.md skeleton） */
export function Skeleton(props: { className?: string }) {
  return <div className={cx('animate-pulse rounded-sm bg-panel-2', props.className)} />
}

/* ── 说明块 ───────────────────────────────────────────────────────── */

/**
 * 说明块（原型 `.note`）：`*-soft` 底 + `*-line` 描边 + 加粗标题 + `ink-body` 正文。
 * 与 chip 的分工：note 承载**成段说明**，chip 承载**单点状态**。
 */
export function Note(props: {
  tone?: 'info' | 'ok' | 'warn' | 'danger'
  title?: ReactNode
  children: ReactNode
}) {
  const tone = props.tone ?? 'info'
  return (
    <div
      className={cx(
        'rounded-md border px-3 py-2 text-sm',
        {
          info: 'border-info-line bg-info-soft',
          ok: 'border-ok-line bg-ok-soft',
          warn: 'border-warn-line bg-warn-soft',
          danger: 'border-danger-line bg-danger-soft',
        }[tone],
      )}
    >
      {props.title !== undefined && <b className="mb-0.5 block text-xs font-bold">{props.title}</b>}
      <div className="text-ink-body">{props.children}</div>
    </div>
  )
}

/* ── 专家视图块 ───────────────────────────────────────────────────── */

/**
 * 专家视图块（原型 `.pro`）：**默认隐藏，顶栏「专家视图」打开后才显示**。
 *
 * ## 为什么要有这道闸
 *
 * 原型的「渐进披露红线 4」：高级块常埋在世界各处，普通用户被它们淹没、专家找不到。
 * 一个开关把两边的诉求都接住 —— 默认干净，需要时一键越级。
 *
 * ## 实现口径
 *
 * 开关往 `document.body` 加 `expert` 类；显示规则在 `index.css`
 * （`body.expert [data-problock]`）—— **不要用 state 逐层传**：那要把 `expert`
 * 塞进每一条 props 链，而它是**全站偏好**不是页面状态。首启默认关，
 * 与主题同机制（localStorage `openvibe:expert`）。
 */
export function ProBlock(props: {
  /** 块本身若是栅格/弹性，用 `display` 还原（默认块级） */
  display?: 'block' | 'grid' | 'flex'
  children: ReactNode
}) {
  return (
    <div data-problock data-display={props.display ?? 'block'}>
      {props.children}
    </div>
  )
}
