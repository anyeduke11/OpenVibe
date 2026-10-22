import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../ui/icons'
import {
  btnGhost,
  btnPrimary,
  chipTone,
  inputCls,
  labelCls,
  noteCls,
  noteTitleCls,
  segCls,
  segItemCls,
  skelCls,
  type ChipTone,
} from '../ui/styles'
import { Section } from './SettingsSections'
import { useLangInterpretCapability, useLangProviderConfig } from '../../hooks/useLangSource'
import type { InterpretProviderKind } from '@openvibe/shared'

/**
 * 设置页的**「AI 解读」**区（owner 2026-10-22 裁决一）。
 *
 * ## 它是什么
 *
 * 让用户**手动调控**「用哪个 provider 解读源码」—— 此前这件事**只能靠环境变量**，
 * 界面上没有入口。
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
 * 视图形状里装不下全文（`InterpretProviderView`）⇒ 这件事在类型上就发生不了。
 * ⇒ 输入框留空表示「**保持原值**」（不是清空）—— 改一下模型名不该把 key 抹掉。
 */
const L = {
  title: 'AI 解读',
  hint: '源码的「AI 解读」需要一个 provider。没配置或关掉时，源码识别与掌握度推导照常工作（AI 只负责解读，不参与判定）。',
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
  argsPlaceholder: 'run, --json',
  cmdPlaceholder: 'pi',
  endpointPlaceholder: 'http://127.0.0.1:11434/v1/chat/completions',
  modelPlaceholder: 'qwen2.5-coder:7b',
  providerPlaceholder: 'ollama',
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

/** 参数串 ⇢ 逐个参数（**逗号分隔**，去空白、去空项）。 */
function parseArgs(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export function InterpretProviderSection() {
  const { query, save } = useLangProviderConfig()
  const capability = useLangInterpretCapability()
  const view = query.data

  const [enabled, setEnabled] = useState(false)
  const [kind, setKind] = useState<InterpretProviderKind>('command')
  const [cmd, setCmd] = useState('')
  const [argsRaw, setArgsRaw] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keyCleared, setKeyCleared] = useState(false)
  const [timeoutMs, setTimeoutMs] = useState(30_000)
  const [justSaved, setJustSaved] = useState(false)
  const loaded = useRef(false)

  // ⚠️ **只在第一次拿到配置时灌进本地草稿** ——
  //   之后每次 refetch 都不该把用户正在改的内容冲掉。
  useEffect(() => {
    if (view === undefined || loaded.current) return
    loaded.current = true
    setEnabled(view.enabled)
    setKind(view.kind)
    setCmd(view.cmd)
    setArgsRaw(view.args.join(','))
    setEndpoint(view.endpoint)
    setModel(view.model)
    setProvider(view.provider)
    setTimeoutMs(view.timeout_ms)
  }, [view])

  const onSave = (): void => {
    setJustSaved(false)
    save.mutate(
      {
        enabled,
        kind,
        cmd,
        args: parseArgs(argsRaw),
        endpoint,
        model,
        provider,
        // ⚠️ **空 = 保持原值**；「清除」按钮 ⇒ 显式空串
        api_key: keyCleared ? '' : apiKeyInput === '' ? undefined : apiKeyInput,
        timeout_ms: timeoutMs,
      },
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
          <label className="flex items-start gap-2 text-[13.5px] text-ink-body">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
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
                  aria-pressed={kind === value}
                  className={kind === value ? segItemCls : `${segItemCls} text-ink-muted`}
                  onClick={() => setKind(value)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {kind === 'command' ? (
            <>
              <div>
                <label className={labelCls} htmlFor="m9-provider-cmd">
                  {L.cmd}
                </label>
                <input
                  id="m9-provider-cmd"
                  className={`${inputCls} mono`}
                  value={cmd}
                  placeholder={L.cmdPlaceholder}
                  onChange={(e) => setCmd(e.target.value)}
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
                  value={argsRaw}
                  placeholder={L.argsPlaceholder}
                  onChange={(e) => setArgsRaw(e.target.value)}
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
                  value={endpoint}
                  placeholder={L.endpointPlaceholder}
                  onChange={(e) => setEndpoint(e.target.value)}
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
                  value={model}
                  placeholder={L.modelPlaceholder}
                  onChange={(e) => setModel(e.target.value)}
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
                  value={provider}
                  placeholder={L.providerPlaceholder}
                  onChange={(e) => setProvider(e.target.value)}
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
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value)
                    setKeyCleared(false)
                  }}
                />
                <p className="mt-1 text-xs text-ink-faint">{L.apiKeyHint}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-muted">
                    {view?.has_api_key === true
                      ? L.apiKeyConfigured(view.api_key_hint)
                      : L.apiKeyNone}
                  </span>
                  {view?.has_api_key === true && (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        setKeyCleared(true)
                        setApiKeyInput('')
                      }}
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
          {view?.has_api_key === true && (
            <div className={view.api_key_storage === 'inline' ? noteCls('warn') : undefined}>
              {view.api_key_storage === 'inline' ? (
                <>
                  <strong className={noteTitleCls}>{L.keyStoragePlainTitle}</strong>
                  {view.api_key_storage_detail}
                </>
              ) : (
                <p className="text-xs text-ink-muted">
                  <span className="font-medium text-ink-body">{L.keyStorageLabel}</span>
                  {`：${view.api_key_storage_detail}`}
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
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
            />
          </div>

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
