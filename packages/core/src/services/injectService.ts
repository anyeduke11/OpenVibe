import { compareCodeUnit, type PackLock } from '@openvibe/shared'
import {
  applyDecisions,
  checkPackInjectable,
  planInjection,
  strategyToDecisions,
  type InjectDecision,
  type InjectPlan,
  type InjectPlanFile,
  type PackFileWithHash,
} from '../inject'

/**
 * 注入服务（service-layer.md FR-1 的 `injectService`，owner 2026-10-14 裁① 定下的三个服务之一）。
 *
 * ## 它要解决的问题：编排被包边界劈开了
 *
 * 注入状态机是「**计划 → 决策 → 应用 → 核验**」四步，而三步的原件早已在 core
 * （`inject/planner.ts` 的 `planInjection` / `applyDecisions`、`inject/security.ts` 的 `checkPackInjectable`），
 * **唯独中间那步「决策」留在 CLI** —— 因为它要问用户，而「问用户」在 CLI 侧是 `@clack` 的
 * `select`。于是四步里有三步在 core、一步在 app，真正决定「这次注入会不会动我的文件」
 * 的那一步（决策）反而是唯一测不到传输无关形态的一步。
 *
 * ## 处方：终端交互经 `AskFn` 注入（FR-3.3）
 *
 * spec 原文已经点明正确的形制：「终端交互（`@clack` 的 `select`／`isCancel`）**留在 app 侧**，
 * 作为 `AskFn` 传入……服务层接受它，不 import 它」。
 * 于是决策规则整体下沉到 core，`@clack` 那一行仍留在 `apps/cli/src/commands/sync.ts`。
 * 决策规则从此可在 core 内用假 `AskFn` 逐项断言，而不必起子进程、不必是 TTY。
 *
 * ## 执行顺序（照搬既有 `syncAction`，不是按 FR-1 的字面顺序）
 *
 * **核验 → 计划 → 决策 → 应用**。安全防线必须在计划之前：整包一旦有违规路径就零写入，
 * 连「打算写什么」都不该对外可见（m6b §6.1/§6.3）。FR-1 那一串是能力清单，不是时序图。
 */

/** 交互询问：CONFLICT 给两项、DRIFT 给三项（core 的 options 已按状态裁好） */
export type AskFn = (file: InjectPlanFile) => Promise<InjectDecision>

/**
 * 注入域错误。
 *
 * ⚠️ **从 `apps/cli/src/commands/sync.ts` 迁入**：它守的是决策规则，而决策规则搬到了 core。
 * 留在 app 侧会迫使 core 反向依赖 app（破 R3）。CLI 侧以 `SyncError` 之名再导出，
 * 三个既有测试文件（`sync.test.ts` / `security.test.ts` / `pack-source.test.ts`）的
 * `toBeInstanceOf(SyncError)` 断的仍是**同一个类对象**，故一字未改仍然绿。
 *
 * code 集合随实现原样迁移，**未增未删**（FR-5 出参口径：code 集合不得增删）。
 */
export class InjectError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'InjectError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface DecideOptions {
  /** `--yes`：非交互下显式授权 */
  yes?: boolean
  /** `--strategy`：与 `--yes` 同时给出时批量决定待决项 */
  strategy?: InjectDecision
  /** dry-run 结构性零写入（只规划不落盘，m6b §6.1） */
  dryRun?: boolean
  /** 是否交互终端。非 TTY 且无 `--yes` ⇒ 拒绝执行，不是「默默用默认值」 */
  isTTY?: boolean
  /** 交互确认器（`@clack` 实现留在 app 侧） */
  ask?: AskFn
}

/**
 * 决策收集（从 `sync.ts` 的 `decide` 迁入，规则逐条保持）：
 * - 无待决项 ⇒ `{}`；
 * - dry-run ⇒ `{}` 并**留下说明**（不能静默：否则用户以为默认动作已经生效）；
 * - `--yes` ⇒ 按策略批量，否则 `{}`（走每项的 `defaultAction`）；
 * - 非 TTY ⇒ 抛 `NEED_TTY`，details 带待决路径，**不擅自替用户决定**；
 * - 未注入 `ask` ⇒ 抛 `NO_ASKER`（配置错误，不是用户错误）。
 */
export async function decideInjections(
  plan: InjectPlan,
  options: DecideOptions,
  warningsOut: string[],
): Promise<Record<string, InjectDecision | undefined>> {
  if (plan.pending.length === 0) return {}
  if (options.dryRun) {
    warningsOut.push(
      `dry-run：${plan.pending.length} 项待决（CONFLICT/DRIFT），正式执行会按默认「以包为准」处理`,
    )
    return {}
  }
  if (options.yes) {
    return options.strategy ? strategyToDecisions(plan, options.strategy) : {}
  }
  if (options.isTTY !== true) {
    throw new InjectError(
      'NEED_TTY',
      `${plan.pending.length} 个文件需要确认，但当前不是交互终端：加 --yes（默认以包为准）或 --yes --strategy skip|overwrite|keep-local`,
      { pending: plan.pending.map((p) => p.path).sort(compareCodeUnit) },
    )
  }
  const ask = options.ask
  if (!ask) throw new InjectError('NO_ASKER', '交互确认器未注入')
  const decisions: Record<string, InjectDecision | undefined> = {}
  for (const file of plan.pending) decisions[file.path] = await ask(file)
  return decisions
}

export interface PlanDecideApplyInput {
  /** 项目绝对路径：安全防线用它把包内相对路径解析成绝对路径并拒绝越界写入 */
  projectPath: string
  /** 包内文件全集（路径 + 正文 + sha256；sha256 是规划五状态与指纹的输入，不是可选项） */
  files: readonly PackFileWithHash[]
  /** 磁盘读取器（读失败按抛错处理，不静默当成可覆盖的新文件，m6b §6.5） */
  readDisk: (relPath: string) => string | null
  /** 既有 pack.lock.json 的解析结果；null 表示未注入或不可解析 */
  lock: PackLock | null
  /** `--target` 解析后的目标子集；null 表示全量 */
  targets?: readonly string[] | null
  decisions: DecideOptions
  warningsOut: string[]
}

export interface PlanDecideApplyResult {
  plan: InjectPlan
  decided: Record<string, InjectDecision | undefined>
  /** 落盘绝对路径（按包内路径索引）——调用方据此做备份与写入 */
  absPaths: Record<string, string>
  writes: ReturnType<typeof applyDecisions>['writes']
  skipped: ReturnType<typeof applyDecisions>['skipped']
}

/**
 * 「计划 → 决策 → 应用」的主入口（service-layer.md FR-1.1 的一次用户意图级入口）。
 *
 * **本函数不碰磁盘**：备份、写文件、抢锁、释放信号监听都在调用方（CLI），
 * 因为它们全是 I/O 副作用，留在 app 侧才能由 app 决定怎么呈现失败。
 * 本函数只产出「该写什么、写到哪里、为什么」。
 *
 * @throws `AppError('VALIDATION_ERROR')` — 整包安全防线未过（越界路径／非法路径／超大文件／文件数超限），
 *   由 `checkPackInjectable` 抛出。**此时一个字节都不该写**，连计划都不产出；
 * @throws `InjectError` — `PATH_REJECTED`（待写路径没有已校验的绝对路径 ⇒ 防线被绕过，宁可整包中止）
 *   / `NEED_TTY` / `NO_ASKER`
 */
export async function planDecideApply(
  input: PlanDecideApplyInput,
): Promise<PlanDecideApplyResult> {
  const { warningsOut } = input

  // 核验先行：整包安全防线。违规即整包中止（m6b §6.1/§6.3）
  const safety = checkPackInjectable(input.projectPath, input.files)

  const plan = planInjection({
    files: input.files,
    readDisk: input.readDisk,
    lock: input.lock,
    targets: input.targets ?? null,
  })

  const decided = await decideInjections(plan, input.decisions, warningsOut)
  const applied = applyDecisions(
    plan,
    Object.fromEntries(input.files.map((f) => [f.path, f.content])),
    decided,
  )

  // 每个待写路径都必须有已校验的绝对路径；缺一个就是安全防线被绕过，宁可整包中止
  for (const write of applied.writes) {
    if (safety.absPaths[write.path] === undefined) {
      throw new InjectError('PATH_REJECTED', `${write.path} 未通过写入路径校验，整包中止`)
    }
  }

  return {
    plan,
    decided,
    absPaths: safety.absPaths,
    writes: applied.writes,
    skipped: applied.skipped,
  }
}
