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

/**
 * 扫描根清单。
 *
 * ⚠️ **staleTime: 0**（服务端把它标成 `mixed` 端点）：未配置时服务端走
 *   `defaultSkillRoots()` —— 那是一次**磁盘发现**（home 下的约定目录）⇒
 *   装了/删了 agent 之后结论就变了 ⇒ 缓存 30 秒会展示旧清单。
 *   ⇒ staleTime 0 ⇒ 每次进设置页重取（这个页面不是高频页面，代价可忽略）。
 */
export function useSkillScanRoots() {
  return useQuery({
    queryKey: ['skill-scan-roots'],
    queryFn: () => apiJson<SkillScanRootsView>('/api/skills/scan-roots'),
    staleTime: 0,
  })
}

/**
 * 出厂默认清单（已知 agent 路径 + 本机是否存在标记）。
 *
 * ⚠️ **staleTime: 0**（服务端把它标成 `filesystem` 端点）：每一项的 `exists`
 *   都是当场判的「这个目录在本机在不在」⇒ 缓存 60 秒会展示旧标记。
 */
export function useSkillScanRootDefaults() {
  return useQuery({
    queryKey: ['skill-scan-roots-defaults'],
    queryFn: () =>
      apiJson<{ items: { path: string; exists: boolean }[]; libraryRoot: string }>(
        '/api/skills/scan-roots/defaults',
      ),
    staleTime: 0,
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
