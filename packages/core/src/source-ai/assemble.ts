/**
 * `packages/core/src/source-ai/assemble.ts` —— **解读入参的装配**（P5.1 + P5.2 · DL-18）
 * （`m9-dev-language-roadmap.md` §3.8 三条线第 1/2 条 / §5.5 / §7 DL-18）
 *
 * ## 它做什么
 *
 * 把「**勾选过的命中**」变成「**送出去的那一份内容**」：
 *
 * ```
 * 命中（库里的位置）＋ 勾选集合（用户的选择）＋ 项目根
 *        │
 *        ├─ 只留**勾选过的**（片段粒度）      ← DL-18 第一道
 *        ├─ 路径改成**相对项目根**             ← DL-18 第二道（P0 的 toRelativePath）
 *        └─ 正文里的**绝对路径脱敏**            ← P5.2 的实质
 * ```
 *
 * ## ⚠️ 为什么粒度是「**片段**」而不是「文件」
 *
 * §5.5 写死：「❌ **不许在未勾选时把整个文件/整个项目发出去** ——
 * 「一个片段」是粒度上限，不是「一个文件**」。
 * ⇒ 勾了一条命中 ⇒ **只发那一条命中的片段**，同一个文件里的别的命中**不发**。
 *
 * ⚠️ **P0 的 `assembleAiCallPayload` 是文件粒度的闸**（`consentIds` 收的是**路径**）——
 * 它继续服务文件粒度的调用方；T2 的粒度更细 ⇒ 这里另做一道**片段粒度**的过滤。
 * ⚠️ **两处不是同一道闸，也不该合并**：合并会把片段粒度**退化成**文件粒度
 *   （同一文件里勾一条 ⇒ 整个文件进包）—— 那正是 §5.5 禁止的形态。
 *   ⇒ **共用的只有路径口径**：相对化与越界判定都用 P0 的 `toRelativePath`（**单源**）。
 */
import { toRelativePath } from '../services/m9-payload'
import { redactAbsolutePaths } from './redact'
import type { SourceInterpretRequest } from '@openvibe/shared'

/** 一条待装配的片段（**已带上正文**）。 */
export interface InterpretCandidate {
  /** 命中 id（勾选以它为单位） */
  id: number
  /** 相对项目根的路径（或绝对路径 —— 会被相对化） */
  path: string
  /** 命中行（1 起） */
  line: number
  /** 片段正文（**未脱敏**） */
  content: string
  /** 知识点 slug */
  topic_slug: string
  /** 知识点标题 */
  topic_title: string
}

/** 装配的入参。 */
export interface AssembleInterpretOptions {
  /** 项目根（**绝对路径**） */
  projectRoot: string
  /** 全部候选片段（**只有勾选过的会被装进去**） */
  candidates: readonly InterpretCandidate[]
  /** 勾选过的命中 id（**片段粒度**） */
  tickedIds: ReadonlySet<number>
}

/**
 * 装配解读请求。
 *
 * ⚠️ **顺序不能换**：先按 id 过滤（勾选）⇒ 再相对化路径 ⇒ 最后脱敏正文。
 *   反过来做的话，脱敏会把「未勾选的片段」也算一遍（白做功），更糟的是
 *   相对化会先把未勾选片段的路径算进结果里（虽然最终也会被滤掉，但一旦顺序写错就会漏）。
 */
export function assembleInterpretRequest(
  opts: AssembleInterpretOptions,
): SourceInterpretRequest {
  const picked = opts.candidates.filter((c) => opts.tickedIds.has(c.id))
  const fragments = picked.map((c) => ({
    // ⚠️ 片段 id 跟着走（**勾选与计数的单位是片段** ⇒ 台账要能对回是哪一条）
    finding_id: c.id,
    // ⚠️ 路径口径单源：相对化 ＋ 越界判定都用 P0 的 `toRelativePath`
    path: toRelativePath(opts.projectRoot, c.path),
    content: redactAbsolutePaths(c.content, opts.projectRoot),
    line: c.line,
    topic_slug: c.topic_slug,
    topic_title: c.topic_title,
  }))
  // ⚠️ **排序在 JS 里做**（本仓纪律：排序不放 SQL/不稳定处）；键 = (path, line, topic)
  fragments.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.topic_slug.localeCompare(b.topic_slug),
  )
  const topics = [...new Map(fragments.map((f) => [f.topic_slug, f.topic_title])).entries()]
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
  return { fragments, topics }
}
