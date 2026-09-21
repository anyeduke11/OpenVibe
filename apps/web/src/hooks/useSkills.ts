import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SkillCreateInput,
  SkillOut,
  SkillScanReport,
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
