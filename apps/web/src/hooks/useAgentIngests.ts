import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type { ProjectContextOut } from '@openvibe/shared'

/**
 * M8-E 的取数 hook（`m8-agent-panel.md` FR-5.3.2 ＋ spec §3-3）。
 *
 * ## 为什么不裸写 `fetch`
 *
 * spec FR-5.3.2 明写「照 §3-3 的既有 hook 形制新增取数，不裸写 `fetch`」。
 * 既有形制（`useProjectPorts`）是：`useQuery` ＋ `queryKey` ＋ `apiJson` ＋ `enabled` ＋ `staleTime`。
 * 本文件两条 hook 都照它写，**不复用同一个 queryKey 前缀**——
 * `['agent-ingests', id]` 与 `['project-context', id, fields]` 各自独立，
 * 否则切字段会把待确认列表也一起刷新（那是两回事）。
 *
 * ## 出参类型为什么不自己定义
 *
 * 上下文面有 `ProjectContextOut`（`packages/shared`）；回流面**目前没有**对应的
 * output schema（spec 自身在 §3-6 登记了「两个 hook 尚不存在」，没登记缺 schema）。
 * 这里按端点实际返回的形状**就地声明**，并在注释里标明「若日后 shared 补了 schema，
 * 改从那里导入，不要两份并存」—— 与本仓已登记的「键与类型必须同源」是同一条纪律。
 */

/** 回流条目：对应 `GET /api/projects/:id/agent-ingests` 的 items 元素 */
export interface AgentIngestItem {
  id: string
  projectId: string
  /** 五类闭集，见 `AGENT_INGEST_KINDS` */
  kind: string
  /** 四态闭集 `pending|published|rejected|conflict`；本面板只看 `pending` 与 `conflict` */
  status: string
  sourcePlatform: string
  sourceSessionId: string | null
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
  /** 由调用方自报的不可信输入（spec §6.2）；**只当纯文本渲染** */
  payload: unknown
}

interface AgentIngestListOut {
  items: AgentIngestItem[]
  total: number
}

/**
 * 待确认回流队列（pending ＋ conflict 都要人看）。
 *
 * ⚠️ **不开轮询**：这一面是「人坐在那儿逐条裁决」的界面，30s 后自动刷新会把
 * 正在读的那一行内容换掉（FR-5.6 的裁决弹层尤其不能）。要最新就点重试或重新进详情页。
 */
export function useAgentIngests(id: string | null) {
  return useQuery({
    queryKey: ['agent-ingests', id],
    queryFn: () => apiJson<AgentIngestListOut>(`/api/projects/${id ?? ''}/agent-ingests`),
    enabled: id !== null && id !== '',
    staleTime: 10_000,
  })
}

/**
 * 上下文预览（与 `GET /api/projects/:id/context` 同源同渲染，FR-5.1.3）。
 *
 * `fields` 传 `undefined` = 不裁剪，由服务端决定默认。⚠️ 非法段名由服务端**直接 422**
 * （`parseContextFields`），前端**不做**静默过滤 —— 那正是 FR-3.3 要禁的行为。
 */
export function useProjectContext(id: string | null, fields?: readonly string[]) {
  const qs = fields && fields.length > 0 ? `?fields=${fields.join(',')}` : ''
  return useQuery({
    queryKey: ['project-context', id, fields ? [...fields] : null],
    queryFn: () => apiJson<ProjectContextOut>(`/api/projects/${id ?? ''}/context${qs}`),
    enabled: id !== null && id !== '',
    staleTime: 15_000,
  })
}

/**
 * 人工裁决（FR-5.6.2：走**既有** `/api/agent/ingests/:id/review` 语义，**不新增合并端点**）。
 *
 * ⚠️ FR-5.6.3：**不得**出现「用新的覆盖旧的」那条动作 —— 那正是幂等被破坏的地方。
 * 本 hook 的入参类型里**根本没有** `overwrite` 这类字段：类型层就堵死，不靠调用方自觉。
 */
export function useReviewIngest(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ingestId: string; to: 'published' | 'rejected'; reason?: string }) =>
      apiJson(`/api/agent/ingests/${input.ingestId}/review`, {
        method: 'POST',
        body: { to: input.to, reason: input.reason ?? null },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agent-ingests', id] })
    },
  })
}
