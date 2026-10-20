// `packages/core/src/db/m9-p1d-stage-phase-guard.ts` —— M9 v1.6 **P1d · DL-50 守卫**
// （`m9-dev-language-roadmap.md` §3.6 / §3.17 / §3.22.1 · **DL-50**）
//
// ## 它断什么
//
// owner 2026-10-19 明确裁定：**8 站 = 学什么，附件分期 = 什么时候学，两者不做逐格映射**。
// ⚠️ **下一个人看到两套「阶段」最自然的动作就是把它们对齐** ——
//   8 站是知识点粒度、21 段是时间粒度，硬对齐会把 DAG 分层与时间线搅在一起（§3.6 的论证）。
//   ⇒ 判据不钉死，这个裁定活不过下一版。
//
// ## 三支
//
// 1. **正向支（仓里没有映射）**：`lang_topics` 上不得有 `phase_id` / `profile_phase_id`
//    之类的列；仓内不得存在任何「站↔段」的映射表。
// 2. **反证支（裁定还在）**：spec §3.6 那张两列分工表与 §3.22.1 那张三套分段表都在，
//    且**都标注了「不映射」**。
//    ⚠️ **为什么必须有反证支**：正向支**恒绿** —— 它只会说「没有」，
//    而「没有」也可能是因为解析写错了。⇒ 必须同时断「裁定文字还在，且两处都写了不映射」。
// 3. **变异腿**：给 `lang_topics` 加一列 `phase_id`（真加列）⇒ 必须报出。
//
// ⚠️ **反向判据天然没有正向痕迹**（本仓的老教训）：
//   加一列、多一张表，代码照常编译、测试照常过、文档读起来完全成立 ——
//   只有专门这条检查会红。⇒ **每条反向判据都必须配一条「真动数据」的变异腿**。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SqliteDatabase } from './index'

export interface StagePhaseGuardOptions {
  db: SqliteDatabase
  /** 仓库根（扫描源码用） */
  repoRoot: string
  /**
   * 要扫的源码目录（相对仓库根）。
   * ⚠️ **测试传临时目录** —— 往真实仓里造人造映射表来验证这条规则是**错的**：
   *   那里放的东西会被将来的读者当成实测。
   */
  scanDirs?: string[]
}

export interface StagePhaseViolation {
  /** 出处 */
  where: string
  /** 哪一支 */
  kind: 'topic-column' | 'mapping-table' | 'db-table'
  detail: string
}

/** 默认扫的目录（仓内源码）。 */
const DEFAULT_SCAN_DIRS = ['packages/core/src/db', 'packages/core/src/db/migrations']

/**
 * **测试文件不参与源码扫描**。
 *
 * ⚠️ **为什么**：变异腿必须真的写出一张违规的映射表才能证明这条闸会红，
 *   而那行建表语句就写在测试文件里 ——
 *   若连它一起扫，守卫会**检出自己的测试**（本轮真踩过）。
 *   ⇒ 测试文件里的建表语句不是生产映射表（不进任何运行时路径）。
 */
const SCAN_SKIP_SUFFIX = '.test.ts'

/**
 * **守卫自己也不参与扫描**。
 *
 * ⚠️ **为什么**：这个文件里会**举例子说明**违规形态（例：「`CREATE TABLE xxx`」那种写法），
 *   而扫描器用的是纯文本匹配 ⇒ 例子本身就会被当成真建表 ⇒ 守卫检出自己。
 *   ⇒ 跳过自身路径（用 `import.meta.url` 取，改文件名也不会失效）。
 */
const SELF_FILE = fileURLToPath(import.meta.url)

/** `lang_topics` 上不许有的列名形状（DL-50 点名的 phase_id / profile_phase_id 都在内）。 */
const PHASE_COLUMN_RE = /phase/i

/**
 * 是不是「站↔段」的映射表名 —— **同时**含 stage 与 phase。
 *
 * ⚠️ **为什么要求「同时含」**：单含 'stage' 的表（`lang_stage_tracks`，§3.1 的第十七张表）
 *   是**成长阶段 × 轨道**，单含 'phase' 的表（`lang_profile_phases`）是**模式 × 语言 × 段**
 *   —— 这两张都是**规格里有的表**，不是映射表。
 *   只有「站」与「段」**同时**出现（`lang_stage_phase_map` 之类）才是被禁止的那个东西。
 */
const MAPPING_TABLE_RE = /stage.*phase|phase.*stage/i

/** 收集目录下所有 `.sql` / `.ts` 文件（递归，跳过 node_modules 与隐藏目录）。 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) collectSourceFiles(full, out)
    else if (/\.(sql|ts)$/.test(name)) out.push(full)
  }
  return out
}

/**
 * 跑 DL-50 的正向支 —— 找出「站↔段」映射的痕迹。
 *
 * @returns 违规清单；**空数组 = 通过**。
 */
export function findStagePhaseArtifacts(opts: StagePhaseGuardOptions): StagePhaseViolation[] {
  const out: StagePhaseViolation[] = []

  // ---------- ① `lang_topics` 上不许有 phase 类列 ----------
  const cols = opts.db
    .prepare(`SELECT name FROM pragma_table_info('lang_topics')`)
    .all() as { name: string }[]
  for (const c of cols) {
    if (PHASE_COLUMN_RE.test(c.name)) {
      out.push({
        where: 'lang_topics',
        kind: 'topic-column',
        detail: `lang_topics 上出现 phase 类列「${c.name}」⇒ 两套「阶段」被混成一套`,
      })
    }
  }

  // ---------- ② 库里不得有「站↔段」映射表 ----------
  const tables = opts.db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all() as { name: string }[]
  for (const t of tables) {
    if (MAPPING_TABLE_RE.test(t.name)) {
      out.push({
        where: t.name,
        kind: 'db-table',
        detail: `库里出现「站↔段」映射表「${t.name}」`,
      })
    }
  }

  // ---------- ③ 仓内源码不得定义「站↔段」映射表 ----------
  const dirs = opts.scanDirs ?? DEFAULT_SCAN_DIRS
  for (const dir of dirs) {
    // ⚠️ **绝对路径原样使用** —— `join(repoRoot, '/tmp/xxx')` 会拼成
    //   `repoRoot/tmp/xxx` ⇒ 临时目录版的扫描会扫空（测试会静默通过）。
    const abs = isAbsolute(dir) ? dir : join(opts.repoRoot, dir)
    for (const file of collectSourceFiles(abs)) {
      if (file.endsWith(SCAN_SKIP_SUFFIX)) continue
      // ⚠️ 守卫自身跳过（它的注释里会举例违规形态，纯文本匹配会自曝）
      if (file === SELF_FILE) continue
      const content = readFileSync(file, 'utf8')
      // CREATE TABLE <name>（大小写与空白都不敏感）
      const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`[]?([A-Za-z0-9_]+)/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const name = m[1] ?? ''
        if (MAPPING_TABLE_RE.test(name)) {
          out.push({
            where: isAbsolute(dir) ? file : `${dir}/${file.slice(abs.length + 1)}`,
            kind: 'mapping-table',
            detail: `源码里定义了「站↔段」映射表「${name}」`,
          })
        }
      }
    }
  }

  return out
}

/**
 * DL-50 的**反证支** —— 裁定文字还在，且两处都写了「不映射」。
 *
 * ⚠️ 与正向支**同款地重要**：正向支恒绿 ⇒ 若裁定文字被删了，正向支依然绿，
 *   下一个人照样会以为「不做映射」这件事根本没被规定过。
 */
export function checkNoMappingStatementsStillThere(specText: string): {
  ok: boolean
  problems: string[]
} {
  const problems: string[] = []
  const stageIdx = specText.indexOf('### 3.6 ')
  const stageSec =
    stageIdx === -1 ? '' : specText.slice(stageIdx, specText.indexOf('### 3.7 ', stageIdx))
  const stageDivision =
    stageSec.includes('`lang_topics.stage_id`') &&
    stageSec.includes('`lang_profile_phases`') &&
    stageSec.includes('不做逐格映射')
  if (!stageDivision) problems.push('§3.6 的两列分工表或「不做逐格映射」那句不见了')

  const planIdx = specText.indexOf('#### 3.22.1')
  const planSec =
    planIdx === -1 ? '' : specText.slice(planIdx, specText.indexOf('#### ', planIdx + 5))
  const triplePlan = planSec.includes('互不映射')
  if (!triplePlan) problems.push('§3.22.1 的「三者互不映射」那句不见了')

  return { ok: problems.length === 0, problems }
}
