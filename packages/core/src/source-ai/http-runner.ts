import {
  SOURCE_INTERPRET_SCHEMA_VERSION,
  SourceInterpretRequest,
  SourceInterpretResult,
  type SourceInterpretResult as SourceInterpretResultType,
} from '@openvibe/shared'
import { InterpretRunnerError, type SourceInterpretRunner } from './runner'

/**
 * `packages/core/src/source-ai/http-runner.ts` —— **OpenAI 兼容**的解读 runner。
 *
 * ## 它是什么
 *
 * 把 T2 解读送到一个 **OpenAI 兼容**的 HTTP 接口（`POST <endpoint>`，
 * body 是 `chat/completions` 的形状，响应取 `choices[0].message.content`）。
 *
 * ⚠️ **为什么「OpenAI 兼容」这一种协议就够**：
 *   本机模型（Ollama / LM Studio / vLLM / llama.cpp server）与云端 API
 *   **说的是同一种话** ⇒ 两种接入**共用一个 runner**，不为「本地」与「云端」各写一套。
 *   （owner 2026-10-22 裁决一：「支持本地模型和 LLM API 接入」。）
 *
 * ## ⚠️ 为什么用**内建 `fetch`**（不引 SDK）
 *
 * owner 的技术口径是**零依赖优先** ⇒ 不引 `openai` / `axios` 之类；
 * Node 18+ 的 `fetch` 已经够用，且 `AbortSignal.timeout` 直接给超时。
 *
 * ## ⚠️ 三条纪律（与命令适配器**完全同款**，不许在这里另立一套）
 *
 * 1. **路径不出网**（DL-18）—— 送出去的是 `SourceInterpretRequest`，
 *    其 `path` 是**相对项目根**的路径（core 装配时已保证）⇒ 本文件**不做**路径拼接。
 * 2. **契约先比版本，再谈字段**（增强 3）—— 版本对不上 ⇒
 *    `runner-version-mismatch`，而不是笼统的「不合 schema」。
 * 3. **失败归一**（M3 FR-6.3.3）—— 全部落成 `InterpretRunnerError`（带 `reason`），
 *    上层据此写台账并**如实显示失败**，不让异常冒到界面。
 *
 * ## ⚠️ 为什么**不带** `response_format`
 *
 * OpenAI 兼容服务的支持面不一致（有的实现不认这个字段，会直接 400）⇒
 * **不赌服务端支持**：改成在 prompt 里要求「只输出 JSON」，
 * 并在解析时**剥掉 markdown 围栏**（模型很爱把 JSON 包在 ```json 里）。
 *
 * ⚠️ **不剥围栏 ⇒ 明明拿到了正确内容却被判成「输出坏了」** ⇒ 用户会以为工具坏了。
 */
export interface HttpRunnerOptions {
  /** 完整 URL（如 `http://127.0.0.1:11434/v1/chat/completions`） */
  endpoint: string
  /** 模型标识 */
  model: string
  /** provider 标识（台账用） */
  provider: string
  /** API key（**可空** —— 本机模型通常不需要） */
  apiKey?: string
  /** 超时（毫秒；默认 30s） */
  timeoutMs?: number
}

/** 只把 host 露出去（**端点里可能带 query 里的 key** ⇒ 绝不在错误消息里回显完整 URL）。 */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return '（端点格式不对）'
  }
}

/**
 * 把请求变成「要模型照着做的说明」。
 *
 * ⚠️ **格式由本仓定，模型不许自由发挥** —— 它必须回一份能被
 * `SourceInterpretResult` 校验的 JSON（DL-09 的前提是「AI 的说法」可结构化比对）。
 */
export function buildInterpretPrompt(request: SourceInterpretRequest): string {
  const payload = {
    schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
    topics: request.topics,
    fragments: request.fragments,
  }
  return [
    '你是源码解读助手。请针对给定的代码片段，逐条给出解读。',
    '',
    '**只输出一个 JSON 对象**，不要 markdown 围栏、不要解释性文字。',
    'JSON 的形状必须是：',
    '{',
    '  "schema_version": ' + String(SOURCE_INTERPRET_SCHEMA_VERSION) + ',',
    '  "model": "<你用的模型标识>",',
    '  "provider": "<你所属的 provider 标识>",',
    '  "items": [',
    '    { "topic_slug": "<片段对应的知识点 slug>",',
    '      "summary": "<一句话解读>",',
    '      "risks": ["<风险点>"],',
    '      "claim_state": null',
    '    }',
    '  ]',
    '}',
    '',
    '⚠️ `items` 里**每一条片段都要有一条**，`topic_slug` 必须取自输入里的 slug。',
    '⚠️ `claim_state` 只在你判断「这段代码已经掌握了」时才填 `mastered`，',
    '   拿不准就填 `null`。',
    '',
    '输入：',
    JSON.stringify(payload),
  ].join('\n')
}

/**
 * 剥掉 markdown 围栏（```json … ``` / ``` … ```）。
 *
 * ⚠️ **只剥围栏，不动内容** —— 内容里的反引号、换行都是数据的一部分。
 */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed)
  return fenced?.[1]?.trim() ?? trimmed
}

export class HttpInterpretRunner implements SourceInterpretRunner {
  readonly id = 'openai-http'
  readonly model: string
  readonly provider: string
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly timeoutMs: number

  constructor(opts: HttpRunnerOptions) {
    this.endpoint = opts.endpoint.trim()
    this.model = opts.model
    this.provider = opts.provider
    this.apiKey = opts.apiKey?.trim() ?? ''
    this.timeoutMs = opts.timeoutMs ?? 30_000
  }

  async interpret(request: SourceInterpretRequest): Promise<SourceInterpretResultType> {
    if (this.endpoint === '') {
      throw new InterpretRunnerError('runner-not-found', '没有配置解读端点')
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    // ⚠️ **没配 key 就不发 Authorization 头** —— 本机模型通常不需要，
    //   硬发一个空 Bearer 反而会让某些服务端判成「未登录」。
    if (this.apiKey !== '') headers['authorization'] = `Bearer ${this.apiKey}`

    let res: Response
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: buildInterpretPrompt(request) }],
          temperature: 0,
          stream: false,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      const e = err as { name?: string; message?: string }
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new InterpretRunnerError('runner-timeout', `解读请求超时（${String(this.timeoutMs)}ms）`)
      }
      throw new InterpretRunnerError(
        'runner-failed',
        `连不上解读服务（${hostOf(this.endpoint)}）：${(e.message ?? '').slice(0, 200)}`,
      )
    }

    if (!res.ok) {
      // ⚠️ **401/403 单列**：这是「配了但没登录/没配 key」⇒ 人话要说清楚，
      //   否则用户会去查代码，而问题在凭据。
      if (res.status === 401 || res.status === 403) {
        throw new InterpretRunnerError(
          'runner-failed',
          `解读服务拒绝了凭据（HTTP ${String(res.status)}）：API key 没配、过期或没登录`,
        )
      }
      throw new InterpretRunnerError(
        'runner-failed',
        `解读服务返回 HTTP ${String(res.status)}（${hostOf(this.endpoint)}）`,
      )
    }

    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new InterpretRunnerError('runner-invalid-json', '解读服务的响应不是合法 JSON')
    }
    const content = extractContent(body)
    if (content === null) {
      throw new InterpretRunnerError('runner-invalid-json', '解读服务的响应里没有可读的内容')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(stripJsonFence(content))
    } catch {
      throw new InterpretRunnerError('runner-invalid-json', '解读服务返回的内容不是合法 JSON')
    }

    // ⚠️ **先比版本，再谈字段**（同命令适配器）
    const version =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { schema_version?: unknown }).schema_version
        : undefined
    if (version !== SOURCE_INTERPRET_SCHEMA_VERSION) {
      throw new InterpretRunnerError(
        'runner-version-mismatch',
        `解读契约版本对不上（期望 ${String(SOURCE_INTERPRET_SCHEMA_VERSION)}，收到 ${String(version ?? '缺失')}）`,
      )
    }
    const result = SourceInterpretResult.safeParse(parsed)
    if (!result.success) {
      throw new InterpretRunnerError('runner-invalid-schema', '解读服务返回的内容不合契约')
    }
    return result.data
  }
}

/**
 * 从 chat/completions 的响应里取正文。
 *
 * ⚠️ **容错两处**：有些服务返回 `choices[0].message.content`，
 *   有些返回 `choices[0].text`（旧式 completion）⇒ 两个都认。
 */
export function extractContent(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown }
  const fromMessage = first.message?.content
  if (typeof fromMessage === 'string') return fromMessage
  if (typeof first.text === 'string') return first.text
  return null
}
