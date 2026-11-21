import {
  HOOK_DEFAULT_TIMEOUT_MS,
  HOOK_FAIL_POLICIES,
  LIMITS,
  type HookDef,
  type Hooks,
} from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import {
  btnGhost,
  btnPrimary,
  cardBodyCls,
  cardCls,
  chipPressed,
  chipTone,
  inputCls,
  labelCls,
  noteCls,
} from '../ui/styles'

type Phase = 'pre' | 'post'

const PHASES: { key: Phase; label: string }[] = [
  { key: 'pre', label: zh.packs.wizard.hooksPhasePre },
  { key: 'post', label: zh.packs.wizard.hooksPhasePost },
]

/** 空钩子行（新增时预填默认值，符合 FR-1.2 默认补齐语义） */
function blankHook(): HookDef {
  return {
    name: '',
    command: '',
    timeoutMs: HOOK_DEFAULT_TIMEOUT_MS,
    failPolicy: 'continue',
  }
}

/**
 * N3 FR-3.3：PackWizard 钩子配置步骤的编辑器。
 *
 * pre/post 两组，组内可增删钩子；每个钩子编辑 name / command / timeoutMs / failPolicy。
 * 校验在 PackWizard 的 validateStep 做阻断，这里只做即时提示，编辑结果通过 onChange 传出。
 */
export function HookEditor(props: { value: Hooks; onChange: (hooks: Hooks) => void }) {
  const { value, onChange } = props
  const pre = value.pre ?? []
  const post = value.post ?? []

  const setPhase = (phase: Phase, list: HookDef[]): void => {
    onChange(phase === 'pre' ? { ...value, pre: list } : { ...value, post: list })
  }

  const patchHook = (phase: Phase, index: number, patch: Partial<HookDef>): void => {
    const list = (phase === 'pre' ? pre : post).map((h, i) =>
      i === index ? { ...h, ...patch } : h,
    )
    setPhase(phase, list)
  }

  const addHook = (phase: Phase): void => {
    setPhase(phase, [...(phase === 'pre' ? pre : post), blankHook()])
  }

  const removeHook = (phase: Phase, index: number): void => {
    setPhase(
      phase,
      (phase === 'pre' ? pre : post).filter((_, i) => i !== index),
    )
  }

  return (
    <div className="max-w-3xl space-y-4 text-sm">
      <p className="text-xs text-ink-muted">{zh.packs.wizard.hooksHint}</p>
      {PHASES.map(({ key, label }) => {
        const list = key === 'pre' ? pre : post
        return (
          <section key={key} className={cardCls}>
            <header className="flex items-center justify-between border-b border-line-hair px-3.5 py-2.5">
              <span className="text-xs font-medium text-ink-muted">{label}</span>
              <button type="button" className={btnPrimary} onClick={() => addHook(key)}>
                {zh.packs.wizard.hooksAdd}
              </button>
            </header>
            <div className={`${cardBodyCls} space-y-3`}>
              {list.length === 0 && (
                <p className={`${noteCls('info')} text-ink-body`}>{zh.packs.wizard.hooksEmpty}</p>
              )}
              {list.map((hook, i) => (
                <HookRow
                  key={`${key}-${i}`}
                  phase={key}
                  index={i}
                  hook={hook}
                  onPatch={(patch) => patchHook(key, i, patch)}
                  onRemove={() => removeHook(key, i)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function HookRow(props: {
  phase: Phase
  index: number
  hook: HookDef
  onPatch: (patch: Partial<HookDef>) => void
  onRemove: () => void
}) {
  const { hook, onPatch, onRemove } = props
  const nameControlChar = /[\u0000-\u001f\u007f]/.test(hook.name)

  return (
    <div className="rounded-md border border-line bg-panel-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={`${chipTone('default')}`}>
          {props.phase === 'pre' ? zh.packs.wizard.hooksPhasePre : zh.packs.wizard.hooksPhasePost}
          <span className="ml-1.5 text-[11px]">#{props.index + 1}</span>
        </span>
        <button type="button" className={btnGhost} onClick={props.onRemove}>
          {zh.packs.wizard.hooksRemove}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{zh.packs.wizard.hooksName}</label>
          <input
            className={`${inputCls} mono`}
            aria-label={zh.packs.wizard.hooksName}
            value={hook.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
          {nameControlChar && (
            <p className="mt-1 text-[11px] text-danger">{zh.packs.wizard.hooksDupName}</p>
          )}
        </div>
        <div>
          <label className={labelCls}>{zh.packs.wizard.hooksTimeout}</label>
          <input
            type="number"
            min={1}
            max={LIMITS.hooks.maxTimeoutMs}
            className={`${inputCls} mono`}
            aria-label={zh.packs.wizard.hooksTimeout}
            value={String(hook.timeoutMs)}
            onChange={(e) => {
              const n = Number(e.target.value)
              onPatch({ timeoutMs: Number.isFinite(n) ? n : HOOK_DEFAULT_TIMEOUT_MS })
            }}
          />
          {hook.timeoutMs > LIMITS.hooks.maxTimeoutMs && (
            <p className="mt-1 text-[11px] text-danger">
              {zh.packs.wizard.hooksTimeoutMax(LIMITS.hooks.maxTimeoutMs)}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>{zh.packs.wizard.hooksCommand}</label>
          <input
            className={`${inputCls} mono`}
            aria-label={zh.packs.wizard.hooksCommand}
            value={hook.command}
            onChange={(e) => onPatch({ command: e.target.value })}
            placeholder="echo hello"
          />
        </div>
        <div>
          <label className={labelCls}>{zh.packs.wizard.hooksPolicy}</label>
          <div className="inline-flex gap-0.5">
            {HOOK_FAIL_POLICIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`${chipTone('default')} ${hook.failPolicy === p ? chipPressed : ''}`}
                onClick={() => onPatch({ failPolicy: p })}
              >
                {p === 'continue'
                  ? zh.packs.wizard.hooksPolicyContinue
                  : zh.packs.wizard.hooksPolicyBlock}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
