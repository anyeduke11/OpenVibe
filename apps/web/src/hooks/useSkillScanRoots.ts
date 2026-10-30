import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SkillScanRoot, SkillScanRootsView } from '@openvibe/shared'
import { apiJson } from '../api/client'
import { useApiMutation } from './useApiMutation'

/**
 * 本地 skill 扫描根清单（2026-10-30：改成可配置清单）。
 *
 * ## 为什么扫描根要能配
 *
 * 原实现只按一条约定扫全盘（home 下一切 `~/.<tool>/skills`）：
 *  - 装了几个 agent 就扫几个 ⇒ **用户没法说「别扫这个」**；
 *  - 嵌套形态（WorkBuddy 市场库、Loomy-OpenCode）与非点目录（豆包工作、GBrain）
 *    约定够不着 ⇒ **该收的没收**。
 *
 * 清单化之后两件事同时成立：能减（停用一个根）、能增（加任意绝对路径）。
 */

/** 扫描根清单 */
export function useSkillScanRoots() {
  return useQuery({
    queryKey: ['skill-scan-roots'],
    queryFn: () => apiJson<SkillScanRootsView>('/api/skills/scan-roots'),
    staleTime: 30_000,
  })
}

/** 出厂默认清单（已知 agent 路径 + 本机是否存在标记） */
export function useSkillScanRootDefaults() {
  return useQuery({
    queryKey: ['skill-scan-roots-defaults'],
    queryFn: () =>
      apiJson<{ items: { path: string; exists: boolean }[]; libraryRoot: string }>(
        '/api/skills/scan-roots/defaults',
      ),
    staleTime: 60_000,
  })
}

/** 写扫描根清单（整份覆盖） */
export function useSkillScanRootsWrite() {
  const qc = useQueryClient()
  return useApiMutation({
    mutationFn: (roots: SkillScanRoot[]) =>
      apiJson<SkillScanRootsView>('/api/skills/scan-roots', { method: 'POST', body: { roots } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['skill-scan-roots'] })
    },
  })
}
