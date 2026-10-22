// `packages/shared/src/m9-source-scan.ts` —— M9 v1.6 **P4 的扫描结果形状**
// （`m9-dev-language-roadmap.md` §3.8 / §3.10 · dev-plan §6.10 P4.1 ~ P4.3）
//
// ## 它是什么
//
// 「一次扫描产出了什么」的**类型**定义。core 的扫描器、server 的出参、
// web 的抽屉三方共用这一份 ⇒ 形状只有一处。
//
// ## ⚠️ 三态的语义（§3.8.2 第 2 条：两档不混在一个列表里）
//
// | 档 | 什么时候 | 颜色/标签 |
//---|---|---|
// | `confirmed` | **解析器**认出的（Python `ast` / Go `go/parser`） | 「已确认」 |
// | `possible` | **启发式**（正则）认出的 | 「**可能**」 |
//
// ⚠️ 「两档不混」不是样式问题：用户据此判断**要不要信**。混在一起就等于把
// 「可能」显示成「已确认」⇒ 用户会拿着不确定的结论去改代码。
//
// ## ⚠️ 扫描模式（`scanner_mode`）必须**显式可见**
//
// §3.8.2 第 1 条：「不许静默回退」⇒ 扫描结果里**必须**带
// 「本次用的是哪条路」＋「工具链版本（或缺失）」。
import type { LangCode } from './m9-roadmap'

/** 扫描走的是哪条路（§3.8.2 第 1 条）。 */
export type ScannerMode = 'parser' | 'heuristic'

/**
 * 出网台账的**授权来源**（§3.9 的二分）。
 *
 * ⚠️ **二分保留不动**（既有判据与既有读法都依赖它）⇒ 细分另开一列。
 */
export type ConsentSource = 'explicit_tick' | 'remembered'

/**
 * 出网台账的授权来源**细分**（§3.9 · owner 2026-10-22 裁定「加一列区分」）。
 *
 * ⚠️ **为什么二分不够**：「因为记住了而全勾」与「用户自己又全勾了一遍」
 *   在二分里**都**是 `remembered`（集合相同）⇒ 事后审计分不清这两种情况。
 *
 * | 取值 | 含义 |
 * |---|---|
 * | `memory_applied` | 记忆起了作用（全发记忆 ＋ 发了全部 / 全不发记忆 ＋ 一条没发） |
 * | `user_reticked` | 记忆是「全发」，但**用户自己又全勾了一遍**（依赖客户端「动过没有」的上报） |
 * | `user_partial` | 用户自己勾了一部分（不是记忆带过去的） |
 * | `no_memory` | 没有记忆，纯用户主动 |
 * | `unknown` | **历史行**（细分列之前写的行） |
 */
export type ConsentDetail =
  | 'memory_applied'
  | 'user_reticked'
  | 'user_partial'
  | 'no_memory'
  | 'unknown'

/** 命中的可信度（§3.8.2 第 2 条：两档不混）。 */
export type ScanConfidence = 'confirmed' | 'possible'

/** 一条命中（§3.10 的 `lang_topic_findings` 一行）。 */
export interface SourceFinding {
  /** 模式 id（`m9-source-patterns.ts` 的 `SourcePattern.id`） */
  pattern_id: string
  /** 规范模式名（界面显示；⚠️ **不是**落库的 `matched_pattern`） */
  pattern_name: string
  /** 知识点 slug */
  topic_slug: string
  /**
   * **相对**项目根的路径（§3.10：⚠️ **绝不存绝对路径** —— FR-7.2）。
   *
   * ⚠️ 路径分隔符统一用 `/`（Windows 上也如此）⇒ 跨机器的导出清单可比对。
   */
  file_rel_path: string
  /** 行号（**1 起**） */
  line: number
  /** 列号（**1 起**） */
  col: number
  /**
   * **命中的那段源码文本**（⚠️ 可 grep 的字面串 —— DL-22 的导出要求）。
   *
   * ⚠️ 与 `pattern_name` **不是同一个东西**（见 `m9-source-patterns.ts` 文件头）。
   */
  matched_pattern: string
  /** 可信度 */
  confidence: ScanConfidence
  /** 本次扫描用的哪条路 */
  scanner_mode: ScannerMode
}

/** 某个语言这一侧的扫描情况（§3.8.2 第 1 条：路径必须显式可见）。 */
export interface LangScanStatus {
  lang: LangCode
  /**
   * 这一侧走了哪条路。
   *
   * ⚠️ **`null` = 这一侧没扫成**（例：机器上没有 `python3`）⇒
   *   「没扫成」与「扫了但没命中」必须能分开 —— 前者是**环境问题**，
   *   后者是**结论**。混起来会让用户以为「我的项目里没用这些」。
   */
  mode: ScannerMode | null
  /** 工具链版本（例：`go1.24.5` / `Python 3.15.0`）；**启发式或未扫成时为 null** */
  toolchain: string | null
  /** 这一侧扫描的文件数 */
  file_count: number
  /** 这一侧的命中数 */
  hit_count: number
  /** ⚠️ 显式告知（例：「未检测到 Go 工具链，识别可能不全」）；null = 没有要说的话 */
  notice: string | null
}

/** 一次扫描的完整结果。 */
export interface SourceScanResult {
  /** 项目 id */
  project_id: string
  /** 扫描 id（一次扫描一个；`lang_topic_findings.scan_id` 的分组键） */
  scan_id: number
  /** 两侧各走哪条路 */
  languages: LangScanStatus[]
  /** 全部命中（按 file → line → pattern 排序，**排序在 JS 里做**） */
  findings: SourceFinding[]
  /** 扫描过程中的显式告警（⚠️ 空数组 = 没有告警；不是「未知」） */
  warnings: string[]
}

/**
 * 扫描模式的**显示文案**（§3.8.2 第 1 条：路径必须显式可见）。
 *
 * ## 为什么它住在 shared 而不是组件里
 *
 * 「本次用的是哪条路」是**扫描结果的语义**，不是某个界面的私有装饰 ——
 * 同一份 `LangScanStatus` 会被 web 抽屉、CLI 输出、将来的导出清单同时用到。
 * ⇒ 文案只留一处（口径只留一处）。
 *
 * ## ⚠️ 三档不能合并
 *
 * - `parser` ⇒ 「完整解析（工具链版本）」—— **带版本**，用户才知道这个结论是谁给的；
 * - `heuristic` ⇒ 「启发式模式」—— 明确降级；
 * - `null` ⇒ 「未扫描」—— **这一侧没扫成**（环境问题），与「扫了但没命中」不是一回事。
 */
export function describeScannerMode(info: LangScanStatus): string {
  if (info.mode === 'parser') return `完整解析（${info.toolchain ?? '工具链未知'}）`
  if (info.mode === 'heuristic') return '启发式模式'
  return '未扫描'
}
