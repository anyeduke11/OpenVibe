import type { FlywheelStatsOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { sys } from '../../i18n/lane-system'
import type { useFlywheelStats } from '../../hooks/useSettings'
import {
  btnGhost,
  noteCls,
  noteTitleCls,
  proseCls,
  skelCls,
  statCls,
  statHeroCls,
} from '../ui/styles'
import { Icon } from '../ui/icons'

/**
 * 飞轮统计条（onboarding FR-3.1，props 形状见 dev-plan §5.2）—— 工作台与成长页共用同一块。
 *
 * 口径（§1.4 定的，不改）：北极星是「标准化飞轮**完整走完**的圈数」
 * （沉淀 → 组包 → 注入 → 回流，按项目去重），其余四格是它的因子，不是它的替代口径。
 * 所以强调底（statHeroCls，全页只此一处）落在圈数那一格。
 *
 * 一行放得下是硬要求：四格 `grid-cols-2 lg:grid-cols-4`，不是一屏一张卡。
 */
export function FlywheelCard(props: FlywheelStatsOut) {
  const zeroed =
    props.assets === 0 &&
    props.packs === 0 &&
    props.injections === 0 &&
    props.reflows === 0 &&
    props.loops === 0

  const cells: {
    key: string
    label: string
    value: string
    note: string
    hero?: boolean
  }[] = [
    {
      key: 'loops',
      label: sys.workbench.stats.heroKey,
      value: String(props.loops),
      note: zeroed ? sys.workbench.stats.zeroNote : sys.workbench.stats.heroNote,
      hero: true,
    },
    {
      key: 'assets',
      label: sys.workbench.stats.assetsKey,
      value: String(props.assets),
      note: sys.workbench.stats.assetsNote,
    },
    {
      // 原型同款：包数与注入次数挤一格（值写成 `3 / 12`），五项指标才排得进四格
      key: 'packs',
      label: sys.workbench.stats.packKey,
      value: `${String(props.packs)} / ${String(props.injections)}`,
      note: sys.workbench.stats.packNote,
    },
    {
      key: 'reflows',
      label: sys.workbench.stats.reflowKey,
      value: String(props.reflows),
      note: sys.workbench.stats.reflowNote,
    },
  ]

  return (
    <section aria-label={zh.flywheel.title} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map((c) => (
        <div
          key={c.key}
          className={c.hero ? statHeroCls : statCls}
          title={c.hero ? zh.flywheel.tooltip : undefined}
        >
          <div className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Icon name={c.hero ? 'refresh' : 'chart'} size={13} />
            <span className="truncate">{c.label}</span>
          </div>
          <div className="num mt-1 text-[27px] font-semibold leading-none text-ink">{c.value}</div>
          <div className="mt-1.5 text-xs leading-snug text-ink-muted">{c.note}</div>
        </div>
      ))}
    </section>
  )
}

/**
 * 统计条四态：加载骨架 / 错误可重试 / 数据（全零由 hero 注自陈）。
 * 工作台与成长页共用；错误文案与其它查询块一致，只取 Error.message。
 */
export function FlywheelBody(props: { stats: ReturnType<typeof useFlywheelStats> }) {
  const { stats } = props
  if (stats.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${skelCls} h-[86px] rounded-md`} />
        ))}
      </div>
    )
  }
  if (stats.error) {
    return (
      <div className={noteCls('danger')}>
        <b className={`${noteTitleCls} flex items-center gap-1.5 text-danger`}>
          <Icon name="alert" size={13} />
          统计条没取到
        </b>
        <p className={proseCls}>
          {sys.state.error(stats.error instanceof Error ? stats.error.message : '')}
        </p>
        <button type="button" className={`${btnGhost} mt-2`} onClick={() => void stats.refetch()}>
          <Icon name="refresh" size={13} />
          {sys.state.retry}
        </button>
      </div>
    )
  }
  if (stats.data === undefined) return null
  return <FlywheelCard {...stats.data} />
}
