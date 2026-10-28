import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson, qs } from '../api/client'
import { zh } from '../i18n/zh'
import { sys } from '../i18n/lane-system'
import { btnGhost, cardBodyCls, emptyHintCls, rowCls, skelCls } from './ui/styles'
import { Icon, type IconName } from './ui/icons'

/**
 * 命令面板本体（⌘K / Ctrl K）。
 *
 * 面板是**懒加载**的：挂载点见 `CommandPaletteHost`（入口只留一个按键监听），
 * 面板 + 三个搜索请求只在第一次唤起时才下载。
 *
 * 快捷键冲突三条纪律（照搬 demo 里验证过的做法）：
 * 1. 输入态（INPUT/TEXTAREA/SELECT/contentEditable）内不劫持单键；
 * 2. 带 meta/ctrl/alt 的组合键放行（留给浏览器与编辑器）；
 * 3. CodeMirror 在 contenteditable 里，与 ① 同源，因此编辑器内按 ⌘K 也不会被抢。
 */

type Group = 'nav' | 'prompt' | 'term' | 'skill'

interface Item {
  id: string
  group: Group
  label: string
  hint?: string
  icon: IconName
  run: () => void
}

const GROUP_ORDER: Group[] = ['nav', 'prompt', 'term', 'skill']

const GROUP_LABEL: Record<Group, string> = {
  nav: zh.palette.group.nav,
  prompt: zh.palette.group.prompt,
  term: zh.palette.group.term,
  skill: zh.palette.group.skill,
}

/** 全部**静态路由**（参数化的 /projects/:id、/packs/:id/edit 只能从各自的列表进，故不在此列）。
 *  少一条就是「面板能搜到但跳不到」，所以这份表与 App.tsx 的 Route 一一对照维护。 */
const NAV_TARGETS: ReadonlyArray<{ to: string; label: string; hint: string; icon: IconName }> = [
  { to: '/', label: zh.nav.workbench, hint: '总览 · 飞轮统计', icon: 'home' },
  { to: '/library', label: zh.nav.library, hint: '资产', icon: 'doc' },
  { to: '/terms', label: zh.nav.terms, hint: '资产', icon: 'book' },
  { to: '/playbooks', label: zh.nav.playbooks, hint: '资产', icon: 'sparkle' },
  { to: '/skills', label: zh.nav.skills, hint: '资产', icon: 'box' },
  { to: '/flows', label: zh.nav.flows, hint: '资产', icon: 'flow' },
  { to: '/projects', label: zh.nav.projects, hint: '工程', icon: 'folder' },
  { to: '/packs', label: zh.nav.packs, hint: '工程', icon: 'pack' },
  { to: '/packs/new', label: '组包向导', hint: '五步组装一个新包', icon: 'plus' },
  { to: '/growth', label: zh.nav.growth, hint: '系统', icon: 'chart' },
  { to: '/settings', label: zh.nav.settings, hint: '系统', icon: 'cog' },
]

/** 搜索三域：提示词 / 术语 / Skill（各自有端点，没有跨实体全局检索，故并发三路） */
interface Hit {
  id: string
  label: string
  hint?: string
  to: string
}

type Search = { phase: 'idle' | 'searching' | 'ready' | 'empty' | 'failed' }

export function CommandPalette(props: { onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [hits, setHits] = useState<Hit[]>([])
  const [phase, setPhase] = useState<Search>({ phase: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  // 关闭后把焦点还给唤起前的那个元素，键盘用户不至于掉回 body
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => restoreRef.current?.focus?.()
  }, [])

  // 搜索：trim 后 ≥1 字符即查；输入变化时取消上一轮，避免旧结果覆盖新结果
  const search = useCallback((term: string, ctrl: AbortController) => {
    setPhase({ phase: 'searching' })
    void Promise.all([
      apiJson<{ items: { id: string; title: string }[] }>(
        `/api/prompts${qs({ q: term, size: 5 })}`,
      ),
      apiJson<{ items: { term: { id: string; zh: string; en: string } }[] }>(
        `/api/terms/search${qs({ q: term })}`,
      ),
      apiJson<{ items: { id: string; name: string; latestVersion: string }[] }>(
        `/api/skills${qs({ q: term })}`,
      ),
    ])
      .then(([prompts, terms, skills]) => {
        if (ctrl.signal.aborted) return
        const next: Hit[] = [
          ...prompts.items.map((p) => ({ id: `p:${p.id}`, label: p.title, to: '/library' })),
          ...terms.items.map((t) => ({
            id: `t:${t.term.id}`,
            label: t.term.zh,
            hint: t.term.en,
            to: '/terms',
          })),
          ...skills.items.slice(0, 5).map((s) => ({
            id: `s:${s.id}`,
            label: s.name,
            hint: s.latestVersion,
            to: '/skills',
          })),
        ]
        setHits(next)
        setPhase({ phase: 'ready' })
      })
      .catch(() => {
        if (ctrl.signal.aborted) return
        // 搜索失败不让面板不可用：页面组仍在，只是少了结果（状态要说出来 + 给重试）
        setPhase({ phase: 'failed' })
      })
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (term.length === 0) {
      setHits([])
      setPhase({ phase: 'idle' })
      return
    }
    const timer = setTimeout(() => {
      abort.current?.abort()
      const ctrl = new AbortController()
      abort.current = ctrl
      search(term, ctrl)
    }, 180)
    return () => clearTimeout(timer)
  }, [q, search])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = NAV_TARGETS.map((t) => ({
      id: `nav:${t.to}`,
      group: 'nav' as Group,
      label: t.label,
      hint: t.hint,
      icon: t.icon,
      run: () => navigate(t.to),
    }))
    for (const h of hits) {
      out.push({
        id: h.id,
        group: h.id.startsWith('t:') ? 'term' : h.id.startsWith('s:') ? 'skill' : 'prompt',
        label: h.label,
        hint: h.hint,
        icon: h.id.startsWith('t:') ? 'term' : h.id.startsWith('s:') ? 'box' : 'doc',
        run: () => navigate(h.to),
      })
    }
    const term = q.trim().toLowerCase()
    const filtered =
      term.length === 0
        ? out
        : out.filter(
            (it) =>
              it.label.toLowerCase().includes(term) ||
              it.id.includes(term) ||
              (it.hint ?? '').toLowerCase().includes(term),
          )
    return GROUP_ORDER.flatMap((g) => filtered.filter((it) => it.group === g))
  }, [hits, navigate, q])

  useEffect(() => {
    setSel(0)
  }, [q])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [sel])

  const close = useCallback(() => {
    abort.current?.abort()
    props.onClose()
  }, [props])

  /** 焦点圈闭：Tab / Shift+Tab 在面板内首尾互绕，不跑到背后的页面去 */
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (nodes === undefined || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (first === undefined || last === undefined) return
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[sel]
      if (it) {
        close()
        it.run()
      }
    } else {
      trapTab(e)
    }
  }

  let lastGroup: Group | null = null
  const searching = phase.phase === 'searching'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/40 pt-[12vh]">
      {/* 点击遮罩关闭；面板本体 stopPropagation 防止误关 */}
      <div className="absolute inset-0" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={zh.palette.title}
        onKeyDown={onKeyDown}
        className="relative w-[min(620px,calc(100vw-32px))] overflow-hidden rounded-lg border border-line bg-panel shadow-3"
      >
        <div className="flex items-center gap-2 border-b border-line-hair px-3 py-2">
          <Icon name="search" size={15} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={zh.palette.placeholder}
            aria-label={zh.palette.search}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          {searching && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted">
              <Icon name="refresh" size={12} />
              {sys.palette.searching}
            </span>
          )}
        </div>

        {phase.phase === 'failed' && (
          <div className="border-b border-line-hair bg-danger-soft px-3 py-1.5 text-[11.5px] text-danger">
            <span className="inline-flex items-center gap-1">
              <Icon name="alert" size={12} />
              {sys.palette.failed}
            </span>
            <button
              type="button"
              className="ml-2 underline underline-offset-2"
              onClick={() => {
                const term = q.trim()
                if (term === '') return
                abort.current?.abort()
                const ctrl = new AbortController()
                abort.current = ctrl
                search(term, ctrl)
              }}
            >
              {sys.state.retry}
            </button>
          </div>
        )}

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1" role="listbox">
          {searching && items.length === 0 ? (
            <li className={`${cardBodyCls} space-y-1.5`} aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className={`${skelCls} h-6`} />
              ))}
            </li>
          ) : items.length === 0 ? (
            <li className="px-4 py-4">
              <div className={emptyHintCls}>
                <p>{zh.palette.empty}</p>
                <p>{sys.palette.noResultHint}</p>
              </div>
            </li>
          ) : (
            items.map((it, i) => {
              const head = it.group !== lastGroup
              lastGroup = it.group
              return (
                <li key={it.id}>
                  {head && (
                    <div className="px-3 pb-1 pt-2 text-[11px] text-ink-faint">
                      {GROUP_LABEL[it.group]}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === sel}
                    onMouseMove={() => setSel(i)}
                    onClick={() => {
                      close()
                      it.run()
                    }}
                    className={`${rowCls} flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm text-ink-body`}
                  >
                    <Icon name={it.icon} size={14} className="self-center text-ink-faint" />
                    <span className="min-w-0 grow truncate">{it.label}</span>
                    {it.hint && (
                      <span className="shrink-0 text-[11px] text-ink-muted">{it.hint}</span>
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-line-hair px-3 py-1.5 text-[11px] text-ink-muted">
          <span className="num">↑↓ {zh.palette.move}</span>
          <span className="num">↵ {zh.palette.enter}</span>
          <span>esc {zh.palette.close}</span>
          <span className="hidden sm:inline">{sys.palette.navHint}</span>
          <button
            type="button"
            className={`${btnGhost} ml-auto px-2 py-0.5 text-[11px]`}
            onClick={close}
          >
            {zh.palette.close}
          </button>
        </div>
      </div>
    </div>
  )
}
