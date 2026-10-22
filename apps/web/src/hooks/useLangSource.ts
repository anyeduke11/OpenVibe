import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, apiRaw } from '../api/client'
import type {
  InterpretCapability,
  InterpretProviderCollectionSave,
  InterpretProviderCollectionView,
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
/**
 * 读**某个项目**最近一次扫描的命中。
 *
 * ⚠️ **项目是必填参数**（owner 2026-10-22）：命中表现在每个项目各存一份
 *   ⇒ 不给项目就读不出「是谁的命中」。
 */
export function useLangFindings(projectId: string | null) {
  return useQuery({
    queryKey: ['lang-findings', projectId ?? ''],
    queryFn: () =>
      apiJson<LangFindingsResponse>(
        `/api/lang/findings?project=${encodeURIComponent(projectId ?? '')}`,
      ),
    enabled: projectId !== null && projectId !== '',
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
 *
 * ## ⚠️ `providerId` 的三态（**多份 provider 并存** · owner 2026-10-22 增强 2）
 *
 * | 入参 | 探测哪一份 |
 * |---|---|
 * | `undefined` | **当前该用的那一份**（服务端按「项目绑定 → 默认」的顺序选） |
 * | `'p-xxx'` | **指定那一份**（`?provider_id=p-xxx`） |
 * | `null` | **不探测**（界面上还没选中任何一份） |
 */
export function useLangInterpretCapability(providerId?: string | null) {
  const id = providerId ?? ''
  const explicit = id !== ''
  return useQuery({
    queryKey: ['lang-interpret-capability', id],
    queryFn: () =>
      apiJson<InterpretCapability>(
        explicit
          ? `/api/lang/interpret/capability?provider_id=${encodeURIComponent(id)}`
          : '/api/lang/interpret/capability',
      ),
    // ⚠️ `null` = 「还没选中」⇒ 不发请求（否则会白探测一次「当前那一份」）
    enabled: providerId !== null,
    staleTime: LANG_STALE_TIME,
  })
}

/**
 * 解读**勾选过的**片段（DL-18：只有勾过的才入参）。
 *
 * ⚠️ 这是**写操作**（会出网 ＋ 写台账）⇒ mutation。
 *
 * @param userTouched 用户**动过**勾选没有（owner 2026-10-22：只影响台账的分类）
 */
export function useLangInterpret(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { findingIds: readonly number[]; userTouched?: boolean }) =>
      apiJson<SourceInterpretSummary>('/api/lang/interpret', {
        method: 'POST',
        body: {
          project_id: projectId ?? '',
          finding_ids: input.findingIds,
          user_touched: input.userTouched === true,
        },
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
export function useLangConsent(projectId: string | null) {  return useQuery({
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

/**
 * **AI 解读 provider 配置**（**集合**语义 · owner 2026-10-22 增强 2）。
 *
 * ## ⚠️ 端点是**复数** `/api/lang/interpret/providers`
 *
 * 旧路径（单数 `/api/lang/interpret/provider`）**已删**。
 *
 * ## ⚠️ 保存是**一次 PUT 整份集合**，不是逐份 PUT
 *
 * 逐份 PUT 表达不了「删掉哪一份」⇒ 集合语义只能整份落库。
 *
 * ## ⚠️ `api_key` 的语义：**缺省 = 保持原值**，**空串 = 清除**
 *
 * 读端**只回显末 4 位**（回显不了全文）⇒ 若把「缺省」当成「清空」，
 * 用户改一下模型名就会把 key 抹掉 ⇒ 想清 key 必须**显式**传空串。
 */
export function useLangProviderConfig() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['lang-interpret-providers'],
    queryFn: () => apiJson<InterpretProviderCollectionView>('/api/lang/interpret/providers'),
    staleTime: LANG_STALE_TIME,
  })
  const save = useMutation({
    mutationFn: (input: InterpretProviderCollectionSave) =>
      apiJson<InterpretProviderCollectionView>('/api/lang/interpret/providers', {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['lang-interpret-providers'] })
      // ⚠️ **能力也会变**（换了命令 / 端点 / key ⇒ 可用性不同）⇒ 一并失效
      void qc.invalidateQueries({ queryKey: ['lang-interpret-capability'] })
      return d
    },
  })
  return { query, save }
}
