import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ContextGovernanceMergeStat, ContextGovernanceOut } from '@openvibe/shared'
import { apiJson, qs } from '../../api/client'
import { sys } from '../../i18n/lane-system'
import { Icon } from '../ui/icons'
import { chipTone } from '../ui/styles'
import { Section } from './SettingsSections'

/**
 * 设置页「上下文治理」面板（只读）。
 *
 * ## 三条纪律
 *
 * ① **不代跑**：面板只展示最近一次 `pnpm context:check` 的落盘结论，不触发任何检查
 *    —— 触发会把「看状态」变成「改状态」，而且面板拿不到那次运行的退出码。
 * ② **`available: false` 必须如实显示**：没跑过时显示「先运行」，而不是渲染一串 0
 *    （假的 0 会被读成「全绿」，比不显示更坏）。
 * ③ **判定颜色只走语义 chip**：`chipTone('ok' | 'danger')`，不写任何字面色阶
 *    （DESIGN.md 的「调用点只写语义 utility」）。
 */
export function ContextGovernanceSection() {
  // 聚合行点选：`mergeFrom` URL query 承载（刷新/切页后筛选不丢）；null = 显示全部逐条记录。
  // 用 URL 而非组件 state：筛选是视图状态，进 URL 才可能被「重挂/刷新」带回。
  const [searchParams, setSearchParams] = useSearchParams()
  const activeFrom = searchParams.get('mergeFrom')
  // 明细分页：`mergesOffset` = 从最新往回跳过多少条（0 = 最近一页）。
  // 换来源必须回到第 0 页，否则新来源的明细段位不对。
  const offset = Number(searchParams.get('mergesOffset') ?? '0') || 0
  // 写筛选到 URL：同来源再点 = 取消（删除参数）；replace 不堆浏览器历史
  const setFilter = (from: string | null): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (from === null) next.delete('mergeFrom')
        else next.set('mergeFrom', from)
        next.delete('mergesOffset') // 换来源 ⇒ 回到最近一页
        return next
      },
      { replace: true },
    )
  }
  // 回到最近一页（清 offset）
  const backToRecent = (): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('mergesOffset')
        return next
      },
      { replace: true },
    )
  }

  const q = useQuery({
    // ⚠️ queryKey 必须带 activeFrom 与 offset：筛选/翻页变了就是**另一份数据**
    //    （服务端按来源 + offset 返回对应页），不带会命中旧缓存显示错数据。
    queryKey: ['context-governance', activeFrom, offset],
    queryFn: () =>
      apiJson<ContextGovernanceOut>(
        `/api/context-governance${qs({
          mergesFrom: activeFrom ?? undefined,
          mergesOffset: offset > 0 ? offset : undefined,
        })}`,
      ),
    // ⚠️ 磁盘态端点必须 `staleTime: 0`（tests/report-endpoint-cache.test.ts 的判据）：
    //    结论每轮 context:check 覆盖，挂载后展示缓存旧值等于报一个过期的「绿」。
    staleTime: 0,
  })

  const g = q.data
  const errors = g?.errors
  const overBy = g?.c5OverBy
  const allGreen =
    g?.available === true && (errors === undefined || errors === 0) && (overBy ?? 0) === 0

  // 合并清单的窗口边界（⚠️ 端点只给最近 N 条窗口，除非按来源筛选）：
  // `mergesBySource` 是**全量**按来源统计（含最近时间）⇒ 窗口外还有多少条能算出来并如实提示。
  const merges = Array.isArray(g?.merges) ? g.merges : []
  // 显示更早：以「当前页条数」为步长再往回翻一页（前端不硬编码页大小，步长即端点给的页）
  const loadEarlier = (): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('mergesOffset', String(offset + merges.length))
        return next
      },
      { replace: true },
    )
  }
  const bySource = g?.mergesBySource
  /** 全量合并记录总数（跨来源） */
  const totalMerges =
    bySource === undefined
      ? undefined
      : Object.values(bySource).reduce((sum, s) => sum + s.count, 0)
  /**
   * 还没显示出来的条数（端点只给窗口内那些）。
   *
   * ⚠️ 筛选态下端点已按来源返回**该来源的全量明细** ⇒ 此时不该再提示「窗口外还有」。
   */
  const notShown: number | undefined =
    totalMerges === undefined || activeFrom !== null ? undefined : totalMerges - merges.length

  /**
   * 筛选态下该来源「有但没显示」的条数。
   *
   * ⚠️ 直接取服务端 `mergesOmitted`（权威计算），不再用 `mergesBySource.count` 推断——
   * 后者口径是「文件里合格记录数」，可能因合并日志上限被截掉而不全，推断会误导。
   * 缺省（undefined）= 已到最早或旧服务端（不提示，不猜）。
   */
  const omittedForActive: number | undefined = activeFrom !== null ? g?.mergesOmitted : undefined
  /** 筛选态下该来源文件内记录总数（服务端给，含分页）；缺省 = 旧服务端或未筛选 */
  const mergesTotal = activeFrom !== null ? g?.mergesTotal : undefined

  const aside =
    g?.available !== true ? undefined : allGreen ? (
      <span className={chipTone('ok')}>
        <Icon name="check" size={12} />
        {sys.settings.contextGovernance.pass}
      </span>
    ) : (
      <span className={chipTone('danger')}>
        <Icon name="alert" size={12} />
        {sys.settings.contextGovernance.fail(errors ?? 0)}
      </span>
    )

  return (
    <Section
      title={sys.settings.contextGovernance.title}
      icon="check"
      hint={sys.settings.contextGovernance.hint}
      aside={aside}
    >
      {q.isLoading ? (
        <p className="text-sm text-ink-faint">…</p>
      ) : q.isError ? (
        <p className="text-xs text-ink-faint">读取失败（服务端未就绪或端点不可达）</p>
      ) : g?.available !== true ? (
        <p className="text-[13px] text-ink-muted">{sys.settings.contextGovernance.unavailable}</p>
      ) : (
        <div className="space-y-2">
          {g.at !== undefined && (
            <p className="text-xs text-ink-faint">
              {sys.settings.contextGovernance.sampledAt(new Date(g.at).toLocaleString('zh-CN'))}
            </p>
          )}
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="py-1 font-normal">{sys.settings.contextGovernance.cols.item}</th>
                <th className="py-1 font-normal">{sys.settings.contextGovernance.cols.value}</th>
                <th className="py-1 font-normal">{sys.settings.contextGovernance.cols.judge}</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label={sys.settings.contextGovernance.rows.errors}
                value={errors}
                judge={
                  errors === undefined
                    ? sys.settings.contextGovernance.unknown
                    : errors === 0
                      ? sys.settings.contextGovernance.pass
                      : sys.settings.contextGovernance.fail(errors)
                }
                bad={errors !== undefined && errors > 0}
              />
              <Row
                label={sys.settings.contextGovernance.rows.c5}
                value={g.c5}
                judge={
                  overBy === undefined
                    ? sys.settings.contextGovernance.unknown
                    : overBy === 0
                      ? sys.settings.contextGovernance.pass
                      : sys.settings.contextGovernance.overBy(overBy)
                }
                bad={(overBy ?? 0) > 0}
              />
              <Row
                label={sys.settings.contextGovernance.rows.upper}
                value={g.c5UpperBound ?? undefined}
                judge={sys.settings.contextGovernance.notJudged}
                bad={false}
              />
              <Row
                label={sys.settings.contextGovernance.rows.coAnchors}
                value={g.coAnchors}
                judge={sys.settings.contextGovernance.notJudged}
                bad={false}
              />
            </tbody>
          </table>
          {/* 下调建议：闸只报不写，面板只显示「建议目标值」，不替人改基线 */}
          {typeof g.c5SuggestLowerBound === 'number' && (
            <p className="flex items-start gap-1.5 text-[13px] text-ink-muted">
              <Icon name="warn" size={12} className="mt-0.5 shrink-0 text-warn" />
              {sys.settings.contextGovernance.suggestLower(g.c5SuggestLowerBound)}
            </p>
          )}
          {/* 多轮趋势：本机历史文件每轮追加（最近 5 轮），最旧→最新 */}
          {Array.isArray(g.history) && g.history.length > 0 ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-ink-faint">
                {sys.settings.contextGovernance.historyTitle}
              </p>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-ink-faint">
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.historyCols.at}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.historyCols.source}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.historyCols.errors}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.historyCols.c5}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.historyCols.coAnchors}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.history.slice(-5).map((r, i) => (
                    <tr key={`${r.at}-${String(i)}`} className="border-t border-line/60">
                      <td className="py-1 pr-2 text-ink-body">{formatAt(r.at)}</td>
                      <td className="py-1 pr-2 text-ink-muted">{r.source ?? 'local'}</td>
                      <td className={`py-1 pr-2 ${r.errors > 0 ? 'text-danger' : 'text-ink'}`}>
                        {r.errors}
                      </td>
                      <td className={`py-1 pr-2 ${r.c5OverBy > 0 ? 'text-danger' : 'text-ink'}`}>
                        {r.c5}
                      </td>
                      <td className="py-1 text-ink">{r.coAnchors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink-faint">
              {sys.settings.contextGovernance.historyEmpty}
            </p>
          )}
          {/* 合并来源清单：原生 <details> 折叠（无新依赖），只在有合并记录时出现。
              ⚠️ 筛选态下**即使端点返回空也要保留折叠区** —— 否则「取消筛选」按钮跟着消失，
              用户会被困在筛选态里出不来。 */}
          {(merges.length > 0 || activeFrom !== null) && (
            <details className="mt-3 rounded-md border border-line/60 px-2.5 py-2">
              <summary className="cursor-pointer text-xs text-ink-muted">
                {sys.settings.contextGovernance.mergesTitle(merges.length)}
              </summary>
              <p className="mt-1.5 text-xs text-ink-faint">
                {sys.settings.contextGovernance.mergesHint}
              </p>
              {/* 来源聚合：同一文件合并多次时，逐条清单会占满版面 ⇒ 先给一眼概览。
                  ⚠️ 数据源是服务端的**全量**按来源统计（`mergesBySource`）——含全量次数与
                  全量最近时间，所以窗口外的来源也在这里可见（不只窗口内那几条）。 */}
              <p className="mt-2 text-xs text-ink-faint">
                {sys.settings.contextGovernance.mergesAggTitle(totalMerges ?? merges.length)}
              </p>
              <table className="mt-1 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-ink-faint">
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.mergesAggCols.from}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.mergesAggCols.count}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.mergesAggCols.added}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.mergesAggCols.accepted}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.mergesAggCols.dropped}
                    </th>
                    <th className="py-1 font-normal">
                      {sys.settings.contextGovernance.mergesAggCols.lastAt}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mergeSourceRows(bySource).map((s) => {
                    const active = activeFrom === s.from
                    return (
                      <tr
                        key={s.from}
                        className={`border-t border-line/60 ${active ? 'bg-accent-soft/40' : ''}`}
                      >
                        <td className="py-1 pr-2">
                          {/* 可访问性：整行可点但无角色语义差，故用 button 承载点击 */}
                          <button
                            type="button"
                            onClick={() => setFilter(active ? null : s.from)}
                            className="inline-flex items-center gap-1 text-ink-muted hover:text-ink"
                          >
                            {active ? '▾' : '▸'} {s.from}
                          </button>
                        </td>
                        <td className="py-1 pr-2 text-ink">{s.count}</td>
                        <td className="py-1 pr-2 text-ink">{s.added}</td>
                        <td className="py-1 pr-2 text-ink">{s.accepted}</td>
                        <td className="py-1 pr-2 text-ink">{s.dropped}</td>
                        <td className="py-1 text-ink-body">{formatAt(s.lastAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* 筛选态的操作行：取消筛选 + 翻页控制。
                  ⚠️ 筛选态下端点按来源 + offset 返回**对应页**的明细（跨窗口分页），
                  所以下面这张表直接画端点给的当前页。 */}
              {activeFrom !== null && (
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFilter(null)}
                    className="text-xs text-ink-muted underline"
                  >
                    {sys.settings.contextGovernance.mergesFilterClear(activeFrom)}
                  </button>
                  {offset > 0 && (
                    <button
                      type="button"
                      onClick={backToRecent}
                      className="text-xs text-ink-muted underline"
                    >
                      {sys.settings.contextGovernance.mergesBackToRecent()}
                    </button>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs text-ink-faint">
                {activeFrom === null
                  ? sys.settings.contextGovernance.mergesTitle(merges.length)
                  : sys.settings.contextGovernance.mergesFiltered(
                      activeFrom,
                      mergesTotal,
                      merges.length,
                    )}
              </p>
              {/* 还有更早的记录 ⇒ 给出「显示更早」入口（把「另有 N 条未显示」变成可操作） */}
              {activeFrom !== null && omittedForActive !== undefined && omittedForActive > 0 && (
                <button
                  type="button"
                  onClick={loadEarlier}
                  className="mt-1 text-xs text-ink-muted underline"
                >
                  {sys.settings.contextGovernance.mergesLoadEarlier(omittedForActive)}
                </button>
              )}
              {/* 筛选态下当前页为空：区分「该来源没有记录」与「已翻到最早的记录」 */}
              {activeFrom !== null && merges.length === 0 && (
                <p className="text-xs text-ink-faint">
                  {mergesTotal === undefined || mergesTotal === 0
                    ? sys.settings.contextGovernance.mergesSourceEmpty(activeFrom)
                    : sys.settings.contextGovernance.mergesNoMoreEarlier()}
                </p>
              )}
              {/* 窗口外还有记录时如实标注（否则「只显示这几条」会被读成「就这些了」） */}
              {notShown !== undefined && notShown > 0 && (
                <p className="text-xs text-ink-faint">
                  {sys.settings.contextGovernance.mergesOutsideWindow(notShown)}
                </p>
              )}
              {merges.length > 0 && (
                <table className="mt-1 w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-ink-faint">
                      <th className="py-1 font-normal">
                        {sys.settings.contextGovernance.mergesCols.at}
                      </th>
                      <th className="py-1 font-normal">
                        {sys.settings.contextGovernance.mergesCols.from}
                      </th>
                      <th className="py-1 font-normal">
                        {sys.settings.contextGovernance.mergesCols.accepted}
                      </th>
                      <th className="py-1 font-normal">
                        {sys.settings.contextGovernance.mergesCols.added}
                      </th>
                      <th className="py-1 font-normal">
                        {sys.settings.contextGovernance.mergesCols.dropped}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {merges.map((m, i) => (
                      <tr
                        key={`${m.at}-${m.from}-${String(i)}`}
                        className="border-t border-line/60"
                      >
                        <td className="py-1 pr-2 text-ink-body">{formatAt(m.at)}</td>
                        <td className="py-1 pr-2 text-ink-muted">{m.from}</td>
                        <td className="py-1 pr-2 text-ink">{m.accepted}</td>
                        <td className="py-1 pr-2 text-ink">{m.added}</td>
                        <td className="py-1 text-ink">{m.dropped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </details>
          )}
        </div>
      )}
    </Section>
  )
}

/** 时间显示：`MM-DD HH:mm`（本地时区）；解析失败原样显示，不吞掉数据 */
function formatAt(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 按来源文件聚合后的一行（面板折叠区的一眼概览） */
export interface MergedSourceSummary {
  from: string
  /** 该来源的合并总次数（全量） */
  count: number
  accepted: number
  added: number
  dropped: number
  /** 该来源最近一次合并时间（ISO；全量口径） */
  lastAt: string
}

/**
 * 把服务端的**全量**按来源统计排成聚合表行（纯函数，可测）。
 *
 * ## 为什么不再在前端聚合
 *
 * 旧实现用前端拿到的窗口（最近 N 条）聚合 ⇒ **窗口外的来源与次数一概看不到**，
 * 「这个来源到底合并过几次」被窗口截断。现在聚合由服务端做（`mergesBySource`，
 * 跨窗口），前端只负责排序。
 *
 * 排序：**累计净增降序 → 最近合并时间降序 → 文件名**（「长期在贡献的来源」排前面）。
 */
export function mergeSourceRows(
  bySource: Record<string, ContextGovernanceMergeStat> | undefined,
): MergedSourceSummary[] {
  if (bySource === undefined) return []
  return Object.entries(bySource)
    .map(([from, s]) => ({
      from,
      count: s.count,
      accepted: s.accepted,
      added: s.added,
      dropped: s.dropped,
      lastAt: s.lastAt,
    }))
    .sort(
      (a, b) =>
        b.added - a.added || b.lastAt.localeCompare(a.lastAt) || a.from.localeCompare(b.from),
    )
}

/** 一行读数：值缺失时统一显示「未知」，不把 undefined 渲染成 0 */
function Row(props: { label: string; value: number | undefined; judge: string; bad: boolean }) {
  return (
    <tr className="border-t border-line/60">
      <td className="py-1.5 pr-2 text-ink-body">{props.label}</td>
      <td className="py-1.5 pr-2 text-ink">
        {props.value ?? sys.settings.contextGovernance.unknown}
      </td>
      <td className={`py-1.5 ${props.bad ? 'text-danger' : 'text-ink-muted'}`}>{props.judge}</td>
    </tr>
  )
}
