import { readProviderCollection, resolveApiKey, selectProviderEntry, isLocalEndpoint } from '../source-ai/provider-config'
import { realKeychainStore } from '../source-ai/keychain'
import type { SqliteDatabase } from '../db'

/**
 * 提取链的 runner（v0.2.3 批次 D AN1/AN4）。
 *
 * **provider 配置复用解读链的同一份**（`langInterpretProvider`，含 keychain/多份并存/
 * 按项目绑定）——偏离 spec 预判③「新键」的登记理由：配置面零新增，用户配一次即两线可用；
 * 代价（解读配置的改动波及提取）由「同一份配置本来就是同一个用户的同一批端点」对冲，
 * 已登记 DEV-0142。失败纪律与 source-ai 同款：错误只露 host、超时归一、不重试。
 */

export interface ExtractRunner {
  readonly id: string
  readonly model: string
  readonly provider: string
  /** 本机端点（Ollama/LM Studio 等）⇒ 出网预算豁免（spec §8.2② 预判口径：本机推理零外联） */
  readonly local: boolean
  run(prompt: string): Promise<string>
}

export class ExtractRunnerError extends Error {
  readonly reason: 'timeout' | 'failed' | 'invalid-json' | 'empty'
  constructor(reason: ExtractRunnerError['reason'], message: string) {
    super(message)
    this.name = 'ExtractRunnerError'
    this.reason = reason
  }
}

interface ResolvedProvider {
  id: string
  name: string
  endpoint: string
  model: string
  apiKey: string
  local: boolean
}

/** 复用解读链的 provider 配置选型（显式 provider_id → 按项目绑定 → 默认） */
export async function resolveExtractProvider(db: SqliteDatabase, providerId?: string): Promise<ResolvedProvider | null> {
  const { collection } = readProviderCollection(db)
  const picked = selectProviderEntry(collection, { providerId })
  if (picked.kind !== 'entry' || picked.entry.kind !== 'openai_http') return null
  const entry = picked.entry
  if (!isValidEndpointString(entry.endpoint)) return null
  const apiKey = await resolveApiKey(entry, realKeychainStore, entry.id)
  return {
    id: entry.id,
    name: entry.name,
    endpoint: entry.endpoint,
    model: entry.model,
    apiKey,
    local: isLocalEndpoint(entry.endpoint),
  }
}

function isValidEndpointString(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return '(端点不可解析)'
  }
}

const EXTRACT_TIMEOUT_MS = 60_000

/** OpenAI 兼容 chat/completions 调用（零依赖 fetch + 超时归一 + 错误只露 host） */
async function postChat(p: ResolvedProvider, prompt: string): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (p.apiKey !== '') headers.authorization = `Bearer ${p.apiKey}`
  const res = await fetch(p.endpoint, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    throw new ExtractRunnerError('failed', `推理端点返回 ${String(res.status)}（${hostOf(p.endpoint)}）`)
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = body.choices?.[0]?.message?.content ?? ''
  if (content.trim() === '') throw new ExtractRunnerError('empty', '推理端点返回空正文')
  return content
}

export async function createExtractRunner(db: SqliteDatabase, providerId?: string): Promise<ExtractRunner | null> {
  const p = await resolveExtractProvider(db, providerId)
  if (p === null) return null
  return {
    id: p.id,
    model: p.model,
    provider: p.name,
    local: p.local,
    async run(prompt: string): Promise<string> {
      return postChat(p, prompt)
    },
  }
}

export { isLocalEndpoint, EXTRACT_TIMEOUT_MS }
