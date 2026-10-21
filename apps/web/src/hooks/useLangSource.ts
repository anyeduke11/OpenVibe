import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, apiRaw } from '../api/client'
import type {
  InterpretCapability,
  LangConsentResponse,
  LangFindingsResponse,
  LangScanSummary,
  LangSnippetsResponse,
  SourceInterpretSummary,
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

/**
 * 读所有命中的**本地片段**（T1 硬要求：勾选前要看到**将要发送的确切内容**）。
 *
 * ⚠️ **一次读完**（不是逐条点开）—— 勾选框旁边必须一直有内容，
 *   否则用户是在盲签。
 */
export function useLangSnippets(projectId: string | null) {
  return useQuery({
    queryKey: ['lang-snippets', projectId ?? ''],
    queryFn: () =>
      apiJson<LangSnippetsResponse>(
        `/api/lang/snippets?project=${encodeURIComponent(projectId ?? '')}`,
      ),
    enabled: projectId !== null && projectId !== '',
    staleTime: LANG_STALE_TIME,
  })
}

/**
 * AI 解读**能不能用**（DL-08）。
 *
 * ⚠️ **不可用 ⇒ 界面不渲染 T2 区**（不是渲染一个失败态）——
 *   「没配 AI」与「跑挂了」是两件事，混起来会让用户以为 AI 坏了。
 */
export function useLangInterpretCapability() {
  return useQuery({
    queryKey: ['lang-interpret-capability'],
    queryFn: () => apiJson<InterpretCapability>('/api/lang/interpret/capability'),
    staleTime: LANG_STALE_TIME,
  })
}

/**
 * 解读**勾选过的**片段（DL-18：只有勾过的才入参）。
 *
 * ⚠️ 这是**写操作**（会出网 ＋ 写台账）⇒ mutation。
 */
export function useLangInterpret(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (findingIds: readonly number[]) =>
      apiJson<SourceInterpretSummary>('/api/lang/interpret', {
        method: 'POST',
        body: { project_id: projectId ?? '', finding_ids: findingIds },
      }),
    onSuccess: () => {
      // ⚠️ 解读**不改掌握度**（§3.8 三条线第 3 条）⇒ 路线不用失效；
      //   但台账多了一行 ⇒ 本地状态刷新（设置页的计数会变）
      void qc.invalidateQueries({ queryKey: ['lang-share-summary'] })
    },
  })
}

/**
 * 把这次解读**导出**成 Markdown（**用户主动动作** · 增强 4）。
 *
 * ## ⚠️ 导出**不写库**
 *
 * §3.8 三条线第 3 条：解读结果**不自动入库** ⇒ 导出的产物落在**用户自己的磁盘**上，
 * 不进本机数据库、也不外传（§3.8 的「只展示不留存」在**本机状态**里的形态）。
 *
 * ## ⚠️ 脱敏在**服务端**做
 *
 * 客户端不负责脱敏（客户端说「我已经脱敏了」不可信）⇒ 服务端导出前再过一遍。
 */
export function useLangInterpretExport() {
  return useMutation({
    mutationFn: async (summary: SourceInterpretSummary) => {
      const res = await apiRaw('/api/lang/interpret/export', {
        method: 'POST',
        body: { summary },
      })
      // ⚠️ **文件名由服务端给**（清洗规则只留一处）
      const name = res.headers.get('x-m9-filename') ?? 'm9-interpret.md'
      const blob = await res.blob()
      // ⚠️ 没有 `createObjectURL` 的环境（jsdom 等）⇒ 跳过下载这一步（请求已经发出）
      if (typeof URL.createObjectURL !== 'function') return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
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
