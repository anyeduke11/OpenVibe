import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 本地 skill 扫描根的**已知 agent 清单**（owner 2026-10-30 裁定「覆盖国内主流 agent」）。
 *
 * ## 为什么要这张清单
 *
 * 原实现只按一条约定发现根：home 下**一切** `~/.<tool>/skills` 目录（`discoverSkillRoots`）。
 * 这条约定覆盖不到两类真实形态：
 *
 *  1. **嵌套形态**：目录不是 home 的直接子目录。如 WorkBuddy 的市场库在
 *     `~/.workbuddy/skills-marketplace/skills`、TRAE 的内置库在
 *     `~/.trae-cn/builtin/global/skills`、Loomy-OpenCode 在 `~/.config/loomy-opencode/skills`。
 *     这些目录里的 skill 是**用户已安装/已下载**的，正是台账该收的。
 *  2. **非 `skills` 命名**：如豆包工作在 `~/DoubaoWork/skills`（home 的非点目录子目录）、
 *     GBrain 在 `~/gbrain/skills`。约定式发现只看 home 的**点**目录，直接漏掉。
 *
 * ## 为什么不改成硬编码白名单
 *
 * 白名单会让「装了个新 agent 但清单里没有」⇒ 扫不到 ⇒ 用户以为功能坏了。
 * 故**约定式发现照旧**（它零维护、覆盖未知工具），这张清单只做**增补**：
 * 把上面两类「约定够不着」的已知形态显式列出来。清单可由用户在设置页增删，
 * 本文件只提供**出厂默认值**。
 *
 * ## 相对路径 vs 绝对路径
 *
 * 出厂清单用**相对 home 的路径**（`'.workbuddy/skills'`），因为清单要能随机器走；
 * 落进 `app_meta` 时展开成绝对路径（用户可在设置页改成任意绝对路径）。
 */

/** 出厂默认的已知扫描根（相对 home）。存在的才被采用，不存在不报错。 */
export const KNOWN_SKILL_ROOTS: readonly string[] = [
  // ── 国内主流 agent ──────────────────────────────────────────────────────
  '.workbuddy/skills', // WorkBuddy 正式安装的 skill
  '.workbuddy/skills-marketplace/skills', // WorkBuddy 市场库（已下载的 skill 在这）
  '.workbuddy/skills-archive', // WorkBuddy 归档区（用户移进去的也算）
  '.trae/skills', // TRAE
  '.trae-cn/skills', // TRAE 国内版
  '.trae-cn/builtin/global/skills', // TRAE 国内版内置 skill
  '.stepclaw/skills', // 灵犀 claw
  '.openclaw-autoclaw/skills', // autoclaw
  '.kukuai/skills', // 库库 AI
  '.lingma/skills', // 通义灵码
  '.qwen/skills', // 通义千问 / Qwen Code
  '.minimax/skills', // MiniMax
  '.stepfun/skills', // 阶跃星辰
  '.hub/skills', // hub
  '.pilotdeck/skills', // PilotDeck
  '.codeartsdoer/skills', // CodeArts Doer
  '.understand-anything-plugin/skills', // 第三方插件
  'DoubaoWork/skills', // 豆包工作（非点目录 ⇒ 约定式发现够不着）
  'Doubao/skills', // 豆包
  'gbrain/skills', // GBrain（非点目录）
  '.config/loomy-opencode/skills', // Loomy-OpenCode（嵌套在 .config 下）
  // ── 国际主流 agent ──────────────────────────────────────────────────────
  '.claude/skills', // Claude Code
  '.codex/skills', // Codex
  '.agents/skills', // 通用 agents 目录（跨工具共享）
  '.opencode/skills', // OpenCode
  '.acode/acode/acode-home-overlay/skills', // ACode（嵌套三层）
]

/** home 下的点目录永不扫描：`.Trash` 里的是已删除的，扫了会复活台账条目 */
const EXCLUDED_HOME_ENTRIES = new Set(['.Trash'])

function isDirectory(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

/**
 * 约定式发现：home 下**一切** `~/.<tool>/skills` 形态目录（零维护，覆盖未知工具）。
 *
 * ⚠️ 只看 home 的**直接**点目录子项 ⇒ 嵌套形态（`~/.config/loomy-opencode/skills`）
 * 与非点目录（`~/gbrain/skills`）够不着 ⇒ 那两类由 `KNOWN_SKILL_ROOTS` 补。
 */
export function discoverSkillRoots(homeDir: string, cwdSkillsDir?: string): string[] {
  const roots = new Set<string>()
  let entries: string[]
  try {
    entries = readdirSync(homeDir)
  } catch {
    entries = []
  }
  for (const name of entries) {
    if (!name.startsWith('.') || EXCLUDED_HOME_ENTRIES.has(name)) continue
    const skillsDir = join(homeDir, name, 'skills')
    if (isDirectory(skillsDir)) roots.add(skillsDir)
  }
  const cwdRoot = cwdSkillsDir ?? join(process.cwd(), '.claude', 'skills')
  if (isDirectory(cwdRoot)) roots.add(cwdRoot)
  return [...roots].sort()
}

/**
 * 出厂默认扫描根（约定式发现 ∪ 已知 agent 清单补的嵌套/异形路径）。
 *
 * 存在的才纳入——清单里写了某 agent 不代表用户装了它。
 */
export function defaultSkillRoots(homeDir: string = homedir()): string[] {
  const roots = new Set<string>(discoverSkillRoots(homeDir))
  for (const rel of KNOWN_SKILL_ROOTS) {
    const abs = join(homeDir, rel)
    if (isDirectory(abs)) roots.add(abs)
  }
  return [...roots].sort()
}

/**
 * 把相对 home 的出厂清单展开成绝对路径（供设置页显示与落库）。
 * 不存在的路径也返回——设置页要能看到「这条指向哪」，哪怕现在还没装。
 */
export function expandKnownRoots(homeDir: string): { path: string; exists: boolean }[] {
  return KNOWN_SKILL_ROOTS.map((rel) => {
    const abs = join(homeDir, rel)
    return { path: abs, exists: isDirectory(abs) }
  })
}
