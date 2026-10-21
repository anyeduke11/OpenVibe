import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../api/client'
import { Section } from './SettingsSections'
import { Icon } from '../ui/icons'
import { btnGhost, tagCls } from '../ui/styles'
import { toast } from '../ui/Toaster'

/**
 * 设置页的**「源码授权记忆」**区（M9 v1.6 P4.5 · dev-plan §6.10 P4.5）。
 *
 * ## 它是什么
 *
 * 列出「**你 Remember 过哪些项目**」，每一条都能**单独清除**。
 *
 * ## ⚠️ 为什么清除入口在设置页（DL-21）
 *
 * DL-21 原文：「走一遍「记住全发」⇒ **设置页清除** ⇒ 下次扫描必须全不勾」。
 * ⇒ 记忆是**跨页面**的状态（抽屉里设的，设置页里清的），
 *   清除入口必须在**用户找得到的地方** —— 设置页是「本机状态」的归口。
 *
 * ## ⚠️ 清除后**立刻回到全不勾**
 *
 * 清除的动作是**删掉整行**（不是把 `remember_all` 置 0）——
 * 置 0 会留下「曾经记住过、现在记住的是『全不发』」的残影。
 */
const L = {
  title: '源码授权记忆',
  hint: '「记住我的选择」是**按项目**记的（§3.9：全局记忆会让一个项目的授权泄漏到另一个项目）。清除后，下次扫描立即回到全不勾。',
  empty: '还没有任何项目被记住过。',
  rememberAll: '记住「全发」',
  rememberNone: '记住「全不发」',
  clear: '清除',
  cleared: '已清除 —— 下次扫描回到全不勾。',
  failed: '清除失败。',
} as const

interface ConsentItem {
  project_id: string
  remember_all: boolean
  remembered_at: string
}

export function SourceConsentSection() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['lang-consents'],
    queryFn: () => apiJson<{ consents: ConsentItem[] }>('/api/lang/source/consents'),
  })
  const clear = useMutation({
    mutationFn: (projectId: string) =>
      apiJson<{ cleared: boolean }>(
        `/api/lang/source/consent?project=${encodeURIComponent(projectId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lang-consents'] })
      void qc.invalidateQueries({ queryKey: ['lang-consent'] })
      toast(L.cleared)
    },
    onError: () => {
      toast(L.failed)
    },
  })

  const items = list.data?.consents ?? []

  return (
    <Section
      title={L.title}
      icon="lock"
      hint={L.hint}
      aside={
        <span className={tagCls}>{`${String(items.length)} 个项目`}</span>
      }
    >
      {items.length === 0 ? (
        <p className="text-[13.5px] text-ink-muted">{L.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => (
            <li
              key={c.project_id}
              className="flex flex-wrap items-center gap-2 border-b border-line-hair pb-1.5 last:border-b-0"
            >
              <span className="mono text-[13px] text-ink">{c.project_id}</span>
              <span className={tagCls}>{c.remember_all ? L.rememberAll : L.rememberNone}</span>
              <span className="text-[11.5px] text-ink-faint">{c.remembered_at}</span>
              <button
                className={`${btnGhost} ml-auto`}
                type="button"
                disabled={clear.isPending}
                onClick={() => {
                  clear.mutate(c.project_id)
                }}
              >
                <Icon name="trash" size={13} />
                {L.clear}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
