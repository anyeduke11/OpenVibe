/**
 * tests/setup-worker-registry.ts —— vitest 的 **setupFiles**（2026-11-02）。
 *
 * ## 它做什么
 *
 * 每个 worker 启动时把自己的 **pid + cwd** 登记进 `OV_WORKER_REGISTRY` 指向的目录
 * ⇒ `scripts/check-orphan-workers.ts` 据此判断「这个孤儿 worker 是不是本仓的」
 * ⇒ **跨平台**（不依赖 `lsof` 这类非 POSIX 标准的工具）。
 *
 * ## 为什么是 setupFiles 而不是「用到了 tempDir 才登记」
 *
 * `tempDir()` 只在**用到它的测试**里才会被 import ⇒ 靠它登记会**漏掉**
 * 「那些一条 tempDir 都没用、但确实是本仓 worker」的进程 ⇒ 孤儿闸会漏判。
 * ⇒ setupFiles 是**无条件**执行的 ⇒ 登记完整。
 *
 * ## 顺带做一次**限频回收**（2026-11-03）
 *
 * 原先登记目录只在体检进程（`pnpm orphans:check`）里被回收
 * ⇒ **没跑过体检的机器**（只跑 vitest、或体检脚本没装到那台机器）
 * 登记目录永远只增不减 ⇒ 机器越用越久，文件越长。
 * ⇒ 这里让 worker 启动时也回收一次，但**限频**（详见 `maybePruneRegistry()`）。
 */
import { maybePruneRegistry, registerSelf } from '@openvibe/core/test-support/worker-registry'

// ⚠️ 回收同样**不阻断测试**（回收是辅助动作，失败不该让测试失败）
//   ⚠️ 顺序：**先回收、后登记** ⇒ 本 worker 自己那条是在回收**之后**才写的
//     ⇒ 不会被回收误删（回收只删「自己枚举到」的文件 ⇒ 枚举之后新建的必然安全）。
maybePruneRegistry()

// ⚠️ 登记失败**不阻断测试**（登记是辅助线索，不是测试的前置条件）
registerSelf()
