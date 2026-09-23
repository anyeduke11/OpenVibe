import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  FlywheelStatsOut,
  InjectionStatusOut,
  ReseedOut,
  SettingsOut,
  TelemetrySettingsOut,
} from '@openvibe/shared'
import { ApiError, apiJson, qs } from '../api/client'

/** dev-plan §5.3：服务端状态 staleTime 15s，写后按 key 目录精确失效 */
export const SETTINGS_STALE_TIME = 15_000

/** 步骤③自动确认的轮询节奏（dev-plan §5.2：2s × ≤60 次 ≈ 2 分钟后交回手动按钮） */
export const PROBE_INTERVAL_MS = 2_000
export const PROBE_MAX_TICKS = 60

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiJson<SettingsOut>('/api/settings'),
    staleTime: SETTINGS_STALE_TIME,
  })
}

export function useFlywheelStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiJson<FlywheelStatsOut>('/api/stats'),
    staleTime: SETTINGS_STALE_TIME,
  })
}

export function useTelemetrySettings() {
  return useQuery({
    queryKey: ['telemetry'],
    queryFn: () => apiJson<TelemetrySettingsOut>('/api/settings/telemetry'),
    staleTime: SETTINGS_STALE_TIME,
  })
}

/** 向导完成标记（onboarding FR-2.3）：done=false 即设置页「重新显示向导」 */
export function useOnboardingToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (done: boolean) =>
      apiJson<{ onboardingDone: boolean }>('/api/settings/onboarding', {
        method: 'POST',
        body: { done },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

/** D13 一次性询问的落点：accepted/declined 由服务端从 enabled 反推，前端不再各自记标记 */
export function useTelemetryToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiJson<TelemetrySettingsOut>('/api/settings/telemetry', {
        method: 'POST',
        body: { enabled },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['telemetry'] })
      void qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

/** 重播种子 + 重建预置包（FR-1.2 / dev-plan §607） */
export function useReseed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiJson<ReseedOut>('/api/settings/reseed', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      // §5.3 表只列到 settings/stats：reseed 还会新增 standard_packs 行与导出历史，
      // 不一起失效的话设置页刚报「已重建」，包列表还停在旧快照。
      void qc.invalidateQueries({ queryKey: ['packs'] })
      void qc.invalidateQueries({ queryKey: ['pack-exports'] })
    },
  })
}

/**
 * 注入探针的归一结果：lock 不存在不是错误（那是「尚未注入」），目录不存在/非法路径
 * 才是。轮询里抛错会被全局 query-error 订阅逐次 toast，所以这里把失败折成 problem。
 */
export interface InjectionProbe {
  status: InjectionStatusOut | null
  problem: string | null
}

/**
 * GET /api/injection-status?dir=（onboarding FR-2.4 / D11）：active 期间每 2s 探测一次，
 * 探到 lock 或满 60 次（≈2 分钟）即停，调用方据此降级为诚实手动按钮。
 */
export function useInjectionProbe(dir: string, active: boolean) {
  const qc = useQueryClient()
  const [ticks, setTicks] = useState(0)

  useEffect(() => {
    if (!active) {
      setTicks(0)
      return
    }
    const id = window.setInterval(() => setTicks((t) => t + 1), PROBE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [active, dir])

  const query = useQuery({
    queryKey: ['injection-probe', dir],
    queryFn: async (): Promise<InjectionProbe> => {
      try {
        const status = await apiJson<InjectionStatusOut>(`/api/injection-status${qs({ dir })}`)
        return { status, problem: null }
      } catch (e) {
        return { status: null, problem: e instanceof ApiError ? e.message : '注入检测失败' }
      }
    },
    enabled: active && dir.trim().length > 0,
    // 函数式间隔：探到 lock 就停手，不必等 step 变化或跑满 60 次。
    // 目录尚不存在（404）也要继续等——用户可能就是还没建目录/还没跑命令。
    refetchInterval: (q) =>
      active && q.state.data?.status?.lockPresent !== true && ticks < PROBE_MAX_TICKS
        ? PROBE_INTERVAL_MS
        : false,
    staleTime: 0,
  })

  const found = query.data?.status?.lockPresent === true
  // 探到 lock 即把飞轮拉新：injections 是服务端行，15s staleTime 不该让顶栏慢半拍
  useEffect(() => {
    if (found) void qc.invalidateQueries({ queryKey: ['stats'] })
  }, [found, qc])

  return {
    ...query,
    ticks,
    found,
    exhausted: active && !found && ticks >= PROBE_MAX_TICKS,
  }
}
