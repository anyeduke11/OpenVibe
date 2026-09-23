import { APP_META_KEYS, AppMetaRepo, TelemetryRepo, type SqliteDatabase } from '@openvibe/core'
import {
  TELEMETRY_FLUSH_BATCH,
  TELEMETRY_FLUSH_INTERVAL_MS,
  TelemetryBatch,
  type TelemetryBatchEvent,
} from '@openvibe/shared'

/**
 * 匿名遥测的出队腿（design §11.5 / dev-plan §4.6，T8d）：
 * serve 进程内每 60s 取 pending ≤100 条，POST 到 config.telemetryEndpoint，
 * 端点确认收下（2xx）才写 sent_at；失败不盖章，下一轮自然重试。
 *
 * 两道闸门叠在一起才叫「关闭即零外联」：
 * ① 没有 endpoint —— startTelemetryFlush 直接返回 no-op，连定时器都不建；
 * ② 开关关闭 —— 每轮先读 app_meta，关着就一个字节都不发。
 * CLI 侧不外发（D-6）：入队即终点，队列由在跑的 serve 排空。
 */

export type FlushReason = 'no-endpoint' | 'disabled' | 'empty' | 'ok' | 'error'

export interface FlushResult {
  /** 本轮端点收下并盖上 sent_at 的条数 */
  sent: number
  reason: FlushReason
  /** 仍留在队列里的 pending 数；error 时附带失败摘要 */
  kept: number
  detail?: string
}

export interface TelemetryFlushDeps {
  db: SqliteDatabase
  /** 空串 = 未配置端点 */
  endpoint: string
  /** 注入点：单测据此挡掉真网络，生产用 global fetch */
  fetchImpl?: typeof fetch
  now?: () => Date
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function batchOf(rows: ReturnType<TelemetryRepo['pending']>): TelemetryBatchEvent[] {
  return rows.map((r) => ({
    event: r.event,
    value: r.value,
    day: r.day,
    os: r.os,
    appVersion: r.appVersion,
  }))
}

/** 单次出队：调用方（定时器或测试）负责串行，不并发重入 */
export async function flushTelemetryOnce(deps: TelemetryFlushDeps): Promise<FlushResult> {
  const telemetry = new TelemetryRepo(deps.db)
  if (deps.endpoint === '') return { sent: 0, reason: 'no-endpoint', kept: telemetry.pendingCount() }
  if (!new AppMetaRepo(deps.db).read<boolean>(APP_META_KEYS.telemetryEnabled, false)) {
    // §4.6：开关关闭时 pending 记录保留不发送
    return { sent: 0, reason: 'disabled', kept: telemetry.pendingCount() }
  }
  const rows = telemetry.pending(TELEMETRY_FLUSH_BATCH)
  if (rows.length === 0) return { sent: 0, reason: 'empty', kept: 0 }

  const events = batchOf(rows)
  const body = TelemetryBatch.parse({ events })
  try {
    const res = await (deps.fetchImpl ?? fetch)(deps.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return {
        sent: 0,
        reason: 'error',
        kept: telemetry.pendingCount(),
        detail: `HTTP ${String(res.status)}`,
      }
    }
    const sent = telemetry.markSent(
      rows.map((r) => r.id),
      (deps.now ?? (() => new Date()))().toISOString(),
    )
    return { sent, reason: 'ok', kept: telemetry.pendingCount() }
  } catch (e) {
    return { sent: 0, reason: 'error', kept: telemetry.pendingCount(), detail: message(e) }
  }
}

/**
 * 起一条 60s 的上报循环，返回停止函数。定时器 unref：遥测绝不该让 serve 赖着不退。
 * 每轮串行（上一轮没回来就跳过），失败只记一行——遥测不打断本地功能。
 */
export function startTelemetryFlush(
  deps: TelemetryFlushDeps & { onError?: (line: string) => void },
): () => void {
  if (deps.endpoint === '') return () => undefined
  let busy = false
  let stopped = false
  const tick = (): void => {
    if (busy || stopped) return
    busy = true
    void flushTelemetryOnce(deps)
      .then((r) => {
        if (r.reason === 'error') deps.onError?.(`遥测上报失败（${r.detail ?? '未知'}），${String(r.kept)} 条留在队列`)
      })
      .catch((e: unknown) => deps.onError?.(`遥测上报异常：${message(e)}`))
      .finally(() => {
        busy = false
      })
  }
  const id = setInterval(tick, TELEMETRY_FLUSH_INTERVAL_MS)
  // 定时器不吊住进程：遥测永远不该让 serve 退不掉
  id.unref()
  return () => {
    stopped = true
    clearInterval(id)
  }
}
