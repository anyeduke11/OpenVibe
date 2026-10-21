// `packages/core/src/db/m9-p1f-grade-guard.ts` —— M9 v1.6 **P1f · DL-42 守卫**
// （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §3.21 第 4 条）
//
// ## 它守的是什么
//
// **界面不得出现越过编程证据的职业等级断言**。
//
// 阶段出口是**评测能力**指标（出题有效率 ≥80%、kappa ≥0.8、质检一次通过率 ≥85%、
// checker 覆盖率 ≥1/3），编程轨道只是该阶段 N 项任务里的**其中一项**（阶段 0 是 7 项里的第 7 项）。
// ⇒ 编程模块**只能**回答「这一项编程任务做完没有」；
//   **出现「你已达成 L1」「你已到专家级」这类文案即红**（DL-42）。
// 理由与 §2.2 同源：那是**关于人的判断**，而本模块只有代码证据。
//
// ## ⚠️ 守卫自证
//
// DL-42 明写「⚠️ **守卫自证**：注入一条必被报出」⇒ 本文件自带
//   `findGradeAssertionsInText` 的**反证腿**（测试里注入一条必被报出）。
//
// ## ⚠️ 本守卫**不扫自己的模式定义**
//
// 模式定义里就写着「专家级」这些词 ⇒ 扫到自己是自证失败，不是发现问题。
//   ⇒ 用 `import.meta.url` 取自身路径并跳过（与 `m9-p1d-stage-phase-guard.ts` 同款）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 一条职业等级断言的命中。 */
export interface GradeAssertionHit {
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
 * 职业等级断言的形态表。
 *
 * ⚠️ **只认「主语 + 断言」的结构**，不认裸词 ——
 *   裸词「专家级」在「本模块不判断你是否达到专家级」这类**规则说明**里是合法的。
 *   ⇒ 主语必须是「你／您／用户／学员」这类**对人的称呼**，
 *   且**中间段与前缀都不得带否定/疑问标记**（见 `NOT_ASSERTION_MARKERS`）。
 *
 * ⚠️ 每条模式的第 1 个捕获组是主语、第 2 个是**主语与断言之间的中间段**
 *   —— 否定与疑问标记就在那段里（「你**是否**达到专家级」）。
 */
export const GRADE_ASSERTION_PATTERNS: readonly { name: string; re: RegExp }[] = [
  {
    name: '「你已达成/达到 L[0-3]」',
    re: /(你|您|用户|学员)([^。！？\n]{0,10})(已|已经)?(达成|达到|具备|拥有|晋升|进入)([^。！？\n]{0,6})L[0-3]\b/i,
  },
  {
    name: '「你已到专家级/专家水平」',
    re: /(你|您|用户|学员)([^。！？\n]{0,10})(已|已经|就是|达到)([^。！？\n]{0,4})(专家级|专家水平|资深专家|专家)/,
  },
  {
    name: '「你已具备 L[0-3] 水平/能力」',
    re: /(你|您|用户|学员)([^。！？\n]{0,10})(已|已经)?(具备)([^。！？\n]{0,6})L[0-3]\b/i,
  },
  {
    name: '「你已达成阶段出口/阶段 N 的能力」',
    re: /(你|您|用户|学员)([^。！？\n]{0,10})(已|已经)(达成|通过|满足)([^。！？\n]{0,6})阶段/,
  },
]

/**
 * 否定与疑问标记 —— 命中它们就说明这句**不是断言**。
 *
 * ⚠️ **为什么需要**：DL-42 要断的是「界面**宣称**用户到了某等级」，
 *   而规则说明里引用这些词（「界面不得出现「你已达成 L1」」）是**必须写的**。
 *   ⇒ 守卫不能把「本模块不判断你是否达到专家级」判红 —— 那会让它**没法被写出来**。
 */
export const NOT_ASSERTION_MARKERS: readonly string[] = [
  '是否',
  '能否',
  '会不会',
  '不能',
  '不判断',
  '不代表',
  '不等于',
  '不得',
  '不许',
  '禁止',
  '尚未',
  '并非',
  '未',
  '没',
  '不',
]

/**
 * 判断一句命中**是不是断言**。
 *
 * @param line 整行
 * @param matchIndex 命中起点
 * @param middle 主语与断言之间的中间段（捕获组 2）
 */
function isAssertion(line: string, matchIndex: number, middle: string): boolean {
  const prefix = line.slice(0, matchIndex)
  // ⚠️ 前缀只看**末尾 6 个字符** —— 否则「未来」里的「未」会把整句误判成否定
  const tail = prefix.slice(-6)
  return ![middle, tail].some((part) => NOT_ASSERTION_MARKERS.some((m) => part.includes(m)))
}

/**
 * 在一段文本里找职业等级断言。
 *
 * @param text 待扫文本
 * @returns 命中清单（空数组 = 通过）
 */
export function findGradeAssertionsInText(text: string): { pattern: string; line: number; text: string }[] {
  const out: { pattern: string; line: number; text: string }[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    for (const p of GRADE_ASSERTION_PATTERNS) {
      const m = new RegExp(p.re.source, p.re.flags).exec(line)
      if (m === null) continue
      const middle = m[2] ?? ''
      if (!isAssertion(line, m.index, middle)) continue
      out.push({ pattern: p.name, line: i + 1, text: line.trim() })
    }
  }
  return out
}

/** 要扫的源码根（相对仓库根）。 */
export const GRADE_GUARD_ROOTS: readonly string[] = [
  'apps/web/src',
  'apps/server/src',
  'apps/cli/src',
  'packages/shared/src',
  'packages/core/src',
]

/** 扫哪些扩展名。 */
const SCAN_EXTENSIONS = ['.ts', '.tsx']

/** 本守卫自身（**不扫自己** —— 模式定义里就写着那些词）。 */
const SELF_FILE = fileURLToPath(import.meta.url)

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'build') continue
      walk(full, out)
      continue
    }
    if (!SCAN_EXTENSIONS.some((ext) => name.endsWith(ext))) continue
    // ⚠️ 测试文件不扫 —— 变异腿的样本里**故意**写着那些形态
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue
    out.push(full)
  }
}

/**
 * 全仓扫职业等级断言。
 *
 * @param repoRoot 仓库根
 */
export function findGradeAssertions(repoRoot: string): GradeAssertionHit[] {
  const out: GradeAssertionHit[] = []
  for (const root of GRADE_GUARD_ROOTS) {
    const files: string[] = []
    walk(join(repoRoot, root), files)
    for (const file of files) {
      if (file === SELF_FILE) continue
      let content: string
      try {
        content = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      for (const hit of findGradeAssertionsInText(content)) {
        out.push({
          file: relative(repoRoot, file),
          line: hit.line,
          pattern: hit.pattern,
          text: hit.text,
        })
      }
    }
  }
  return out
}
