/**
 * `iso-ports.mjs` 的类型声明（2026-10-31）。
 *
 * ⚠️ **为什么实现是 `.mjs` 而不是 `.ts`**：`scripts/dev-iso.mjs` 是纯 `.mjs`
 *   （用 `node` 直接跑，没挂 TS 加载器）⇒ 共用模块必须是纯 JS。
 *   而判据测试（`.ts`）也要用同一个模块 ⇒ 单源一份实现 + 这一份声明。
 *
 * ⚠️ **声明与实现必须一致**：改实现签名时同步改这里，否则测试拿到的是错的类型。
 */

/** 端口被占时最多重试几次（首试 1 次 + 重试 2 次） */
export const PORT_RETRY_LIMIT: number

/** 一组端口：API 一个、web 一个 */
export interface IsoPortPair {
  api: number
  web: number
}

/** 探一个当前空闲的端口（仍有竞态窗口，见实现注释） */
export function findFreePort(): Promise<number>

/** 探一组互不相同的端口 */
export function pickPortPair(): Promise<IsoPortPair>

/** 这段输出是不是在说「端口被占」 */
export function detectPortConflict(text: string): boolean

/** 一次尝试的结果 */
export interface IsoAttemptResult {
  /** 失败原因是不是端口冲突 */
  conflict: boolean
  /** 子进程退出码（冲突时通常是 1） */
  code?: number
}

/** 重试循环的结果 */
export interface IsoRetryResult extends IsoAttemptResult {
  /** 最后一组用的端口 */
  ports: IsoPortPair
  /** 一共试了几次（首试算第 1 次） */
  attempts: number
  /** true = 重试用尽仍未起来 */
  exhausted?: boolean
}

/**
 * 起一次；端口被占就换一组端口重试。
 *
 * @param options.allocate 分配一组端口
 * @param options.attempt 起一次（失败时回报 `conflict: true`）
 * @param options.limit 最多重试几次
 * @param options.onRetry 每次重试的回调（打印用）
 */
export function withPortRetry(options: {
  allocate: () => Promise<IsoPortPair>
  attempt: (ports: IsoPortPair) => Promise<IsoAttemptResult>
  limit?: number
  onRetry?: (info: { attempt: number; limit: number; ports: IsoPortPair }) => void
}): Promise<IsoRetryResult>
