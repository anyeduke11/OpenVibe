import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ADAPTER_IDS,
  PACK_NAME_RE,
  SEMVER_RE,
  type AdapterId,
  type ExportOut,
  type PackCreateInput,
  type PackOut,
} from '@openvibe/shared'
import { ApiError } from '../../api/client'
import { usePackExports, usePackList, usePackMutations, usePackPreview } from '../../hooks/usePacks'
import { useFlowTemplates } from '../../hooks/useFlows'
import { zh } from '../../i18n/zh'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls, inputCls, labelCls } from '../ui/styles'
import { AssetPicker, type AssetIds } from './AssetPicker'
import { PackPreviewPane } from './PackPreviewPane'

const STEPS = [
  zh.packs.wizard.step1,
  zh.packs.wizard.step2,
  zh.packs.wizard.step3,
  zh.packs.wizard.step4,
  zh.packs.wizard.step5,
]

const EMPTY_STALE: AssetIds = { promptIds: [], termIds: [], skillIds: [] }

/** 第 4 步的文件名提示（design §8.2 映射；实际清单以第 5 步预览为准） */
const MAIN_PATH_HINT: Record<AdapterId, string> = {
  'claude-code': 'CLAUDE.md',
  cursor: '.cursor/rules/openvibe.mdc',
  'generic-agents': 'AGENTS.md',
  codebuddy: 'CODEBUDDY.md',
  trae: '.trae/rules/openvibe.md',
  minicode: 'MINI.md',
}

/** 把 STALE_SELECTION 的 details 归一成三栏 id 清单（resolve.ts 的 StaleDetails 形状） */
function toAssetIds(details: unknown): AssetIds {
  const d = (details ?? {}) as Partial<Record<keyof AssetIds | 'flowTemplateId', unknown>>
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return { promptIds: list(d.promptIds), termIds: list(d.termIds), skillIds: list(d.skillIds) }
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
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [flowTemplateId, setFlowTemplateId] = useState<string>(initial?.selection.flowTemplateId ?? '')
  const [assets, setAssets] = useState<AssetIds>({
    promptIds: initial?.selection.promptIds ?? [],
    termIds: initial?.selection.termIds ?? [],
    skillIds: initial?.selection.skillIds ?? [],
  })
  const [targets, setTargets] = useState<AdapterId[]>(initial?.targets ?? ['claude-code', 'generic-agents'])
  const [version, setVersion] = useState('1.0.0')
  const [stale, setStale] = useState<AssetIds>(EMPTY_STALE)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ExportOut | null>(null)
  const { create, update, exportPack } = usePackMutations(savedId)

  const items = packs.data?.items ?? []
  const templates = flows.data?.items ?? []
  const preview = usePackPreview(step === 4 ? savedId : null, version, rev)
  const exports = usePackExports(step === 4 ? savedId : null)
  const lastExport = exports.data?.items[0]
  /** §6.2：预览失败常因引用资产被删，明细用于把失效项带回第 3 步标红 */
  const previewStale =
    preview.isError &&
    preview.error instanceof ApiError &&
    preview.error.code === 'STALE_SELECTION'
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
      const empty =
        assets.promptIds.length + assets.termIds.length + assets.skillIds.length === 0 &&
        flowTemplateId === ''
      if (empty) return zh.packs.wizard.assetsRequired
    }
    if (step === 3 && targets.length === 0) return zh.packs.wizard.targetsRequired
    return null
  }

  /** 定义落库（新建或 PATCH 全量），返回 id；失败时把向导带回对应步骤 */
  const saveDefinition = async (): Promise<string | null> => {
    const trimmed = name.trim()
    const selection = {
      promptIds: assets.promptIds,
      termIds: assets.termIds,
      skillIds: assets.skillIds,
      playbookIds: [],
      flowTemplateId: flowTemplateId === '' ? null : flowTemplateId,
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
      toast(zh.packs.wizard.saved)
      return pack.id
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'NAME_CONFLICT') {
        setStep(0)
        toast(err.message, 'error')
      } else if (err.code === 'STALE_SELECTION') {
        setStale(toAssetIds(err.details))
        setStep(2)
        toast(err.message, 'error')
      } else {
        toast(err.message, 'error')
      }
      return null
    }
  }

  const next = async () => {
    const problem = validateStep()
    if (problem !== null) {
      toast(problem, 'error')
      return
    }
    if (step === 3) {
      setSaving(true)
      const id = await saveDefinition()
      setSaving(false)
      if (id === null) return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const runExport = async (channel: 'download' | 'directory') => {
    if (savedId === null) return
    if (!SEMVER_RE.test(version)) {
      toast(zh.packs.preview.versionHint, 'error')
      return
    }
    try {
      const out = await exportPack.mutateAsync({ id: savedId, body: { version, channel } })
      setResult(out)
      setStale(EMPTY_STALE)
      toast(out.status === 'created' ? zh.packs.preview.done(out.export.version) : zh.packs.preview.idempotent(out.export.version))
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
        setStep(2)
      }
      toast(err.message, 'error')
    }
  }

  const checkbox = (id: AdapterId) => (
    <label
      key={id}
      className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
        targets.includes(id) ? 'border-brand bg-brand-soft' : 'border-zinc-200 bg-white'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={targets.includes(id)}
        onChange={() =>
          setTargets((cur) =>
            cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
          )
        }
      />
      <span className="min-w-0">
        <span className="block font-medium">{zh.packs.targetLabels[id] ?? id}</span>
        <span className="mono block truncate text-[11px] text-zinc-500">{MAIN_PATH_HINT[id]}</span>
      </span>
    </label>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <h1 className="text-base font-semibold">{`${
          initial === null ? zh.packs.wizard.title : zh.packs.wizard.editTitle
        } · ${STEPS[step] ?? ''}`}</h1>
        <span className="ml-auto text-[11px] text-zinc-400">{`${String(step + 1)} / ${String(STEPS.length)}`}</span>
      </header>

      <div className="flex-1 overflow-auto px-5 py-4">
        {step === 0 && (
          <div className="max-w-xl space-y-3 text-sm">
            <div>
              <label className={labelCls}>{zh.packs.wizard.name}</label>
              <input
                className={`${inputCls} mono`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={zh.packs.wizard.namePlaceholder}
              />
              <p className="mt-1 text-[11px] text-zinc-400">{zh.packs.wizard.nameHint}</p>
            </div>
            <div>
              <label className={labelCls}>{zh.packs.wizard.description}</label>
              <textarea
                className={`${inputCls} min-h-20`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="max-w-2xl space-y-2 text-sm">
            {templates.length === 0 && <p className="text-zinc-500">{zh.packs.wizard.flowNone}</p>}
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 ${
                flowTemplateId === '' ? 'border-brand bg-brand-soft' : 'border-zinc-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="packFlow"
                className="mt-1"
                checked={flowTemplateId === ''}
                onChange={() => setFlowTemplateId('')}
              />
              <span>{zh.packs.wizard.flowSkip}</span>
            </label>
            {templates.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
                  flowTemplateId === t.id ? 'border-brand bg-brand-soft' : 'border-zinc-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="packFlow"
                  className="mt-1"
                  checked={flowTemplateId === t.id}
                  onChange={() => setFlowTemplateId(t.id)}
                />
                <span className="min-w-0">
                  <span className="font-medium">{t.name}</span>
                  <span className={`${chipCls} ml-2 border-zinc-200 bg-zinc-50 text-zinc-500`}>
                    {t.builtin ? zh.flows.builtin : zh.flows.custom}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
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
            }}
          />
        )}

        {step === 3 && (
          <div className="max-w-2xl space-y-3 text-sm">
            <p className="text-xs text-zinc-500">{zh.packs.wizard.targetsHint}</p>
            <div className="grid gap-2 sm:grid-cols-2">{ADAPTER_IDS.map(checkbox)}</div>
            <p className="text-[11px] text-zinc-400">{zh.packs.wizard.compatNote}</p>
          </div>
        )}

        {step === 4 && (
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
              <span className="text-[11px] text-zinc-400">{zh.packs.preview.dirHint}</span>
            </div>
            <p className="text-[11px] text-zinc-400">{zh.packs.preview.versionHint}</p>

            {lastExport !== undefined &&
              preview.data !== undefined &&
              preview.data.fingerprint !== lastExport.fingerprint && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {zh.packs.preview.changedSince(lastExport.version)}
                </p>
              )}

            {preview.isError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {(preview.error as Error).message}
                {previewStale !== undefined && (
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => {
                      setStale(previewStale)
                      setStep(2)
                    }}
                  >
                    {zh.packs.preview.backToAssets}
                  </button>
                )}
              </div>
            )}
            {preview.isLoading && <p className="text-sm text-zinc-400">{zh.common.loading}</p>}
            <div className="min-h-0 flex-1">
              <PackPreviewPane preview={preview.data} />
            </div>

            {result !== null && (
              <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                {`${zh.packs.preview.done(result.export.version)} · ${result.status === 'created' ? 'created' : 'idempotent'} · ${result.export.channel} · ${zh.packs.exports.fingerprint} ${result.fingerprint.slice(0, 12)}${result.directoryPath === null ? '' : ` · ${result.directoryPath}`}`}
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-zinc-100 px-5 py-2">
        <button className={btnGhost} onClick={() => navigate('/packs')}>
          {zh.packs.title}
        </button>
        <span className="ml-auto" />
        <button
          className={btnGhost}
          disabled={step === 0 || saving}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          {zh.packs.wizard.prev}
        </button>
        {step < STEPS.length - 1 ? (
          <button className={btnPrimary} disabled={saving} onClick={() => void next()}>
            {saving ? zh.packs.wizard.saving : step === 3 ? zh.packs.wizard.saveNext : zh.packs.wizard.next}
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
