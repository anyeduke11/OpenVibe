import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ExtractOut } from '@openvibe/shared'
import { apiJson } from '../api/client'

/**
 * M10/D 提取触发（日志区入口的 mutation 面）。
 * 出网前确认屏在组件层；本 hook 只管调用与成功后的失效面（待确认列表 + 采纳率）。
 */
export function useExtractRun(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { logIds: string[]; confirm: boolean; remember: boolean }) =>
      apiJson<ExtractOut>('/api/extract', {
        method: 'POST',
        body: {
          project_id: projectId,
          log_ids: input.logIds,
          confirm: input.confirm,
          remember: input.remember,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agent-ingests'] })
      void qc.invalidateQueries({ queryKey: ['ai-adoption'] })
    },
  })
}
