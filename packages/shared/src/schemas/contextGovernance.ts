import { z } from 'zod'

/**
 * 上下文治理结论（只读面板的契约）。
 *
 * 数据来自三处，**都不是数据库**：
 * - `test-results/context-check.json`：`pnpm context:check` 每轮落盘的真值（被 gitignore）；
 * - `test-results/context-check-history.json`：本机多轮历史（每轮追加、保留最近 50 轮）；
 * - `docs/context-check-baseline.json`：入仓的 C-5 棘轮基线（上界与留痕）。
 *
 * ⚠️ `available: false` 是**一等状态**：本机还没跑过 `context:check`（或发布包里没有
 * 该产物）时，面板必须显示「先跑一遍」，而不是显示一串假的 0 ——
 * 假的 0 会被读成「全绿」，比不显示更坏。
 */

/** 一轮历史快照（只含计数；当轮明细在 `context-check.json`，不进历史） */
export const ContextGovernanceRun = z.object({
  /** 采样时间（ISO）；跨机器合并时的去重键 */
  at: z.string(),
  /** 产出这一轮的机器：本机 `local`，CI `ci-<平台>`；旧产物缺省时按 `local` 读 */
  source: z.string().optional(),
  errors: z.number().int().nonnegative(),
  c5: z.number().int().nonnegative(),
  c5UpperBound: z.number().int().nonnegative().nullable(),
  c5OverBy: z.number().int().nonnegative(),
  c5SuggestLowerBound: z.number().int().nonnegative().nullable(),
  coAnchors: z.number().int().nonnegative(),
})
export type ContextGovernanceRun = z.infer<typeof ContextGovernanceRun>

/** 一次合并动作的留痕（`context:history:merge` 写入历史文件的 `merges`） */
export const ContextGovernanceMerge = z.object({
  /** 合并发生时间（ISO） */
  at: z.string(),
  /** 来源文件名（basename；如 `ci-history.json`） */
  from: z.string(),
  /** 从该文件读入的合格轮次 */
  accepted: z.number().int().nonnegative(),
  /** 该文件里不合格、被丢弃的项 */
  dropped: z.number().int().nonnegative(),
  /** 去重后净增的轮次 */
  added: z.number().int().nonnegative(),
})
export type ContextGovernanceMerge = z.infer<typeof ContextGovernanceMerge>

/**
 * 按来源的**全量**合并统计（跨窗口）。
 *
 * ⚠️ 与 `merges` 的区别：`merges` 只是**最近 N 条窗口**，本字段统计文件里的全部合格记录
 * —— 面板据此说清「窗口外还有多少条」，否则筛选后用户会误以为该来源只合并过那么几次。
 */
export const ContextGovernanceMergeStat = z.object({
  /** 该来源的合并总次数（全量） */
  count: z.number().int().nonnegative(),
  /** 累计读入的合格轮次 */
  accepted: z.number().int().nonnegative(),
  /** 去重后累计净增的轮次 */
  added: z.number().int().nonnegative(),
  /** 累计丢弃的不合格项 */
  dropped: z.number().int().nonnegative(),
  /** 该来源最近一次合并时间（ISO；全量口径） */
  lastAt: z.string(),
})
export type ContextGovernanceMergeStat = z.infer<typeof ContextGovernanceMergeStat>

export const ContextGovernanceOut = z.object({
  /** 本轮结论是否存在且可解析 */
  available: z.boolean(),
  /** 采样时间（ISO） */
  at: z.string().optional(),
  /** 判红数（C-1～C-4 ＋ C-6 ＋ C-5 棘轮） */
  errors: z.number().int().nonnegative().optional(),
  /** C-5 上下游未回指（本轮计数） */
  c5: z.number().int().nonnegative().optional(),
  /** C-5 棘轮上界；基线缺失时为 null */
  c5UpperBound: z.number().int().nonnegative().nullable().optional(),
  /** C-5 超出上界的条数（0 = 未超） */
  c5OverBy: z.number().int().nonnegative().optional(),
  /**
   * C-5 上界的下调建议：数字 = 建议下调到的目标值；`null` = 无须下调；
   * 字段缺省 = 旧版产物没写（面板按「无建议」处理，不猜）。
   */
  c5SuggestLowerBound: z.number().int().nonnegative().nullable().optional(),
  /** 共锚自检条数（趋势主指标） */
  coAnchors: z.number().int().nonnegative().optional(),
  /** 最近若干轮的历史（最旧→最新）；无历史文件时缺省 */
  history: z.array(ContextGovernanceRun).optional(),
  /** 合并来源清单（最近若干条，最旧→最新）；无合并记录时缺省 */
  merges: z.array(ContextGovernanceMerge).optional(),
  /**
   * 按来源统计的**全量**合并数据（跨窗口；键 = 来源文件名）。
   *
   * ⚠️ 与 `merges` 的区别：`merges` 只是**最近 N 条窗口**，本字段统计文件里的全部合格记录
   * —— 面板据此说清「窗口外还有多少条」，否则筛选后用户会误以为该来源只合并过那么几次。
   */
  mergesBySource: z.record(z.string(), ContextGovernanceMergeStat).optional(),
  /**
   * 筛选态（`mergesFrom`）下该来源**有但没返回**的条数。
   *
   * ⚠️ 由服务端在取明细时权威计算（该来源全量记录数 − 当前页已返回条数），
   * 不是前端推断。**分页语义**：`mergesOffset` 是「从最新往回跳过多少条」，
   * 本字段 = 「当前页之后（更早）还有多少条」；offset 越大值越小，到最早时缺省。
   * 仅当差额 > 0 时出现；缺省 = 已到最早或未筛选。
   */
  mergesOmitted: z.number().int().positive().optional(),
  /**
   * 筛选态（`mergesFrom`）下该来源的**文件内记录总数**（跨窗口、含分页）。
   *
   * 面板据此显示「全量 N 条」与判断分页位置；0 = 该来源没有记录（与「已到最早」区分）。
   */
  mergesTotal: z.number().int().nonnegative().optional(),
})
export type ContextGovernanceOut = z.infer<typeof ContextGovernanceOut>
