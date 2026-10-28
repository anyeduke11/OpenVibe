import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { DefaultPackOutcomeOut, ReseedOut, SettingsOut } from '@openvibe/shared'
import { ApiError, apiJson } from '../../api/client'
import { useLedger } from '../../hooks/useLedger'
import { usePackExports, usePackList } from '../../hooks/usePacks'
import {
  useExtractConsentClear,
  useExtractConsents,
  useExtractGate,
  useExtractGateToggle,
  useExtractUsage,
  useAdoption,
} from '../../hooks/useExtract'
import { useOm, useReseed, useTelemetrySettings, useTelemetryToggle } from '../../hooks/useSettings'
import { zh } from '../../i18n/zh'
import { sys } from '../../i18n/lane-system'
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  cardBodyCls,
  cardCls,
  cardFootCls,
  cardHeadCls,
  chipTone,
  emptyHintCls,
  ledgerHeadCls,
  ledgerNumCls,
  noteCls,
  noteTitleCls,
  proseCls,
  skelCls,
} from '../ui/styles'
import { QueryError, QueryOffline, QuerySkeleton } from '../ui/QueryStates'
import { Icon, type IconName } from '../ui/icons'
import { toast } from '../ui/Toaster'

const DEFAULT_PACK_NAME = 'default'

/** 设置页的统一分节骨架：cardHeadCls 标题 + 右侧动作 + cardBodyCls 正文 */
export function Section(props: {
  title: string
  icon: IconName
  /** 标题右侧的常驻状态（chip / 计数等），走 chip/tag 而非裸文字 */
  aside?: ReactNode
  hint?: string
  action?: ReactNode
  children: ReactNode
  foot?: ReactNode
}) {
  return (
    <section className={cardCls}>
      <div className={cardHeadCls}>
        <Icon name={props.icon} size={15} className="text-ink-faint" />
        <h2 className="text-sm font-semibold text-ink">{props.title}</h2>
        {props.aside}
        {props.action && <div className="ml-auto shrink-0">{props.action}</div>}
      </div>
      <div className={cardBodyCls}>
        {props.hint !== undefined && (
          <p className={`${proseCls} mb-2.5 text-[13.5px] leading-relaxed text-ink-muted`}>
            {props.hint}
          </p>
        )}
        {props.children}
      </div>
      {props.foot !== undefined && <div className={cardFootCls}>{props.foot}</div>}
    </section>
  )
}

/** 键值行：标签固定宽（元信息），值可换行（路径 / 命令用 mono） */
function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-line-hair py-1.5 last:border-b-0">
      <span className="w-24 shrink-0 text-[11.5px] text-ink-muted">{props.label}</span>
      <span className="min-w-0 flex-1 text-[13.5px] text-ink-body">{props.children}</span>
    </div>
  )
}

/* ---------- 外观 ---------- */

/**
 * 外观：主题切换的**全站唯一入口在顶栏**，这里只做解释与自陈当前值（DESIGN.md Layout）。
 * 不提供第二个开关——两个入口迟早会漂移，而「当前是什么」必须可查。
 */
export function AppearanceSection() {
  const [theme, setTheme] = useState<'paper' | 'night'>('paper')
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'night' : 'paper')
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return (
    <Section
      title={sys.settings.appearance.title}
      icon="sun"
      hint={sys.settings.appearance.body}
      aside={
        <span className={theme === 'night' ? chipTone('accent') : chipTone('default')}>
          <Icon name={theme === 'night' ? 'moon' : 'sun'} size={12} />
          {theme === 'night' ? sys.settings.appearance.night : sys.settings.appearance.paper}
        </span>
      }
    >
      <p className={`${proseCls} text-[13.5px] text-ink-body`}>
        {sys.settings.appearance.switchHint}
      </p>
    </Section>
  )
}

/* ---------- 匿名遥测 ---------- */

export function TelemetrySection() {
  const telemetry = useTelemetrySettings()
  const toggle = useTelemetryToggle()
  const data = telemetry.data
  const on = data?.enabled === true

  const flip = (next: boolean) =>
    toggle.mutate(next, {
      onSuccess: (res) => toast(res.enabled ? zh.settings.telemetry.on : zh.settings.telemetry.off),
      onError: (e: Error) => toast(`${zh.settings.telemetry.failed}: ${e.message}`, 'error'),
    })

  return (
    <Section
      title={sys.settings.telemetry.title}
      icon="pulse"
      aside={
        data === undefined ? null : on ? (
          <span className={chipTone('warn')}>
            <Icon name="pulse" size={12} />
            {sys.settings.telemetry.on}
          </span>
        ) : (
          <span className={chipTone('default')}>
            <Icon name="x" size={12} />
            {sys.settings.telemetry.defaultOff}
          </span>
        )
      }
      action={
        data === undefined ? null : (
          <button
            type="button"
            className={on ? btnSecondary : btnPrimary}
            disabled={toggle.isPending}
            onClick={() => flip(!on)}
          >
            <Icon name={on ? 'x' : 'check'} size={13} />
            {on ? sys.settings.telemetry.toggleOff : sys.settings.telemetry.toggleOn}
          </button>
        )
      }
    >
      {data === undefined ? (
        <div className="space-y-1.5" aria-busy>
          <div className={`${skelCls} h-4 w-2/3`} />
          <div className={`${skelCls} h-4 w-1/2`} />
        </div>
      ) : (
        <>
          <p className={`${proseCls} text-[13.5px] text-ink-body`}>
            {sys.settings.telemetry.offNote}
          </p>
          <table className="mt-2 w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th
                  className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}
                >
                  {sys.settings.telemetry.cols.event}
                </th>
                <th
                  className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}
                >
                  {sys.settings.telemetry.cols.trigger}
                </th>
                <th
                  className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}
                >
                  {sys.settings.telemetry.cols.excludes}
                </th>
              </tr>
            </thead>
            <tbody>
              {sys.settings.telemetry.events.map((e) => (
                <tr key={e.id} className="border-b border-line-hair last:border-b-0">
                  <td className="mono py-1.5 text-ink-body">{e.id}</td>
                  <td className="py-1.5 text-ink-muted">{e.trigger}</td>
                  <td className="py-1.5 text-ink-muted">{e.excludes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-ink-muted">
            {sys.settings.telemetry.askHint(data.askState !== 'unset')} ·{' '}
            {zh.settings.telemetry.state[data.askState]}
          </p>
        </>
      )}
    </Section>
  )
}

/* ---------- 本机自证层（MT 层） ---------- */

/**
 * 事件台账只读展示。
 *
 * 为什么不给「清空」按钮：server 侧只有 `GET /api/telemetry/events`（写端点只在 POST 的
 * 事件入队路径上），没有清空端点。这里因此只讲清「可清空」的事实与代价，不摆一个
 * 点了没反应或会误删资产的假按钮。
 */
export function LedgerSection() {
  const state = useLedger(50)
  const missing = state.error instanceof ApiError && state.error.status === 404
  const items = state.data?.items ?? []

  return (
    <Section
      title={sys.settings.ledger.title}
      icon="lock"
      aside={
        <span className={chipTone('default')}>
          <Icon name="lock" size={12} />
          不出网
        </span>
      }
      foot={
        <>
          <span className={`${proseCls} text-[11.5px] text-ink-muted`}>
            {sys.settings.ledger.clearHint}
          </span>
          <Link to="/growth" className="ml-auto shrink-0 text-xs text-ink-muted hover:text-ink">
            {sys.settings.ledger.openGrowth} ›
          </Link>
        </>
      }
    >
      <p className={`${proseCls} text-[13.5px] text-ink-body`}>{sys.settings.ledger.body}</p>

      {state.isLoading ? (
        <QuerySkeleton wrap="mt-2" />
      ) : missing ? (
        <QueryOffline wrap="mt-2" />
      ) : state.error ? (
        <QueryError wrap="mt-2" error={state.error} onRetry={() => void state.refetch()} />
      ) : items.length === 0 ? (
        <div className="mt-2">
          <div className={emptyHintCls}>
            <p>{sys.settings.ledger.empty}</p>
            <p>{sys.settings.ledger.emptyHint}</p>
            <Link to="/packs" className={btnGhost}>
              <Icon name="pack" size={13} />
              {sys.workbench.action.newPack}
            </Link>
          </div>
        </div>
      ) : (
        <table className="mt-2 w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
                时间
              </th>
              <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
                事件
              </th>
              <th
                className={`${ledgerHeadCls} ${ledgerNumCls} border-b border-line py-1.5 font-normal`}
              >
                累计
              </th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 8).map((e) => (
              <tr key={e.id} className="border-b border-line-hair last:border-b-0">
                <td className="num py-1.5 text-ink-muted">
                  {new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}
                </td>
                <td className="mono py-1.5 text-ink-body">{e.name}</td>
                <td className={`${ledgerNumCls} num py-1.5 text-ink-muted`}>{String(e.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

/* ---------- 数据与路径 ---------- */

/** 重播结果：逐 bundle 状态 + 预置包结论 + 警告，全按服务端原文展示（不美化、不吞原因） */
function ReseedResult(props: { result: ReseedOut | null }) {
  const r = props.result
  if (r === null) return null
  return (
    <div className="mt-2 space-y-1 rounded-md border border-line bg-panel-2 p-3 text-xs">
      <Row label={zh.settings.seed.title}>
        <span className="flex flex-wrap gap-1.5">
          {Object.entries(r.seed.bundles).map(([bundle, status]) => (
            <span key={bundle} className={chipTone(status === 'error' ? 'danger' : 'default')}>
              <Icon name={status === 'error' ? 'alert' : 'check'} size={12} />
              {zh.settings.seed.bundles(bundle, status)}
            </span>
          ))}
        </span>
      </Row>
      <Row label={zh.settings.pack.title}>
        <PackOutcome outcome={r.defaultPack} />
      </Row>
      <Row label={zh.settings.seed.warnings}>
        {r.seed.warnings.length === 0 ? (
          <span className="text-ink-muted">{zh.settings.seed.noWarnings}</span>
        ) : (
          <ul className="space-y-0.5 text-warn">
            {r.seed.warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        )}
      </Row>
    </div>
  )
}

function PackOutcome(props: { outcome: DefaultPackOutcomeOut }) {
  const o = props.outcome
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <span>{zh.settings.seed.outcome(o.status, o.reason ?? '')}</span>
      {o.version !== null && (
        <span className="text-ink-muted">{zh.settings.pack.version(o.version)}</span>
      )}
      {o.directoryPath !== null && (
        <span className="mono w-full break-all text-[11px] text-ink-muted">
          {zh.settings.pack.exportedTo(o.directoryPath)}
        </span>
      )}
    </span>
  )
}

/**
 * 数据与路径：服务事实 + 种子 / 预置包 + 向导标记 + 备份口径。
 * 这些是「只在本机生效」的信息，删了就没地方查，所以一节收纳而不是拆散。
 */
export function PathsSection(props: { settings: SettingsOut | undefined }) {
  const s = props.settings
  const reseed = useReseed()
  const [last, setLast] = useState<ReseedOut | null>(null)

  const packs = usePackList()
  const packId = packs.data?.items.find((p) => p.name === DEFAULT_PACK_NAME)?.id ?? null
  const exports = usePackExports(packId)
  const latest = exports.data?.items[0]

  const run = (after?: (d: ReseedOut) => void) =>
    reseed.mutate(undefined, {
      onSuccess: (data) => {
        setLast(data)
        after?.(data)
        toast(zh.settings.seed.reseeded)
      },
      onError: (e) => toast(`${zh.settings.seed.failed}: ${e.message}`, 'error'),
    })

  const loading = s === undefined

  return (
    <Section
      title={sys.settings.paths.title}
      icon="folder"
      hint={sys.settings.paths.body}
      aside={
        loading ? (
          <span className={chipTone('default')}>
            <Icon name="refresh" size={12} />
            {sys.state.loading}
          </span>
        ) : (
          <span className={chipTone('ok')}>
            <Icon name="check" size={12} />
            {zh.settings.service.title} · {s.db.status}
          </span>
        )
      }
      foot={
        <span className={`${proseCls} text-[11.5px] text-ink-muted`}>
          {sys.settings.paths.serviceHint}
        </span>
      }
    >
      {loading ? (
        <div className="space-y-1.5" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${skelCls} h-4`} />
          ))}
        </div>
      ) : (
        <>
          <Row label={zh.settings.service.version}>
            <span className="mono">{s.appVersion}</span>
          </Row>
          <Row label={zh.settings.service.port}>
            <span className="mono">127.0.0.1:{String(s.port)}</span>
          </Row>
          <Row label={zh.settings.service.dataDir}>
            <span className="mono break-all">{s.dataDir === '' ? zh.common.none : s.dataDir}</span>
          </Row>
          <Row label={zh.settings.service.db}>
            <span className="mono">{s.db.detail ?? s.db.status}</span>
          </Row>
          <Row label={zh.settings.seed.countsLabel}>
            <span className="num">
              {zh.settings.seed.counts(s.seed.terms, s.seed.flowTemplates, s.seed.prompts)}
            </span>
          </Row>
          <Row label={zh.settings.pack.name}>
            {packId === null ? (
              <span className="text-ink-muted">{zh.onboarding.step2.missing}</span>
            ) : (
              <span className="mono">
                {DEFAULT_PACK_NAME}
                {latest !== undefined ? `@${latest.version}` : ''}
              </span>
            )}
          </Row>
          <Row label={zh.settings.wizard.title}>
            <span className="flex flex-wrap items-center gap-2">
              <span>{s.onboardingDone ? zh.settings.wizard.done : zh.settings.wizard.pending}</span>
              <Link to="/projects" className="text-xs text-ink-muted hover:text-ink">
                {zh.nav.workbench} ›
              </Link>
            </span>
          </Row>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={reseed.isPending}
              onClick={() => run()}
            >
              <Icon name="refresh" size={13} />
              {reseed.isPending ? zh.settings.seed.reseeding : zh.settings.seed.reseed}
            </button>
            <Link to="/packs" className={btnGhost}>
              <Icon name="pack" size={13} />
              {zh.settings.pack.rebuild}
            </Link>
            <Link to="/packs/new" className={btnGhost}>
              <Icon name="plus" size={13} />
              组新包
            </Link>
          </div>
          <p className={`${proseCls} mt-1.5 text-[11.5px] text-ink-muted`}>
            {zh.settings.pack.rebuildHint}
          </p>
          <ReseedResult result={last} />
        </>
      )}
    </Section>
  )
}

/* ---------- CLI 命令参考 ---------- */

/** CLI 元数据（来自 `GET /api/cli/commands`；端点未上线时如实说未上线），四态齐全 */
export function CliSection() {
  const [data, setData] = useState<{ items: CliCommand[] } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setState('loading')
    void apiJson<{ items: CliCommand[] }>('/api/cli/commands')
      .then((d) => {
        if (!alive) return
        setData(d)
        setState('ready')
      })
      .catch((e: unknown) => {
        if (!alive) return
        setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error')
      })
    return () => {
      alive = false
    }
  }, [nonce])

  return (
    <Section
      title={sys.settings.cli.title}
      icon="term"
      hint={sys.settings.cli.hint}
      action={
        state === 'error' ? (
          <button type="button" className={btnGhost} onClick={() => setNonce((n) => n + 1)}>
            <Icon name="refresh" size={13} />
            {sys.state.retry}
          </button>
        ) : null
      }
    >
      {state === 'loading' ? (
        <div className="space-y-1.5" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${skelCls} h-4`} />
          ))}
        </div>
      ) : state === 'missing' ? (
        <p className={`${proseCls} text-[13.5px] text-ink-muted`}>{zh.growth.cli.missing}</p>
      ) : state === 'error' ? (
        <div className={emptyHintCls}>
          <p className="text-danger">{sys.state.error('')}</p>
          <button type="button" className={btnGhost} onClick={() => setNonce((n) => n + 1)}>
            <Icon name="refresh" size={13} />
            {sys.state.retry}
          </button>
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
                {zh.growth.cli.command}
              </th>
              <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
                {zh.growth.cli.summary}
              </th>
              <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
                {zh.growth.cli.risk}
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((c) => (
              <tr key={c.name} className="border-b border-line-hair align-top last:border-b-0">
                <td className="mono py-2 text-ink-body">
                  {c.usage}
                  {c.flags.length > 0 && (
                    <div className="mt-1 space-y-0.5 text-[11px] text-ink-muted">
                      {c.flags.map((f) => (
                        <div key={f.name} className="mono">
                          {f.name} {f.value} — {f.summary}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2 text-ink-muted">{c.summary}</td>
                <td className="py-2">
                  <span className={riskTone(c.risk)}>
                    <Icon name={riskIcon(c.risk)} size={12} />
                    {zh.growth.cli.risks[c.risk]}
                    {c.writesDisk ? ` · ${zh.growth.cli.writesDisk}` : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

/** CLI 是唯一能写磁盘的通道：读端点在 git diff 里 */
interface CliCommand {
  name: string
  usage: string
  summary: string
  risk: 'readonly' | 'decision' | 'destructive'
  writesDisk: boolean
  flags: { name: string; value: string; summary: string }[]
}

// 风险档位落三支形制色：只读=default、需决策=warn、破坏性=danger（chip 恒为「图标+文字+颜色」）
const riskTone = (risk: CliCommand['risk']): string =>
  risk === 'destructive'
    ? chipTone('danger')
    : risk === 'decision'
      ? chipTone('warn')
      : chipTone('default')
const riskIcon = (risk: CliCommand['risk']): IconName =>
  risk === 'destructive' ? 'alert' : risk === 'decision' ? 'warn' : 'check'

/* ---------- 第 7 区：可读性与设计系统（theme.md FR-3.6 / DESIGN.md Readability Contract） ---------- */

/** WCAG 2.1 相对亮度（sRGB） */
function relativeLuminance(hex: string): number | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const hexStr = m[1]
  if (!hexStr) return null
  const r = parseInt(hexStr.slice(0, 2), 16) / 255
  const g = parseInt(hexStr.slice(2, 4), 16) / 255
  const b = parseInt(hexStr.slice(4, 6), 16) / 255
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrastRatio(fgHex: string, bgHex: string): number | null {
  const l1 = relativeLuminance(fgHex)
  const l2 = relativeLuminance(bgHex)
  if (l1 === null || l2 === null) return null
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

interface Pair {
  label: string
  fgVar: string
  bgVar: string
  /** 禁区配对：ink-faint 落 -soft 容器 */
  forbidden?: boolean
}

const PAIRS: Pair[] = [
  { label: 'ink on panel', fgVar: '--color-ink', bgVar: '--color-panel' },
  { label: 'ink-body on panel-2', fgVar: '--color-ink-body', bgVar: '--color-panel-2' },
  { label: 'ink-muted on panel-2', fgVar: '--color-ink-muted', bgVar: '--color-panel-2' },
  { label: 'ink-faint on panel-sunk', fgVar: '--color-ink-faint', bgVar: '--color-panel-sunk' },
  { label: 'accent on canvas', fgVar: '--color-accent', bgVar: '--color-canvas' },
  {
    label: 'accent-deep on accent-soft',
    fgVar: '--color-accent-deep',
    bgVar: '--color-accent-soft',
  },
  { label: 'ok on ok-soft', fgVar: '--color-ok', bgVar: '--color-ok-soft' },
  { label: 'warn on warn-soft', fgVar: '--color-warn', bgVar: '--color-warn-soft' },
  { label: 'danger on danger-soft', fgVar: '--color-danger', bgVar: '--color-danger-soft' },
  { label: 'info on info-soft', fgVar: '--color-info', bgVar: '--color-info-soft' },
  {
    label: 'ink-faint on accent-soft',
    fgVar: '--color-ink-faint',
    bgVar: '--color-accent-soft',
    forbidden: true,
  },
  {
    label: 'ink-faint on ok-soft',
    fgVar: '--color-ink-faint',
    bgVar: '--color-ok-soft',
    forbidden: true,
  },
]

/**
 * 可读性量具：运行时读 CSS 变量真算，不是写死的数字。
 * 判定口径 = DESIGN.md Readability Contract：正文阈 4.5（3.0 只给大字）。
 */
export function ReadabilitySection() {
  const [results, setResults] = useState<{ pair: Pair; ratio: number | null }[]>([])

  const compute = () => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    setResults(
      PAIRS.map((pair) => {
        const fg = style.getPropertyValue(pair.fgVar).trim()
        const bg = style.getPropertyValue(pair.bgVar).trim()
        const ratio = fg && bg ? contrastRatio(fg, bg) : null
        return { pair, ratio }
      }),
    )
  }

  useEffect(() => {
    compute()
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          compute()
          return
        }
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  const fails = results.filter((r) => r.ratio !== null && r.ratio < 4.5)

  return (
    <Section
      title={sys.settings.readability.title}
      icon="check"
      hint={sys.settings.readability.hint}
      aside={
        fails.length === 0 ? (
          <span className={chipTone('ok')}>
            <Icon name="check" size={12} />
            {sys.settings.readability.passAll}
          </span>
        ) : (
          <span className={chipTone('danger')}>
            <Icon name="alert" size={12} />
            {sys.settings.readability.failCount(fails.length)}
          </span>
        )
      }
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
              {sys.settings.readability.pairCols.pair}
            </th>
            <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
              {sys.settings.readability.pairCols.sample}
            </th>
            <th
              className={`${ledgerHeadCls} ${ledgerNumCls} border-b border-line py-1.5 font-normal`}
            >
              {sys.settings.readability.pairCols.ratio}
            </th>
            <th className={`${ledgerHeadCls} border-b border-line py-1.5 text-left font-normal`}>
              {sys.settings.readability.pairCols.verdict}
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map(({ pair, ratio }) => {
            const missing = ratio === null
            const pass = !missing && ratio >= 4.5
            return (
              <tr key={pair.label} className="border-b border-line-hair last:border-b-0">
                <td className="py-1.5 pr-2 text-ink-body">
                  <span className="mono text-[11.5px]">{pair.label}</span>
                  {pair.forbidden === true && (
                    <span className={`${chipTone('danger')} ml-1.5`}>
                      <Icon name="x" size={11} />
                      {sys.settings.readability.forbiddenTag}
                    </span>
                  )}
                </td>
                {/* 样例把这一对颜色真的铺出来：量具要看得见，不能只报数字 */}
                <td className="py-1.5 pr-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 text-[11.5px]"
                    style={{
                      background: `var(${pair.bgVar})`,
                      color: `var(${pair.fgVar})`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-[3px] border border-line"
                      style={{ background: `var(${pair.fgVar})` }}
                    />
                    读得清的文字
                  </span>
                </td>
                <td className={`${ledgerNumCls} num py-1.5 text-ink-body`}>
                  {missing ? '—' : ratio.toFixed(2)}
                </td>
                <td className="py-1.5">
                  {missing ? (
                    <span className={chipTone('default')}>
                      <Icon name="x" size={11} />
                      {sys.settings.readability.undeclared}
                    </span>
                  ) : pass ? (
                    <span className={chipTone('ok')}>
                      <Icon name="check" size={11} />
                      {ratio >= 7
                        ? sys.settings.readability.verdict.aaa
                        : sys.settings.readability.verdict.aa}
                    </span>
                  ) : (
                    <span className={chipTone('danger')}>
                      <Icon name="alert" size={11} />
                      {sys.settings.readability.verdict.fail}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className={`${noteCls('info')} mt-3`}>
        <b className={`${noteTitleCls} flex items-center gap-1.5 text-info`}>
          <Icon name="lock" size={13} />
          硬约束
        </b>
        <p className={`${proseCls} text-ink-body`}>{sys.settings.readability.contract}</p>
      </div>
    </Section>
  )
}

/**
 * 输出侧度量（v0.2.3 批次 B RQ5 / PRD OM1+OM2）：设置页「本机统计」区的两件量具。
 * OM1 密度 = 最新标准包的受管 token ÷ 资产数（estimateTokens 估算口径，界面必须标「估算」）；
 * OM2 首次见效 = 首次本机事件 → 首次注入的墙钟差。全部本机现算，零出网，不参与遥测；
 * 数据缺失时如实显示「待采集」，不显示 0（PRD RQ5 验收 2）。
 */
export function OmSection() {
  const state = useOm()
  const om = state.data
  const density = om?.density ?? null
  const time = om?.timeToValue ?? null
  return (
    <Section
      title={sys.settings.om.title}
      icon="chart"
      aside={
        <span className={chipTone('default')}>
          <Icon name="lock" size={12} />
          {sys.settings.om.aside}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        <p className={`${proseCls} text-[13.5px] font-medium text-ink-body`}>
          {sys.settings.om.densityTitle}
        </p>
        {density === null ? (
          <p className={`${proseCls} text-[12.5px] text-ink-muted`}>
            {sys.settings.om.densityEmpty}
          </p>
        ) : (
          <>
            <p className={`${proseCls} text-[12.5px] text-ink-body`}>
              {sys.settings.om.densityLine(
                `${density.packName}@${density.packVersion}`,
                density.managedTokens,
                density.assetCount,
                density.perAsset === null ? '—' : String(density.perAsset),
              )}
            </p>
            {density.top5.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <p className={`${proseCls} text-[11.5px] text-ink-muted`}>
                  {sys.settings.om.top5Title}
                </p>
                {density.top5.map((t) => (
                  <p key={t.path} className={`${proseCls} text-[12px] text-ink-muted`}>
                    {t.path} · {t.tokens} token
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <p className={`${proseCls} mt-2 text-[13.5px] font-medium text-ink-body`}>
          {sys.settings.om.timeTitle}
        </p>
        {time === null || time.seconds === null ? (
          <p className={`${proseCls} text-[12.5px] text-ink-muted`}>{sys.settings.om.timeEmpty}</p>
        ) : (
          <p className={`${proseCls} text-[12.5px] text-ink-body`}>
            {sys.settings.om.timeLine(time.seconds)}
          </p>
        )}
        <p className={`${proseCls} text-[11.5px] text-ink-muted`}>{sys.settings.om.timeRange}</p>
      </div>
    </Section>
  )
}

/**
 * 「AI 与出网」区（M10/D 批次 AN4/AN5 的设置面）：提取总闸（默认关）＋ 采纳率
 * （影子门槛 25%，数据全部从 agent_ingests review 结果现算）＋ 已记住同意的项目
 * （清除 = 删行，DL-21）。取数全部本机，零额外出网——本区展示的是**允许出网**的开关，不是出网本身。
 */
export function AiSection() {
  const gate = useExtractGate()
  const toggleGate = useExtractGateToggle()
  const adoption = useAdoption()
  const consents = useExtractConsents()
  const usage = useExtractUsage()
  const clearConsent = useExtractConsentClear()
  return (
    <Section
      title={sys.settings.aiExtract.title}
      icon="sparkle"
      aside={<span className={chipTone('default')}>{sys.settings.aiExtract.aside}</span>}
    >
      <div className="flex flex-col gap-2">
        <label className={`${proseCls} flex items-center gap-2 text-[13.5px] text-ink-body`}>
          <input
            type="checkbox"
            checked={gate.data?.enabled ?? false}
            onChange={(e) => toggleGate.mutate(e.target.checked)}
          />
          {sys.settings.aiExtract.gateLabel}
        </label>
        <p className={`${proseCls} text-[11.5px] text-ink-muted`}>
          {sys.settings.aiExtract.gateHint}
        </p>
        <p className={`${proseCls} text-[11.5px] text-ink-muted`}>
          {sys.settings.aiExtract.providerHint}
        </p>
        <p className={`${proseCls} mt-2 text-[13.5px] font-medium text-ink-body`}>
          {sys.settings.aiExtract.usageTitle}
        </p>
        {(usage.data?.usage ?? []).length === 0 ? (
          <p className={`${proseCls} text-[12.5px] text-ink-muted`}>
            {sys.settings.aiExtract.usageEmpty}
          </p>
        ) : (
          (usage.data?.usage ?? []).map((u) => (
            <p
              key={`${u.provider}/${u.model}`}
              className={`${proseCls} text-[12.5px] text-ink-body`}
            >
              {u.provider} · {u.model}：{u.calls} 次出网（成功 {u.okCalls}）· 候选 {u.candidates} 条
            </p>
          ))
        )}
        <p className={`${proseCls} mt-2 text-[13.5px] font-medium text-ink-body`}>
          {sys.settings.aiExtract.adoptionTitle}
        </p>
        {(
          (
            adoption.data as unknown as {
              consecutive?: { kind: string; triggered: boolean; rounds: number }[]
            }
          )?.consecutive ?? []
        )
          .filter((c) => c.triggered)
          .map((c) => (
            <p key={c.kind} className={`${noteCls('warn')} mt-1 text-[12px]`}>
              {sys.settings.aiExtract.adoptionLowBanner(c.rounds)}
            </p>
          ))}
        {(adoption.data?.kinds ?? []).filter((k) => k.published + k.rejected > 0).length === 0 ? (
          <p className={`${proseCls} text-[12.5px] text-ink-muted`}>
            {sys.settings.aiExtract.adoptionEmpty}
          </p>
        ) : (
          (adoption.data?.kinds ?? [])
            .filter((k) => k.published + k.rejected > 0)
            .map((k) => (
              <p key={k.kind} className={`${proseCls} text-[12.5px] text-ink-body`}>
                {k.kind}：{k.published} 采纳 / {k.rejected} 拒绝
                {k.rate !== null ? `（${String(Math.round(k.rate * 100))}%）` : ''}
                {k.belowThreshold ? ' · 低于门槛' : ''}
              </p>
            ))
        )}
        <p className={`${proseCls} mt-2 text-[13.5px] font-medium text-ink-body`}>
          {sys.settings.aiExtract.consentTitle}
        </p>
        {(consents.data?.consents ?? []).length === 0 ? (
          <p className={`${proseCls} text-[12.5px] text-ink-muted`}>
            {sys.settings.aiExtract.consentEmpty}
          </p>
        ) : (
          (consents.data?.consents ?? []).map((c) => (
            <div key={c.project_id} className="flex items-center gap-2">
              <span className={`${proseCls} text-[12.5px] text-ink-body`}>{c.project_id}</span>
              <button
                type="button"
                className={btnGhost}
                onClick={() => clearConsent.mutate(c.project_id)}
              >
                {sys.settings.aiExtract.clear}
              </button>
            </div>
          ))
        )}
      </div>
    </Section>
  )
}
