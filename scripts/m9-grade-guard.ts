/**
 * scripts/m9-grade-guard.ts —— 「专家级断言」卫生守卫的 CI 形态（v0.2.3 批次 C CS4）。
 *
 * m9-p1f-grade-guard 此前只活在单个测试文件里（test-only）；CS4 接入生产的方式
 * 不是塞进 server 路由（它扫的是**仓库源码**，不是 db），而是升为可独立执行的闸：
 * `pnpm m9:grade-guard` → 命中「专家级/精通了」这类断言式文案即非零退出。
 * 规则单源在 `packages/core/src/tooling/m9-p1f-grade-guard.ts`（本文件零复制）。
 */
import { findGradeAssertions } from '../packages/core/src/tooling/m9-p1f-grade-guard'

const hits = findGradeAssertions(process.cwd())
if (hits.length > 0) {
  console.error(`m9-grade-guard：命中 ${hits.length} 处断言式文案（应改为可复核的凭据句）：`)
  for (const h of hits) console.error(`  ${h.file}:${h.line} — ${h.text}`)
  process.exit(1)
}
console.log('m9-grade-guard：0 命中')
