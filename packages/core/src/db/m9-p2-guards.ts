// `packages/core/src/db/m9-p2-guards.ts` —— M9 v1.6 **P2 的三道守卫**
// （`m9-dev-plan-2026-10.md` §6.8 ＋ `m9-dev-language-roadmap.md` §3.3 / §3.13 / §6.3
//   · **DL-05 / DL-07 / DL-28 / DL-34**）
//
// ## 它守什么
//
// | 守卫 | 拦的是 | 判据出处 |
// |---|---|---|
// | `findForbiddenMasteryCopy` | 界面文案不得出现「你已掌握」/「未触及」 | DL-05 / §6.3 第 2 条 |
// | `findForbiddenDerivationTables` | 推导路径不得读资源三表 / 模式三表 | DL-28 / DL-34 |
// | （运行时）`assertMasteryInput` | 入参不得多出资源 / 模式字段 | DL-28 / DL-34 |
//
// ## ⚠️ 三道都是**否定式**判据 ⇒ 天然没有正向痕迹
//
// 「少写一条映射、偷偷维护一张对照表」，代码照常编译、界面照常显示，
// 只有专门那条检查会红 ⇒ **检查器与它的变异腿必须成对存在**。
//   本文件的三道守卫都有变异腿（`m9-p2-state.test.ts` 与 `tests/m9-p2-guards.test.ts`）。
//
// ## ⚠️ 为什么扫描前要**去注释**
//
// 规则说明里**必须能引用**被禁的形态（「界面不得出现「你已掌握」」这句话本身是必需的）
// ⇒ 扫原文会把规则判红。⇒ 只扫**代码部分**（去注释，保留字符串与 JSX 文本）。
//   ⚠️ JSX 文本**不是字符串字面量**（`<p>你已掌握</p>` 里的字是 JSXText）
//   ⇒ 守卫扫的是「去注释后的整段文本」，不是「字符串字面量集合」。
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from '@openvibe/shared'
import { SOURCE_SCAN_ROOTS, walkSourceFiles } from './m9-repo-scan'

/** 一处文案命中。 */
export interface MasteryCopyHit {
  /** 相对仓库根的文件路径 */
  file: string
  /** 行号（1 起） */
  line: number
  /** 命中的形态名 */
  pattern: string
  /** 命中的那一行 */
  text: string
}

/**
 * 掌握度文案里**不得出现**的形态。
 *
 * ⚠️ **两条都来自规格原文**：
 * - 「你已掌握」—— §3.3 末段：「这套推断**天然只认得出「用过」**，认不出「学过但没用过」
 *   ……**任何声称能回答「我掌握了吗」的表述都是假的** —— 界面文案必须写「本项目用到过」」；
 * - 「未触及」—— §6.3 第 2 条：「界面上不出现「未触及」三个字，一律写「**本项目未涉及****」。
 *
 * ⚠️ 「本项目未涉及」**不含**「未触及」三个字 ⇒ 两条互不误伤（实测过）。
 */
export const FORBIDDEN_MASTERY_COPY_PHRASES: readonly { name: string; phrase: string }[] = [
  { name: '「你已掌握」', phrase: '你已掌握' },
  { name: '「未触及」', phrase: '未触及' },
]

/**
 * 在一段文本里找被禁的文案。
 *
 * @param text 待扫文本
 * @returns 命中清单（空数组 = 通过）
 */
export function findForbiddenMasteryCopy(text: string): {
  pattern: string
  line: number
  text: string
}[] {
  // ⚠️ **去注释** —— 规则说明里引用被禁形态是必需的，扫原文会把规则判红
  const code = stripComments(text)
  const out: { pattern: string; line: number; text: string }[] = []
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    for (const p of FORBIDDEN_MASTERY_COPY_PHRASES) {
      const at = line.indexOf(p.phrase)
      if (at < 0) continue
      out.push({ pattern: p.name, line: i + 1, text: line.trim() })
    }
  }
  return out
}

/** 本守卫自身（**不扫自己** —— 形态表里就写着那些词）。 */
const SELF_FILE = fileURLToPath(import.meta.url)

/**
 * 全仓扫被禁的掌握度文案。
 *
 * @param repoRoot 仓库根
 */
export function findForbiddenMasteryCopyInRepo(repoRoot: string): MasteryCopyHit[] {
  const out: MasteryCopyHit[] = []
  for (const file of walkSourceFiles(SOURCE_SCAN_ROOTS, repoRoot)) {
    if (file === SELF_FILE) continue
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const hit of findForbiddenMasteryCopy(content)) {
      out.push({
        file: relative(repoRoot, file),
        line: hit.line,
        pattern: hit.pattern,
        text: hit.text,
      })
    }
  }
  return out
}

// ============================================================================
// DL-28 / DL-34：推导路径不许碰资源三表与模式三表
// ============================================================================

/**
 * **推导路径不许碰**的表 —— 资源三张 ＋ 模式三张。
 *
 * ⚠️ **为什么这张表本身就是判据的实现**：
 * - **DL-28**（资源层不得参与掌握度推导）：掺进资源层，
 *   「这个知识点有配套教程」就能点亮它 —— 那是**学习资源**不是**项目活动**（§2.2）；
 * - **DL-34**（模式不得影响掌握度判定）：掺进模式，
 *   速成就又变成「更容易点亮」的路径，§2.2 拒绝的自评清单从后门回来了（§3.19 第 3 条）。
 *
 * ⇒ 「不许碰」的可执行形态 = **推导那两个源文件里不得出现这些表名**。
 */
export const FORBIDDEN_DERIVATION_TABLES: readonly string[] = [
  // 资源三张
  'lang_resources',
  'lang_vibe_resources',
  'lang_topic_resources',
  // 模式三张
  'lang_topic_profiles',
  'lang_profile_phases',
  'lang_stage_tracks',
]

/**
 * 推导路径必须只读的两张表（**拓扑**）。
 *
 * ⚠️ 这两张是**必须**碰的 —— 没有它们就没有「前置」，
 *   而 §3.3 的阶梯有一半是前置条件。
 */
export const REQUIRED_DERIVATION_TABLES: readonly string[] = ['lang_topics', 'lang_topic_edges']

/**
 * 在推导源码里找被禁的表名。
 *
 * ⚠️ **去注释** —— 规则说明里要写清「不许碰哪几张表」，那是必需的。
 *   留在代码部分里的表名才是**真的被读了**（SQL 就在字符串里）。
 *
 * @param source 推导源码文本
 * @returns 命中的表名（去重、排序）
 */
export function findForbiddenDerivationTables(source: string): string[] {
  const code = stripComments(source)
  const hits = new Set<string>()
  for (const table of FORBIDDEN_DERIVATION_TABLES) {
    if (code.includes(table)) hits.add(table)
  }
  return [...hits].sort()
}

/**
 * 在推导源码里找**该读却没读**的表。
 *
 * @param source 推导源码文本
 */
export function findMissingDerivationTables(source: string): string[] {
  const code = stripComments(source)
  return REQUIRED_DERIVATION_TABLES.filter((t) => !code.includes(t)).sort()
}
