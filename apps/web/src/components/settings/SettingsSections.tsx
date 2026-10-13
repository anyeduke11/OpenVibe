import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { DefaultPackOutcomeOut, ReseedOut, SettingsOut } from '@openvibe/shared'
import { usePackExports, usePackList } from '../../hooks/usePacks'
import {
  useOnboardingToggle,
  useReseed,
  useTelemetrySettings,
  useTelemetryToggle,
} from '../../hooks/useSettings'
import { zh } from '../../i18n/zh'
import { btnGhost, btnPrimary, chipTone } from '../ui/styles'
import { toast } from '../ui/Toaster'

const DEFAULT_PACK_NAME = 'default'

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold text-ink-body">{props.title}</h2>
      <div className="mt-2 space-y-2 text-sm text-ink-body">{props.children}</div>
    </section>
  )
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs text-ink-muted">{props.label}</span>
      <span className="min-w-0 flex-1">{props.children}</span>
    </div>
  )
}

export function ServiceSection(props: { settings: SettingsOut | undefined }) {
  const s = props.settings
  return (
    <Section title={zh.settings.service.title}>
      <Row label={zh.settings.service.version}>
        <span className="mono">{s?.appVersion ?? zh.common.loading}</span>
      </Row>
      <Row label={zh.settings.service.port}>
        <span className="mono">{s === undefined ? zh.common.loading : String(s.port)}</span>
      </Row>
      <Row label={zh.settings.service.dataDir}>
        <span className="mono break-all">{s?.dataDir === '' ? zh.common.none : (s?.dataDir ?? zh.common.loading)}</span>
      </Row>
      <Row label={zh.settings.service.db}>
        <span className="mono">{s?.db.detail ?? s?.db.status ?? zh.common.loading}</span>
      </Row>
      <p className="text-xs text-ink-muted">{zh.settings.service.hint}</p>
    </Section>
  )
}

/** 重播结果：逐 bundle 状态 + 预置包结论 + 警告，全按服务端原文展示（不美化、不吞原因） */
export function ReseedResult(props: { result: ReseedOut | null }) {
  const r = props.result
  if (r === null) return null
  return (
    <div className="space-y-1 rounded-md border border-line bg-panel-2 p-3 text-xs">
      <Row label={zh.settings.seed.title}>
        <span className="flex flex-wrap gap-1.5">
          {Object.entries(r.seed.bundles).map(([bundle, status]) => (
            <span key={bundle} className={chipTone('default')}>
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
          <span className="text-ink-faint">{zh.settings.seed.noWarnings}</span>
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
      {o.version !== null && <span className="text-ink-muted">{zh.settings.pack.version(o.version)}</span>}
      {o.directoryPath !== null && (
        <span className="mono w-full break-all text-[11px] text-ink-muted">
          {zh.settings.pack.exportedTo(o.directoryPath)}
        </span>
      )}
    </span>
  )
}

/** 种子重播 + 预置包重建同一入口（POST /api/settings/reseed 内部就是这两步） */
export function SeedSection(props: { settings: SettingsOut | undefined }) {
  const seed = props.settings?.seed
  const reseed = useReseed()
  const [last, setLast] = useState<ReseedOut | null>(null)

  const run = () =>
    reseed.mutate(undefined, {
      onSuccess: (data) => {
        setLast(data)
        toast(zh.settings.seed.reseeded)
      },
      onError: (e) => toast(`${zh.settings.seed.failed}: ${e.message}`, 'error'),
    })

  return (
    <Section title={zh.settings.seed.title}>
      <Row label={zh.settings.seed.countsLabel}>
        {seed !== undefined ? (
          zh.settings.seed.counts(seed.terms, seed.flowTemplates, seed.prompts)
        ) : (
          zh.common.loading
        )}
      </Row>
      <p className="text-xs text-ink-muted">{zh.settings.seed.hint}</p>
      <button type="button" className={btnPrimary} disabled={reseed.isPending} onClick={run}>
        {reseed.isPending ? zh.settings.seed.reseeding : zh.settings.seed.reseed}
      </button>
      <ReseedResult result={last} />
    </Section>
  )
}

export function PackSection() {
  const packs = usePackList()
  const id = packs.data?.items.find((p) => p.name === DEFAULT_PACK_NAME)?.id ?? null
  const exports = usePackExports(id)
  const reseed = useReseed()
  const [last, setLast] = useState<ReseedOut | null>(null)
  const latest = exports.data?.items[0]

  return (
    <Section title={zh.settings.pack.title}>
      <p className="text-xs text-ink-muted">{zh.settings.pack.hint}</p>
      <Row label={zh.settings.pack.name}>
        {id === null ? (
          <span className="text-ink-faint">{zh.onboarding.step2.missing}</span>
        ) : (
          <span className="mono">
            {DEFAULT_PACK_NAME}
            {latest !== undefined ? `@${latest.version}` : ''}
          </span>
        )}
      </Row>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={reseed.isPending}
          onClick={() =>
            reseed.mutate(undefined, {
              onSuccess: (data) => setLast(data),
              onError: (e) => toast(`${zh.settings.seed.failed}: ${e.message}`, 'error'),
            })
          }
        >
          {zh.settings.pack.rebuild}
        </button>
        <Link to="/packs" className="text-xs text-accent underline-offset-2 hover:underline">
          {zh.nav.packs}
        </Link>
      </div>
      <p className="text-[11px] text-ink-faint">{zh.settings.pack.rebuildHint}</p>
      <ReseedResult result={last} />
    </Section>
  )
}

export function TelemetrySection() {
  const telemetry = useTelemetrySettings()
  const toggle = useTelemetryToggle()
  const data = telemetry.data

  return (
    <Section title={zh.settings.telemetry.title}>
      {data === undefined ? (
        <p className="text-xs text-ink-faint">{zh.common.loading}</p>
      ) : (
        <>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.enabled}
              disabled={toggle.isPending}
              onChange={(e) =>
                toggle.mutate(e.target.checked, {
                  onSuccess: (next) =>
                    toast(next.enabled ? zh.settings.telemetry.on : zh.settings.telemetry.off),
                  onError: (e) => toast(`${zh.settings.telemetry.failed}: ${e.message}`, 'error'),
                })
              }
            />
            <span>{zh.settings.telemetry.enabled}</span>
            <span className={chipTone('default')}>
              {zh.settings.telemetry.state[data.askState]}
            </span>
          </label>
          <p className="text-xs text-ink-muted">{zh.settings.telemetry.hint}</p>
          <p className="text-[11px] text-ink-faint">{zh.telemetryAsk.whitelist(data.whitelist.join(' / '))}</p>
        </>
      )}
    </Section>
  )
}

export function WizardSection(props: { settings: SettingsOut | undefined }) {
  const toggle = useOnboardingToggle()
  return (
    <Section title={zh.settings.wizard.title}>
      <p className="text-xs text-ink-muted">{zh.settings.wizard.hint}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btnGhost}
          disabled={toggle.isPending}
          onClick={() => void toggle.mutate(false)}
        >
          {zh.settings.wizard.reset}
        </button>
        <span className="text-xs text-ink-muted">
          {props.settings === undefined
            ? zh.common.loading
            : props.settings.onboardingDone
              ? zh.settings.wizard.done
              : zh.settings.wizard.pending}
        </span>
      </div>
    </Section>
  )
}

export function BackupSection() {
  return (
    <Section title={zh.settings.backup.title}>
      <p className="text-xs leading-relaxed text-ink-muted">{zh.settings.backup.body}</p>
    </Section>
  )
}

/* ---------- 可读性与设计系统（第 7 区，theme.md FR-3.6 / DESIGN.md Readability Contract） ---------- */

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
  forbidden?: boolean
}

const PAIRS: Pair[] = [
  { label: 'ink on panel', fgVar: '--color-ink', bgVar: '--color-panel' },
  { label: 'ink-body on panel-2', fgVar: '--color-ink-body', bgVar: '--color-panel-2' },
  { label: 'ink-muted on panel-2', fgVar: '--color-ink-muted', bgVar: '--color-panel-2' },
  { label: 'ink-faint on panel-sunk', fgVar: '--color-ink-faint', bgVar: '--color-panel-sunk' },
  { label: 'accent on canvas', fgVar: '--color-accent', bgVar: '--color-canvas' },
  { label: 'accent-deep on accent-soft', fgVar: '--color-accent-deep', bgVar: '--color-accent-soft' },
  { label: 'ok on ok-soft', fgVar: '--color-ok', bgVar: '--color-ok-soft' },
  { label: 'warn on warn-soft', fgVar: '--color-warn', bgVar: '--color-warn-soft' },
  { label: 'danger on danger-soft', fgVar: '--color-danger', bgVar: '--color-danger-soft' },
  { label: 'info on info-soft', fgVar: '--color-info', bgVar: '--color-info-soft' },
  { label: 'ink-faint on accent-soft', fgVar: '--color-ink-faint', bgVar: '--color-accent-soft', forbidden: true },
  { label: 'ink-faint on ok-soft', fgVar: '--color-ink-faint', bgVar: '--color-ok-soft', forbidden: true },
]

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const themeName = document.documentElement.dataset.theme === 'dark' ? '暖夜' : '暖纸'

  return (
    <Section title="可读性与设计系统">
      <p className="text-xs text-ink-muted">
        主题切换入口在顶栏右侧（全站唯一入口），设置页不提供第二个开关。
      </p>
      <div className="mt-1 text-[11px] text-ink-faint">当前主题：{themeName}</div>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line-hair text-left">
            <th className="pb-1 pr-2 font-medium text-ink-faint">配对</th>
            <th className="pb-1 px-2 font-medium text-ink-faint">对比度</th>
            <th className="pb-1 pl-2 font-medium text-ink-faint">判定</th>
          </tr>
        </thead>
        <tbody>
          {results.map(({ pair, ratio }) => {
            const missing = ratio === null
            const pass = !missing && ratio >= 4.5
            const forbidden = pair.forbidden
            return (
              <tr key={pair.label} className="border-b border-line-hair">
                <td className="py-1 pr-2 text-ink-body">
                  <span className="mono text-[11px]">{pair.label}</span>
                  {forbidden && (
                    <span className="ml-1 text-[10px] text-danger">禁区</span>
                  )}
                </td>
                <td className="py-1 px-2 text-ink-muted">
                  {missing ? (
                    <span className="text-ink-faint">token 未声明</span>
                  ) : (
                    <span className="mono tabular-nums">{ratio.toFixed(2)}</span>
                  )}
                </td>
                <td className="py-1 pl-2">
                  {missing ? (
                    <span className="flex items-center gap-1 text-ink-faint">
                      <CrossIcon /> 未声明
                    </span>
                  ) : pass ? (
                    <span className="flex items-center gap-1 text-ok">
                      <CheckIcon /> ≥4.5 AA
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-danger">
                      <CrossIcon /> &lt;4.5 不达标
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-ink-faint">
        ink-faint 不得落五类 -soft 容器（暖夜下 accent-soft 4.29 / ok-soft 4.41，均 &lt;4.5）。
      </p>
    </Section>
  )
}
