import { describe, expect, it } from 'vitest'
import {
  buildInterpretPrompt,
  digestPiEventStream,
  extractAssistantTextFromEvents,
  stripJsonFence,
} from './m9-source-prompt'
import { SOURCE_INTERPRET_SCHEMA_VERSION, type SourceInterpretRequest } from './m9-source-ai'

/**
 * M9 P1g · **解读提示词 ＋ Pi 事件流解析**（`@openvibe/shared` 纯计算层）
 *
 * ## 它断什么
 *
 * | 判据 | 一句话 | 对应的那支 |
 * |---|---|---|
 * | **DL-09** | 提示词要求模型回**可结构化比对**的 JSON | 「提示词」组 |
 * | **DL-08** | 契约版本号在**请求与结果两侧**都在 | 「提示词」组 |
 * | **命令适配器** | Pi 的 NDJSON 事件流 ⇒ **最终 assistant 正文** | 「事件流」组 |
 *
 * ## ⚠️ 夹具是**真跑出来的**事件流（Pi 1.1.0 · 2026-10-22 实测）
 *
 * ⚠️ **不是照着文档编的** —— 探针实跑 `pi --mode json -p --no-tools …`
 *   得到的事件序列逐行抄在这里（system / user 的消息只留类型名）。
 *   ⚠️ 特别地：**assistant 的 `message_start` 的 `content` 是空数组**
 *   ⇒ 解析器若拿 `message_start` 当正文来源就会取到空串。
 */
const REAL_EVENT_STREAM = [
  '{"type":"session","version":3}',
  '{"type":"agent_start"}',
  '{"type":"turn_start"}',
  '{"type":"message_start"}',
  '{"type":"message_end"}',
  '{"type":"message_start"}',
  '{"type":"message_end"}',
  '{"type":"message_start","message":{"role":"assistant","content":[]}}',
  '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"收到"}}',
  '{"type":"message_update","assistantMessageEvent":{"type":"text_end","contentIndex":0,"content":"收到"}}',
  '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"收到"}]}}',
  '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"收到"}]},"toolResults":[]}',
  '{"type":"agent_end"}',
  '{"type":"agent_settled","aborted":false}',
].join('\n')

const REQUEST: SourceInterpretRequest = {
  schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
  topics: [{ slug: 'py-asyncio-basics', title: 'asyncio 基础' }],
  fragments: [
    {
      finding_id: 1,
      path: 'app/worker.py',
      content: 'async def run():\n    await asyncio.sleep(1)',
      line: 12,
      topic_slug: 'py-asyncio-basics',
      topic_title: 'asyncio 基础',
    },
  ],
}

describe('M9 P1g · 解读提示词（HTTP runner 与 Pi 包装脚本共用同一份）', () => {
  it('① 提示词里**带上了片段与知识点**（模型要对着它们解读）', () => {
    const prompt = buildInterpretPrompt(REQUEST)
    expect(prompt).toContain('py-asyncio-basics')
    expect(prompt).toContain('asyncio 基础')
    expect(prompt).toContain('app/worker.py')
  })

  it('② ⚠️ 提示词里**写死了契约版本**（DL-08：请求与结果两侧都要有版本）', () => {
    const prompt = buildInterpretPrompt(REQUEST)
    expect(prompt).toContain(`"schema_version": ${String(SOURCE_INTERPRET_SCHEMA_VERSION)}`)
    expect(prompt).toContain('schema_version')
  })

  it('③ 明确要求「只输出 JSON」（否则模型会包围栏、夹解释 ⇒ 解析必失败）', () => {
    const prompt = buildInterpretPrompt(REQUEST)
    expect(prompt).toContain('只输出一个 JSON 对象')
    expect(prompt).toContain('markdown 围栏')
  })

  it('④ ⚠️ 提示词里**不许出现本机绝对路径**（DL-18：路径不出网）', () => {
    const prompt = buildInterpretPrompt(REQUEST)
    expect(prompt).not.toContain('/Users/')
    expect(prompt).not.toContain('C:\\')
  })
})

describe('M9 P1g · 剥 markdown 围栏（模型很爱把 JSON 包起来）', () => {
  it('① 只剥围栏，不动内容', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}')
    expect(stripJsonFence('{"a":"```x```"}')).toBe('{"a":"```x```"}')
  })
})

describe('M9 P1g · Pi 事件流 ⇒ 最终 assistant 正文', () => {
  it('① 真事件流 ⇒ 取到正文', () => {
    expect(extractAssistantTextFromEvents(REAL_EVENT_STREAM)).toBe('收到')
  })

  it('② ⚠️ **先信 `turn_end`**（`message_end` 在流式过程中可能是空的）', () => {
    // ⚠️ 变异腿：把「先信 turn_end」去掉 ⇒ 就会取到后面那条 message_end 的内容
    const stream = [
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"中间态"}]}}',
      '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"最终"}]}}',
    ].join('\n')
    expect(extractAssistantTextFromEvents(stream)).toBe('最终')
  })

  it('③ ⚠️ **只认 assistant**（user / system 的正文不是模型的回答）', () => {
    const stream = [
      '{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"这是我的问题"}]}}',
      '{"type":"message_end","message":{"role":"system","content":[{"type":"text","text":"系统提示"}]}}',
    ].join('\n')
    expect(extractAssistantTextFromEvents(stream)).toBeNull()
  })

  it('④ ⚠️ **thinking 不算正文**（Pi 会把思考过程也放进 content）', () => {
    const stream =
      '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"thinking","thinking":"我在想…"},{"type":"text","text":"答案"}]}}'
    expect(extractAssistantTextFromEvents(stream)).toBe('答案')
  })

  it('⑤ ⚠️ 坏行**跳过**（Pi 的 stdout 可能混进非 JSON 行）', () => {
    const stream = ['not json at all', '', '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"好"}]}}'].join(
      '\n',
    )
    expect(extractAssistantTextFromEvents(stream)).toBe('好')
  })

  it('⑥ ⚠️ 一行都没读懂 ⇒ **null**（不是空串冒充成功）', () => {
    expect(extractAssistantTextFromEvents('not json\nneither is this')).toBeNull()
    expect(extractAssistantTextFromEvents('')).toBeNull()
  })

  it('⑦ ⚠️ **中止**能被认出来（`agent_settled.aborted`）', () => {
    const aborted = REAL_EVENT_STREAM.replace(
      '{"type":"agent_settled","aborted":false}',
      '{"type":"agent_settled","aborted":true}',
    )
    const digest = digestPiEventStream(aborted)
    expect(digest.aborted).toBe(true)
    // ⚠️ 正常那一份不是中止
    expect(digestPiEventStream(REAL_EVENT_STREAM).aborted).toBe(false)
  })

  it('⑧ 事件类型序列**只含类型名**（不含任何正文 ⇒ 可直接进日志）', () => {
    const digest = digestPiEventStream(REAL_EVENT_STREAM)
    expect(digest.eventTypes).toContain('turn_end')
    expect(digest.eventTypes).not.toContain('收到')
  })
})
