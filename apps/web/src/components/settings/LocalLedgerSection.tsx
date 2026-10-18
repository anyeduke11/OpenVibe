import { useState } from 'react'
import { ApiError } from '../../api/client'
import {
  useClearLocalEvents,
  useLocalEventsSummary,
  type LocalEventsWindowDays,
} from '../../hooks/useLocalEvents'
import { sys } from '../../i18n/lane-system'
import { Section } from './SettingsSections'
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  chipTone,
  emptyHintCls,
  ledgerHeadCls,
  ledgerNumCls,
  noteCls,
  noteTitleCls,
  proseCls,
  skelCls,
} from '../ui/styles'
import { Icon } from '../ui/icons'
import { toast } from '../ui/Toaster'
import { Dialog, DialogPanel } from '../ui/Dialog'

/**
 * 设置页的**真·本机事件台账**节（local-event-ledger.md FR-3.2 / FR-7 · §7-i / §7-l）。
 *
 * ## ⚠️ 与 `LedgerSection` 是两节两表，别合并
 *
 * `LedgerSection` 读 `/api/telemetry/events` → `telemetry_events` 表：受匿名遥测开关控制、
 * 带 `sent_at`、**会被发出**；`TelemetrySection` 读的是同一层的设置。
 * 本节读 `/api/local-events/summary` → `local_events` 表：无条件本机写、永不出网。
 *
 * FR-2.2 要求两者 kind 闭集严格不同名，理由就是「混名会让『关了遥测就没记录』这个误解
 * 被代码坐实」。本节正文第一句就把这个正交关系讲死，就是为了在两节并存时不产生误读。
 *
 * ## 为什么窗预设要标 UTC
 *
 * `day` 是 UTC 日戳（2026-10-14 裁定②），而用户脑中的「今天」是本机日。
 * 跨时区时两者会差一天，所以窗与合计都显式标注口径，不让用户自己猜差在哪。
 */
const WINDOWS: { days: LocalEventsWindowDays; label: string }[] = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 0, label: '全部' },
]

export function LocalLedgerSection() {
  const [days, setDays] = useState<LocalEventsWindowDays>(30)
  // `now` 取一次就固定：每次渲染都 new Date() 会让 queryKey 抖动、反复重取
  const [now] = useState(() => new Date())
  const state = useLocalEventsSummary(days, now)
  const clear = useClearLocalEvents()
  const [confirming, setConfirming] = useState(false)

  const missing = state.error instanceof ApiError && state.error.status === 404
  const data = state.data

  const doClear = async () => {
    try {
      const out = await clear.mutateAsync()
      setConfirming(false)
      toast(sys.settings.localLedger.cleared(String(out.cleared)))
    } catch (e) {
      toast(sys.state.error(e instanceof Error ? e.message : ''), 'error')
    }
  }

  return (
    <Section
      title={sys.settings.localLedger.title}
      icon="lock"
      aside={
        <span className={chipTone('default')}>
          <Icon name="lock" size={12} />
          {sys.settings.localLedger.offlineChip}
        </span>
      }
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              className={days === w.days ? btnSecondary : btnGhost}
              aria-pressed={days === w.days}
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </button>
          ))}
          <button
            type="button"
            className={btnPrimary}
            disabled={clear.isPending || data?.cumulativeTotal === 0}
            onClick={() => setConfirming(true)}
          >
            <Icon name="x" size={13} />
            {sys.settings.localLedger.clear}
          </button>
        </div>
      }
    >
      <p className={`${proseCls} text-[13.5px] text-ink-body`}>{sys.settings.localLedger.body}</p>

      {state.isLoading ? (
        <div className="mt-2 space-y-1.5" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${skelCls} h-4`} />
          ))}
        </div>
      ) : missing ? (
        <p className="mt-2 text-[13px] text-ink-muted">{sys.state.notOnline}</p>
      ) : state.error ? (
        <div className="mt-2">
          <div className={emptyHintCls}>
            <p className="text-danger">
              {sys.state.error(state.error instanceof Error ? state.error.message : '')}
            </p>
            <button type="button" className={btnGhost} onClick={() => void state.refetch()}>
              <Icon name="refresh" size={13} />
              {sys.state.retry}
            </button>
          </div>
        </div>
      ) : !data || data.cumulativeTotal === 0 ? (
        <div className="mt-2">
          <div className={emptyHintCls}>
            <p>{sys.settings.localLedger.empty}</p>
            <p>{sys.settings.localLedger.emptyHint}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2.5">
            <div className={noteCls('info')}>
              <b className={`${noteTitleCls} flex items-center gap-1.5 text-info`}>
                <Icon name="chart" size={13} />
                {sys.settings.localLedger.scope}
              </b>
              {/* 窗内与累计必须同时在场：只看窗内会把「这段有 3 次」误读成「本机一直这么安静」 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={`${proseCls} text-[11.5px] text-ink-muted`}>
                    {sys.settings.localLedger.windowLabel}
                  </div>
                  <div className={ledgerNumCls}>{String(data.windowTotal)}</div>
                  <div className={`${proseCls} text-[11.5px] text-ink-muted`}>
                    {`${data.window.from} → ${data.window.to}`}
                  </div>
                </div>
                <div>
                  <div className={`${proseCls} text-[11.5px] text-ink-muted`}>
                    {sys.settings.localLedger.cumulativeLabel}
                  </div>
                  <div className={ledgerNumCls}>{String(data.cumulativeTotal)}</div>
                  <div className={`${proseCls} text-[11.5px] text-ink-muted`}>
                    {sys.settings.localLedger.activeDays(data.activeDays)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {data.byKind.length > 0 && (
            <table className="mt-2.5 w-full border-collapse text-[13px]">
              <thead>
                <tr className={ledgerHeadCls}>
                  <th className="text-left font-normal">{sys.settings.localLedger.colKind}</th>
                  <th className="text-right font-normal">
                    {sys.settings.localLedger.colWindow}
                  </th>
                  <th className="text-right font-normal">
                    {sys.settings.localLedger.colCumulative}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cumulativeByKind(data.cumulativeByKind, data.byKind).map(({ kind, inWindow, total }) => (
                  <tr key={kind} className="border-t border-line-hair">
                    <td className="py-1.5 text-ink-body">{kind}</td>
                    <td className="py-1.5 text-right text-ink">{String(inWindow)}</td>
                    <td className="py-1.5 text-right text-ink-muted">{String(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className={`${proseCls} mt-2 text-[11.5px] text-ink-muted`}>
            {sys.settings.localLedger.utcNote}
          </p>
        </>
      )}

      <Dialog open={confirming} onOpenChange={(o) => (o ? undefined : setConfirming(false))}>
        <DialogPanel
          title={sys.settings.localLedger.clearDialog.title}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setConfirming(false)}>
                {sys.settings.localLedger.cancel}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={clear.isPending}
                onClick={() => void doClear()}
              >
                {sys.settings.localLedger.clearDialog.confirm}
              </button>
            </>
          }
        >
          <p className="text-[13.5px] text-ink-body">{sys.settings.localLedger.clearDialog.body}</p>
          <p className={`${proseCls} mt-2 text-[13px] text-danger`}>
            {sys.settings.localLedger.clearDialog.irreversible}
          </p>
        </DialogPanel>
      </Dialog>
    </Section>
  )
}

/**
 * 把「窗内按 kind」与「累计按 kind」并成一张表。
 *
 * ⚠️ 必须以**累计**那一侧为主表键：窗内可能没有某个 kind（一行都没有），
 * 用窗内做主键会把「累计有 128 次但这个窗一条都没有」的类别整行丢掉 ——
 * 那恰恰是用户最需要看见的一行。
 */
function cumulativeByKind(
  cumulative: { kind: string; count: number }[],
  inWindow: { kind: string; count: number }[] = [],
): { kind: string; inWindow: number; total: number }[] {
  const win = new Map(inWindow.map((r) => [r.kind, r.count]))
  return cumulative
    .map((r) => ({ kind: r.kind, inWindow: win.get(r.kind) ?? 0, total: r.count }))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
}
