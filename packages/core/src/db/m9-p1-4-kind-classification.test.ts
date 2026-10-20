// `packages/core/src/db/m9-p1-4-kind-classification.test.ts` —— M9 v1.6 P1.4 出口
// （`m9-dev-plan-2026-10.md` §6.2 + `m9-dev-language-roadmap.md` §7 DL-13）
//
// DL-13 原文：
//   "清单必须带 `kind` 且可复算。
//    删掉任一条目的 `kind` ⇒ 红；
//    并附一条复算：按 §1.4 的分类规则跑一遍，库级占比必须仍是 35.7% ± 抽样误差"
//
// 验三件事：
//   ① seed JSON 每条都有 `kind` 且取值 ∈ {language, library}（§3.1 schema 闭集）
//   ② 跑 TS 分类器对 Python 84 条重算 —— 严格库级 30 条 = 35.7%（与 §1.4 第 100 行一致）
//   ③ seed JSON 的 kind 字段与 TS 分类器重算结果一致
//      —— 这条是"TS 规则源 + Python builder 规则源两份必须同步"的硬闸（§1.4 数据漂移护栏）
//
// 反向变异腿（spec §7 DL-13 写法 + 本仓 DL-50 同源经验）：
//   - 删掉任一条 kind → 红
//   - 把某条 library 改成 language → 库级占比下降，红
//   - 把某条 language 改成 library → 库级占比上升，红（验证对称）
//   - builder 规则与 TS 规则不同步 → 复算结果不一致，红（防止双轨规则漂移）
//
// "抽样误差"定义：本仓定为 ± 2 个百分点（即 [34%, 38%]）——
//   - §1.4 第 100 行实测 30 条 = 35.7%，是单源历史观测（2026-10-20 已订正正文）
//   - 任何"边界扩张"或"边界收缩"都应触发本闸，不允许悄悄漂移

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  classifyKind,
  strictLibraryClassifier,
  _internals,
} from './m9-classify-lang-topics'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const PY = 'lang_topics_python3.json'
const GO = 'lang_topics_go.json'

/** §1.4 库级占比的"抽样误差"边界 —— ± 2 个百分点。 */
const LIBRARY_RATIO_MIN = 0.34
const LIBRARY_RATIO_MAX = 0.38
/**
 * §1.4 的**严格库级**条数。
 *
 * ⚠️ **与 spec §1.4 第 100 行的差 1 已闭合（2026-10-20 订正正文）** ——
 *   P1.7 开工时发现 P1.4 的分类规则有一处**语义缺陷**（关键词命中 ≠ 语义命中）：
 *   「Python3 模块」标题含「模块」⇒ 被原规则判成库级 ⇒ 它进不了 DAG。
 *   但它恰恰是 spec §1.4 第 109–111 行点名的**「源顺序 ≠ 依赖」反例主角**
 *   （「侧栏位次：Python3 模块 = #28 …… Python logging 模块 = #76」），
 *   也是 §3.6 站 2「函数与模块」的核心节点。
 * ⇒ 规则加了「<语言> 模块」例外。30/84 = **35.7%**，仍在 DL-13 的
 *   ±2 个百分点区间 [34%, 38%] 内。
 *   **spec §1.4 已于 2026-10-20 把「库级 31 条 = 36%」订正为「30 条 = 35.7%」**
 *   （owner 裁定改正文）⇒ 本处的「差 1」不再是漂移，而是两处同值。
 */
const PY_STRICT_EXPECTED = 30

function loadSeed(file: string): { items: Array<{ title: string; kind: string }> } {
  return JSON.parse(readFileSync(join(SEEDS_DIR, file), 'utf8'))
}

describe('M9 P1.4 · DL-13 清单必须带 kind 且可复算', () => {
  // ─────────────────────────────────────────────────────────────────────
  // ① 字段存在性 + 闭集
  // ─────────────────────────────────────────────────────────────────────
  it('① seed JSON 每条都有 kind；取值 ∈ {language, library}（§3.1 schema 闭集）', () => {
    for (const f of [PY, GO]) {
      const seed = loadSeed(f)
      for (const it of seed.items) {
        expect(it.kind, `${f}: ${it.title}`).toBeTruthy()
        expect(['language', 'library']).toContain(it.kind)
      }
    }
  })

  // ─────────────────────────────────────────────────────────────────────
  // ② TS 分类器对 Python 84 条复算 → 30 条 = 35.7%
  // ─────────────────────────────────────────────────────────────────────
  it('② §1.4 分类规则复算 Python 84 条：严格库级 30 条 = 35.7% ± 抽样误差', () => {
    const seed = loadSeed(PY)
    const total = seed.items.length
    expect(total).toBe(84)
    let strictLib = 0
    for (const it of seed.items) {
      if (strictLibraryClassifier(it.title)) strictLib += 1
    }
    // 精确命中 §1.4 第 100 行（30 条）
    expect(strictLib).toBe(PY_STRICT_EXPECTED)
    const ratio = strictLib / total
    // 抽样误差区间 [34%, 38%]
    expect(ratio).toBeGreaterThanOrEqual(LIBRARY_RATIO_MIN)
    expect(ratio).toBeLessThanOrEqual(LIBRARY_RATIO_MAX)
  })

  // ─────────────────────────────────────────────────────────────────────
  // ③ seed JSON 的 kind 字段与 TS 分类器重算结果一致（护 builder 与 TS 规则同步）
  // ─────────────────────────────────────────────────────────────────────
  it('③ seed JSON 的 kind 字段 == TS 分类器重算结果（两份规则源必须同步）', () => {
    let pyMismatch = 0
    for (const it of loadSeed(PY).items) {
      if (it.kind !== classifyKind(it.title)) pyMismatch += 1
    }
    let goMismatch = 0
    for (const it of loadSeed(GO).items) {
      if (it.kind !== classifyKind(it.title)) goMismatch += 1
    }
    expect(pyMismatch, 'Python seed 与 TS 分类器不一致条数').toBe(0)
    expect(goMismatch, 'Go seed 与 TS 分类器不一致条数').toBe(0)
  })

  // ─────────────────────────────────────────────────────────────────────
  // 反向变异腿 ①：删掉任一条 kind → 红
  // ─────────────────────────────────────────────────────────────────────
  it('反向变异 ①：删掉任一条 kind ⇒ DL-13 字段存在性闸红', () => {
    // 直接断言：每个 kind 必须 truthy
    for (const f of [PY, GO]) {
      const seed = loadSeed(f)
      for (const it of seed.items) {
        expect(it.kind, `${f}: ${it.title}`).toBeTruthy()
      }
    }
    // 注入式反向：抽走第一条的 kind，跑分类器会判定为缺 kind
    const tampered = JSON.parse(JSON.stringify(loadSeed(PY)))
    const victim = tampered.items[0]
    delete victim.kind
    // 复算逻辑（数据维度）：`kind` 不存在 ⇒ 无法断言 kind ∈ 闭集 ⇒ 红
    expect(victim.kind).toBeUndefined()
  })

  // ─────────────────────────────────────────────────────────────────────
  // 反向变异腿 ②：seed 把 §1.4 严格库级条目标 language → 闸 ③（seed vs TS 一致性）红
  // ─────────────────────────────────────────────────────────────────────
  it('反向变异 ②：seed 把 §1.4 严格库级条目标 language ⇒ 闸 ③ 会红（mismatch > 0）', () => {
    // 反向变异腿断言「闸确实会红」，不是闸本身。
    // 先验原始 seed：闸 ③ 通过（mismatch = 0）
    const origSeed = loadSeed(PY)
    const origMismatch = origSeed.items.filter(
      (it) => it.kind !== classifyKind(it.title),
    ).length
    expect(origMismatch).toBe(0)

    // 注入：把 §1.4 严格库级条目 "Python logging 模块" 的 kind 改成 'language'
    const tampered = JSON.parse(JSON.stringify(origSeed))
    const victimIdx = tampered.items.findIndex(
      (it: { title: string; kind: string }) => it.title === 'Python logging 模块',
    )
    expect(victimIdx).toBeGreaterThanOrEqual(0)
    tampered.items[victimIdx].kind = 'language'

    // 闸 ③ 的判定逻辑：seed kind ≠ TS 重算 ⇒ mismatch > 0 ⇒ 闸红
    const newMismatch = tampered.items.filter(
      (it: { title: string; kind: string }) => it.kind !== classifyKind(it.title),
    ).length
    expect(newMismatch).toBeGreaterThan(0)
    // 闸 ②（TS 复算）仍 31（与 kind 字段无关）
    const tsStrict = tampered.items.filter(
      (it: { title: string; kind: string }) => strictLibraryClassifier(it.title),
    ).length
    expect(tsStrict).toBe(PY_STRICT_EXPECTED)
  })

  // ─────────────────────────────────────────────────────────────────────
  // 反向变异腿 ③：seed 把 language 条目标 library → 闸 ③（seed vs TS 一致性）红
  // ─────────────────────────────────────────────────────────────────────
  it('反向变异 ③：seed 把语言知识点条目标 library ⇒ 闸 ③ 会红（mismatch > 0）', () => {
    const origSeed = loadSeed(PY)
    const origMismatch = origSeed.items.filter(
      (it: { title: string; kind: string }) => it.kind !== classifyKind(it.title),
    ).length
    expect(origMismatch).toBe(0)

    // 注入：把语言知识点 "Python3 基础语法" 的 kind 改成 'library'
    const tampered = JSON.parse(JSON.stringify(origSeed))
    const victimIdx = tampered.items.findIndex(
      (it: { title: string; kind: string }) => it.title === 'Python3 基础语法',
    )
    expect(victimIdx).toBeGreaterThanOrEqual(0)
    tampered.items[victimIdx].kind = 'library'

    const newMismatch = tampered.items.filter(
      (it: { title: string; kind: string }) => it.kind !== classifyKind(it.title),
    ).length
    expect(newMismatch).toBeGreaterThan(0)
    // 闸 ②（TS 复算）仍 31
    const tsStrict = tampered.items.filter(
      (it: { title: string; kind: string }) => strictLibraryClassifier(it.title),
    ).length
    expect(tsStrict).toBe(PY_STRICT_EXPECTED)
  })

  // ─────────────────────────────────────────────────────────────────────
  // 反向变异腿 ④：清空某条 kind → 闸 ①（字段存在性）红
  // ─────────────────────────────────────────────────────────────────────
  it('反向变异 ④：清空某条 kind ⇒ 闸 ① 会红（kind truthy 失败）', () => {
    const origSeed = loadSeed(PY)
    // 原数据：闸 ① 通过
    for (const it of origSeed.items) {
      expect(it.kind).toBeTruthy()
    }

    // 注入：把第一条 kind 清空
    const tampered = JSON.parse(JSON.stringify(origSeed))
    tampered.items[0].kind = ''
    // 闸 ① 的判定逻辑：kind truthy 失败 ⇒ 闸红
    expect(tampered.items[0].kind).toBeFalsy()
  })

  // ─────────────────────────────────────────────────────────────────────
  // 规则边界：「<语言> 模块」是语言知识点，不是库级（P1.7 开工时发现的缺陷）
  // ─────────────────────────────────────────────────────────────────────
  it('规则边界：「Python3 模块」是语言知识点（§1.4 的 DAG 反例主角），不算严格库级', () => {
    // 标题含「模块」关键词，但讲的是**模块这个概念本身** ⇒ 不是库级
    expect(strictLibraryClassifier('Python3 模块')).toBe(false)
    expect(classifyKind('Python3 模块')).toBe('language')
    // 对照：「logging 模块」是某个库 ⇒ 库级
    expect(strictLibraryClassifier('Python logging 模块')).toBe(true)
    expect(classifyKind('Python logging 模块')).toBe('library')
    // 对照：「Python3 标准库概览」是索引页 ⇒ 归 library 但不算严格库级
    expect(strictLibraryClassifier('Python3 标准库概览')).toBe(false)
    expect(classifyKind('Python3 标准库概览')).toBe('library')
  })

  it('规则边界：「Python 类型注解」「Python3 实例」是语言知识点（过泛关键词不得误伤）', () => {
    // §3.7 第 534 行明确把「类型注解」列为 Python 语言专有条目
    expect(classifyKind('Python 类型注解')).toBe('language')
    // 「实例」是面向对象的实例 ⇒ 语言知识点
    expect(classifyKind('Python3 实例')).toBe('language')
  })

  // ─────────────────────────────────────────────────────────────────────
  // 反向变异腿 ⑤：边界断言 ——「库」字在「标准库」语境下不命中严格库级
  // ─────────────────────────────────────────────────────────────────────
  it('反向变异 ⑤：「库」字在「标准库」语境下不命中严格库级（关键词边界）', () => {
    // §1.4 第 101 行「环境与杂项」档里"Python3 标准库概览"是同档
    // 它含「库」字但 §1.4 严格口径不视为库级
    expect(strictLibraryClassifier('Python3 标准库概览')).toBe(false)
    // 但它归 kind='library'（§1.4 第 113 行「按需查阅区」）
    expect(classifyKind('Python3 标准库概览')).toBe('library')
    // 反向断言：把"标准库"误判为库级会让 Python 严格库级从 31 涨到 32
    const allStdLibLike: ReadonlyArray<string> = [
      'Python3 标准库概览',
      // 任意含「库」但非「标准库」的标题应命中（这条保护前面的判定不被破）
      'Python selenium 库',
    ]
    expect(strictLibraryClassifier(allStdLibLike[0]!)).toBe(false)
    expect(strictLibraryClassifier(allStdLibLike[1]!)).toBe(true)
  })
})

describe('M9 P1.4 · DL-13 配套：单源数据内部一致性（防止 THIRD_PARTY_NAMES 漂移）', () => {
  it('`_internals` 导出的是模块内同一份清单（不是拷贝）', () => {
    // 这条是给"下次改分类规则的人"立的：改 THIRD_PARTY_NAMES 时必须也更新模块顶部的注释。
    expect(_internals.THIRD_PARTY_NAMES).toBeDefined()
    expect(_internals.KEYWORD_LIBRARY_HITS).toBeDefined()
    expect(_internals.KEYWORD_ENV_HITS).toBeDefined()
    // 关键不变量：§1.4 第 100 行 8 个 stdlib 举例必须全部在清单里
    const tpLower = new Set(_internals.THIRD_PARTY_NAMES.map((s) => s.toLowerCase()))
    for (const n of ['logging', 'pickle', 'subprocess', 'queue', 're', 'csv', 'threading', 'asyncio']) {
      expect(tpLower.has(n), `§1.4 第 100 行 stdlib 举例「${n}」不在 THIRD_PARTY_NAMES`).toBe(true)
    }
    // 关键不变量：§1.4 第 100 行 5 个第三方举例必须全部在清单里
    for (const n of ['mysql', 'mongodb', 'scrapy', 'selenium', 'pyqt']) {
      expect(tpLower.has(n), `§1.4 第 100 行第三方举例「${n}」不在 THIRD_PARTY_NAMES`).toBe(true)
    }
  })
})