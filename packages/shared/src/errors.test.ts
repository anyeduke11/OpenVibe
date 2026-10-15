import { describe, it, expect } from 'vitest'
import { ERROR_CODES, ERROR_HTTP_STATUS, TELEMETRY_EVENTS, LOCAL_EVENT_KINDS } from '@openvibe/shared'

/**
 * `ERROR_CODES` 闭集的守护闸。
 *
 * **为什么必须有这条**：本仓已实证这个闭集此前**零测试守护** ——
 * `grep -rn 'ERROR_CODES\|ErrorCode' --include='*.test.ts' apps packages` 返回 0 命中。
 * m8-agent-bridge.md FR-6.1.2 因此把「增码同批必须补守护测试」写成硬要求：
 * 增码属 B 级、会改变所有调用方可观察行为，而闭集本身没人守。
 *
 * 变异腿：往 ERROR_CODES 加一项而不配 HTTP 映射 ⇒ 第 2 条必判红。
 */

describe('ERROR_CODES 闭集完整性', () => {
  it('每一项都有 HTTP 状态映射，且无多余映射键', () => {
    const missing = ERROR_CODES.filter((c) => ERROR_HTTP_STATUS[c] === undefined)
    expect(missing, `这些错误码没有 HTTP 映射：${missing.join(', ')}`).toEqual([])
    const extra = Object.keys(ERROR_HTTP_STATUS).filter((k) => !(ERROR_CODES as readonly string[]).includes(k))
    expect(extra, `这些 HTTP 映射没有对应错误码：${extra.join(', ')}`).toEqual([])
  })

  it('状态码取值合法（100–599）', () => {
    for (const [code, status] of Object.entries(ERROR_HTTP_STATUS)) {
      expect(Number.isInteger(status) && status >= 100 && status <= 599, `${code} → ${status} 不是合法状态码`).toBe(true)
    }
  })

  it('IDEMPOTENCY_CONFLICT 存在且取 422（m8 FR-6.1.3：语义是键构造歧义，不是资源态冲突）', () => {
    expect(ERROR_CODES).toContain('IDEMPOTENCY_CONFLICT')
    expect(ERROR_HTTP_STATUS.IDEMPOTENCY_CONFLICT).toBe(422)
  })

  it('台账 kind 与遥测三事件不同名 —— 与错误码闭集同属「无守护双源」家族', () => {
    // 同理：错误码闭集和遥测白名单都是「改了没人发现」的面，这里一并钉住。
    const overlap = LOCAL_EVENT_KINDS.filter((k) => (TELEMETRY_EVENTS as readonly string[]).includes(k))
    expect(overlap).toEqual([])
  })
})
