import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type {
  LangConsentResponse,
  LangFindingsResponse,
  LangScanSummary,
} from '@openvibe/shared'
import { LANG_STALE_TIME } from './useLangRoadmap'

/**
 * M9「源码识别」的 hook（`m9-dev-language-roadmap.md` §3.8 / §3.9 / §3.10 · dev-plan §6.10 P4）。
 *
 * ## ⚠️ 扫描是**写操作**，其余是读
 *
 * `POST /api/lang/scan` 会落库并**重算掌握度** ⇒ 它是 mutation，
 * 成功后要失效 `lang-findings` 与 `lang-roadmap`（页面上「点亮」的数要跟着变）。
 */

/**
 * 读最近一次扫描的命中。
 *
 * ⚠️ **不带项目参数** —— 命中只属于「最近一次扫描」（`lang_topic_findings` 没有项目列）。
 */
export function useLangFindings() {
  return useQuery({
    queryKey: ['lang-findings'],
    queryFn: () => apiJson<LangFindingsResponse>('/api/lang/findings'),
    staleTime: LANG_STALE_TIME,
  })
}

/** 扫一个项目（落库 + 重算掌握度）。 */
export function useLangScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      apiJson<LangScanSummary>('/api/lang/scan', {
        method: 'POST',
        body: { project_id: projectId },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lang-findings'] })
      // ⚠️ 掌握度变了 ⇒ 路线视图也要重取（「你站到第 M 站」会变）
      void qc.invalidateQueries({ queryKey: ['lang-roadmap'] })
    },
  })
}

/** 读该项目的「记住我的选择」＋ 出网计数。 */
export function useLangConsent(projectId: string | null) {
  return useQuery({
    queryKey: ['lang-consent', projectId ?? ''],
    queryFn: () =>
      apiJson<LangConsentResponse>(
        `/api/lang/source/consent?project=${encodeURIComponent(projectId ?? '')}`,
      ),
    enabled: projectId !== null && projectId !== '',
    staleTime: LANG_STALE_TIME,
  })
}

/** 写 / 清除「记住我的选择」（DL-21：清除后**立刻回到全不勾**）。 */
export function useLangConsentMutations(projectId: string) {
  const qc = useQueryClient()
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['lang-consent'] })
  }
  const set = useMutation({
    mutationFn: (rememberAll: boolean) =>
      apiJson<LangConsentResponse>('/api/lang/source/consent', {
        method: 'POST',
        body: { project_id: projectId, remember_all: rememberAll },
      }),
    onSuccess: invalidate,
  })
  const clear = useMutation({
    mutationFn: () =>
      apiJson<LangConsentResponse>(
        `/api/lang/source/consent?project=${encodeURIComponent(projectId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  })
  return { set, clear }
}
