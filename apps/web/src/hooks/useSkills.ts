import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SkillCreateInput,
  SkillDuplicatesReport,
  SkillOut,
  SkillRemoteImportInput,
  SkillRemoteImportReport,
  SkillRemoteSearchReport,
  SkillRetrackInput,
  SkillRetrackReport,
  SkillReviewInput,
  SkillReviewReport,
  SkillScanReport,
  SkillUpdateCheckInput,
  SkillUpdateCheckReport,
  SkillUpdateInput,
  SkillVersionOut,
} from '@openvibe/shared'
import { apiJson, qs } from '../api/client'

export const SKILL_STALE_TIME = 15_000

/** 台账行视图：服务端在列表里内联版本数（m2 FR-3.1） */
export interface SkillRow extends SkillOut {
  versionCount: number
}

export function useSkillList(q: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['skills', trimmed],
    queryFn: () => apiJson<{ items: SkillRow[]; total: number }>(`/api/skills${qs({ q: trimmed })}`),
    staleTime: SKILL_STALE_TIME,
  })
}

export function useSkillVersions(skillId: string | null) {
  return useQuery({
    queryKey: ['skill-versions', skillId],
    queryFn: () =>
      apiJson<{ items: SkillVersionOut[]; total: number }>(
        `/api/skills/${skillId ?? ''}/versions`,
      ),
    enabled: skillId !== null && skillId !== '',
    staleTime: SKILL_STALE_TIME,
  })
}

export function useSkillMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['skills'] })
    void qc.invalidateQueries({ queryKey: ['skill-versions'] })
  }

  const create = useMutation({
    mutationFn: (input: SkillCreateInput) =>
      apiJson<SkillOut>('/api/skills', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdateInput }) =>
      apiJson<SkillOut>(`/api/skills/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiJson<void>(`/api/skills/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  /** roots 省略即扫描默认目录清单（m2 FR-1.1）；Web 只触发同一入口，不自己走目录 */
  const scan = useMutation({
    mutationFn: (roots?: string[]) =>
      apiJson<SkillScanReport>('/api/skills/scan', {
        method: 'POST',
        body: roots === undefined ? {} : { roots },
      }),
    onSuccess: invalidate,
  })

  return { create, update, remove, scan }
}

/** 远程源（DEV-0067）：搜索 SkillHub 市场 / 按源导入，全部走服务端出站守卫 */
export function useSkillRemote() {
  const search = useMutation({
    mutationFn: (q: string) =>
      apiJson<SkillRemoteSearchReport>('/api/skills/remote/search', {
        method: 'POST',
        body: { source: 'skillhub', q },
      }),
  })
  const importSkill = useMutation({
    mutationFn: (input: SkillRemoteImportInput) =>
      apiJson<SkillRemoteImportReport>('/api/skills/remote/import', {
        method: 'POST',
        body: input,
      }),
  })
  return { search, importSkill }
}

/** 检查更新（DEV-0068）：树指纹对比；报告里 remoteChanged 的条目可一键走 importSkill 重导 */
export function useSkillUpdateCheck() {
  return useMutation({
    mutationFn: (input: SkillUpdateCheckInput) =>
      apiJson<SkillUpdateCheckReport>('/api/skills/remote/check-updates', {
        method: 'POST',
        body: input,
      }),
  })
}

/** 补档（DEV-0069）：未建档的存量远程条目按版本线溯源串重导一次，写树指纹 */
export function useSkillRetrack() {
  return useMutation({
    mutationFn: (input: SkillRetrackInput) =>
      apiJson<SkillRetrackReport>('/api/skills/remote/retrack', { method: 'POST', body: input }),
  })
}

/** 重复整理报告（GET 语义但随对话框打开/手动刷新按需跑，故用 mutation 免缓存歧义） */
export function useSkillDuplicates() {
  return useMutation({
    mutationFn: () => apiJson<SkillDuplicatesReport>('/api/skills/duplicates'),
  })
}

/** 内置审查：ids 缺省=全量（无本地目录的条目仅元数据审查） */
export function useSkillReview() {
  return useMutation({
    mutationFn: (input: SkillReviewInput) =>
      apiJson<SkillReviewReport>('/api/skills/review', { method: 'POST', body: input }),
  })
}
