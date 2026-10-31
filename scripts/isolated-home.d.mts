/**
 * `isolated-home.mjs` 的类型声明（2026-10-31）。
 *
 * ⚠️ **为什么实现是 `.mjs` 而不是 `.ts`**：走查脚本（`docs/devlog-evidence/**`）
 * 是纯 `.mjs`（用 `node` 直接跑，没挂 TS 加载器）⇒ 守卫必须是纯 JS 才能被它们 import。
 * 而测试（`.ts`）也要用同一个模块 ⇒ 单源一份实现 + 这一份声明。
 *
 * ⚠️ **声明与实现必须一致**：改实现签名时同步改这里，否则测试拿到的是错的类型。
 */

/** 真实数据目录（`~/.openvibe`）—— 走查脚本绝不能落在这里 */
export function realHome(): string

/**
 * 判断某个 home 是否是**隔离**的（不是真实数据目录）。
 *
 * @param home `OPENVIBE_HOME` 的值（或脚本自算的沙箱目录）
 */
export function isIsolatedHome(home: string | undefined | null): boolean

/**
 * 断言某个 home 是**隔离**的；不隔离就抛错拒绝执行。
 *
 * @param home 那个 home
 * @param label 出错时说明「哪个 home 不对」（脚本常有多个沙箱）
 */
export function assertIsolatedHome(home: string | undefined | null, label?: string): void

/**
 * 造一个「`OPENVIBE_HOME` 只能是被断言过的那个值」的 env。
 *
 * 断言不通过 ⇒ 抛错，**不给 env**。
 *
 * @param home 沙箱 home（会被断言）
 * @param extra 额外环境变量（盖不掉 `OPENVIBE_HOME`）
 * @param label 出错时说明「哪个 home 不对」
 */
export function isolatedEnv(
  home: string,
  extra?: Record<string, string | undefined>,
  label?: string,
): Record<string, string | undefined>

/**
 * 起一个**被守卫罩住**的子进程：`OPENVIBE_HOME` 只能是被断言过的值。
 *
 * 断言不通过 ⇒ 抛错，**不会起进程**。
 *
 * @param cmd 可执行文件
 * @param args 参数
 * @param home 沙箱 home（会被断言）
 * @param options 其余 spawn 选项（`env` 会被合并，但 `OPENVIBE_HOME` 由本函数决定）
 */
export function spawnIsolated(
  cmd: string,
  args: readonly string[],
  home: string,
  options?: {
    env?: Record<string, string | undefined>
    cwd?: string
    stdio?: unknown
    shell?: boolean
    label?: string
    [key: string]: unknown
  },
): import('node:child_process').ChildProcess

/**
 * `spawnIsolated` 的同步版（`spawnSync`）。
 *
 * @param cmd 可执行文件
 * @param args 参数
 * @param home 沙箱 home（会被断言）
 * @param options 其余 spawnSync 选项（`env` 会被合并，但 `OPENVIBE_HOME` 由本函数决定）
 */
export function spawnSyncIsolated(
  cmd: string,
  args: readonly string[],
  home: string,
  options?: {
    env?: Record<string, string | undefined>
    cwd?: string
    encoding?: BufferEncoding
    input?: string
    timeout?: number
    label?: string
    [key: string]: unknown
  },
): import('node:child_process').SpawnSyncReturns<string>
