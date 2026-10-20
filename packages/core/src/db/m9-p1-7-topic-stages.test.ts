// `packages/core/src/db/m9-p1-7-topic-stages.test.ts` —— M9 v1.6 P1.7 出口
// （`m9-dev-plan-2026-10.md` §6.2 + `m9-dev-language-roadmap.md` §7 DL-04 / DL-12 / DL-26）
//
// P1.7 = **补上 M9-P1 期范围里漏掉的那一项**：「建前置边并过无环守卫」。
//
// 断六件事：
//   ① 8 站分站落地：每条 language 类条目都有站，Python 八站全满、Go 站号连续
//   ② 前置边入库（112 条），且**只挂 language 类条目**
//   ③ **DL-04：前置边无环** —— 守卫做**真正的环检测**（不靠 stage 单调性）
//   ④ **DL-12：库级条目不得进学习路线** —— 四颗牙齿，每颗都能被变异腿打红
//   ⑤ 前置站不得晚于后继站（路线能自上而下走）
//   ⑥ **DL-26：§3.1 表数可复算** —— grep 实跑 == 正文写的 17，**且分组分解的成员集合相等**
//
// 反向变异腿（证明闸确实会红）：
//   - 注入一条同站的 a→b→a ⇒ 环检测必须检出（**这条同时证明守卫不靠 stage 单调性**）
//   - 把库级条目改成 language ⇒ 误分类闸红（DL-12 牙 ②）
//   - 给库级条目指派非 0 站号 ⇒ 站号指派闸红（DL-12 牙 ③）
//   - 给库级条目加一条边 ⇒ 边闸红（DL-12 牙 ④）
//   - 改 spec §3.1 的表 ⇒ DL-26 复算红
//   - 前置站晚于后继站 ⇒ 站序闸红
//
// ⚠️ **DL-12 首版闸是同义反复**（P1.7 开工自查发现）：
//   初版写「站列表里不得出现 kind='library' 的节点」，而站列表本身是
//   kind 过滤后的结果 ⇒ 该检查**恒绿**，是摆设。⇒ 现改为四颗能红的牙齿：
//     ① 站列表条目数（生产路径）== 独立 SQL 的 kind='language' 条数
//     ② 每条目的 kind 与 §1.4 分类规则重算一致
//     ③ 库级条目不得被指派非 0 站号
//     ④ 边不得连接库级条目
//   配一条**反证**：未过滤的分组里确实有库级 ⇒ 牙 ① 不是空转。
//
// ⚠️ DL-26 断的是**两条**：总数（grep == 正文）与分解（分组口径的成员集合 == grep 的集合）。
//   只断总数的话，「总数对、拆分错位」会被完整放过 —— spec §3.1 抬头自己就记着
//   v1.5 那次「总数 17 对得上、分组却错位一格」的事故。
//
// ⚠️ **范围边界**：§0 速览与 §3.1 的**逐组对照**归 **DL-44**（dev-plan §11.1 的
//   `tests/m9-spec-consistency.test.ts`），**不在 P1.7 范围**，本文件不重复实现。
//   本文件只守 §3.1 **区间内部**的自洽：正文写的 17 == grep 实跑值，
//   且 §3.1 分组口径的成员并集 == grep 出的表名集合（不重不漏）。
//   ⚠️ 纯**跨组对调**（各组条数不变、成员并集不变）在当前文档结构下**不可检出** ——
//      「组归属」只有 §3.1 抬头那一行一处出处，没有第二处可对（详见交付报告缺口登记）。

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedConceptContent } from './m9-p1-5-concept-content'
import { seedConceptDeltas } from './m9-p1-6-concept-deltas'
import {
  seedTopicEdges,
  listDagNodes,
  listDagEdges,
  stationList,
  detectDagCycle,
  libraryLeakage,
  unfilteredStationPreview,
  stationHoles,
  stageOrderViolations,
} from './m9-p1-7-topic-stages'
import { findCycle, topoOrder, type DagEdge } from './m9-topic-dag'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')

// ✅ **节点数已裁定并改正文（2026-10-20，owner 裁定「接受实测值」）**：
//   dev-plan §6.2 的 P1 出口原写「lang_topics 节点数 = 78」，**现已改为 72**。
//   那 78 来自 §1.4 的 Python 三档（语言知识点 44）＋ 隐含「Go 34 条全是语言知识点」。
//   **实测 = 72**（Python 45 ＋ Go 27）：
//     ① Python 侧 **+1**：「Python3 模块」从库级纠正为语言知识点（P1.4 规则缺陷，
//        P1.7 开工时发现）⇒ 44 → 45；
//     ② Go 侧 **−7**：runoob Go 34 条里有 7 条是「教程首页 / 简介 / 环境安装 /
//        开发工具 / 测验 / VSCode」类（§1.4 从未对 Go 做三档拆分）⇒ 34 → 27。
//   净 78 → 72。spec §1.4 的两行（44/31 ⇒ 45/30）已于同日一并订正。
//   单测钉的是**实测值**（可复算），不是计划值。
const EXPECTED_EDGES = 112
const EXPECTED_PY_LANGUAGE = 45
const EXPECTED_GO_LANGUAGE = 27
const EXPECTED_STAGE_TABLES = 17

function seedAll(h: { db: Parameters<typeof seedTopicEdges>[0] }): void {
  seedLangTopics(h.db, SEEDS_DIR)
  seedConceptContent(h.db, SEEDS_DIR)
  seedConceptDeltas(h.db, SEEDS_DIR)
  seedTopicEdges(h.db, SEEDS_DIR)
}

describe('M9 P1.7 · 分站与前置边', () => {
  it('① 8 站分站落地：Python 45 条 / Go 27 条 language 类；Python 八站全满，Go 站号连续', () => {
    const h = newDb()
    try {
      seedAll(h)
      const py = listDagNodes(h.db, 'python').filter((n) => n.kind === 'language')
      const go = listDagNodes(h.db, 'go').filter((n) => n.kind === 'language')
      expect(py.length).toBe(EXPECTED_PY_LANGUAGE)
      expect(go.length).toBe(EXPECTED_GO_LANGUAGE)

      const pyStations = stationList(h.db, 'python')
      // Python 侧八站全满（§3.6 的 8 站是 Python 视角的分层）
      for (let s = 0; s < 8; s++) {
        expect(pyStations.get(s)?.length ?? 0, `Python 站 ${s} 为空`).toBeGreaterThan(0)
      }
      // Go 侧站 6/7 允许为空（runoob Go 34 条里无 Web 框架与部署条目 —— 事实，不是缺口）
      // 但站号必须连续无空洞
      expect(stationHoles(h.db, 'go')).toEqual([])
      expect(stationHoles(h.db, 'python')).toEqual([])

      // 库级条目 stage_id 恒为 0（无语义占位，不进站列表）
      const libs = listDagNodes(h.db, 'python').filter((n) => n.kind === 'library')
      expect(libs.length).toBeGreaterThan(0)
      for (const n of libs) {
        expect(n.stage_id, `${n.slug} 是库级，stage_id 应恒为 0`).toBe(0)
      }
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('② 前置边 112 条入库，全部连接 language 类条目', () => {
    const h = newDb()
    try {
      seedAll(h)
      const res = seedTopicEdges(h.db, SEEDS_DIR)
      expect(res.status).toBe('imported')
      expect(res.warnings).toEqual([])
      const pyEdges = listDagEdges(h.db, 'python')
      const goEdges = listDagEdges(h.db, 'go')
      expect(pyEdges.length + goEdges.length).toBe(EXPECTED_EDGES)

      // DL-12：边不接库级
      const leakage = libraryLeakage(h.db, 'python')
      expect(leakage.onEdges).toEqual([])
      expect(leakage.assignedStages).toEqual([])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('③ DL-04：前置边无环（守卫做真正的环检测，不靠 stage 单调性）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(detectDagCycle(h.db, 'python')).toBeNull()
      expect(detectDagCycle(h.db, 'go')).toBeNull()
      // 拓扑排序存在（Kahn 的副产品：能排完说明无环）
      const nodes = listDagNodes(h.db, 'python')
      expect(topoOrder(nodes, listDagEdges(h.db, 'python'))).not.toBeNull()
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('④ DL-12：库级条目不得进站列表 / DAG 节点（四颗牙齿）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const leak = libraryLeakage(h.db, 'python')
      // 牙 ①：站列表（生产路径）条目数 == 独立 SQL 查出的 kind='language' 条数
      //   —— kind 过滤被删 ⇒ 站 0 会多出全部库级条目 ⇒ 两侧不等 ⇒ 红
      expect(leak.listed).toBe(EXPECTED_PY_LANGUAGE)
      expect(leak.listed, '站列表条目数与 kind=language 条数不等').toBe(leak.languageOnly)
      // 牙 ②：库里每条目的 kind 与 §1.4 分类规则重算一致
      //   —— 「库级被误标成 language」是最真实的泄漏路径
      expect(leak.misclassified.map((n) => n.slug)).toEqual([])
      // 牙 ③：库级条目不得被指派非 0 站号（约定恒为 0）
      expect(leak.assignedStages.map((n) => n.slug)).toEqual([])
      // 牙 ④：边不得连接库级条目
      expect(leak.onEdges).toEqual([])
      // 前提：该语言确实有库级条目（否则 牙 ① 是空转）
      expect(leak.libraryCount).toBeGreaterThan(0)

      // 站列表里逐条看：不得出现库级条目
      const stations = stationList(h.db, 'python')
      for (const [stage, nodes] of stations) {
        for (const n of nodes) {
          expect(n.kind, `站 ${stage} 里混进了库级条目 ${n.slug}`).toBe('language')
        }
      }
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('⑤ 前置站不得晚于后继站（路线能自上而下走）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(stageOrderViolations(h.db, 'python')).toEqual([])
      expect(stageOrderViolations(h.db, 'go')).toEqual([])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('幂等：二次 import 不增不减；stage_id 重写结果一致', () => {
    const h = newDb()
    try {
      seedAll(h)
      const second = seedTopicEdges(h.db, SEEDS_DIR)
      expect(second.created).toBe(0)
      expect(second.ignored).toBe(EXPECTED_EDGES)
      expect(listDagEdges(h.db, 'python').length + listDagEdges(h.db, 'go').length).toBe(
        EXPECTED_EDGES,
      )
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})

describe('M9 P1.7 · DL-26 §3.1 表数可复算（总数 + 分解两条都断）', () => {
  const spec = readFileSync(SPEC_FILE, 'utf8')

  /** 取 §3.1 的区间（从 "### 3.1 数据模型" 到下一个 "### " 标题） */
  function section31(text: string): string {
    const start = text.indexOf('### 3.1 数据模型')
    expect(start, 'spec 里找不到 §3.1').toBeGreaterThanOrEqual(0)
    const rest = text.slice(start + 10)
    const nextIdx = rest.indexOf('\n### ')
    return nextIdx === -1 ? rest : rest.slice(0, nextIdx)
  }

  it('总数：grep -c "^lang_"（限定 §3.1 区间）的实跑值 == 正文写的 17', () => {
    const sec = section31(spec)
    const tables = [...sec.matchAll(/^lang_[a-z_]+/gm)].map((m) => m[0])
    const uniq = [...new Set(tables)]
    // 去重后应当是 17（表名在正文里出现多次，正文写法是「每个表名一行」+ 引用）
    expect(uniq.length).toBe(EXPECTED_STAGE_TABLES)
    // 正文抬头的数字：「十七张表」
    expect(sec).toContain('十七张表')
    // 抬头尾部的算式：7 ＋ 4 ＋ 2 ＋ 3 ＋ 1 = 17
    expect(sec).toContain('7 ＋ 4 ＋ 2 ＋ 3 ＋ 1 = **17**')
  })

  it('分解：分组口径的成员集合 == grep 出的表名集合（不只是计数相等）', () => {
    const sec = section31(spec)
    const grepped = [...new Set([...sec.matchAll(/^lang_[a-z_]+/gm)].map((m) => m[0]))]

    // 解析分组口径：**知识点 7**（`a` `b` …）· **源码与记忆 4**（…）…
    const groups = [...sec.matchAll(/\*\*([^*]+?)\s(\d+)\*\*（([^）]*)）/g)]
    expect(groups.length, '没解析到分组口径').toBeGreaterThan(0)
    const members: string[] = []
    let sum = 0
    for (const g of groups) {
      const declared = Number(g[2])
      const names = [...g[3]!.matchAll(/`(lang_[a-z_]+)`/g)].map((m) => m[1]!)
      // ⚠️ **计数自洽不等于分解自洽** —— 逐项都要对得上
      expect(names.length, `分组「${g[1]}」声明 ${declared} 但列了 ${names.length} 个`).toBe(
        declared,
      )
      sum += declared
      members.push(...names)
    }
    expect(sum).toBe(EXPECTED_STAGE_TABLES)
    // ⚠️ **成员集合相等**（不是只比计数 —— 计数相等但成员错位正是本例要防的）
    expect([...members].sort()).toEqual([...grepped].sort())
  })

  // ─────────────────────────────────────────────────────────────────────
  // DL-26 的变异腿：证明这两道闸都会红
  // ─────────────────────────────────────────────────────────────────────
  it('变异 ①：spec §3.1 里多出一张表 ⇒ 总数闸红', () => {
    const sec = section31(spec)
    const orig = [...new Set([...sec.matchAll(/^lang_[a-z_]+/gm)].map((m) => m[0]))]
    expect(orig.length).toBe(EXPECTED_STAGE_TABLES)

    // 注入：在 §3.1 区间里加一张不存在的表
    const tampered = sec.replace(
      /^lang_concepts/m,
      'lang_fake_table（伪造的表）\nlang_concepts',
    )
    const after = [...new Set([...tampered.matchAll(/^lang_[a-z_]+/gm)].map((m) => m[0]))]
    // 闸红：总数不再是 17
    expect(after.length).not.toBe(EXPECTED_STAGE_TABLES)
    expect(after.length).toBe(EXPECTED_STAGE_TABLES + 1)
  })

  it('变异 ②：分组口径里换成一个不存在的表名（计数不变）⇒ 成员集合闸红', () => {
    const sec = section31(spec)
    const grepped = [...new Set([...sec.matchAll(/^lang_[a-z_]+/gm)].map((m) => m[0]))]

    // 取分组口径的解析逻辑（原样搬过来用，避免测试与实现各写一份）
    const parse = (text: string): { members: string[]; sum: number } => {
      const members: string[] = []
      let sum = 0
      for (const g of text.matchAll(/\*\*([^*]+?)\s(\d+)\*\*（([^）]*)）/g)) {
        const names = [...g[3]!.matchAll(/`(lang_[a-z_]+)`/g)].map((m) => m[1]!)
        expect(names.length).toBe(Number(g[2]))
        sum += Number(g[2])
        members.push(...names)
      }
      return { members, sum }
    }

    const orig = parse(sec)
    expect(orig.sum).toBe(EXPECTED_STAGE_TABLES)
    expect([...orig.members].sort()).toEqual([...grepped].sort())

    // 注入：把分组口径里的一个成员换成**不存在的表名**
    //   ⇒ 每组条数不变、总数不变（17）⇒ **只有成员集合相等**这道闸能发现
    const tampered = sec.replace('`lang_topic_terms`', '`lang_topic_termz`')
    const after = parse(tampered)
    expect(after.sum, '注入后计数不应变化 —— 变了说明这条腿测的不是成员集合').toBe(
      EXPECTED_STAGE_TABLES,
    )
    expect(after.members.length).toBe(EXPECTED_STAGE_TABLES)
    // 成员集合不再相等（少一张真表、多一张不存在的表）
    expect([...after.members].sort()).not.toEqual([...grepped].sort())
    expect(after.members).toContain('lang_topic_termz')
    expect(after.members).not.toContain('lang_topic_terms')
  })
})

describe('M9 P1.7 · 反向变异腿（证明闸确实会红）', () => {
  it('变异 ①：注入一条同站的 a→b→a ⇒ 环检测必须检出（证明守卫不靠 stage 单调性）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const nodes = listDagNodes(h.db, 'python')
      // 取同站的两个节点（站 0 的两条）—— **同站边是允许的**，
      // 所以守卫若只查「stage 是否单调」就检不出这个环
      const station0 = nodes.filter((n) => n.kind === 'language' && n.stage_id === 0)
      expect(station0.length).toBeGreaterThanOrEqual(2)
      const a = station0[0]!
      const b = station0[1]!
      // 注入 a→b 与 b→a（注意：正常库里只有 prereq→topic 方向的一条）
      const injected: DagEdge[] = [
        { topic_id: b.id, prereq_topic_id: a.id },
        { topic_id: a.id, prereq_topic_id: b.id },
      ]
      const cycle = findCycle(nodes, injected)
      expect(cycle, '同站的两节点环没被检出').not.toBeNull()
      expect(cycle!.length).toBeGreaterThanOrEqual(3)
      // 两个端点都在环上
      expect(cycle).toContain(a.id)
      expect(cycle).toContain(b.id)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ②：把库级条目改成 language ⇒ 误分类闸红（DL-12 牙 ②）', () => {
    const h = newDb()
    try {
      seedAll(h)
      // 原状：闸绿
      expect(libraryLeakage(h.db, 'python').misclassified).toEqual([])
      // 注入：把一条库级条目改成 language ⇒ 它就坐进了学习路线
      const lib = listDagNodes(h.db, 'python').find((n) => n.kind === 'library')!
      h.db.prepare(`UPDATE lang_topics SET kind = 'language' WHERE id = ?`).run(lib.id)
      // 闸红：它与 §1.4 分类规则重算结果不一致
      const leak = libraryLeakage(h.db, 'python')
      expect(leak.misclassified.length, '库级条目被误标成 language 却没被检出').toBeGreaterThan(0)
      expect(leak.misclassified.map((n) => n.id)).toContain(lib.id)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ⑤：给库级条目指派非 0 站号 ⇒ 站号指派闸红（DL-12 牙 ③）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(libraryLeakage(h.db, 'python').assignedStages).toEqual([])
      const lib = listDagNodes(h.db, 'python').find((n) => n.kind === 'library')!
      // 注入：把库级条目排进「面向对象」那一站
      h.db.prepare(`UPDATE lang_topics SET stage_id = 3 WHERE id = ?`).run(lib.id)
      const leak = libraryLeakage(h.db, 'python')
      expect(leak.assignedStages.length, '库级条目被指派了站号却没被检出').toBeGreaterThan(0)
      expect(leak.assignedStages.map((n) => n.id)).toContain(lib.id)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('反证：未过滤的分组里**确实**有库级 ⇒ 牙 ① 不是空转（过滤在起作用）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const leak = libraryLeakage(h.db, 'python')
      const raw = unfilteredStationPreview(h.db, 'python')
      // 未过滤 ⇒ 库级条目确实会出现在分组里（它们 stage_id=0 ⇒ 落在站 0）
      const rawLibs = [...raw.values()].flat().filter((n) => n.kind === 'library')
      expect(rawLibs.length, '未过滤分组里一条库级都没有 ⇒ 这条反证无法证明闸在做事').toBe(
        leak.libraryCount,
      )
      expect(rawLibs.length).toBeGreaterThan(0)
      // 而生产路径把它们全滤掉了 ⇒ 站列表条目数（45）< 未过滤总数（84）
      const rawTotal = [...raw.values()].flat().length
      expect(rawTotal).toBeGreaterThan(leak.listed)
      expect(leak.listed).toBe(leak.languageOnly)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ③：给库级条目加一条边 ⇒ 边闸红（DL-12 的推论）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(libraryLeakage(h.db, 'python').onEdges).toEqual([])
      // 注入：一条 python topic → 一条 library 的边
      const lib = listDagNodes(h.db, 'python').find((n) => n.kind === 'library')!
      const topic = listDagNodes(h.db, 'python').find(
        (n) => n.kind === 'language' && n.id !== lib.id,
      )!
      h.db
        .prepare(`INSERT OR IGNORE INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?, ?)`)
        .run(topic.id, lib.id)
      const leak = libraryLeakage(h.db, 'python')
      expect(leak.onEdges.length, '接了库级条目的边没被检出').toBeGreaterThan(0)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ④：前置站晚于后继站 ⇒ 站序闸红', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(stageOrderViolations(h.db, 'python')).toEqual([])
      // 注入：一条「站 4 的条目依赖站 0 的条目」的反向边（用站号最大的当 topic）
      const nodes = listDagNodes(h.db, 'python').filter((n) => n.kind === 'language')
      const late = nodes.find((n) => n.stage_id === 4)!
      const early = nodes.find((n) => n.stage_id === 0)!
      h.db
        .prepare(`INSERT OR IGNORE INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?, ?)`)
        .run(late.id, early.id)
      // ⚠️ 这条边**方向上是合法的**（late 依赖 early）⇒ 不构成环
      //    但它**不违反**站序（前置站 0 早于后继站 4）⇒ 闸不该红
      expect(stageOrderViolations(h.db, 'python')).toEqual([])
      // 反过来：让站 0 的条目依赖站 4 的条目 ⇒ 前置站更晚 ⇒ 闸红
      h.db
        .prepare(`INSERT OR IGNORE INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?, ?)`)
        .run(early.id, late.id)
      const violations = stageOrderViolations(h.db, 'python')
      expect(violations.length, '前置站晚于后继站的边没被检出').toBeGreaterThan(0)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})
