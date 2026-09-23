import { useState, type ReactNode } from 'react'
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
import { btnGhost, btnPrimary, chipCls } from '../ui/styles'
import { toast } from '../ui/Toaster'

const DEFAULT_PACK_NAME = 'default'

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-800">{props.title}</h2>
      <div className="mt-2 space-y-2 text-sm text-zinc-700">{props.children}</div>
    </section>
  )
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs text-zinc-500">{props.label}</span>
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
      <p className="text-xs text-zinc-500">{zh.settings.service.hint}</p>
    </Section>
  )
}

/** 重播结果：逐 bundle 状态 + 预置包结论 + 警告，全按服务端原文展示（不美化、不吞原因） */
export function ReseedResult(props: { result: ReseedOut | null }) {
  const r = props.result
  if (r === null) return null
  return (
    <div className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
      <Row label={zh.settings.seed.title}>
        <span className="flex flex-wrap gap-1.5">
          {Object.entries(r.seed.bundles).map(([bundle, status]) => (
            <span key={bundle} className={`${chipCls} border-zinc-200 bg-white text-zinc-600`}>
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
          <span className="text-zinc-400">{zh.settings.seed.noWarnings}</span>
        ) : (
          <ul className="space-y-0.5 text-amber-700">
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
      {o.version !== null && <span className="text-zinc-500">{zh.settings.pack.version(o.version)}</span>}
      {o.directoryPath !== null && (
        <span className="mono w-full break-all text-[11px] text-zinc-500">
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
      <p className="text-xs text-zinc-500">{zh.settings.seed.hint}</p>
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
      <p className="text-xs text-zinc-500">{zh.settings.pack.hint}</p>
      <Row label={zh.settings.pack.name}>
        {id === null ? (
          <span className="text-zinc-400">{zh.onboarding.step2.missing}</span>
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
        <Link to="/packs" className="text-xs text-brand underline-offset-2 hover:underline">
          {zh.nav.packs}
        </Link>
      </div>
      <p className="text-[11px] text-zinc-400">{zh.settings.pack.rebuildHint}</p>
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
        <p className="text-xs text-zinc-400">{zh.common.loading}</p>
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
            <span className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-500`}>
              {zh.settings.telemetry.state[data.askState]}
            </span>
          </label>
          <p className="text-xs text-zinc-500">{zh.settings.telemetry.hint}</p>
          <p className="text-[11px] text-zinc-400">{zh.telemetryAsk.whitelist(data.whitelist.join(' / '))}</p>
        </>
      )}
    </Section>
  )
}

export function WizardSection(props: { settings: SettingsOut | undefined }) {
  const toggle = useOnboardingToggle()
  return (
    <Section title={zh.settings.wizard.title}>
      <p className="text-xs text-zinc-500">{zh.settings.wizard.hint}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btnGhost}
          disabled={toggle.isPending}
          onClick={() => void toggle.mutate(false)}
        >
          {zh.settings.wizard.reset}
        </button>
        <span className="text-xs text-zinc-500">
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
      <p className="text-xs leading-relaxed text-zinc-500">{zh.settings.backup.body}</p>
    </Section>
  )
}
