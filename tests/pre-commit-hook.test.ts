import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * pre-commit 钩子的**接线判据**（`context-management.md` FR-6 的本地侧）。
 *
 * ## 为什么用文本判据而不是跑一次钩子
 *
 * 「钩子会跑 `context:check`」这件事无法用行为测试稳定地钉住：要造红就得改仓内文件
 * （改一处、跑一次、再改回，任何中途失败都会留下脏工作树）。而这条腿要防的退回形态
 * 只有两种，都是**结构性**的：
 * ① 接线被删／被改名（钩子不再调 `context:check`）；
 * ② 判据被放宽（`|| true` / `continue-on-error` 之类把红变黄，规格 FR-6.3 明禁）。
 * ⇒ 两条都用文本断言，成本近零、退回必红。行为侧的真机验收按发布节奏人工跑一次。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('pre-commit · 上下文治理闸（FR-6 本地侧）', () => {
  const hook = readFileSync(join(ROOT, 'scripts', 'hooks', 'pre-commit'), 'utf8')

  it('⚠️ 接线存在：钩子调用与 CI 同一个 context:check 入口（不是另写一份判据）', () => {
    expect(hook).toContain('npx tsx scripts/context-check.ts')
  })

  it('⚠️ 不放宽：context-check 那段不得 `|| true`／`continue` 把红变黄（FR-6.3）', () => {
    const at = hook.indexOf('闸四')
    expect(at, '钩子里应有一段「闸四」注释').toBeGreaterThan(-1)
    const block = hook.slice(at)
    // 失败分支必须是 exit 1（阻断提交），且调用行上不得挂 `|| true`
    expect(block).toContain('exit 1')
    expect(block).not.toMatch(/context-check\.ts[^\n]*\|\|\s*true/)
  })

  it('失败提示必须给出处置入口（判据编号由脚本自身输出，钩子负责指向规范与基线）', () => {
    const at = hook.indexOf('闸四')
    const block = hook.slice(at)
    expect(block).toContain('docs/specs/context-governance.md')
    expect(block).toContain('docs/context-check-baseline.json')
  })
})
