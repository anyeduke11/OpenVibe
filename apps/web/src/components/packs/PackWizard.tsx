import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ADAPTER_IDS,
  LIMITS,
  PACK_NAME_RE,
  SEMVER_RE,
  type AdapterId,
  type ExportOut,
  type HookDef,
  type Hooks,
  type PackCreateInput,
  type PackOut,
} from '@openvibe/shared'
import { ApiError } from '../../api/client'
import { usePackExports, usePackList, usePackMutations, usePackPreview } from '../../hooks/usePacks'
import { useFlowTemplates } from '../../hooks/useFlows'
import { zh } from '../../i18n/zh'
import { toast, toastError } from '../ui/Toaster'
import {
  btnGhost,
  btnPrimary,
  chipPressed,
  chipTone,
  h1Cls,
  h1SubCls,
  inputCls,
  labelCls,
  noteCls,
  segCls,
  segItemCls,
} from '../ui/styles'
import { laneEngineering } from '../../i18n/lane-engineering'
import { AssetPicker, type AssetIds } from './AssetPicker'
import { HookEditor } from './HookEditor'
import { PackPreviewPane } from './PackPreviewPane'

const STEPS = [
  zh.packs.wizard.step1,
  zh.packs.wizard.step2,
  zh.packs.wizard.step3,
  zh.packs.wizard.step4,
  zh.packs.wizard.step5,
  zh.packs.wizard.step6,
]

const EMPTY_STALE: AssetIds = { promptIds: [], termIds: [], skillIds: [], playbookIds: [] }

/** N3 FR-3.3：校验一组钩子（pre/post 各自独立命名空间，组内 name 唯一、无控制字符） */
function validateHookGroup(list: HookDef[], phase: 'pre' | 'post'): string | null {
  const seen = new Set<string>()
  for (const hook of list) {
    if (hook.name.trim() === '') return zh.packs.wizard.hooksNameRequired
    if (/[\u0000-\u001f\u007f]/.test(hook.name)) return zh.packs.wizard.hooksDupName
    if (seen.has(hook.name)) return zh.packs.wizard.hooksNameDup
    seen.add(hook.name)
    if (hook.command.trim() === '') return zh.packs.wizard.hooksCommandRequired
    if (!Number.isInteger(hook.timeoutMs) || hook.timeoutMs <= 0) {
      return zh.packs.wizard.hooksTimeoutRequired
    }
    if (hook.timeoutMs > LIMITS.hooks.maxTimeoutMs) {
      return zh.packs.wizard.hooksTimeoutMax(LIMITS.hooks.maxTimeoutMs)
    }
  }
  return null
}

/** 第 4 步的文件名提示（design §8.2 映射；实际清单以第 6 步预览为准） */
const MAIN_PATH_HINT: Record<AdapterId, string> = {
  'claude-code': 'CLAUDE.md',
  cursor: '.cursor/rules/openvibe.mdc',
  'generic-agents': 'AGENTS.md',
  codebuddy: 'CODEBUDDY.md',
  trae: '.trae/rules/openvibe.md',
  minicode: 'MINI.md',
}

/** 把 STALE_SELECTION 的 details 归一成四栏 id 清单（resolve.ts 的 StaleDetails 形状） */
function toAssetIds(details: unknown): AssetIds {
  const d = (details ?? {}) as Partial<Record<keyof AssetIds | 'flowTemplateId', unknown>>
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    promptIds: list(d.promptIds),
    termIds: list(d.termIds),
    skillIds: list(d.skillIds),
    playbookIds: list(d.playbookIds),
  }
}

/**
 * 五步组装向导（m6a FR-1）。预览与导出都要 packId，故第 4→5 步之间先落定义：
 * 新建走 POST、编辑走 PATCH，保存代次 rev 进预览键，避免拿到上一代缓存。
 */
export function PackWizard(props: { initial: PackOut | null }) {
  const initial = props.initial
  const navigate = useNavigate()
  const packs = usePackList()
  const flows = useFlowTemplates()
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null)
  const [rev, setRev] = useState(0)
  const [step, setStep] = useState(0)
  /** 走到的最远步：步骤条只允许回到走过的步（m6a FR-1「任何一步可回退」） */
  const [maxStep, setMaxStep] = useState(0)
  const goTo = (next: number): void => {
    setStep(next)
    setMaxStep((m) => Math.max(m, next))
  }
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [flowTemplateId, setFlowTemplateId] = useState<string>(
    initial?.selection.flowTemplateId ?? '',
  )
  const [assets, setAssets] = useState<AssetIds>({
    promptIds: initial?.selection.promptIds ?? [],
    termIds: initial?.selection.termIds ?? [],
    skillIds: initial?.selection.skillIds ?? [],
    playbookIds: initial?.selection.playbookIds ?? [],
  })
  const [targets, setTargets] = useState<AdapterId[]>(
    initial?.targets ?? ['claude-code', 'generic-agents'],
  )
  /** N3 FR-3.3：钩子配置（pre/post 两组）。缺省为空集，由 resolvePack 补齐 */
  const [hooks, setHooks] = useState<Hooks>(initial?.selection.hooks ?? { pre: [], post: [] })
  const [version, setVersion] = useState('1.0.0')
  const [stale, setStale] = useState<AssetIds>(EMPTY_STALE)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ExportOut | null>(null)
  /**
   * 表单相对上次保存是否有改动（v0.2.4 F6 / R5）。
   *
   * **为什么需要它**：步骤条允许回到走过的任一步（`i <= maxStep`），而 `goTo(4)`
   * 不经过 `next()` 的保存分支 ⇒ 用户在第 3 步改完资产后直接点步骤条进第 4 步，
   * 预览/导出用的是**旧定义**（`savedId`）。这条标志让「进预览 / 导出」前先落库。
   */
  const [dirty, setDirty] = useState(false)
  const markDirty = (): void => setDirty(true)
  const { create, update, exportPack } = usePackMutations(savedId)

  const items = packs.data?.items ?? []
  const templates = flows.data?.items ?? []
  const preview = usePackPreview(step === 5 ? savedId : null, version, rev)
  const exports = usePackExports(step === 5 ? savedId : null)
  const lastExport = exports.data?.items[0]
  /** §6.2：预览失败常因引用资产被删，明细用于把失效项带回第 3 步标红 */
  const previewStale =
    preview.isError && preview.error instanceof ApiError && preview.error.code === 'STALE_SELECTION'
      ? toAssetIds(preview.error.details)
      : undefined

  const nameTaken = (trimmed: string): boolean =>
    items.some((p) => p.name === trimmed && p.id !== savedId)

  const validateStep = (): string | null => {
    if (step === 0) {
      const trimmed = name.trim()
      if (trimmed === '') return zh.packs.wizard.nameRequired
      if (!PACK_NAME_RE.test(trimmed)) return zh.packs.wizard.nameInvalid
      if (nameTaken(trimmed)) return zh.packs.wizard.nameTaken(trimmed)
    }
    if (step === 2) {
      // m4 §6.4（owner 裁定 ⑤）：技巧**不计入**成包的最低选集——只选技巧仍不可成包，
      // 归因文案在 zh.packs.wizard.assetsRequired 里点明「只选了技巧」。
      const empty =
        assets.promptIds.length + assets.termIds.length + assets.skillIds.length === 0 &&
        flowTemplateId === ''
      if (empty) return zh.packs.wizard.assetsRequired
    }
    if (step === 3 && targets.length === 0) return zh.packs.wizard.targetsRequired
    if (step === 4) {
      const preErr = validateHookGroup(hooks.pre, 'pre')
      if (preErr !== null) return preErr
      const postErr = validateHookGroup(hooks.post, 'post')
      if (postErr !== null) return postErr
    }
    return null
  }

  /** 定义落库（新建或 PATCH 全量），返回 id；失败时把向导带回对应步骤 */
  const saveDefinition = async (): Promise<string | null> => {
    const trimmed = name.trim()
    const selection = {
      promptIds: assets.promptIds,
      termIds: assets.termIds,
      skillIds: assets.skillIds,
      playbookIds: assets.playbookIds,
      flowTemplateId: flowTemplateId === '' ? null : flowTemplateId,
      hooks,
    }
    try {
      let pack: PackOut
      if (savedId === null) {
        const input: PackCreateInput = {
          name: trimmed,
          description,
          selection,
          targets,
        }
        pack = await create.mutateAsync(input)
        setSavedId(pack.id)
      } else {
        pack = await update.mutateAsync({
          id: savedId,
          patch: { name: trimmed, description, selection, targets },
        })
      }
      setRev((n) => n + 1)
      setResult(null)
      setDirty(false)
      toast(zh.packs.wizard.saved)
      return pack.id
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'NAME_CONFLICT') {
        goTo(0)
        toastError(err)
      } else if (err.code === 'STALE_SELECTION') {
        setStale(toAssetIds(err.details))
        goTo(2)
        toastError(err)
      } else {
        toastError(err)
      }
      return null
    }
  }

  /**
   * 进预览 / 导出前确保定义已落库（v0.2.4 F6 / R5）。
   * 有未保存改动 ⇒ 先保存；保存失败（重名 / 选集失效 / 网络）⇒ 返回 null，调用方中止。
   */
  const ensureSaved = async (): Promise<string | null> => {
    if (savedId !== null && !dirty) return savedId
    setSaving(true)
    const id = await saveDefinition()
    setSaving(false)
    return id
  }

  const next = async () => {
    const problem = validateStep()
    if (problem !== null) {
      toast(problem, 'error')
      return
    }
    if (step === 4) {
      // N3 FR-3.3：钩子配置是进预览前的最后一步，进入预览前落库（含 hooks）
      setSaving(true)
      const id = await saveDefinition()
      setSaving(false)
      if (id === null) return
    }
    goTo(Math.min(STEPS.length - 1, step + 1))
  }

  const runExport = async (channel: 'download' | 'directory') => {
    // 有未保存改动 ⇒ 先落库，否则导出的是旧定义（v0.2.4 F6 / R5）
    const id = await ensureSaved()
    if (id === null) return
    if (!SEMVER_RE.test(version)) {
      toast(zh.packs.preview.versionHint, 'error')
      return
    }
    try {
      const out = await exportPack.mutateAsync({ id, body: { version, channel } })
      setResult(out)
      setStale(EMPTY_STALE)
      toast(
        out.status === 'created'
          ? zh.packs.preview.done(out.export.version)
          : zh.packs.preview.idempotent(out.export.version),
      )
      if (out.directoryPath !== null) toast(zh.packs.preview.written(out.directoryPath))
      if (channel === 'download') {
        const a = document.createElement('a')
        a.href = out.bundlePath
        a.download = ''
        a.click()
      }
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'STALE_SELECTION') {
        setStale(toAssetIds(err.details))
        goTo(2)
      }
      toastError(err)
    }
  }

  const checkbox = (id: AdapterId) => (
    <label
      key={id}
      className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
        targets.includes(id) ? 'border-accent bg-accent-soft' : 'border-line bg-panel'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={targets.includes(id)}
        onChange={() => {
          setTargets((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
          markDirty()
        }}
      />
      <span className="min-w-0">
        <span className="block font-medium">{zh.packs.targetLabels[id] ?? id}</span>
        <span className="mono block truncate text-[11px] text-ink-muted">{MAIN_PATH_HINT[id]}</span>
      </span>
    </label>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line-hair px-5 pt-4 pb-3">
        <h1 className={h1Cls}>
          {initial === null ? zh.packs.wizard.title : zh.packs.wizard.editTitle}
        </h1>
        <p className={h1SubCls}>{laneEngineering.view.packNew}</p>
        {/* 步骤条本身就是导航：走过的步都能点回去，未走过的不能点（否则绕过校验直接看空预览） */}
        <ol className={`${segCls} mt-3 flex-wrap`}>
          {STEPS.map((label, i) => {
            const visited = i <= maxStep
            const on = i === step
            return (
              <li key={label}>
                <button
                  type="button"
                  aria-current={on ? 'step' : undefined}
                  disabled={!visited}
                  className={`${segItemCls} ${on ? chipPressed : ''} disabled:opacity-40`}
                  onClick={async () => {
                    // 跳到预览步前先落库：否则预览用的是旧定义（v0.2.4 F6 / R5）
                    if (i === 5) {
                      const id = await ensureSaved()
                      if (id === null) return
                    }
                    goTo(i)
                  }}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ol>
      </header>

      <div className="flex-1 overflow-auto px-5 py-4">
        {step === 0 && (
          <div className="max-w-xl space-y-3 text-sm">
            <div>
              <label className={labelCls}>{zh.packs.wizard.name}</label>
              <input
                className={`${inputCls} mono`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  markDirty()
                }}
                placeholder={zh.packs.wizard.namePlaceholder}
              />
              <p className="mt-1 text-[11px] text-ink-faint">{zh.packs.wizard.nameHint}</p>
            </div>
            <div>
              <label className={labelCls}>{zh.packs.wizard.description}</label>
              <textarea
                className={`${inputCls} min-h-20`}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  markDirty()
                }}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="max-w-2xl space-y-2 text-sm">
            {templates.length === 0 && <p className="text-ink-muted">{zh.packs.wizard.flowNone}</p>}
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 ${
                flowTemplateId === '' ? 'border-accent bg-accent-soft' : 'border-line bg-panel'
              }`}
            >
              <input
                type="radio"
                name="packFlow"
                className="mt-1"
                checked={flowTemplateId === ''}
                onChange={() => {
                  setFlowTemplateId('')
                  markDirty()
                }}
              />
              <span>{zh.packs.wizard.flowSkip}</span>
            </label>
            {templates.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
                  flowTemplateId === t.id ? 'border-accent bg-accent-soft' : 'border-line bg-panel'
                }`}
              >
                <input
                  type="radio"
                  name="packFlow"
                  className="mt-1"
                  checked={flowTemplateId === t.id}
                  onChange={() => {
                    setFlowTemplateId(t.id)
                    markDirty()
                  }}
                />
                <span className="min-w-0">
                  <span className="font-medium">{t.name}</span>
                  <span className={`${chipTone('default')} ml-2`}>
                    {t.builtin ? zh.flows.builtin : zh.flows.custom}
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {`${t.stages.map((s) => s.name).join(' → ')} · ${zh.packs.wizard.flowStages(t.stages.length)}`}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {step === 2 && (
          <AssetPicker
            value={assets}
            stale={stale}
            onChange={(patch) => {
              setStale(EMPTY_STALE)
              setAssets((cur) => ({ ...cur, ...patch }))
              markDirty()
            }}
          />
        )}

        {step === 3 && (
          <div className="max-w-2xl space-y-3 text-sm">
            <p className="text-xs text-ink-muted">{zh.packs.wizard.targetsHint}</p>
            <div className="grid gap-2 sm:grid-cols-2">{ADAPTER_IDS.map(checkbox)}</div>
            <p className="text-[11px] text-ink-faint">{zh.packs.wizard.compatNote}</p>
          </div>
        )}

        {step === 4 && (
          <HookEditor
            value={hooks}
            onChange={(next) => {
              setHooks(next)
              markDirty()
            }}
          />
        )}

        {step === 5 && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <label className={labelCls}>{zh.packs.preview.version}</label>
                <input
                  className={`${inputCls} mono`}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
              <button
                className={btnGhost}
                disabled={exportPack.isPending}
                onClick={() => void runExport('download')}
              >
                {zh.packs.preview.bundle}
              </button>
              <button
                className={btnGhost}
                disabled={exportPack.isPending}
                onClick={() => void runExport('directory')}
              >
                {zh.packs.preview.directory}
              </button>
              <span className="text-[11px] text-ink-faint">{zh.packs.preview.dirHint}</span>
            </div>
            <p className="text-[11px] text-ink-faint">{zh.packs.preview.versionHint}</p>

            {lastExport !== undefined &&
              preview.data !== undefined &&
              preview.data.fingerprint !== lastExport.fingerprint && (
                <p className={`${noteCls('warn')} text-ink-body`}>
                  {zh.packs.preview.changedSince(lastExport.version)}
                </p>
              )}

            {preview.isError && (
              <div className={`${noteCls('danger')} text-ink-body`}>
                {(preview.error as Error).message}
                {previewStale !== undefined && (
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => {
                      setStale(previewStale)
                      goTo(2)
                    }}
                  >
                    {zh.packs.preview.backToAssets}
                  </button>
                )}
              </div>
            )}
            {preview.isLoading && <p className="text-sm text-ink-faint">{zh.common.loading}</p>}
            <div className="min-h-0 flex-1">
              <PackPreviewPane preview={preview.data} />
            </div>

            {result !== null && (
              <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-xs text-ink-body">
                {`${zh.packs.preview.done(result.export.version)} · ${result.status === 'created' ? 'created' : 'idempotent'} · ${result.export.channel} · ${zh.packs.exports.fingerprint} ${result.fingerprint.slice(0, 12)}${result.directoryPath === null ? '' : ` · ${result.directoryPath}`}`}
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-hair px-5 py-2">
        <button className={btnGhost} onClick={() => navigate('/packs')}>
          {zh.packs.title}
        </button>
        <span className="ml-auto" />
        <button
          className={btnGhost}
          disabled={step === 0 || saving}
          onClick={() => goTo(Math.max(0, step - 1))}
        >
          {zh.packs.wizard.prev}
        </button>
        {step < STEPS.length - 1 ? (
          <button className={btnPrimary} disabled={saving} onClick={() => void next()}>
            {saving
              ? zh.packs.wizard.saving
              : step === 4
                ? zh.packs.wizard.saveNext
                : zh.packs.wizard.next}
          </button>
        ) : (
          <button className={btnGhost} disabled={saving} onClick={() => void saveDefinition()}>
            {saving ? zh.packs.wizard.saving : zh.packs.wizard.saveNext}
          </button>
        )}
      </footer>
    </div>
  )
}
