import { useState } from 'react'
import type { SkillScanRoot } from '@openvibe/shared'
import { Section } from './SettingsSections'
import { Icon } from '../ui/icons'
import { toast, toastError } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipTone, inputCls, proseCls } from '../ui/styles'
import {
  useSkillScanRootDefaults,
  useSkillScanRoots,
  useSkillScanRootsWrite,
} from '../../hooks/useSkillScanRoots'

/**
 * 设置页的**「Skill 扫描路径」**区（owner 2026-10-30 裁定「改成可配置清单」）。
 *
 * ## 这一区解决什么
 *
 * 原实现的扫描根是**写死的一条约定**（home 下一切 `~/.<tool>/skills`）：
 *  - 用户没法关掉某个目录（装了个测试用的 agent 目录也被扫进来）；
 *  - 嵌套形态（WorkBuddy 市场库 `~/.workbuddy/skills-marketplace/skills`、
 *    Loomy-OpenCode `~/.config/loomy-opencode/skills`）与**非点目录**
 *    （豆包工作 `~/DoubaoWork/skills`、GBrain `~/gbrain/skills`）约定够不着。
 *
 * 清单化之后：能减（停用）、能增（任意绝对路径）、能看（当前生效哪几个）。
 *
 * ## 三态必须能分辨
 *
 * | 状态 | 含义 |
 * |---|---|
 * | `configured=false` | 从没改过 ⇒ 扫描走出厂默认清单 |
 * | 清单非空 | 按清单扫（启用的那些） |
 * | 清单为空 | **显式清空** ⇒ 之后扫描不扫任何根 |
 *
 * 中间那态与空数组都是「用户改过」，但一个扫、一个不扫 —— 后端用
 * 「键是否存在」区分（见 `app_meta` 的 `skillScanRoots` 键）。
 */
export function SkillScanPathsSection() {
  const view = useSkillScanRoots()
  const defaults = useSkillScanRootDefaults()
  const write = useSkillScanRootsWrite()
  const [draft, setDraft] = useState('')

  const items = view.data?.items ?? []
  const enabledCount = items.filter((i) => i.enabled).length

  const save = (next: SkillScanRoot[]) => {
    write.mutate(next, {
      onSuccess: () => toast('扫描路径清单已保存。'),
      onError: (e) => toastError(e),
    })
  }

  const toggle = (path: string) => {
    save(items.map((i) => (i.path === path ? { ...i, enabled: !i.enabled } : i)))
  }

  const remove = (path: string) => {
    save(items.filter((i) => i.path !== path))
  }

  const add = () => {
    const path = draft.trim()
    if (path === '') return
    if (!path.startsWith('/')) {
      toast('请填绝对路径。', 'error')
      return
    }
    if (items.some((i) => i.path === path)) {
      toast('该路径已在清单里。', 'error')
      return
    }
    setDraft('')
    save([...items, { path, enabled: true }])
  }

  const appendDefaults = () => {
    const known = defaults.data?.items ?? []
    const missing = known.filter((d) => d.exists && !items.some((i) => i.path === d.path))
    if (missing.length === 0) {
      toast('已知 agent 路径都已在清单里。')
      return
    }
    save([...items, ...missing.map((d) => ({ path: d.path, enabled: true }))])
  }

  return (
    <Section
      title="Skill 扫描路径"
      icon="search"
      hint="本地扫描按这份清单走。停用的目录保留在清单里，只是不扫；删掉才会移除。改了清单后回 Skill 页重新扫描一次。"
      aside={
        <span className={chipTone('default')}>
          生效 {String(enabledCount)} / 共 {String(items.length)} 个
        </span>
      }
      action={
        <div className="flex gap-1">
          <button
            className={btnGhost}
            disabled={write.isPending}
            onClick={() => save(items.map((i) => ({ ...i, enabled: true })))}
          >
            全部启用
          </button>
          <button className={btnGhost} disabled={write.isPending} onClick={() => save([])}>
            清空清单
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {view.data?.configured === false && (
          <p className={`${proseCls} text-[13px] text-ink-muted`}>
            当前用的是出厂默认清单（自动发现 home 下的 agent 目录 + 已知国内 agent 路径）。
          </p>
        )}

        <div className="max-h-64 space-y-1 overflow-auto rounded-md border border-line p-2">
          {items.length === 0 && (
            <p className="p-2 text-xs text-ink-faint">清单为空 —— 扫描不会扫任何目录。</p>
          )}
          {items.map((i) => (
            <div key={i.path} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs">
              <input
                type="checkbox"
                checked={i.enabled}
                disabled={write.isPending}
                aria-label={`启用 ${i.path}`}
                onChange={() => toggle(i.path)}
              />
              <span
                className={`mono min-w-0 flex-1 truncate ${
                  i.enabled ? 'text-ink-body' : 'text-ink-faint line-through'
                }`}
              >
                {i.path}
              </span>
              <button
                className={btnGhost}
                aria-label={`移除 ${i.path}`}
                onClick={() => remove(i.path)}
                disabled={write.isPending}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            className={`${inputCls} mono flex-1 text-xs`}
            placeholder="自定义扫描目录（绝对路径）"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
          <button
            className={btnPrimary}
            disabled={write.isPending || draft.trim() === ''}
            onClick={add}
          >
            添加
          </button>
        </div>

        <button className={btnGhost} disabled={write.isPending} onClick={appendDefaults}>
          补入已知国内 agent 路径
        </button>

        {defaults.data !== undefined && (
          <p className={`${proseCls} text-xs text-ink-muted`}>
            Skill 库目录：<span className="mono">{defaults.data.libraryRoot}</span>
          </p>
        )}
      </div>
    </Section>
  )
}
