import { spawnSync } from 'node:child_process'

/**
 * agent 注册表的默认健康探测（v0.3.0 FR-3.0-1）。
 *
 * 为什么在 `apps/server/src/lib/` 而不是 core 的服务层：
 * ESLint R5 禁止服务层 import 子进程（「服务层与传输层无关，终端交互经 deps 注入」）。
 * 与 `lib/port-scan.ts` 同一处理方式：子进程只在传输层落地，服务层收注入。
 *
 * 语义边界：`which` 只回答「这个命令名在本机 PATH 上有没有」，
 * **不回答**「它能不能跑」「跑起来会用哪套旗标」——后者要真机探针（PRD L1），不在健康检查范围。
 */
export function whichProbe(executable: string): boolean {
  // 参数化调用，不拼 shell 字符串
  const result = spawnSync('which', [executable], { stdio: 'ignore' })
  return result.status === 0
}
