import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../api/client'
import { agentZh } from '../../i18n/lane-agent'

/**
 * 设置页的「助手桥接」节（`m8-agent-panel.md` FR-5.5）。
 *
 * ## 落点：与第 7 区**并列**成为新一区（FR-5.5.1）
 *
 * spec §3-4 实测第 7 区在 `SettingsSections.tsx:614`（「可读性与设计系统」）。
 * ⇒ 本节是它的**同级**，**不是子项、也不新开第三个隐私分区**（PRD-M8 FR-5.5 明写）。
 *
 * ## 为什么做成独立文件而不是写进 `SettingsSections.tsx`
 *
 * 两个理由，第二个是硬的：
 * ① 该文件是仓内最大的一处并行改动面（约 795 行他人未提交改动），本轮不抢写；
 * ② 更根本的是**归属**：M8 的开关属 M8，不属「可读性与设计系统」。
 * 挂进那个文件会让节标题与内容对不上——那是结构说谎，不是代码风格问题。
 * 挂载点由 `SettingsPage.tsx` 负责（它同样会被并行会话改到，故改动压到最小：两行）。
 *
 * ## 只放一个开关（FR-5.5.2）
 *
 * 台账总开关与遥测总开关**各有各的节**，本节**不重复**它们。
 * 重复开关会导致两处状态不一致 —— 用户改了一处发现另一处没变。
 * ⇒ `WEB-M8E-12` 那支用例会扫本文件：出现台账/遥测开关的字面量即判红。
 */

export function AgentSettingsSection() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['settings', 'agent-write'],
    queryFn: () => apiJson<{ enabled: boolean }>('/api/settings/agent-write'),
    staleTime: 5_000,
  })
  const m = useMutation({
    mutationFn: (enabled: boolean) =>
      apiJson<{ enabled: boolean }>('/api/settings/agent-write', {
        method: 'POST',
        body: { enabled },
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['settings', 'agent-write'] })
      void qc.invalidateQueries({ queryKey: ['agent-ingests'] })
      return d
    },
  })

  return (
    <section aria-label={agentZh.settings.title} className="space-y-2">
      <h3 className="text-sm font-semibold">{agentZh.settings.title}</h3>
      <p className="text-xs text-ink-muted">{agentZh.settings.hint}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={q.data?.enabled ?? false}
          disabled={m.isPending}
          onChange={(e) => m.mutate(e.target.checked)}
        />
        <span>{agentZh.settings.writeLabel}</span>
      </label>
      {/* ⚠️ 默认关这件事必须**写在界面上**：用户看到开关是关的，才知道为什么 agent 推不进来 */}
      <p className="text-xs text-ink-faint">{agentZh.settings.defaultOffNote}</p>
    </section>
  )
}
