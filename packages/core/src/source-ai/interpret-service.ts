/**
 * `packages/core/src/source-ai/interpret-service.ts` —— **T2 解读的编排**（P5.1 ~ P5.4）
 * （`m9-dev-language-roadmap.md` §3.8 / §5.5 / §7 DL-08 / DL-09 / DL-16 / DL-18 ·
 *   dev-plan §6.11）
 *
 * ## 它做什么
 *
 * ```
 * 勾选的命中 id
 *    ├─ 读**本地**片段（本地读，不出网）
 *    ├─ 装配入参（只留勾选过的 ＋ 路径相对化 ＋ 正文脱敏）   ← DL-18 / P5.2
 *    ├─ 调 runner（可注入；没有 ⇒ AI 不可用）
 *    │     ├─ 失败 ⇒ **降级**：记台账 ＋ 如实返回「失败」，**确定性层一动不动**  ← DL-08
 *    │     └─ 成功 ⇒ 比对确定性层 ⇒ **显式标注分歧**                              ← DL-09
 *    └─ 写台账（只存指纹与计数）                                               ← DL-16 / P5.4
 * ```
 *
 * ## ⚠️ 本文件**从不写** `lang_topic_state`
 *
 * §3.8 三条线第 3 条：「解读结果**不自动入库**」⇒ 掌握度**只由确定性层决定**。
 * ⇒ 本文件对 `lang_topic_state` **只读不写** —— 这不是「忘了」，是纪律，
 *   由测试断言（解读前后状态逐字不变）。
 *
 * ## ⚠️ 「AI 不可用」与「调用失败」是**两件事**
 *
 * | 情形 | 有没有出网 | 台账 | 界面 |
 * |---|---|---|---|
 * | **不可用**（没配 runner） | ❌ 没有 | **不记**（没有调用） | T2 区**不渲染**（DL-08） |
 * | **失败**（配了但跑挂了） | ⚠️ 发出去了 | **记**（`result='error'` ＋ 原因） | 显示「解读失败」＋ 原因 |
 *
 * ⚠️ 把两者混成一件事，就会出现「没配 runner 也往台账里写一行」的假调用 ⇒
 *   台账就不再能回答「到底出网了几次」。
 */
import { readFindings, recordShare } from '../db/m9-source-scan'
import { readConsent } from '../db/m9-source-scan'
import { readTopicStateMap } from '../db/m9-p2-state'
import { readProjectRoot } from '../services/m9-source-service'
import { assembleInterpretRequest, type InterpretCandidate } from './assemble'
import { findDivergences } from './divergence'
import { fingerprintRequest, recordInterpretCall } from './ledger'
import { readSnippets } from './snippet'
import {
  InterpretRunnerError,
  type SourceInterpretRunner,
} from './runner'
import type {
  ConsentDetail,
  ConsentSource,
  MasteryState,
  SourceInterpretSummary,
} from '@openvibe/shared'

/** 解读的入参。 */
export interface InterpretOptions {
  /** 项目 id */
  projectId: string
  /** 勾选过的命中 id（**片段粒度**） */
  findingIds: readonly number[]
  /** runner（**没有 ⇒ AI 不可用**） */
  runner: SourceInterpretRunner | null
  /** 参照时刻（**注入** ⇒ 台账的时间可复现） */
  now?: () => Date
  /**
   * 用户**动过**勾选没有（客户端上报 · owner 2026-10-22）。
   *
   * ⚠️ **只影响台账的分类**，不影响「发了什么」—— 服务端仍然按**自己算出来的**
   *   勾选集合出网 ⇒ 客户端在这里撒谎，最多让审计分类失真，不会让它多发一条。
   */
  userTouched?: boolean
}

/**
 * ⚠️ **能力探测不在这里**（2026-10-22 移走）。
 *
 * 以前这里是 `interpretCapability(runner)` ⇒ 只有「可用 / 不可用」两档。
 * 现在「为什么不可用」也是用户要看的东西（设置页要告诉用户是没填、填错、还是服务没起）
 * ⇒ 探测改由 `provider-config.ts` 的 `resolveProvider` 承担，
 * 形状由 `capabilityOf` **一处**构造（`available` 是 `status` 的布尔投影）。
 */

/**
 * 推导这一次出网的**授权来源细分**（§3.9 · owner 2026-10-22）。
 *
 * ⚠️ **在服务端推导，不采信客户端的说法** —— 客户端说「这是记忆带过去的」，
 *   而服务端知道记忆里到底记的是什么 ⇒ 口径只留一处，也不给「谎报」留缝。
 *
 * | 情形 | 判定 |
 * |---|---|
 * | 没有记忆 | `no_memory` |
 * | 记忆是「全发」，这次发出去的**正是全部命中**，且**用户没动过勾选** | `memory_applied` |
 * | 记忆是「全发」，这次发出去的**正是全部命中**，但**用户动过勾选** | `user_reticked` |
 * | 其余（只发了一部分 / 有全发记忆但一条没发） | `user_partial` |
 * | 记忆是「全不发」，而这次**一条都没发** | `memory_applied` |
 *
 * ⚠️ **「记忆是全发 ＋ 用户自己又全勾了一遍」与「记忆带过去的」现在可区分了**
 *   （owner 2026-10-22）—— 但这个区分**依赖客户端上报「用户动过没有」**
 *   ⇒ 台账里**两个字段都记**（服务端的二分判定 ＋ 细分）⇒ 两者可交叉核对。
 *
 * @param rememberAll 记忆里的 `remember_all`（`null` = 没有记忆）
 * @param sentIds 这次送出去的命中 id
 * @param allIds 全部**可勾**命中（读得到正文的那批）的 id
 * @param userTouched 用户**动过**勾选没有（客户端上报；只是分类事实，不影响「发了什么」）
 */
export function deriveConsentDetail(
  rememberAll: boolean | null,
  sentIds: ReadonlySet<number>,
  allIds: ReadonlySet<number>,
  userTouched: boolean,
): ConsentDetail {
  if (rememberAll === null) return 'no_memory'
  if (rememberAll) {
    // 「全发」记忆 ⇒ 送出去的**覆盖了全部可勾命中** 才算「记忆起了作用」
    const coversAll = sentIds.size === allIds.size && [...sentIds].every((id) => allIds.has(id))
    if (!coversAll) return 'user_partial'
    return userTouched ? 'user_reticked' : 'memory_applied'
  }
  // 「全不发」记忆 ⇒ 一条都没发 ⇒ 视为「记忆起了作用」
  return sentIds.size === 0 ? 'memory_applied' : 'user_partial'
}

/**
 * 细分 ⇒ 二分（§3.9 末段那个「两类必须可区分」）。
 *
 * ⚠️ **二分保留不动**（既有判据与既有读法都依赖它）⇒
 *   `user_reticked` 在二分里仍是 `remembered`（集合相同），
 *   细分信息由**另一列**承载。
 */
export function consentSourceFromDetail(detail: ConsentDetail): ConsentSource {
  return detail === 'memory_applied' || detail === 'user_reticked' ? 'remembered' : 'explicit_tick'
}

/** 确定性层的状态（**按 slug** —— 界面与分歧都按 slug 说话）。 */
function deterministicStatesBySlug(
  db: Parameters<typeof readTopicStateMap>[0],
  projectId: string,
): Map<string, MasteryState> {
  const byId = readTopicStateMap(db, projectId)
  const slugs = db.prepare('SELECT id, slug FROM lang_topics').all() as {
    id: number
    slug: string
  }[]
  const out = new Map<string, MasteryState>()
  for (const t of slugs) {
    const state = byId.get(t.id)
    if (state !== undefined) out.set(t.slug, state)
  }
  return out
}

/**
 * 解读一次（**只对勾选过的片段入参**）。
 *
 * @param db 数据库
 * @param opts 入参
 */
export async function interpretSourceFindings(
  db: Parameters<typeof readFindings>[0],
  opts: InterpretOptions,
): Promise<SourceInterpretSummary> {
  const now = opts.now ?? (() => new Date())
  const root = readProjectRoot(db, opts.projectId)

  // ① 装配入参（只留勾选过的 ＋ 相对化 ＋ 脱敏）
  const ticked = new Set(opts.findingIds)
  // ⚠️ **按项目读命中**（owner 2026-10-22）：命中表现在每个项目各存一份
  const findings = readFindings(db, opts.projectId)
  // ⚠️ **一次读完**（与 `/api/lang/snippets` 同一口径、同一个上限）
  //   ⇒ 界面能勾的与服务端能发的**是同一批**（两边都读不到的那条，两边都不可用）
  const windows = readSnippets(root, findings)
  const candidates: InterpretCandidate[] = []
  /** **可勾**的命中 id（读得到正文的那批） */
  const tickableIds = new Set<number>()
  for (const f of findings) {
    const read = windows.get(f.id)
    // ⚠️ **读不到的那条不算「可勾」**（界面也禁用了它的勾选框 ⇒ 两边一致）
    if (read === undefined || read.window === null) continue
    tickableIds.add(f.id)
    if (!ticked.has(f.id)) continue
    candidates.push({
      id: f.id,
      path: f.file_rel_path,
      line: f.line,
      content: read.window.lines.join('\n'),
      topic_slug: f.topic_slug,
      topic_title: f.topic_title,
    })
  }
  const request = assembleInterpretRequest({ projectRoot: root, candidates, tickedIds: ticked })

  // ② AI 不可用 ⇒ **不出网、不记台账**，如实返回
  if (opts.runner === null) {
    return {
      status: 'unavailable',
      project_id: opts.projectId,
      // ⚠️ **没有 provider**（压根没有 runner ⇒ 谁也没答）
      provider: '',
      fragment_count: 0,
      item_count: 0,
      risk_count: 0,
      divergence_count: 0,
      divergences: [],
      items: [],
      input_hash: null,
      usage: null,
      failure_reason: null,
    }
  }

  // ③ 没什么可发 ⇒ 不调用、不记台账
  if (request.fragments.length === 0) {
    return {
      status: 'ok',
      project_id: opts.projectId,
      // ⚠️ **没发出去 ⇒ 谁也没答** ⇒ provider 留空（不许写「当前那家」冒充）
      provider: '',
      fragment_count: 0,
      item_count: 0,
      risk_count: 0,
      divergence_count: 0,
      divergences: [],
      items: [],
      input_hash: null,
      usage: null,
      failure_reason: null,
    }
  }

  // ④ 调用 runner
  const started = now()
  const inputHash = fingerprintRequest(request)
  try {
    const result = await opts.runner.interpret(request)
    const durationMs = Math.max(0, now().getTime() - started.getTime())
    const items = result.items
    const riskCount = items.reduce((sum, it) => sum + it.risks.length, 0)
    const divergences = findDivergences(
      items,
      deterministicStatesBySlug(db, opts.projectId),
    )
    // ⚠️ **台账记「配置的那家」而不是「模型自报的那家」** ——
    //   `result.model` / `result.provider` 是**模型的自述**（可能是猜的），
    //   而 runner 身上那两个是**配好的**（事实）⇒ 台账要记事实。
    const runnerModel = opts.runner.model
    const runnerProvider = opts.runner.provider
    recordInterpretCall(
      db,
      {
        projectId: opts.projectId,
        model: runnerModel,
        provider: runnerProvider,
        inputHash,
        candidateCount: request.fragments.length,
        passedCount: items.length,
        droppedCount: Math.max(0, request.fragments.length - items.length),
        result: 'ok',
        failureReason: '',
        durationMs,
      },
      now(),
    )
    // ⚠️ **每一次出网都要计数**（§3.9：`lang_source_shares` 是 M9 自建的出网台账）
    //   ⇒ P5 是**第一次真的出网** ⇒ 这一笔必须落，否则那张表永远是空的。
    const consentDetail = deriveConsentDetail(
      readConsent(db, opts.projectId)?.remember_all ?? null,
      new Set(request.fragments.map((f) => f.finding_id)),
      tickableIds,
      opts.userTouched === true,
    )
    recordShare(db, {
      project_id: opts.projectId,
      topic_id_count: request.topics.length,
      snippet_count: request.fragments.length,
      created_at: now().toISOString(),
      consent_source: consentSourceFromDetail(consentDetail),
      consent_detail: consentDetail,
      // ⚠️ **台账带 provider / 模型 / 用量**（§3.9 末段 · 增强 1 与 4）
      provider: runnerProvider,
      model: runnerModel,
      usage_total_tokens: result.usage?.total_tokens ?? null,
    })
    return {
      status: 'ok',
      project_id: opts.projectId,
      provider: runnerProvider,
      fragment_count: request.fragments.length,
      item_count: items.length,
      risk_count: riskCount,
      divergence_count: divergences.length,
      divergences,
      items,
      input_hash: inputHash,
      usage: result.usage ?? null,
      failure_reason: null,
    }
  } catch (err) {
    // ⑤ 失败 ⇒ **降级**：记台账 ＋ 如实返回；**确定性层一动不动**
    const durationMs = Math.max(0, now().getTime() - started.getTime())
    const reason =
      err instanceof InterpretRunnerError ? err.reason : 'runner-failed'
    const message = err instanceof Error ? err.message : String(err)
    recordInterpretCall(
      db,
      {
        projectId: opts.projectId,
        model: opts.runner.model,
        provider: opts.runner.provider,
        inputHash,
        candidateCount: request.fragments.length,
        passedCount: 0,
        droppedCount: request.fragments.length,
        result: 'error',
        failureReason: reason,
        durationMs,
      },
      now(),
    )
    return {
      status: 'failed',
      project_id: opts.projectId,
      // ⚠️ **失败也是那一家答的**（它出了网、它跑挂了）⇒ 记它
      provider: opts.runner.provider,
      fragment_count: request.fragments.length,
      item_count: 0,
      risk_count: 0,
      divergence_count: 0,
      divergences: [],
      items: [],
      input_hash: inputHash,
      usage: null,
      failure_reason: message,
    }
  }
}
