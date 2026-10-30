import { useQuery, useQueryClient } from '@tanstack/react-query'
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

/** 失效条目清理预检（只报告） */
export function useSkillCleanupPreview() {
  return useQuery({
    queryKey: ['skill-cleanup-preview'],
    queryFn: () => apiJson<SkillCleanupPreview>('/api/skills/cleanup'),
    staleTime: 15_000,
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
      void qc.invalidateQueries({ queryKey: ['skill-cleanup-preview'] })
    },
  })
}
