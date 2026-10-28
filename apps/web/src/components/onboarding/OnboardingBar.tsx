import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PreviewOut, SettingsOut } from '@openvibe/shared'
import { usePackList, usePackPreview } from '../../hooks/usePacks'
import { PROBE_MAX_TICKS, useInjectionProbe, useSettings } from '../../hooks/useSettings'
import { zh } from '../../i18n/zh'
import { sys } from '../../i18n/lane-system'
import { PackPreviewPane } from '../packs/PackPreviewPane'
import {
  btnGhost,
  btnPrimary,
  cardBodyCls,
  cardCls,
  cardFootCls,
  cardHeadCls,
  chipTone,
  inputCls,
  labelCls,
  proseCls,
  skelCls,
  type ChipTone,
} from '../ui/styles'
import { Icon, type IconName } from '../ui/icons'
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
  /** 走完三步：写完成标记并刷新统计 */
  onDone: () => void
}

const STEP_NAMES: readonly string[] = sys.onboarding.steps

/**
 * 首启向导卡（onboarding FR-2）。它是**工作台的一张卡**，不是顶栏横幅——
 * 壳层已于本轮清掉常驻横幅（AppShell 纪律 2），首启用户落在 `/`，看得到。
 *
 * 三步全部只读真实 API，每步都有真实副作用：步①库存计数、步②真实 preview、
 * 步③真实 lock 探测 + 可复制的 sync/diff 命令（验收 3 红线：不给示意图）。
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
    <section aria-label={zh.onboarding.title} className={cardCls}>
      <div className={cardHeadCls}>
        <Icon name="flow" size={15} className="text-accent" />
        <h2 className="text-sm font-semibold text-ink">{sys.onboarding.title}</h2>
        {/* chip = 状态（图标 + 文字 + 颜色三通道）；步数固定 3，可直接跳 */}
        <span className="flex flex-wrap items-center gap-1.5">
          {STEP_NAMES.map((name, i) => {
            const at = i + 1
            const tone: ChipTone = at < step ? 'ok' : at === step ? 'accent' : 'default'
            const icon: IconName = at < step ? 'check' : 'clock'
            return (
              <button
                key={name}
                type="button"
                aria-pressed={at === step}
                onClick={() => props.onStepChange(at)}
                className={chipTone(tone)}
              >
                <Icon name={icon} size={12} />
                {`${String(at)}. ${name}`}
              </button>
            )
          })}
        </span>
        <button
          type="button"
          onClick={props.onSkip}
          className={`${btnGhost} ml-auto shrink-0 px-2 py-0.5 text-[11.5px]`}
        >
          {zh.onboarding.skip}
        </button>
      </div>

      <div className={cardBodyCls}>
        <p className={`${proseCls} mb-2.5 text-xs text-ink-muted`}>{sys.onboarding.subtitle}</p>
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
            <p className="text-sm font-medium text-ink">{zh.onboarding.step3.title}</p>
            <p className={`${proseCls} mt-0.5 text-xs text-ink-muted`}>
              {zh.onboarding.step3.body}
            </p>

            <label className={`${labelCls} mt-2`} htmlFor="onboarding-dir">
              {zh.onboarding.step3.dirLabel}
              <input
                id="onboarding-dir"
                className={`${inputCls} mono mt-0.5`}
                value={dir}
                onChange={(e) => {
                  setDir(e.target.value)
                  setCheckedManually(false)
                }}
              />
            </label>

            <CommandLine command={syncCommand} onCopy={copy} />

            {!lockPresent && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  className={btnGhost}
                  disabled={probe.isFetching}
                  onClick={() => {
                    setCheckedManually(true)
                    void probe.refetch()
                  }}
                >
                  <Icon name="check" size={13} />
                  {zh.onboarding.step3.manual}
                </button>
                {!probe.exhausted && (
                  <span className="num text-ink-muted">
                    {zh.onboarding.step3.checking(probe.ticks, PROBE_MAX_TICKS)}
                  </span>
                )}
                {(checkedManually || probe.exhausted) && (
                  <span className="flex items-center gap-1 text-warn">
                    <Icon name="warn" size={13} />
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
              <div className="mt-2 space-y-1.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
                  <Icon name="check" size={14} />
                  {zh.onboarding.step3.detected(status.pack.name, status.pack.version)}
                </p>
                {status.injectedAt !== undefined && (
                  <p className="num text-[11.5px] text-ink-muted">
                    {zh.onboarding.step3.detectedAt(status.injectedAt)}
                  </p>
                )}
                <p className={`${proseCls} text-xs text-ink-muted`}>
                  {zh.onboarding.step3.diffHint}
                </p>
                <CommandLine command={diffCommand} onCopy={copy} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cardFootCls}>
        {step > 1 ? (
          <button type="button" className={btnGhost} onClick={() => props.onStepChange(step - 1)}>
            <Icon name="back" size={13} />
            {zh.onboarding.prev}
          </button>
        ) : (
          <span />
        )}
        {lockPresent && step === 3 ? (
          <>
            <button type="button" className={btnPrimary} onClick={props.onDone}>
              <Icon name="check" size={13} />
              {zh.onboarding.step3.done}
            </button>
            <span className="text-[11.5px] text-ink-muted">{zh.onboarding.step3.doneHint}</span>
          </>
        ) : (
          step < 3 && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => props.onStepChange(step + 1)}
            >
              {zh.onboarding.next}
              <Icon name="fwd" size={13} />
            </button>
          )
        )}
      </div>
    </section>
  )
}

function StepAssets(props: { seed: SettingsOut['seed'] | undefined }) {
  const seed = props.seed
  return (
    <div>
      <p className="text-sm font-medium text-ink">{zh.onboarding.step1.title}</p>
      <p className={`${proseCls} mt-0.5 text-xs text-ink-muted`}>{zh.onboarding.step1.body}</p>
      {seed === undefined ? (
        <div className="mt-2 flex gap-2" aria-busy>
          <span className={`${skelCls} h-3 w-24`} />
          <span className={`${skelCls} h-3 w-20`} />
          <span className={`${skelCls} h-3 w-20`} />
        </div>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {[
            zh.onboarding.step1.prompts(seed.prompts),
            zh.onboarding.step1.terms(seed.terms),
            zh.onboarding.step1.flows(seed.flowTemplates),
          ].map((line) => (
            <li key={line} className={chipTone('default')}>
              <Icon name="check" size={12} />
              <span className="num">{line}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Link to="/library" className={btnGhost}>
          {zh.onboarding.step1.library}
        </Link>
        <Link to="/terms" className={btnGhost}>
          {zh.onboarding.step1.termsLink}
        </Link>
        <Link to="/flows" className={btnGhost}>
          {zh.onboarding.step1.flowsLink}
        </Link>
      </div>
    </div>
  )
}

function StepPackPreview(props: {
  found: boolean
  loading: boolean
  preview: PreviewOut | undefined
}) {
  if (!props.found) {
    return (
      <div>
        <p className="text-sm font-medium text-ink">{zh.onboarding.step2.title}</p>
        {/* 边界 1：预置包缺失（被删或首启组装失败）时降级为组包向导链接，不放假数据 */}
        <p className={`${proseCls} mt-0.5 text-xs text-ink-muted`}>{zh.onboarding.step2.missing}</p>
        <Link to="/packs/new" className={`${btnGhost} mt-2`}>
          <Icon name="pack" size={13} />
          {zh.onboarding.step2.missingLink}
        </Link>
      </div>
    )
  }
  return (
    <div>
      <p className="text-sm font-medium text-ink">{zh.onboarding.step2.title}</p>
      <p className={`${proseCls} mt-0.5 text-xs text-ink-muted`}>{zh.onboarding.step2.body}</p>
      {props.loading ? (
        <div className="mt-2 space-y-1.5" aria-busy>
          <span className="block h-3 w-48 animate-pulse rounded-sm bg-panel-2" />
          <span className="block h-3 w-64 animate-pulse rounded-sm bg-panel-2" />
          <span className="block h-3 w-40 animate-pulse rounded-sm bg-panel-2" />
        </div>
      ) : (
        <div className="mt-2 max-h-[46vh] overflow-auto rounded-md border border-line bg-panel p-3">
          <PackPreviewPane preview={props.preview} />
        </div>
      )}
    </div>
  )
}

function CommandLine(props: { command: string; onCopy: (text: string) => void }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code className="mono min-w-0 flex-1 truncate rounded-sm border border-line bg-panel-sunk px-2 py-1 text-xs text-ink-body">
        {props.command}
      </code>
      <button type="button" className={btnGhost} onClick={() => props.onCopy(props.command)}>
        <Icon name="copy" size={13} />
        {zh.onboarding.step3.copy}
      </button>
    </div>
  )
}
