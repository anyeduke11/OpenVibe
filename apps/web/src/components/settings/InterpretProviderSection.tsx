import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../ui/icons'
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  chipTone,
  inputCls,
  labelCls,
  noteCls,
  noteTitleCls,
  rowCls,
  segCls,
  segItemCls,
  skelCls,
  type ChipTone,
} from '../ui/styles'
import { Section } from './SettingsSections'
import { useLangInterpretCapability, useLangProviderConfig } from '../../hooks/useLangSource'
import type {
  InterpretProviderEntrySave,
  InterpretProviderEntryView,
  InterpretProviderKeyStorage,
  InterpretProviderKind,
} from '@openvibe/shared'

/**
 * 设置页的**「AI 解读」**区（owner 2026-10-22 裁决一 ＋ **增强 2：多份并存**）。
 *
 * ## 它是什么
 *
 * 让用户**手动调控**「用哪个 provider 解读源码」—— 此前这件事**只能靠环境变量**，
 * 界面上没有入口。
 *
 * ## ⚠️ **多份并存**（增强 2）：列表 ＋ 选中编辑
 *
 * | 能力 | 落点 |
 * |---|---|
 * | 按**项目**选 | 每份的 `projects`（**空数组 = 通用**） |
 * | 按**接口形态**选 | 每份的 `kind`（命令适配器 / OpenAI 兼容接口） |
 * | 不绑定时的兜底 | `default_provider_id`（默认那一份） |
 *
 * ⇒ 界面因此是**「多份列表 ＋ 编辑选中的那一份」**，保存时**一次 PUT 整份集合**
 *   （逐份 PUT 表达不了「删掉哪一份」）。
 *
 * ## 两种形态（**各覆盖一类真实接入**）
 *
 * | 形态 | 覆盖什么 |
 * |---|---|
 * | 命令适配器 | 任何遵守「stdin 收 JSON / stdout 出 JSON」的 CLI（Pi 的包装脚本等） |
 * | OpenAI 兼容接口 | **本机模型**（Ollama / LM Studio / vLLM）与**云端 API** —— 两者同一种协议 |
 *
 * ## ⚠️ 开关**默认关**（DL-08 的下限）
 *
 * 没配 ⇒ AI 不可用 ⇒ **确定性层照常**（T0 的静态识别、掌握度推导都不依赖 AI）。
 * ⇒ 这一节必须在界面上**说清「关着会怎样」**，否则用户以为功能坏了。
 *
 * ## ⚠️ key **只显示末 4 位**，且**读端压根不回显全文**
 *
 * 视图形状里装不下全文（`InterpretProviderEntryView`）⇒ 这件事在类型上就发生不了。
 * ⇒ 输入框留空表示「**保持原值**」（不是清空）—— 改一下模型名不该把 key 抹掉。
 */
const L = {
  title: 'AI 解读',
  hint: '源码的「AI 解读」需要一个 provider。可以配多份：按项目绑定，或用默认那一份。没配置或全部关掉时，源码识别与掌握度推导照常工作（AI 只负责解读，不参与判定）。',
  listTitle: '配置列表',
  add: '新增一份',
  addHint: '新增的是一份空白草稿（默认关着）；填完记得保存。',
  name: '名称',
  nameHint: '自己起的名字；留空时列表里显示 provider / 模型名。',
  projects: '绑定项目',
  projectsHint: '项目 id 用逗号分隔（如 p1、proj-2026）；留空 = 通用，任何项目都能用这份。',
  projectsGeneral: '通用',
  projectsBound: (ids: string[]) => `绑定：${ids.join('、')}`,
  setDefault: '设为默认',
  isDefault: '默认',
  editing: '编辑中',
  remove: '删除这份',
  removeBlocked: '至少要留一份 —— 删掉最后一份就没有 provider 可用了。',
  enabled: '启用 AI 解读',
  enabledNote: '关着时不会向任何地方发送源码片段；勾选的片段只在本机读取。',
  kind: '接入方式',
  kindCommand: '命令适配器',
  kindHttp: 'OpenAI 兼容接口',
  cmd: '解读命令',
  cmdHint: '命令名或路径；它要从 stdin 收 JSON、从 stdout 出 JSON。',
  args: '命令参数',
  argsHint: '用逗号分隔（逐个传，不是一整串命令行）。',
  endpoint: '接口地址',
  endpointHint: 'OpenAI 兼容的 chat/completions 完整地址，本机与云端同一种协议。',
  model: '模型标识',
  modelHint: '本机模型也填（如 qwen2.5-coder:7b）；写进解读记录，便于回看是谁答的。',
  provider: 'provider 标识',
  providerHint: '如 ollama / openai / pi；同样写进解读记录。',
  apiKey: 'API key',
  apiKeyHint: '本机接口通常留空；云端接口填上。留空表示保持原值，不会覆盖已配置的 key。',
  apiKeyConfigured: (hint: string) => `已配置（末 ${hint}）`,
  apiKeyNone: '未配置',
  keyStorageLabel: '存放位置',
  keyStoragePlainTitle: 'key 以明文存放',
  clearKey: '清除 key',
  timeout: '超时（毫秒）',
  save: '保存',
  saving: '保存中',
  saved: '已保存',
  loadFail: '读不到当前配置。',
  saveFail: '保存失败。',
  statusLabel: '当前状态',
  statusReady: '可用',
  statusMisconfigured: '配好了但用不了',
  statusUnconfigured: '未配置',
  on: '启用',
  off: '停用',
  unnamed: '未命名',
  argsPlaceholder: 'run, --json',
  cmdPlaceholder: 'pi',
  endpointPlaceholder: 'http://127.0.0.1:11434/v1/chat/completions',
  modelPlaceholder: 'qwen2.5-coder:7b',
  providerPlaceholder: 'ollama',
  projectsPlaceholder: 'p1, proj-2026',
} as const

const STATUS_TONE: Record<'ready' | 'misconfigured' | 'unconfigured', ChipTone> = {
  ready: 'ok',
  misconfigured: 'warn',
  unconfigured: 'default',
}

const STATUS_ICON: Record<'ready' | 'misconfigured' | 'unconfigured', IconName> = {
  ready: 'check',
  misconfigured: 'warn',
  unconfigured: 'info',
}

const STATUS_TEXT: Record<'ready' | 'misconfigured' | 'unconfigured', string> = {
  ready: L.statusReady,
  misconfigured: L.statusMisconfigured,
  unconfigured: L.statusUnconfigured,
}

/** 逗号分隔的一串 ⇢ 逐项（去空白、去空项）。命令参数与项目 id 共用这一份口径。 */
function parseCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * 编辑区的一份**本地草稿**。
 *
 * ⚠️ **草稿 ≠ 落库**：改到这儿的东西要按「保存」才发出去
 *   （新增/删除/改字段都是本地的 ⇒ 误删可以「不保存」当没发生过）。
 */
interface Draft {
  id: string
  name: string
  /** 项目 id 的原始文本（逗号分隔）——存的是原文，解析结果另算 */
  projectsRaw: string
  enabled: boolean
  kind: InterpretProviderKind
  cmd: string
  argsRaw: string
  endpoint: string
  model: string
  provider: string
  /** 输入框里的 key（空 = 保持原值） */
  apiKeyInput: string
  /** 点了「清除 key」⇒ 保存时显式传空串 */
  keyCleared: boolean
  timeoutMs: number
  /** 以下四项来自读端（**脱敏视图**）—— 新建的草稿没有 */
  hasApiKey: boolean
  apiKeyHint: string
  apiKeyStorage: InterpretProviderKeyStorage
  apiKeyStorageDetail: string
}

function toDraft(v: InterpretProviderEntryView): Draft {
  return {
    id: v.id,
    name: v.name,
    projectsRaw: v.projects.join(','),
    enabled: v.enabled,
    kind: v.kind,
    cmd: v.cmd,
    argsRaw: v.args.join(','),
    endpoint: v.endpoint,
    model: v.model,
    provider: v.provider,
    apiKeyInput: '',
    keyCleared: false,
    timeoutMs: v.timeout_ms,
    hasApiKey: v.has_api_key,
    apiKeyHint: v.api_key_hint,
    apiKeyStorage: v.api_key_storage,
    apiKeyStorageDetail: v.api_key_storage_detail,
  }
}

/** 列表里显示的名字：显示名 → provider → 模型 → 命令 → 未命名。 */
function displayName(d: Draft): string {
  if (d.name !== '') return d.name
  if (d.provider !== '') return d.provider
  if (d.model !== '') return d.model
  if (d.cmd !== '') return d.cmd
  return L.unnamed
}

export function InterpretProviderSection() {
  const { query, save } = useLangProviderConfig()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaultId, setDefaultId] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const loaded = useRef(false)
  /** 本次会话里发出去过的 id ⇒ 新增时不能重号 */
  const usedIds = useRef<Set<string>>(new Set())

  // ⚠️ **只探测选中的那一份**（不传 id ⇒ 服务端按「项目绑定 → 默认」自己选）
  const capability = useLangInterpretCapability(selectedId)

  // ⚠️ **只在第一次拿到配置时灌进本地草稿** ——
  //   之后每次 refetch 都不该把用户正在改的内容冲掉。
  useEffect(() => {
    const view = query.data
    if (view === undefined || loaded.current) return
    loaded.current = true
    const next = view.providers.map(toDraft)
    for (const d of next) usedIds.current.add(d.id)
    setDrafts(next)
    setDefaultId(view.default_provider_id)
    setSelectedId(next[0]?.id ?? null)
  }, [query.data])

  const selected = drafts.find((d) => d.id === selectedId) ?? null

  const patch = (id: string, next: Partial<Draft>): void => {
    setJustSaved(false)
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)))
  }

  const onAdd = (): void => {
    // ⚠️ **同一次会话里不能重号**（id 撞了 ⇒ 「改哪一份」就指不定了）
    const base = `p-${String(Date.now())}`
    let id = base
    let n = 1
    while (usedIds.current.has(id)) {
      id = `${base}-${String(n)}`
      n += 1
    }
    usedIds.current.add(id)
    const draft: Draft = {
      id,
      name: '',
      projectsRaw: '',
      enabled: false,
      kind: 'command',
      cmd: '',
      argsRaw: '',
      endpoint: '',
      model: '',
      provider: '',
      apiKeyInput: '',
      keyCleared: false,
      timeoutMs: 30_000,
      hasApiKey: false,
      apiKeyHint: '',
      apiKeyStorage: 'none',
      apiKeyStorageDetail: '',
    }
    setJustSaved(false)
    setDrafts((prev) => [...prev, draft])
    setSelectedId(id)
  }

  const onRemove = (): void => {
    if (selected === null || drafts.length <= 1) return
    const rest = drafts.filter((d) => d.id !== selected.id)
    setJustSaved(false)
    setDrafts(rest)
    // ⚠️ **删掉的那份正好是默认** ⇒ 默认要挪走（不能指向一个不存在的那一份）
    if (defaultId === selected.id) setDefaultId(rest[0]?.id ?? '')
    setSelectedId(rest[0]?.id ?? null)
  }

  const onSetDefault = (): void => {
    if (selected === null) return
    setJustSaved(false)
    setDefaultId(selected.id)
  }

  const onSave = (): void => {
    setJustSaved(false)
    const providers: InterpretProviderEntrySave[] = drafts.map((d) => {
      const entry: InterpretProviderEntrySave = {
        id: d.id,
        name: d.name,
        projects: parseCsv(d.projectsRaw),
        enabled: d.enabled,
        kind: d.kind,
        cmd: d.cmd,
        args: parseCsv(d.argsRaw),
        endpoint: d.endpoint,
        model: d.model,
        provider: d.provider,
        timeout_ms: d.timeoutMs,
      }
      // ⚠️ **key 三态**：**不带字段 = 保持原值**；空串 = 清除
      if (d.keyCleared) entry.api_key = ''
      else if (d.apiKeyInput !== '') entry.api_key = d.apiKeyInput
      return entry
    })
    save.mutate(
      { providers, default_provider_id: defaultId },
      { onSuccess: () => setJustSaved(true) },
    )
  }

  const status = capability.data?.status ?? 'unconfigured'
  const detail = capability.data?.detail ?? ''

  return (
    <Section
      title={L.title}
      icon="sparkle"
      hint={L.hint}
      aside={
        <span className={chipTone(STATUS_TONE[status])}>
          <Icon name={STATUS_ICON[status]} size={12} />
          {STATUS_TEXT[status]}
        </span>
      }
      foot={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={save.isPending || query.isPending}
            onClick={onSave}
          >
            <Icon name="check" size={13} />
            {save.isPending ? L.saving : L.save}
          </button>
          {justSaved && <span className="text-xs text-ink-muted">{L.saved}</span>}
          {save.isError && <span className="text-xs text-danger">{L.saveFail}</span>}
        </div>
      }
    >
      {query.isPending ? (
        <div className={skelCls} />
      ) : query.isError ? (
        <p className="text-[13.5px] text-ink-muted">{L.loadFail}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* ---------- 列表区（多份并存） ---------- */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">{L.listTitle}</span>
            <button type="button" className={btnGhost} onClick={onAdd}>
              <Icon name="plus" size={13} />
              {L.add}
            </button>
          </div>

          <ul className="rounded-md border border-line">
            {drafts.map((d) => {
              const isDefault = d.id === defaultId
              const isSelected = d.id === selectedId
              const projects = parseCsv(d.projectsRaw)
              return (
                <li key={d.id} className={`${rowCls} last:border-b-0`} aria-selected={isSelected}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
                    onClick={() => setSelectedId(d.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink-body">
                          {displayName(d)}
                        </span>
                        {isDefault && (
                          <span className={chipTone('accent')}>
                            <Icon name="check" size={11} />
                            {L.isDefault}
                          </span>
                        )}
                        {isSelected && (
                          <span className={chipTone('default')}>
                            <Icon name="cog" size={11} />
                            {L.editing}
                          </span>
                        )}
                      </span>
                      {/* ⚠️ 元信息用 `ink-muted`（不用 `ink-faint`）——
                          选中行是 accent-soft 底，`ink-faint` 落在上面暖夜只有 4.29:1 */}
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        <span>{d.kind === 'command' ? L.kindCommand : L.kindHttp}</span>
                        <span>{` · ${d.enabled ? L.on : L.off}`}</span>
                        {d.model !== '' && <span>{` · 模型 ${d.model}`}</span>}
                        {d.provider !== '' && <span>{` · provider ${d.provider}`}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        {projects.length === 0 ? L.projectsGeneral : L.projectsBound(projects)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="text-xs text-ink-faint">{L.addHint}</p>

          {/* ---------- 编辑区（编辑选中的那一份） ---------- */}
          {selected !== null && (
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelCls} htmlFor="m9-provider-name">
                  {L.name}
                </label>
                <input
                  id="m9-provider-name"
                  className={inputCls}
                  value={selected.name}
                  onChange={(e) => patch(selected.id, { name: e.target.value })}
                />
                <p className="mt-1 text-xs text-ink-faint">{L.nameHint}</p>
              </div>

              <div>
                <label className={labelCls} htmlFor="m9-provider-projects">
                  {L.projects}
                </label>
                <input
                  id="m9-provider-projects"
                  className={`${inputCls} mono`}
                  value={selected.projectsRaw}
                  placeholder={L.projectsPlaceholder}
                  onChange={(e) => patch(selected.id, { projectsRaw: e.target.value })}
                />
                <p className="mt-1 text-xs text-ink-faint">{L.projectsHint}</p>
              </div>

              <label className="flex items-start gap-2 text-[13.5px] text-ink-body">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.enabled}
                  onChange={(e) => patch(selected.id, { enabled: e.target.checked })}
                />
                <span>
                  {L.enabled}
                  <span className="mt-0.5 block text-xs text-ink-faint">{L.enabledNote}</span>
                </span>
              </label>

              <div>
                <span className={labelCls}>{L.kind}</span>
                <div className={segCls} role="group" aria-label={L.kind}>
                  {(
                    [
                      ['command', L.kindCommand],
                      ['openai_http', L.kindHttp],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected.kind === value}
                      className={
                        selected.kind === value ? segItemCls : `${segItemCls} text-ink-muted`
                      }
                      onClick={() => patch(selected.id, { kind: value })}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {selected.kind === 'command' ? (
                <>
                  <div>
                    <label className={labelCls} htmlFor="m9-provider-cmd">
                      {L.cmd}
                    </label>
                    <input
                      id="m9-provider-cmd"
                      className={`${inputCls} mono`}
                      value={selected.cmd}
                      placeholder={L.cmdPlaceholder}
                      onChange={(e) => patch(selected.id, { cmd: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-ink-faint">{L.cmdHint}</p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m9-provider-args">
                      {L.args}
                    </label>
                    <input
                      id="m9-provider-args"
                      className={`${inputCls} mono`}
                      value={selected.argsRaw}
                      placeholder={L.argsPlaceholder}
                      onChange={(e) => patch(selected.id, { argsRaw: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-ink-faint">{L.argsHint}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls} htmlFor="m9-provider-endpoint">
                      {L.endpoint}
                    </label>
                    <input
                      id="m9-provider-endpoint"
                      className={`${inputCls} mono`}
                      value={selected.endpoint}
                      placeholder={L.endpointPlaceholder}
                      onChange={(e) => patch(selected.id, { endpoint: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-ink-faint">{L.endpointHint}</p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m9-provider-model">
                      {L.model}
                    </label>
                    <input
                      id="m9-provider-model"
                      className={`${inputCls} mono`}
                      value={selected.model}
                      placeholder={L.modelPlaceholder}
                      onChange={(e) => patch(selected.id, { model: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-ink-faint">{L.modelHint}</p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m9-provider-provider">
                      {L.provider}
                    </label>
                    <input
                      id="m9-provider-provider"
                      className={`${inputCls} mono`}
                      value={selected.provider}
                      placeholder={L.providerPlaceholder}
                      onChange={(e) => patch(selected.id, { provider: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-ink-faint">{L.providerHint}</p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m9-provider-key">
                      {L.apiKey}
                    </label>
                    <input
                      id="m9-provider-key"
                      type="password"
                      className={`${inputCls} mono`}
                      value={selected.apiKeyInput}
                      onChange={(e) =>
                        patch(selected.id, { apiKeyInput: e.target.value, keyCleared: false })
                      }
                    />
                    <p className="mt-1 text-xs text-ink-faint">{L.apiKeyHint}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-muted">
                        {selected.hasApiKey === true
                          ? L.apiKeyConfigured(selected.apiKeyHint)
                          : L.apiKeyNone}
                      </span>
                      {selected.hasApiKey === true && (
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() => patch(selected.id, { keyCleared: true, apiKeyInput: '' })}
                        >
                          <Icon name="trash" size={12} />
                          {L.clearKey}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ⚠️ **key 存在哪必须让用户看见**（批次 D）——
                  「在系统钥匙串里」与「明文躺在本地库里」是两个保护级别，
                  界面不说就是隐瞒。降级那一档更要显眼。 */}
              {selected.hasApiKey === true && (
                <div className={selected.apiKeyStorage === 'inline' ? noteCls('warn') : undefined}>
                  {selected.apiKeyStorage === 'inline' ? (
                    <>
                      <strong className={noteTitleCls}>{L.keyStoragePlainTitle}</strong>
                      {selected.apiKeyStorageDetail}
                    </>
                  ) : (
                    <p className="text-xs text-ink-muted">
                      <span className="font-medium text-ink-body">{L.keyStorageLabel}</span>
                      {`：${selected.apiKeyStorageDetail}`}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls} htmlFor="m9-provider-timeout">
                  {L.timeout}
                </label>
                <input
                  id="m9-provider-timeout"
                  type="number"
                  className={inputCls}
                  value={selected.timeoutMs}
                  onChange={(e) => patch(selected.id, { timeoutMs: Number(e.target.value) })}
                />
              </div>

              {/* ---------- 这一份自己的两个动作 ---------- */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={selected.id === defaultId}
                  onClick={onSetDefault}
                >
                  <Icon name="check" size={13} />
                  {L.setDefault}
                </button>
                <button
                  type="button"
                  className={btnDanger}
                  disabled={drafts.length <= 1}
                  onClick={onRemove}
                >
                  <Icon name="trash" size={13} />
                  {L.remove}
                </button>
                {drafts.length <= 1 && (
                  <span className="text-xs text-ink-muted">{L.removeBlocked}</span>
                )}
              </div>
            </div>
          )}

          {detail !== '' && (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink-body">{L.statusLabel}</span>
              {`：${detail}`}
            </p>
          )}
        </div>
      )}
    </Section>
  )
}
