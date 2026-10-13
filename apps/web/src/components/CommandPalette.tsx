import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson, qs } from '../api/client'
import { zh } from '../i18n/zh'
import { btnGhost } from './ui/styles'

/**
 * 命令面板（⌘K / Ctrl K）。
 *
 * 整个面板是**懒加载**的：入口包只剩一个按键监听，面板本体（含 Dialog 原语、
 * 三个搜索请求）只在第一次唤起时才下载。理由见 DEV-0090 风险③——入口曾贴顶
 * 299.98/300 kB，本轮把三张常驻卡移出 AppShell 后才腾出余量。
 *
 * 快捷键冲突三条纪律（照搬 demo 里验证过的做法）：
 * 1. 输入态（INPUT/TEXTAREA/SELECT/contentEditable）内不劫持单键；
 * 2. 带 meta/ctrl/alt 的组合键放行（留给浏览器与编辑器）；
 * 3. CodeMirror 在 contenteditable 里，与 ① 同源，因此编辑器内按 ⌘K 也不会被抢。
 */

type Group = 'nav' | 'prompt' | 'term' | 'skill' | 'command'

interface Item {
  id: string
  group: Group
  label: string
  hint?: string
  run: () => void
}

const GROUP_ORDER: Group[] = ['nav', 'command', 'prompt', 'term', 'skill']

const GROUP_LABEL: Record<Group, string> = {
  nav: zh.palette.group.nav,
  command: zh.palette.group.command,
  prompt: zh.palette.group.prompt,
  term: zh.palette.group.term,
  skill: zh.palette.group.skill,
}

const NAV_TARGETS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/', label: zh.nav.workbench },
  { to: '/library', label: zh.nav.library },
  { to: '/terms', label: zh.nav.terms },
  { to: '/skills', label: zh.nav.skills },
  { to: '/flows', label: zh.nav.flows },
  { to: '/projects', label: zh.nav.projects },
  { to: '/packs', label: zh.nav.packs },
  { to: '/settings', label: zh.nav.settings },
]

/** 搜索三域：提示词 / 术语 / Skill（各自有端点，没有跨实体全局检索，故并发三路） */
interface Hit {
  id: string
  label: string
  hint?: string
  to: string
}

export function CommandPalette(props: { onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [hits, setHits] = useState<Hit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 搜索：trim 后 ≥1 字符即查；输入变化时取消上一轮，避免旧结果覆盖新结果
  useEffect(() => {
    const term = q.trim()
    if (term.length === 0) {
      setHits([])
      return
    }
    const timer = setTimeout(() => {
      abort.current?.abort()
      const ctrl = new AbortController()
      abort.current = ctrl
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
          setHits([
            ...prompts.items.map((p) => ({
              id: `p:${p.id}`,
              label: p.title,
              to: '/library',
            })),
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
          ])
        })
        .catch(() => {
          /* 搜索失败静默：面板本体仍可用，只少了结果 */
        })
    }, 180)
    return () => clearTimeout(timer)
  }, [q])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = NAV_TARGETS.map((t) => ({
      id: `nav:${t.to}`,
      group: 'nav' as Group,
      label: t.label,
      run: () => navigate(t.to),
    }))
    for (const h of hits) {
      out.push({
        id: h.id,
        group: h.id.startsWith('t:')
          ? 'term'
          : h.id.startsWith('s:')
            ? 'skill'
            : 'prompt',
        label: h.label,
        hint: h.hint,
        run: () => navigate(h.to),
      })
    }
    const term = q.trim().toLowerCase()
    const filtered =
      term.length === 0
        ? out
        : out.filter((it) => it.label.toLowerCase().includes(term) || it.id.includes(term))
    return GROUP_ORDER.flatMap((g) => filtered.filter((it) => it.group === g))
  }, [hits, navigate, q])

  useEffect(() => {
    setSel(0)
  }, [q])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const close = () => {
    abort.current?.abort()
    props.onClose()
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
    }
  }

  let lastGroup: Group | null = null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/40 pt-[12vh]">
      {/* 点击遮罩关闭；面板本体 stopPropagation 防止误关 */}
      <div className="absolute inset-0" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={zh.palette.title}
        onKeyDown={onKeyDown}
        className="relative w-[min(620px,calc(100vw-32px))] overflow-hidden rounded-lg border border-line bg-panel shadow-3"
      >
        <div className="border-b border-line-hair px-3 py-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={zh.palette.placeholder}
            aria-label={zh.palette.search}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1" role="listbox">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-ink-faint">
              {zh.palette.empty}
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
                    className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${
                      i === sel ? 'bg-accent-soft text-accent-deep' : 'text-ink-body'
                    }`}
                  >
                    <span className="min-w-0 grow truncate">{it.label}</span>
                    {it.hint && (
                      <span className="mono shrink-0 text-[11px] text-ink-faint">{it.hint}</span>
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-line-hair px-3 py-1.5 text-[11px] text-ink-faint">
          <span>↑↓ {zh.palette.move}</span>
          <span>↵ {zh.palette.enter}</span>
          <span>esc {zh.palette.close}</span>
          <button type="button" className={`${btnGhost} ml-auto !px-2 !py-0.5 !text-[11px]`} onClick={close}>
            {zh.palette.close}
          </button>
        </div>
      </div>
    </div>
  )
}