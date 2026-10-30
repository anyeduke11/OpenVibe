import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseConclusionVerdicts, runCheck } from '../scripts/probe-raw-check'

/**
 * `scripts/probe-raw-check.ts` 的结论段解析判据测试（2026-10-17）。
 *
 * ## 本文件的价值：把措辞变体矩阵钉死
 *
 * 结论档位（支持 / 不支持 / 未测到）只从 `## 四问结论` 小节取，且必须兼容三类变体：
 * - 键内空白：`Q1 加载时机` 与 `Q1加载时机`（无空格）都应命中；
 * - 冒号：全角 `：` 与半角 `:` 都应命中；
 * - 结论段**之前**若出现同名小节标题（如「问三 · Q1 加载时机」），不得干扰解析。
 *
 * 任一措辞回归都会让这些用例变红，从而证明解析不是靠肉眼碰巧过的。
 */

/** 取 `parseConclusionVerdicts` 结果里「键 → 档位」的映射，测试断言更紧凑。 */
const verdictsOf = (text: string) =>
  Object.fromEntries(parseConclusionVerdicts(text).entries.map((e) => [e.key, e.verdict]))

describe('parseConclusionVerdicts · 小节定位', () => {
  it('没有「## 四问结论」小节 ⇒ sectionFound 为 false', () => {
    const text = ['# 报告', '## 其他小节', '- Q1 加载时机：支持', ''].join('\n')
    const result = parseConclusionVerdicts(text)
    expect(result.sectionFound).toBe(false)
    expect(result.entries.every((e) => e.line === null && e.verdict === '')).toBe(true)
  })

  it('结论段存在 ⇒ sectionFound 为 true，且只取该小节内的行', () => {
    const text = [
      '# 报告',
      '## 前置小节',
      '- Q1 加载时机：不支持',
      '## 四问结论',
      '- Q1 加载时机：支持',
      '',
    ].join('\n')
    const result = parseConclusionVerdicts(text)
    expect(result.sectionFound).toBe(true)
    // 结论段之前那行「不支持」必须被忽略，结论段内的「支持」才生效
    expect(verdictsOf(text)['Q1 加载时机']).toBe('支持')
  })
})

describe('parseConclusionVerdicts · 常规写法（全角冒号 + 空格键）', () => {
  it('三问三档位全解析', () => {
    const text = [
      '## 四问结论',
      '- Q1 加载时机：支持',
      '- Q3 脚本可执行性：未测到',
      '- Q4 symlink 跟随：不支持',
      '',
    ].join('\n')
    expect(verdictsOf(text)).toEqual({
      'Q1 加载时机': '支持',
      'Q3 脚本可执行性': '未测到',
      'Q4 symlink 跟随': '不支持',
    })
  })
})

describe('parseConclusionVerdicts · 措辞变体', () => {
  it('键无空格 + 半角冒号', () => {
    const text = [
      '## 四问结论',
      '- Q1加载时机:支持',
      '- Q3脚本可执行性:未测到',
      '- Q4 symlink跟随:不支持',
      '',
    ].join('\n')
    expect(verdictsOf(text)).toEqual({
      'Q1 加载时机': '支持',
      'Q3 脚本可执行性': '未测到',
      'Q4 symlink 跟随': '不支持',
    })
  })

  it('冒号前后带空格', () => {
    const text = [
      '## 四问结论',
      '- Q1 加载时机 ： 支持',
      '- Q3 脚本可执行性 : 不支持',
      '- Q4 symlink 跟随： 未测到',
      '',
    ].join('\n')
    expect(verdictsOf(text)).toEqual({
      'Q1 加载时机': '支持',
      'Q3 脚本可执行性': '不支持',
      'Q4 symlink 跟随': '未测到',
    })
  })

  it('档位后跟说明文字不吞档位', () => {
    const text = [
      '## 四问结论',
      '- Q1 加载时机：支持。直接执行成功，exitCode 0，无需 bash。',
      '- Q3 脚本可执行性：未测到。由 agent 手动执行，非平台加载。',
      '- Q4 symlink 跟随：支持。平台 skill 机制已提供。',
      '',
    ].join('\n')
    expect(verdictsOf(text)).toEqual({
      'Q1 加载时机': '支持',
      'Q3 脚本可执行性': '未测到',
      'Q4 symlink 跟随': '支持',
    })
  })
})

describe('parseConclusionVerdicts · 结论段内的异常', () => {
  it('某问缺行 ⇒ 该问 verdict 为空、line 为 null', () => {
    const text = ['## 四问结论', '- Q1 加载时机：支持', ''].join('\n')
    const result = parseConclusionVerdicts(text)
    expect(result.sectionFound).toBe(true)
    const q1 = result.entries.find((e) => e.key === 'Q1 加载时机')!
    const q3 = result.entries.find((e) => e.key === 'Q3 脚本可执行性')!
    expect(q1.verdict).toBe('支持')
    expect(q3.line).toBeNull()
    expect(q3.verdict).toBe('')
  })

  it('结论行存在但档位非法 ⇒ verdict 为空', () => {
    const text = ['## 四问结论', '- Q1 加载时机：应该支持', ''].join('\n')
    expect(verdictsOf(text)['Q1 加载时机']).toBe('')
  })

  it('结论行存在但没冒号 ⇒ verdict 为空', () => {
    const text = ['## 四问结论', '- Q1 加载时机 支持', ''].join('\n')
    expect(verdictsOf(text)['Q1 加载时机']).toBe('')
  })
})

describe('parseConclusionVerdicts · 前置同名小标题不干扰', () => {
  it('「问三 · Q1 加载时机（明细）」等标题在结论段之前不得被当作结论行', () => {
    const text = [
      '## 第 2 步 · 四问（明细，结论见文件顶部「四问结论」）',
      '**问三 · Q1 加载时机（明细）**',
      '本轮启动状态：已重启。',
      '**问四 · Q3 脚本可执行性（明细）**',
      '由 agent 手动 shell 执行。',
      '## 四问结论',
      '- Q1 加载时机：支持',
      '- Q3 脚本可执行性：未测到',
      '- Q4 symlink 跟随：支持',
      '',
    ].join('\n')
    expect(verdictsOf(text)).toEqual({
      'Q1 加载时机': '支持',
      'Q3 脚本可执行性': '未测到',
      'Q4 symlink 跟随': '支持',
    })
  })
})

/**
 * `runCheck` 的夹具：临时目录里放一份「合规」轮次文件，
 * 其余轮次缺席，用来验证缺轮次的失败/忽略两种语义。
 */
function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'm8-check-'))
  const good = [
    '<!-- M8-PROBE platform=trae round=1 -->',
    '客户端：Fixture',
    '## 四问结论',
    '- Q1 加载时机：支持',
    '- Q3 脚本可执行性：未测到',
    '- Q4 symlink 跟随：支持',
    '## 前置自检（登记事实，不作为结论依据）',
    'ls -ld 输出原文含 -> ../../.agents/skills/openvibe-probe',
    '## 第 1 步 · 主测试',
    'stdout：<<<M8-PROBE-SCRIPT-RAN|marker=V1-USER|pwd=/tmp|path=/Users/duke/.agents/skills/openvibe-probe/scripts/probe.sh>>>',
    '',
  ].join('\n')
  writeFileSync(join(dir, 'trae-r1.md'), good, 'utf8')
  return dir
}

const cleanDirs: string[] = []
afterEach(() => {
  for (const d of cleanDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('runCheck · 缺轮次语义', () => {
  it('默认（不忽略缺失）：缺轮次计入失败，exitCode=1，checkRounds 含缺失轮', () => {
    const dir = fixtureDir()
    cleanDirs.push(dir)
    const result = runCheck(['trae-r1', 'trae-r2'], dir, false)
    expect(result.present).toEqual(['trae-r1'])
    expect(result.missing).toEqual(['trae-r2'])
    expect(result.checkRounds).toEqual(['trae-r1', 'trae-r2']) // 非忽略时仍检查全量
    expect(result.missingFail).toBe(true)
    // 非忽略时缺失轮也会被 checkRound，产出 4 条失败 finding（文件存在 + Q1/Q3/Q4 有证据）
    expect(result.bad).toBe(4)
    expect(result.exitCode).toBe(1)
  })

  it('--ignore-missing：缺轮次仅告警不计失败，exitCode=0，且只检查已落盘轮次', () => {
    const dir = fixtureDir()
    cleanDirs.push(dir)
    const result = runCheck(['trae-r1', 'trae-r2'], dir, true)
    expect(result.missing).toEqual(['trae-r2'])
    expect(result.checkRounds).toEqual(['trae-r1']) // 忽略缺失 → 只查已落盘
    expect(result.missingFail).toBe(false)
    expect(result.bad).toBe(0)
    expect(result.exitCode).toBe(0)
  })

  it('目录不存在：视为全部缺失（非忽略 exit=1，忽略 exit=0）', () => {
    const missing = runCheck(['trae-r1'], join(tmpdir(), 'no-such-m8-dir'), false)
    expect(missing.present).toEqual([])
    expect(missing.missing).toEqual(['trae-r1'])
    expect(missing.exitCode).toBe(1)

    const ignored = runCheck(['trae-r1'], join(tmpdir(), 'no-such-m8-dir'), true)
    expect(ignored.missingFail).toBe(false)
    expect(ignored.checkRounds).toEqual([])
    expect(ignored.exitCode).toBe(0)
  })

  it('README.md / REJECTED-*.md 不计入 present，也不触发计划外轮次', () => {
    const dir = fixtureDir()
    writeFileSync(join(dir, 'README.md'), '# 说明', 'utf8')
    writeFileSync(join(dir, 'REJECTED-20261017.md'), '# 驳回', 'utf8')
    cleanDirs.push(dir)
    const result = runCheck(['trae-r1'], dir, false)
    expect(result.present).toEqual(['trae-r1'])
    expect(result.extra).toEqual([])
    expect(result.exitCode).toBe(0)
  })
})

describe('runCheck · 已落盘轮次的坏项', () => {
  it('有坏项（缺机器索引头）即使忽略缺失轮也 exitCode=1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-bad-'))
    writeFileSync(
      join(dir, 'trae-r1.md'),
      ['# 没有索引头', '## 四问结论', '- Q1 加载时机：支持', ''].join('\n'),
      'utf8',
    )
    cleanDirs.push(dir)
    const result = runCheck(['trae-r1', 'trae-r2'], dir, true)
    expect(result.missing).toEqual(['trae-r2'])
    expect(result.bad).toBeGreaterThan(0) // 机器索引头、客户端自证、Q4 取证等判据会红
    expect(result.exitCode).toBe(1)
  })
})
