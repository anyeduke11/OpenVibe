import { useQueryClient } from '@tanstack/react-query'
import type {
  SkillCleanupPreview,
  SkillCleanupReport,
  SkillDownloadReport,
  SkillLibraryReport,
  SkillLibraryRestoreReport,
} from '@openvibe/shared'
import { apiJson } from '../api/client'
import { useApiMutation } from './useApiMutation'

/**
 * Skill 库（2026-10-30）的四个动作：备份 / 恢复 / 移出 / 下载落盘。
 *
 * ## 为什么库要独立于其他 agent
 *
 * 扫描登记的 skill 都指着别的 agent 的目录。那个 agent 被卸载/升级/清理时，
 * 台账条目指向死路径、**内容也一起没了**（本机实测 455 条里 38 条已如此）。
 * 库在 OpenVibe 自己的目录留一份副本 ⇒ agent 走了内容还在。
 */

/** 备份到库：把 skill 的文件复制一份到 ~/.openvibe/skills/<name>/ */
export function useSkillBackup() {
  const qc = useQueryClient()
  return useApiMutation({
    mutationFn: (skillId: string) =>
      apiJson<SkillLibraryReport>(`/api/skills/${skillId}/library/backup`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

/** 从库恢复：把库内副本写回原目录（或指定目录） */
export function useSkillRestore() {
  const qc = useQueryClient()
  return useApiMutation({
    mutationFn: ({ skillId, targetDir }: { skillId: string; targetDir?: string }) =>
      apiJson<SkillLibraryRestoreReport>(`/api/skills/${skillId}/library/restore`, {
        method: 'POST',
        body: targetDir === undefined ? {} : { targetDir },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

/** 移出库：删副本并清空台账列（原 skill 目录不动） */
export function useSkillLibraryRemove() {
  const qc = useQueryClient()
  return useApiMutation({
    mutationFn: (skillId: string) =>
      apiJson<{ skillId: string; name: string }>(`/api/skills/${skillId}/library/remove`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

/**
 * 下载远程 skill 并落盘（缺省落进 skill 库目录）。
 *
 * ⚠️ 代理与直连走**同一套代码**：出站经 http-guard，代理由 server 启动时的
 *   全局 dispatcher 接管 ⇒ 用户配了 `HTTPS_PROXY` 就能下，没配就直接连。
 */
export function useSkillDownload() {
  const qc = useQueryClient()
  return useApiMutation({
    mutationFn: ({ skillId, targetDir }: { skillId: string; targetDir?: string }) =>
      apiJson<SkillDownloadReport>(`/api/skills/${skillId}/download`, {
        method: 'POST',
        body: targetDir === undefined ? {} : { targetDir },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

/**
 * 失效条目清理预检（只报告）—— **按打开对话框那一刻现算**，不走 query 缓存。
 *
 * ## 为什么不能放进缓存
 *
 * 这份预检的结论是「此刻磁盘上哪些 skill 目录已经没了」，它的有效期由**磁盘**决定，
 * 不由时间决定。放进 15s 缓存 ⇒ 用户在别处删掉目录后再打开这个对话框，看到的仍是
 * 删除之前的快照 ⇒ 报「没有失效条目」，而服务端此刻已经能报出失效条目。
 * （真机实测 2026-10-30 踩到：服务端已返回 2 条，对话框显示 0 条，刷新页面才对。）
 *
 * 同仓的「整理重复」报告是同一个形状（GET 语义、按需跑），已用 mutation 处理 ⇒ 照此办理。
 */
export function useSkillCleanupPreview() {
  return useApiMutation({
    mutationFn: () => apiJson<SkillCleanupPreview>('/api/skills/cleanup'),
  })
}

/** 一键批量清理：删「路径已消失 ∧ 不可下载 ∧ 无副本」的台账条目 */
export function useSkillCleanup() {
  const qc = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { ids?: string[]; includeBackedUp?: boolean }) =>
      apiJson<SkillCleanupReport>('/api/skills/cleanup', {
        method: 'POST',
        body: input.includeBackedUp === undefined ? {} : { includeBackedUp: input.includeBackedUp },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}
