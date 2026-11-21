#!/usr/bin/env node
/**
 * scripts/wrap-format-check.mjs —— 收尾三段格式的合规检查（DEV-0229 方案 2）。
 *
 * ## 它解决什么
 *
 * CLAUDE.md 于 2026-11-10 把收尾第三段改为「计划外候选与准入判定」，要求逐条给出
 * **准入判定 + 落点 + 未通过哪条测试**，并**允许「本轮无候选」**。
 * 规范改了，但**没有机制保证遵守** —— 首轮只能靠人看。本脚本是那个机制：
 * 给一段收尾文本，判它是否符合新格式。
 *
 * ## 判据（四条，与 CLAUDE.md 的准入规则一一对应）
 *
 * | 判据 | 要求 | 不满足时 |
 * |---|---|---|
 * | 三段齐全 | 含「已完成」「未完成」两段 | 报缺段 |
 * | 第三段存在 | 含「计划外候选与准入判定」或等义表述 | 报缺段 |
 * | 逐条结构 | 每条候选含「准入判定」与「落点」 | 报结构缺失 |
 * | 允许空 | 显式写「本轮无候选」时直接通过 | — |
 *
 * ⚠️ **机检的边界**：脚本判的是**结构**（有没有这些字段），不判**内容对错**
 *   （候选该不该通过准入、落点对不对）。后者仍需人判 —— 与 `risk-disposition.mjs`
 *   `enhancement-admission.mjs` 同一口径：机械检查供起点，不作最终裁定。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/wrap-format-check.mjs < file.md        # 从 stdin 读收尾文本
 * node scripts/wrap-format-check.mjs --file wrap.md  # 从文件读
 * node scripts/wrap-format-check.mjs --self          # 自检：跑内置样例，验证判定正确
 * ```
 *
 * 退出码：`0` 合规；`1` 不合规；`2` 用法错误。
 */
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)

/** 内置样例：合规 / 不合规各一例，供 `--self` 自检 */
const SAMPLE_OK = `## 已完成
1. 改了 CLAUDE.md 收尾格式。
2. 同步了全局记忆。

## 未完成
无。

## 计划外候选与准入判定
1. **方案 2 的元测试**
   - 准入判定：通过
   - 落点：既有验收（新增一道元测试）
   - 未通过测试：—
   - 为什么要考虑：规范改了但没有机制保证遵守。
   - 如何实现：加一条元测试扫描收尾结构。
   - 验收标准：收尾缺结构时测试报红。
`

const SAMPLE_OK_EMPTY = `## 已完成
1. 三项修复完成。

## 未完成
无。

## 计划外候选与准入判定
本轮无候选。
`

const SAMPLE_BAD = `## 已完成
1. 改了 CLAUDE.md。

## 未完成
无。

## 未考虑且需要增强的需求
1. 加一条元测试。
`

/** 三段标题的识别（容忍 Markdown 层级与措辞差异） */
const H_DONE = /已完成/
const H_TODO = /未完成/
const H_CAND = /计划外候选与准入判定|计划外候选|准入判定/
const NO_CANDIDATE = /本轮无候选|无候选|没有候选|不产生候选/

/** 候选条目结构 */
const F_VERDICT = /准入判定|判定[：:]/
const F_ANCHOR = /落点[：:]/

function check(text) {
  const problems = []
  const lines = text.split('\n')

  const hasDone = lines.some((l) => H_DONE.test(l))
  const hasTodo = lines.some((l) => H_TODO.test(l))
  const hasCand = lines.some((l) => H_CAND.test(l))
  const saysNone = lines.some((l) => NO_CANDIDATE.test(l))

  if (!hasDone) problems.push('缺「已完成」段')
  if (!hasTodo) problems.push('缺「未完成」段')
  if (!hasCand)
    problems.push('缺「计划外候选与准入判定」段（旧格式「未考虑且需要增强的需求」不合规）')

  if (hasCand && !saysNone) {
    // 找第三段区间：从含 H_CAND 的行到下一个同级或更高级标题
    const start = lines.findIndex((l) => H_CAND.test(l))
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      // 遇到新的 ## 级标题即结束（收尾只有三段，不该有第四段）
      if (/^##\s/.test(lines[i])) {
        end = i
        break
      }
    }
    const body = lines
      .slice(start + 1, end)
      .join('\n')
      .trim()
    if (!body) {
      problems.push('第三段为空且未写「本轮无候选」')
    } else {
      // 按**顶层**条目切分：行首无缩进的数字/符号列表项。
      // ⚠️ 不能写成 /\n(?=\s*(?:\d+\.|[-*])\s)/ —— 那会把候选的子项
      //    （`   - 准入判定：…`）也切成独立条目，导致每条候选都被判缺字段。
      const entries = body
        .split(/\n(?=(?:\d+\.|[-*])\s)/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (entries.length === 0) {
        problems.push('第三段无任何候选条目')
      } else {
        entries.forEach((e, i) => {
          const label = `第 ${i + 1} 条候选`
          if (!F_VERDICT.test(e)) problems.push(`${label} 缺「准入判定」`)
          if (!F_ANCHOR.test(e)) problems.push(`${label} 缺「落点」`)
        })
      }
    }
  }

  return problems
}

function selfTest() {
  const cases = [
    { name: '合规（含候选）', text: SAMPLE_OK, expect: 0 },
    { name: '合规（本轮无候选）', text: SAMPLE_OK_EMPTY, expect: 0 },
    { name: '不合规（旧格式 + 缺字段）', text: SAMPLE_BAD, expect: 1 },
  ]
  let fail = 0
  for (const c of cases) {
    const problems = check(c.text)
    const got = problems.length === 0 ? 0 : 1
    const ok = got === c.expect
    if (!ok) fail++
    console.log(`${ok ? '✓' : '✗'} ${c.name}：期望 ${c.expect}，实得 ${got}`)
    if (!ok) problems.forEach((p) => console.log(`    · ${p}`))
  }
  if (fail > 0) {
    console.error(`\n自检失败：${fail}/${cases.length} 例不符`)
    process.exit(1)
  }
  console.log(`\n自检通过：${cases.length}/${cases.length} 例符合预期`)
  process.exit(0)
}

if (argv.includes('--self')) {
  selfTest()
}

if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  console.log(
    '用法: node scripts/wrap-format-check.mjs [--file <path> | --self]  （无参时从 stdin 读）',
  )
  console.log('  --file <path>  从文件读收尾文本')
  console.log('  --self         跑内置样例自检')
  process.exit(0)
}

let text
const fi = argv.indexOf('--file')
if (fi >= 0) {
  const path = argv[fi + 1]
  if (!path) {
    console.error('--file 需要路径参数')
    process.exit(2)
  }
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    console.error(`读不到文件：${path}\n  ${err.message}`)
    process.exit(2)
  }
} else {
  text = readFileSync(0, 'utf8')
}

const problems = check(text)
if (problems.length === 0) {
  console.log('✓ 收尾格式合规')
  process.exit(0)
} else {
  console.error('✗ 收尾格式不合规：')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}
