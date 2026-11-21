import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * 草稿目录守卫（DEV-0244 观察池第 3 项落地）。
 *
 * ## 它钉的是什么
 *
 * `.trae/` `.zwork/` `tmp/` 是**本地草稿目录** —— git、ESLint、prettier 三道都跳过它们：
 * 前两者读 `.gitignore`，prettier 也读**根** `.gitignore`（实测）。
 *
 * ## ⚠️ 为什么「跳过」是纯路径匹配，因此必须有这条守卫
 *
 * 三道闸的忽略**都不看跟踪状态**：`git add -f` 把文件强加进 gitignored 目录后，
 * 该文件**已跟踪**，但 prettier 照样跳过它（实测：`scratch/foo.ts` 被 `-f` 跟踪后
 * 仍不被 `--check` 标记）。⇒ 一旦某个「该入仓」的文件落进这三个目录，
 * 它会**同时逃过 lint 与排版**，而两道闸都不会响。
 *
 * 这正是 DEV-0207 为 `tmp/**` 登记过的同型风险（当时只对 eslint，处置是
 * 「正式脚本应进 `scripts/`」的**人工约定**）。本守卫把那条约定变成**机判**：
 * 这三个目录里出现任何已跟踪文件即红。
 *
 * ## 与 `.prettierignore` 的分工
 *
 * 豁免面**不写在 `.prettierignore` 里**（那是手工维护的盲区：git 那侧一改就脱节），
 * 而是由根 `.gitignore` 统一承载 —— 见 `.prettierignore` 顶部与 `.gitignore` 的说明。
 * 本文件守的是**残余**：被强加进来的跟踪文件。
 */

const SCRATCH_DIRS = ['.trae', '.zwork', 'tmp'] as const

/** 这三个目录里当前被 git 跟踪的文件（`-z` 以 NUL 分隔，路径里可能有空格） */
function trackedInScratchDirs(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SCRATCH_DIRS], {
    encoding: 'utf8',
  })
  return out.split('\0').filter((s) => s !== '')
}

describe('草稿目录守卫 · 不得有已跟踪文件', () => {
  it('三个草稿目录里零已跟踪文件（有则该文件同时逃过 lint 与排版）', () => {
    const tracked = trackedInScratchDirs()
    expect(
      tracked,
      `草稿目录里出现了已跟踪文件：${tracked.join('、')} —— ` +
        '它们会同时逃过 lint 与排版两道闸。该入仓的文件请移到正式目录（如 scripts/）。',
    ).toEqual([])
  })

  it('⚠️ 提取器自证：路径分隔用 NUL，不是换行（否则含换行的路径会漏检）', () => {
    // 哨兵：`git ls-files -z` 的输出里，正常路径之间是 NUL。若哪天 git 行为变化
    // 导致输出为空，上面那条会**恒绿** ⇒ 本条先红，避免守卫静默失效。
    const raw = execFileSync('git', ['ls-files', '-z', '--', 'apps'], { encoding: 'utf8' })
    expect(raw.length).toBeGreaterThan(0)
    expect(raw).toContain('\0')
  })
})
