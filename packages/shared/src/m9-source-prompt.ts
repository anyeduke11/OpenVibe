// `packages/shared/src/m9-source-prompt.ts` —— M9 v1.6 **解读提示词与事件流解析**（纯计算层）
// （`m9-dev-language-roadmap.md` §3.8 / §5.5 · **DL-08 / DL-09 / DL-18**）
//
// ## 它是什么
//
// 三件**纯计算**的东西，HTTP runner 与命令适配器（Pi 包装脚本）**共用同一份**：
//
//   ① `buildInterpretPrompt` —— 请求 ⇒ 「要模型照着做的说明」；
//   ② `stripJsonFence` —— 剥 markdown 围栏（模型很爱把 JSON 包在 ```json 里）；
//   ③ `digestPiEventStream` —— Pi 的 NDJSON 事件流 ⇒ 最终 assistant 正文。
//
// ## ⚠️ 为什么住在 shared（不在 core / 不在 scripts）
//
// - **HTTP runner** 在 `packages/core`（要发网络请求）；
// - **Pi 包装脚本**在 `scripts/`（要起子进程、**不能**引 `better-sqlite3`）。
//
// ⇒ 两边都要用的那部分**必须**落在一个两边都拿得到的底层包 ⇒ shared。
// 否则提示词会有两份 ⇒ 同一件事两套口径 ⇒ 改一处就分叉。
//
// ## ⚠️ 提示词口径只此一处
//
// HTTP runner 与 Pi 包装脚本**问模型的必须是同一句话** ——
// 否则「同一份代码在两种接入下得到不同解读」，且没人查得出来。

import { SOURCE_INTERPRET_SCHEMA_VERSION, type SourceInterpretRequest } from './m9-source-ai'

/**
 * 把请求变成「要模型照着做的说明」。
 *
 * ⚠️ **格式由本仓定，模型不许自由发挥** —— 它必须回一份能被
 *   `SourceInterpretResult` 校验的 JSON（DL-09 的前提是「AI 的说法」可结构化比对）。
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

// ============================================================================
// Pi 的事件流（NDJSON）
// ============================================================================

/**
 * Pi 事件流的解析结果。
 *
 * ⚠️ **只含「结构」不含「内容」** —— `eventTypes` 里是事件名（`turn_end` 之类），
 *   没有正文 ⇒ 可以直接进错误消息与日志。
 */
export interface PiEventDigest {
  /** 最终 assistant 正文（`null` = 事件流里没有可读的正文） */
  text: string | null
  /** 这一轮**被中止**了（`agent_settled.aborted === true`）⇒ 结果不可信 */
  aborted: boolean
  /** 读到的事件类型序列（**只含类型名**） */
  eventTypes: string[]
}

/**
 * **解析 Pi 的 NDJSON 事件流** ⇒ 最终 assistant 正文。
 *
 * ## 它怎么找正文
 *
 * ⚠️ **实测 Pi 1.1.0 的事件流**（`pi --mode json -p`）：
 *   `session` → `agent_start` → `turn_start` → `message_start`/`message_end`（system、user）
 *   → `message_start` / `message_update`(`text_start`/`text_delta`/`text_end`) / `message_end`（assistant）
 *   → **`turn_end`（带最终 assistant 消息）** → `agent_end` → `agent_settled`。
 *
 * ⇒ **正文的权威位置是 `turn_end.message`**（`role: 'assistant'`，
 *   `content: [{type:'text', text:'…'}]`）。
 *   ⚠️ **不能只取 `message_end`** —— 它在流式过程中也会出现**空内容**的 assistant 消息
 *   （探针实测：assistant 的 `message_start` 的 `content` 是**空数组**）⇒
 *   拿 `message_end` 当权威会取到空串。
 *
 * ## ⚠️ 解析不了的行 ⇒ **跳过**，不整体失败
 *
 * Pi 的 stdout 里可能混进非 JSON 行（进度输出、告警）⇒
 * 逐行 `try` 解析，坏行跳过 ⇒ 只要事件流本身完好就能读出正文。
 * ⚠️ 但**一行都没读懂**时必须失败（`text` 为 `null`）⇒ 绝不返回空串冒充成功。
 *
 * @param ndjson Pi 的 stdout 全文
 */
export function digestPiEventStream(ndjson: string): PiEventDigest {
  const eventTypes: string[] = []
  let aborted = false
  let turnEndText: string | null = null
  let lastMessageText: string | null = null

  for (const raw of ndjson.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      // ⚠️ 坏行**跳过**（不是整体失败）—— 见函数注释
      continue
    }
    if (typeof event !== 'object' || event === null) continue
    const e = event as { type?: unknown; message?: unknown; aborted?: unknown }
    if (typeof e.type === 'string') eventTypes.push(e.type)

    if (e.type === 'agent_settled' && e.aborted === true) aborted = true

    const text = assistantTextOf(e.message)
    if (text === null) continue
    if (e.type === 'turn_end') turnEndText = text
    else if (e.type === 'message_end') lastMessageText = text
  }

  return {
    // ⚠️ **先信 `turn_end`**（最终正文）⇒ 没有才退回最后一个 `message_end`
    text: turnEndText ?? lastMessageText,
    aborted,
    eventTypes,
  }
}

/**
 * 从一条消息里取 assistant 正文（`content` 是数组时只取 `type === 'text'` 的部分）。
 *
 * ⚠️ **只认 `role === 'assistant'`** —— 事件流里还有 system / user 的消息，
 *   它们的正文**不是**模型的回答。
 * ⚠️ **空数组 ⇒ `null`**（不是空串）—— 「还没有正文」与「正文是空的」是两件事。
 */
function assistantTextOf(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null
  const m = message as { role?: unknown; content?: unknown }
  if (m.role !== 'assistant') return null
  if (!Array.isArray(m.content)) return null
  const parts: string[] = []
  for (const c of m.content) {
    if (typeof c !== 'object' || c === null) continue
    const part = c as { type?: unknown; text?: unknown }
    if (part.type !== 'text') continue
    if (typeof part.text !== 'string') continue
    parts.push(part.text)
  }
  if (parts.length === 0) return null
  return parts.join('')
}

/**
 * 从 Pi 事件流里取最终 assistant 正文（便捷入口）。
 *
 * @param ndjson Pi 的 stdout 全文
 * @returns 正文；取不到 ⇒ `null`
 */
export function extractAssistantTextFromEvents(ndjson: string): string | null {
  return digestPiEventStream(ndjson).text
}
