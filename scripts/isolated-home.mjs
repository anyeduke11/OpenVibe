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
