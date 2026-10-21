// `tests/m9-p2-guards.test.ts` —— M9 v1.6 **P2 的类型层结构守卫**（DL-28 / DL-34）
// （`m9-dev-plan-2026-10.md` §6.8 ＋ `m9-dev-language-roadmap.md` §7 DL-28 / DL-34）
//
// ## 它断什么
//
// DL-28（资源层不得参与掌握度推导）与 DL-34（模式不得影响掌握度判定）
// 在**类型层**的形态：**入参的类型声明里不许出现资源字段或模式字段**。
//
// ⇒ 运行时那道（`assertMasteryInput`）挡的是「**调用时**传进来」，
//   这一道挡的是「**声明里长出来**」—— 后者更早，也更容易被下一个人照着写。
//
// ## ⚠️ 每条判据都配一条**真改代码**的变异腿
//
// 变异腿改的是**真源码文本**（不是构造的假样本）⇒ 断言「变异确实改了文本」之后
// 再断言闸红 ⇒ 闸不是摆设。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkStateModuleShape } from './support/m9-state-shape'

const STATE_MODULE = fileURLToPath(new URL('../packages/shared/src/m9-state.ts', import.meta.url))
const SOURCE = readFileSync(STATE_MODULE, 'utf8')

describe('M9 P2 · DL-28 / DL-34 类型层结构守卫 · 正支', () => {
  it('真实的掌握度计算模块：零违规', () => {
    const violations = checkStateModuleShape(SOURCE)
    expect(
      violations,
      violations.map((v) => `[${v.rule}] ${v.detail}`).join('\n'),
    ).toEqual([])
  })
})

describe('M9 P2 · DL-28 / DL-34 类型层结构守卫 · 变异腿', () => {
  it('变异腿 ①：入参接口长出资源字段 ⇒ 红', () => {
    const mutated = SOURCE.replace(
      '  byTopic: ReadonlyMap<number, readonly TopicEvidence[]>\n}',
      '  byTopic: ReadonlyMap<number, readonly TopicEvidence[]>\n  resourceIds?: readonly number[]\n}',
    )
    expect(mutated, '变异必须真的改了文本').not.toBe(SOURCE)
    const violations = checkStateModuleShape(mutated)
    expect(violations.map((v) => v.rule)).toContain('interface-members')
  })

  it('变异腿 ②：入参接口长出模式字段 ⇒ 红', () => {
    const mutated = SOURCE.replace(
      '  byTopic: ReadonlyMap<number, readonly TopicEvidence[]>\n}',
      '  byTopic: ReadonlyMap<number, readonly TopicEvidence[]>\n  required: readonly number[]\n}',
    )
    expect(mutated).not.toBe(SOURCE)
    const violations = checkStateModuleShape(mutated)
    expect(violations.map((v) => v.rule)).toContain('interface-members')
  })

  it('变异腿 ③：computeState 长出模式参数 ⇒ 红', () => {
    const mutated = SOURCE.replace(
      'export function computeState(topic: TopicNode, input: MasteryInput): MasteryState {',
      'export function computeState(topic: TopicNode, input: MasteryInput, profile: string): MasteryState {',
    )
    expect(mutated).not.toBe(SOURCE)
    const violations = checkStateModuleShape(mutated)
    expect(violations.map((v) => v.rule)).toContain('function-params')
  })

  it('变异腿 ④：证据种类闭集被撑大（多一种「阶段完成」）⇒ 红', () => {
    const mutated = SOURCE.replace(
      "export type EvidenceKind = 'checklist' | 'skill' | 'task' | 'source_hit'",
      "export type EvidenceKind = 'checklist' | 'skill' | 'task' | 'source_hit' | 'stage_done'",
    )
    expect(mutated).not.toBe(SOURCE)
    const violations = checkStateModuleShape(mutated)
    expect(violations.map((v) => v.rule)).toContain('evidence-kinds')
  })

  it('变异腿 ⑤：函数体里读了一个模式字段 ⇒ 红', () => {
    const mutated = SOURCE.replace(
      '  const own = ownStateOf(id, input)',
      '  const ceiling = required.includes(id) ? \'mastered\' : ownStateOf(id, input)',
    )
    expect(mutated).not.toBe(SOURCE)
    const violations = checkStateModuleShape(mutated)
    expect(violations.map((v) => v.rule)).toContain('forbidden-identifier')
  })

  it('变异腿 ⑥：函数体里读了一个资源字段 ⇒ 红', () => {
    const mutated = SOURCE.replace(
      '  const own = ownStateOf(id, input)',
      '  const ceiling = resourceIds.includes(id) ? \'mastered\' : ownStateOf(id, input)',
    )
    expect(mutated).not.toBe(SOURCE)
    const violations = checkStateModuleShape(mutated)
    expect(violations.map((v) => v.rule)).toContain('forbidden-identifier')
  })
})

describe('M9 P2 · DL-28 / DL-34 类型层结构守卫 · 非空壳', () => {
  it('四类规则各有触发样本（否则守卫可能恒绿）', () => {
    const broken = `
export type EvidenceKind = 'checklist'
export interface TopicEvidence { kind: EvidenceKind; ref: string }
export interface TopicNode { id: number }
export interface MasteryInput { nodes: Map<number, TopicNode> }
export function computeState(topic: TopicNode, input: MasteryInput, rank: number): string {
  const profile = 'master'
  return String(topic.id + input.nodes.size + rank + profile.length)
}
`
    const violations = checkStateModuleShape(broken)
    const rules = new Set(violations.map((v) => v.rule))
    expect(rules.has('interface-members')).toBe(true)
    expect(rules.has('function-params')).toBe(true)
    expect(rules.has('evidence-kinds')).toBe(true)
    expect(rules.has('forbidden-identifier')).toBe(true)
  })

  it('缺声明时也报红（不是「找不到就当过」）', () => {
    const violations = checkStateModuleShape('export const x = 1\n')
    expect(violations.map((v) => v.rule)).toContain('interface-missing')
    expect(violations.map((v) => v.rule)).toContain('function-missing')
    expect(violations.map((v) => v.rule)).toContain('evidence-kind-missing')
  })
})
