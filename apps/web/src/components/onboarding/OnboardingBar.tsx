import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PreviewOut, SettingsOut } from '@openvibe/shared'
import { usePackList, usePackPreview } from '../../hooks/usePacks'
import { PROBE_MAX_TICKS, useInjectionProbe, useSettings } from '../../hooks/useSettings'
import { zh } from '../../i18n/zh'
import { PackPreviewPane } from '../packs/PackPreviewPane'
import { btnGhost, btnPrimary, inputCls } from '../ui/styles'
import { toast } from '../ui/Toaster'

/** web 不 import server（R4），预置包身份只能按契约里的名字与首版号认（onboarding FR-1.1） */
const DEFAULT_PACK_NAME = 'default'
const DEFAULT_PACK_VERSION = '1.0.0'

/** 建议的测试目录：数据目录（通常是 ~/.openvibe）的同级 openvibe-demo；两种路径分隔符都认 */
export function suggestDemoDir(dataDir: string): string {
  const trimmed = dataDir.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut <= 0) return ''
  return `${trimmed.slice(0, cut)}${trimmed[cut]}openvibe-demo`
}

export interface OnboardingBarProps {
  /** 受控步骤（dev-plan §5.2 的 {step, onSkip, onDone}，多一个 onStepChange 才能翻页） */
  step: number
  onStepChange: (step: number) => void
  /** 跳过：写完成标记（FR-2.1 非全屏遮挡，跳过按钮任何一步都在，§4.4） */
  onSkip: () => void
  /** 走完三步：写完成标记并刷新顶栏统计 */
  onDone: () => void
}

/**
 * 首启向导条（onboarding FR-2）。三步全部只读真实 API——步①库存计数、步②真实 preview、
 * 步③真实 lock 探测（验收 3 红线：不给示意图）。
 */
export function OnboardingBar(props: OnboardingBarProps) {
  const { step } = props
  const settings = useSettings()
  const demoDir = suggestDemoDir(settings.data?.dataDir ?? '')
  const [dir, setDir] = useState('')
  const [checkedManually, setCheckedManually] = useState(false)

  // 建议路径要等 GET /api/settings 回来；用户已经改过就不覆盖
  useEffect(() => {
    if (demoDir !== '') setDir((prev) => (prev === '' ? demoDir : prev))
  }, [demoDir])

  const probe = useInjectionProbe(dir, step === 3)
  const status = probe.data?.status ?? null
  const lockPresent = status?.lockPresent === true

  const packs = usePackList()
  const defaultPackId = packs.data?.items.find((p) => p.name === DEFAULT_PACK_NAME)?.id ?? null
  const preview = usePackPreview(defaultPackId, DEFAULT_PACK_VERSION, 0)

  const syncCommand = `npx openvibe-cli sync "${dir}" --pack ${DEFAULT_PACK_NAME}`
  const diffCommand = `npx openvibe-cli diff "${dir}"`
  const copy = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast(zh.onboarding.step3.copied))
      .catch(() => toast(zh.onboarding.step3.copyFailed, 'error'))
  }

  return (
    <section
      aria-label={zh.onboarding.title}
      className="border-b border-brand/20 bg-brand-soft px-6 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-brand">{zh.onboarding.title}</span>
        <span className="text-xs text-zinc-500">{zh.onboarding.stepOf(step)}</span>
        <button
          type="button"
          onClick={props.onSkip}
          className="ml-auto text-xs text-zinc-500 underline-offset-2 hover:underline"
        >
          {zh.onboarding.skip}
        </button>
      </div>

      <div className="mt-1.5 text-sm text-zinc-700">
        {step === 1 && <StepAssets seed={settings.data?.seed} />}
        {step === 2 && (
          <StepPackPreview
            found={defaultPackId !== null}
            loading={preview.isPending}
            preview={preview.data}
          />
        )}
        {step === 3 && (
          <div>
            <p className="font-medium">{zh.onboarding.step3.title}</p>
            <p className="text-xs text-zinc-500">{zh.onboarding.step3.body}</p>

            <label className="mt-1.5 block text-[11px] text-zinc-500">
              {zh.onboarding.step3.dirLabel}
              <input
                className={`${inputCls} mt-0.5`}
                value={dir}
                onChange={(e) => {
                  setDir(e.target.value)
                  setCheckedManually(false)
                }}
              />
            </label>

            <CommandLine command={syncCommand} onCopy={copy} />

            {!lockPresent && (
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  className={btnGhost}
                  disabled={probe.isFetching}
                  onClick={() => {
                    setCheckedManually(true)
                    void probe.refetch()
                  }}
                >
                  {zh.onboarding.step3.manual}
                </button>
                {!probe.exhausted && (
                  <span className="text-zinc-500">
                    {zh.onboarding.step3.checking(probe.ticks, PROBE_MAX_TICKS)}
                  </span>
                )}
                {(checkedManually || probe.exhausted) && (
                  <span className="text-amber-700">
                    {status?.error ??
                      probe.data?.problem ??
                      (probe.exhausted
                        ? zh.onboarding.step3.exhausted
                        : zh.onboarding.step3.waiting)}
                  </span>
                )}
              </div>
            )}

            {lockPresent && status?.pack !== undefined && (
              <div className="mt-1.5 space-y-1">
                <p className="text-sm font-medium text-emerald-700">
                  {zh.onboarding.step3.detected(status.pack.name, status.pack.version)}
                </p>
                {status.injectedAt !== undefined && (
                  <p className="text-[11px] text-zinc-400">
                    {zh.onboarding.step3.detectedAt(status.injectedAt)}
                  </p>
                )}
                <p className="text-xs text-zinc-500">{zh.onboarding.step3.diffHint}</p>
                <CommandLine command={diffCommand} onCopy={copy} />
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button type="button" className={btnPrimary} onClick={props.onDone}>
                    {zh.onboarding.step3.done}
                  </button>
                  <span className="text-[11px] text-zinc-400">{zh.onboarding.step3.doneHint}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {step > 1 && (
          <button type="button" className={btnGhost} onClick={() => props.onStepChange(step - 1)}>
            {zh.onboarding.prev}
          </button>
        )}
        {step < 3 && (
          <button type="button" className={btnPrimary} onClick={() => props.onStepChange(step + 1)}>
            {zh.onboarding.next}
          </button>
        )}
      </div>
    </section>
  )
}

function StepAssets(props: { seed: SettingsOut['seed'] | undefined }) {
  const seed = props.seed
  return (
    <div>
      <p className="font-medium">{zh.onboarding.step1.title}</p>
      <p className="text-xs text-zinc-500">{zh.onboarding.step1.body}</p>
      {seed !== undefined && (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <li>{zh.onboarding.step1.prompts(seed.prompts)}</li>
          <li>{zh.onboarding.step1.terms(seed.terms)}</li>
          <li>{zh.onboarding.step1.flows(seed.flowTemplates)}</li>
        </ul>
      )}
      <div className="mt-1.5 flex gap-3 text-xs">
        <Link to="/library" className="text-brand underline-offset-2 hover:underline">
          {zh.onboarding.step1.library}
        </Link>
        <Link to="/terms" className="text-brand underline-offset-2 hover:underline">
          {zh.onboarding.step1.termsLink}
        </Link>
        <Link to="/flows" className="text-brand underline-offset-2 hover:underline">
          {zh.onboarding.step1.flowsLink}
        </Link>
      </div>
    </div>
  )
}

function StepPackPreview(props: { found: boolean; loading: boolean; preview: PreviewOut | undefined }) {
  if (!props.found) {
    return (
      <div>
        <p className="font-medium">{zh.onboarding.step2.title}</p>
        {/* 边界 1：预置包缺失（被删或首启组装失败）时降级为组包向导链接，不放假数据 */}
        <p className="text-xs text-zinc-500">{zh.onboarding.step2.missing}</p>
        <Link to="/packs/new" className="text-xs text-brand underline-offset-2 hover:underline">
          {zh.onboarding.step2.missingLink}
        </Link>
      </div>
    )
  }
  return (
    <div>
      <p className="font-medium">{zh.onboarding.step2.title}</p>
      <p className="text-xs text-zinc-500">{zh.onboarding.step2.body}</p>
      {props.loading && <p className="mt-1 text-xs text-zinc-400">{zh.onboarding.step2.loading}</p>}
      <div className="mt-2 max-h-[52vh] overflow-auto rounded-md border border-zinc-200 bg-white p-3">
        <PackPreviewPane preview={props.preview} />
      </div>
    </div>
  )
}

function CommandLine(props: { command: string; onCopy: (text: string) => void }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code className="mono min-w-0 flex-1 truncate rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700">
        {props.command}
      </code>
      <button type="button" className={btnGhost} onClick={() => props.onCopy(props.command)}>
        {zh.onboarding.step3.copy}
      </button>
    </div>
  )
}
