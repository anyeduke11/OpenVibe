/**
 * scripts/isolated-home.mjs —— 真机实测的**隔离守卫**（2026-10-31）。
 *
 * ## 它解决什么
 *
 * 本仓的走查脚本（`docs/devlog-evidence/**` 下的真机实测）会真的写库、真的起服务。
 * 在 `OPENVIBE_HOME` 没被隔离时，它们写的是**用户真实数据**
 * （`~/.openvibe/data/openvibe.db`）—— 一次误操作就可能动到用户自己的资产。
 *
 * 之前这件事靠**约定**（「脚本里记得写 `OPENVIBE_HOME=...`」），
 * 而约定会漏：漏一个脚本就是一次真实数据的误写，而且**没有任何信号**。
 *
 * ⇒ 本模块把「必须隔离」变成**机器判的事实**：
 *   走查脚本在启动时调 `assertIsolatedHome()`，
 *   若 `OPENVIBE_HOME` 指向真实 home（或未设置）⇒ **拒绝执行**并说明原因。
 *
 * ## 为什么用「拒绝执行」而不是「自动改成沙箱」
 *
 * 自动改成沙箱会让脚本**静默**跑在一个别的环境里 ⇒ 测出来的结论不是它要测的
 * （例如「连真实实例看看会怎样」这类脚本，本意就是要连真实环境）。
 * ⇒ 拒绝执行 + 说清原因，把决定权留给跑脚本的人。
 *
 * ## 为什么是 `.mjs` 而不是 `.ts`
 *
 * 走查脚本是纯 `.mjs`（用 `node` 直接跑，没挂 TS 加载器）⇒ 守卫必须是
 * 纯 JS 才能被它们 import。⇒ **单源就一份**（本文件），测试也 import 它。
 *
 * ## 用法
 *
 * ```js
 * import { assertIsolatedHome } from '../../../scripts/isolated-home.mjs'
 *
 * assertIsolatedHome(process.env.OPENVIBE_HOME)
 * ```
 *
 * 抛出的错误信息里带「怎么修」的命令，不只说「不许跑」。
 */
import { spawn, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** 真实数据目录（`~/.openvibe`）—— 走查脚本绝不能落在这里 */
export function realHome() {
  return join(homedir(), '.openvibe')
}

/**
 * 判断某个 home 是否是**隔离**的（不是真实数据目录）。
 *
 * ⚠️ **判据**：解析后的路径必须**不等于**真实 home。
 *   「在真实 home 底下」也算不隔离（比如 `~/.openvibe/../.openvibe`）⇒ 用 `resolve` 归一。
 *
 * @param {string | undefined} home `OPENVIBE_HOME` 的值
 * @returns {boolean} true = 隔离
 */
export function isIsolatedHome(home) {
  if (home === undefined || home === null || String(home).trim() === '') return false
  return resolve(String(home)) !== resolve(realHome())
}

/**
 * 断言某个 home 是**隔离**的；不隔离就**抛错拒绝执行**。
 *
 * @param {string | undefined} home 那个 home（通常是脚本自己算出来的沙箱目录）
 * @param {string} [label] 出错时说明「哪个 home 不对」（脚本常有多个：沙箱 home / npm 沙箱 home）
 * @throws {Error} 抛错信息说明「为什么不许跑」与「怎么修」
 */
export function assertIsolatedHome(home, label) {
  if (isIsolatedHome(home)) return
  const actual =
    home === undefined || home === null || String(home).trim() === '' ? '(未设置)' : home
  const what = label === undefined ? '' : `（${label}）`
  throw new Error(
    [
      `拒绝执行：真机实测必须跑在隔离的数据目录里${what}。`,
      `  该 home          = ${actual}`,
      `  真实数据目录       = ${realHome()}（绝不能被真机实测写）`,
      '  修法：给脚本设一个临时目录，例如',
      '    OPENVIBE_HOME=$(mktemp -d /tmp/ov-walk-XXXXXX) node <脚本>',
      '  或用隔离实例入口（它会自动准备数据目录与端口）：',
      '    pnpm dev:iso',
    ].join('\n'),
  )
}

/**
 * 造一个「`OPENVIBE_HOME` 只能是被断言过的那个值」的 env。
 *
 * ## 为什么需要这一层（而不只是「脚本自己 assert 一次」）
 *
 * 之前的守卫断言的是「脚本自算的沙箱常量」，但真正决定数据落点的是**传给子进程的 env**。
 * 这两件事之间隔着一层「人自己写的 env 对象」⇒ 断言与实际投递可以不一致：
 * 脚本断言了 `HOME`，却把 `OPENVIBE_HOME: 另一个值` 传给子进程，守卫照样放行。
 *
 * ⇒ 本包装把「断言」与「投递」**绑成一步**：断言不通过就不给 env；
 *   通过时 env 里的 `OPENVIBE_HOME` 就是刚断言过的那个值（调用方无法另设）。
 *
 * @param {string} home 沙箱 home（会被断言；不隔离则抛错）
 * @param {Record<string, string | undefined>} [extra] 额外环境变量（**盖不掉** `OPENVIBE_HOME`）
 * @param {string} [label] 出错时说明「哪个 home 不对」
 * @returns {Record<string, string | undefined>} 可直接交给 spawn/spawnSync 的 env
 */
export function isolatedEnv(home, extra = {}, label) {
  assertIsolatedHome(home, label)
  // ⚠️ `OPENVIBE_HOME` 放在**最后** ⇒ extra 里就算塞了它，也盖不掉被断言过的那个值
  return { ...process.env, ...extra, OPENVIBE_HOME: home }
}

/**
 * 起一个**被守卫罩住**的子进程：`OPENVIBE_HOME` 只能是被断言过的值。
 *
 * @param {string} cmd 可执行文件
 * @param {string[]} args 参数
 * @param {string} home 沙箱 home（会被断言；不隔离则抛错，**不会起进程**）
 * @param {object} [options] 其余 spawn 选项（`env` 会被合并，但 `OPENVIBE_HOME` 由本函数决定）
 * @param {string} [options.label] 出错时说明「哪个 home 不对」
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnIsolated(cmd, args, home, options = {}) {
  const { env, label, ...rest } = options
  return spawn(cmd, args, { ...rest, env: isolatedEnv(home, env, label) })
}

/**
 * `spawnIsolated` 的同步版（`spawnSync`）。
 *
 * ⚠️ **为什么同步版也要有**：走查脚本里有一批「跑完就拿输出」的短命令
 *   （`diff` / `clean --dry-run`），它们同样会把 home 传给子进程 ⇒ 同样要过守卫。
 *
 * @param {string} cmd 可执行文件
 * @param {string[]} args 参数
 * @param {string} home 沙箱 home（会被断言；不隔离则抛错，**不会起进程**）
 * @param {object} [options] 其余 spawnSync 选项（`env` 会被合并，但 `OPENVIBE_HOME` 由本函数决定）
 * @param {string} [options.label] 出错时说明「哪个 home 不对」
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
export function spawnSyncIsolated(cmd, args, home, options = {}) {
  const { env, label, ...rest } = options
  return spawnSync(cmd, args, { ...rest, env: isolatedEnv(home, env, label) })
}
