import { describe, expect, it } from 'vitest'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, globSync, readFileSync, readdirSync } from 'node:fs'

/**
 * 验收表凭据可定位性守卫（2026-10-15 · owner「以后要保持上下文一致」）。
 *
 * ## 为什么需要这道闸
 *
 * 本仓**四次**栽在同一类缺陷上：spec / 注释里引用的「既有 X」根本不存在。
 * 第一次是台账 spec §7 的 13 个测试 ID（`CORE-EVT-01`…`GOLD-EVT-01`，代码里 0 命中）；
 * 第二次是跨项目的 `EmptyState` 组件；第三次是「本仓无 409 先例」；
 * 第四次是 M8 spec §7 的 24 个测试 ID。
 *
 * 写那张表的人并不是在撒谎——他把**真测试 ID**、**grep 命令行判据**、**外部命令凭据**
 * 三种东西塞进了同一列，于是看起来像有十几条测试在守着，实际一条也没有。
 * **人工复查抓不住它**：那张表读过三遍，每遍都「看起来有凭据」。
 *
 * ## 这道闸断的是什么
 *
 * 只断**验收表里状态为 ✅ 的行**，断两件事：
 * 1. 行内形如路径或文件名的片段 —— **必须在磁盘上真的存在**；
 * 2. 行内形如 `XXX-YYY-NN` 的测试 ID —— **必须在代码树里真的被引用**。
 *
 * ## 这道闸刻意不断什么
 *
 * - ❌ 不扫 spec 正文：正文里出现「将来要有的 ID」是正常的（那是欠账，不是谎话）。
 * - ❌ 不要求 ❌／🟡 行的 ID 存在：**欠账行本来就该缺凭据**，断它等于逼人编凭据。
 * - ❌ 不校验 ID 是否「该有」：那是人的判断；这道闸只断「声称存在的必须存在」。
 *
 * 正因为只断窄面，**它必须能红**：末尾三条变异腿专门造「坏掉的闸」。
 * 落盘过程中它们抓到过**一个真缺陷**（`codeText` 把本文件的 13 个假 ID 也纳入索引 ⇒ 自指）
 * 与**一个误报**（把纯文件名当路径判），两者都已修并留注释。
 * 另有一处我自己的**误判**（把「ID 真存在」当成「子串假阳性」）也留了痕，见 `idExistsInCode`。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_DIR = join(ROOT, 'docs', 'specs')

/** 判据行：`| a | 条目 | 判据 | 凭据 | ✅ 通过 |` 这类表格行，末列为 ✅ */
const PASS_ROW = /^\|\s*\*{0,2}([a-z])\*{0,2}\s*\|.*\|\s*✅[^|]*\|\s*$/gm

/** 测试 ID 形态：三段式 `FAMILY-DOMAIN-NN`，末段允许一位小写后缀 */
const TEST_ID = /\b[A-Z][A-Z0-9]{1,7}-[A-Z][A-Z0-9]{1,7}-\d+[a-z]?\b/g

/** 任何带扩展名的反引号片段：可能是完整路径、尾部片段，也可能只是纯文件名 */
const PATH_LIKE = /`([^`]*?\.(?:ts|tsx|sql|md|json|mjs|js))(?::\d+(?:-\d+)?)?`/g
/** 光文件名：`x.test.ts` 无目录 */
const FILENAME_LIKE = /`([A-Za-z0-9_.-]+\.(?:ts|tsx|sql|md))`/g

/** 整条是 shell 命令而不是路径 */
const SHELL_PREFIX = /^(grep|find|git|pnpm|npx|npm)\b/

/** 仓库顶层目录锚点：只有以它们开头的片段才按「相对 ROOT 的路径」判定 */
const TOP_DIRS = ['apps', 'packages', 'tests', 'scripts', 'content', 'docs', 'demo', 'redesign'] as const
const TOP_DIR_RE = new RegExp(`^(${TOP_DIRS.join('|')})/`)

interface Claim {
  file: string
  row: string
  ids: string[]
  paths: string[]
  names: string[]
}

function specFiles(): string[] {
  if (!existsSync(SPEC_DIR)) return []
  return readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(SPEC_DIR, f))
}

function collectClaims(): Claim[] {
  const out: Claim[] = []
  for (const file of specFiles()) {
    const text = readFileSync(file, 'utf8')
    PASS_ROW.lastIndex = 0
    for (const m of text.matchAll(PASS_ROW)) {
      const row = m[0]
      out.push({
        file: basename(file),
        row,
        ids: [...row.matchAll(TEST_ID)].map((x) => x[0]),
        paths: [...row.matchAll(PATH_LIKE)].map((x) => x[1]!),
        names: [...row.matchAll(FILENAME_LIKE)].map((x) => x[1]!),
      })
    }
  }
  return out
}

/**
 * ⚠️ 选项名必须是 `exclude`，**不是 `ignore`**。
 * `fs.globSync`（Node 26）没有 `ignore` 选项，传了会被**静默忽略** ——
 * 测试照跑、类型却报无匹配，于是 `node_modules` 里的 3 个副本混进了 `codeText`
 * （实测 344 vs 341）。那正是会造成「某个 ID 明明不存在却被判存在」的假阳性来源。
 * 这个坑是 worker B 跑 typecheck 时替我发现的：它报的 rc=2 里有两条在**我的**文件上。
 */
/**
 * 两种索引**故意不同源**，这是这道闸最容易被写错的地方：
 *
 * - `codeFiles`（文件存在性索引）**含 `docs/`** —— spec 互相引用是合法的
 *   （M8 spec 的 v 条就引用 `local-event-ledger.md §7-e`），把 docs 排除会让它误报「文件不存在」。
 * - `codeText`（测试 ID 检索索引）**必须排除 `docs/`** —— 否则 spec 正文里写着的
 *   那些**虚构 ID** 会让自己「有据可查」，这道闸当场变成永真。
 *
 * 早先没区分这两个，v 条那句跨 spec 引用就被判成「文件不存在」（闸红 1 支）。
 */
const EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**']
const codeFiles = globSync('{apps,packages,tests,scripts,content,docs}/**/*.{ts,tsx,sql,md}', {
  cwd: ROOT,
  exclude: EXCLUDE,
})
const allSourceFiles = codeFiles

/**
 * 全仓源码文本（用于测试 ID 检索）。
 *
 * ⚠️ **必须排除本文件自身**：变异腿把那 13 个虚构 ID 逐字写在这里，
 * 若把它们也纳入索引，`codeText` 会因为**本文件的文字**而判定它们存在 ——
 * 闸于是把 13 个假的全判成真的。与「文档里写复算命令 ⇒ 命令扫到自己」是同一类自指，
 * 只是载体从文档换成了测试。
 */
const SELF = basename(fileURLToPath(import.meta.url))
const codeText = codeFiles
  .filter((f) => !f.startsWith('docs/') && basename(f) !== SELF)
  .map((f) => readFileSync(join(ROOT, f), 'utf8'))
  .join('\n')

function fileExistsSomewhere(name: string): boolean {
  return allSourceFiles.some((f) => basename(f) === name)
}

/**
 * 测试 ID 是否真在代码里被引用。用词边界而非 `includes`。
 *
 * 这条注释本身是**一次自我纠正的留痕**（2026-10-17）：我最初以为闸漏网
 * 是因为用了子串匹配（`CORE-EVT-01a` 含 `CORE-EVT-01`），并据此在注释里
 * 写下了那个诊断。随后 `grep -w` 逐个复查发现，漏网的 3 个
 * （`CORE-EVT-01` / `CORE-EVT-05` / `SRV-EVT-01`）**是真的存在** ——
 * DEV-0100 补测时 worker 真的用了这些 ID（如 `core-db.test.ts:223` 的 describe 名）。
 * 那个诊断是错的，词边界写法是**更严谨但没有修复任何东西**的改法，保留仅因它不更差。
 */
function idExistsInCode(id: string): boolean {
  return new RegExp(`\\b${id}\\b`).test(codeText)
}

/**
 * 片段解析三态：
 * - 以顶层目录开头 ⇒ 相对 ROOT 的完整路径，`existsSync` 判定
 * - 含斜杠但无顶层目录（`repos/localEvents.ts`）⇒ 当作尾部片段，在源码树下找
 * - 其余由调用方当纯文件名处理
 *
 * ⚠️ 不能对所有含扩展名的片段一律 `existsSync(join(ROOT, p))`：
 *   `grep -c 'local_events' apps/server/src/lib/telemetry-flush.ts` 整条是**命令**不是路径。
 *   这也是落盘时变异腿抓到的第一个缺陷（当时纯文件名被当路径判 → 全部误报）。
 */
function claimTargetExists(fragment: string): boolean {
  if (TOP_DIR_RE.test(fragment)) return existsSync(join(ROOT, fragment))
  if (!fragment.includes('/')) return fileExistsSomewhere(fragment)
  return (
    globSync(`**/${fragment}`, { cwd: ROOT, exclude: EXCLUDE }).length > 0
  )
}

function verdictFor(claims: Claim[]): string[] {
  const bad: string[] = []
  for (const c of claims) {
    for (const p of c.paths) {
      if (!p.includes('/')) continue
      if (SHELL_PREFIX.test(p)) continue
      if (!claimTargetExists(p)) bad.push(p)
    }
    for (const n of c.names) if (!fileExistsSomewhere(n)) bad.push(n)
    for (const id of c.ids) if (!idExistsInCode(id)) bad.push(id)
  }
  return bad
}

describe('验收表凭据守卫 · ✅ 行的凭据必须真的可定位', () => {
  const claims = collectClaims()

  it('**扫描真的抓到了行**（防止路径写错导致空集假绿）', () => {
    expect(specFiles().length).toBeGreaterThan(2)
    expect(claims.length).toBeGreaterThan(0)
  })

  it('✅ 行引用的仓库路径必须存在', () => {
    const missing: string[] = []
    for (const c of claims) {
      for (const p of c.paths) {
        if (!p.includes('/')) continue
        if (SHELL_PREFIX.test(p)) continue
        if (!claimTargetExists(p)) missing.push(`${c.file} → ${p}`)
      }
    }
    expect(missing.join('\n')).toBe('')
  })

  it('✅ 行引用的文件名必须存在', () => {
    const missing: string[] = []
    for (const c of claims) {
      for (const n of c.names) {
        if (!fileExistsSomewhere(n)) missing.push(`${c.file} → ${n}`)
      }
    }
    expect(missing.join('\\n')).toBe('')
  })

  it('✅ 行引用的测试 ID 必须在代码树里被真实引用', () => {
    const missing: string[] = []
    for (const c of claims) {
      for (const id of c.ids) {
        if (!idExistsInCode(id)) missing.push(`${c.file} → ${id}`)
      }
    }
    expect(missing.join('\n')).toBe('')
  })
})

/**
 * 变异腿：证明这道闸抓得住「台账 spec 那 13 个虚构 ID」这一类缺陷。
 *
 * **为什么要专门做**：这道闸是**否定式判据**（没写错就永远绿）。
 * 若它的正则写坏了，它会永远绿而且**看起来很有安全感**——
 * 与 DEV-0101 那条日历校验判据栽的是同一类坑。
 * 下面三条把「坏掉的闸」造出来，让它当场红；其中前两条在开发过程中**真的红过一次**
 * （自指 + 子串匹配），这正是它们存在的理由。
 */
describe('变异腿 · 这道闸抓得住「虚构 ID / 虚构路径 / 坏掉的自己」', () => {
  it('虚构 ID 喂进去必须被逐个抓出', () => {
    // ⚠️ **不要硬编码台账原表那 13 个 ID 当「应当全虚构」的期望值** ——
    //   2026-10-17 实测：其中 `CORE-EVT-01` / `CORE-EVT-05` / `SRV-EVT-01`
    //   **现在真的存在**（DEV-0100 补测时 worker 复用了这些 ID，
    //   如 `packages/core/src/db/core-db.test.ts:223` 的 describe 名）。
    //   也就是说「那 13 个 ID 全部虚构」这个断言**本身也会随代码演进而腐烂**：
    //   当年是假的，后来被真的用上了。
    //   这正是这道闸只断「✅ 行的凭据此刻可定位」、而**不去维护一份「哪些 ID 是假的」清单**的原因 ——
    //   后者会腐烂，而腐烂的那份比没有更危险。
    const fake = [
      'GHOST-EVT-01',
      'GHOST-EVT-02',
      'GHOST-EVT-03',
      'GHOST-SRV-01',
      'GHOST-INT-01',
      'GHOST-UTL-01',
      'GHOST-GLD-01',
    ]
    const caught = verdictFor([{ file: 'x.md', row: '', ids: fake, paths: [], names: [] }])
    // ⚠️ 若哪天有人把词边界匹配改回子串匹配，这支会红：
    //   真实存在的 `CORE-EVT-01a` 文本里包含 `CORE-EVT-01`。
    expect(caught).toEqual(fake)
  })

  it('虚构文件名与路径同样被抓出，真实尾部路径不被误报', () => {
    const caught = verdictFor([
      {
        file: 'x.md',
        row: '',
        ids: [],
        paths: [
          'packages/core/src/repos/doesNotExist.ts',
          'repos/localEvents.ts',
        ],
        names: ['ghost-ledger.test.ts'],
      },
    ])
    expect(caught).toEqual([
      'packages/core/src/repos/doesNotExist.ts',
      'ghost-ledger.test.ts',
    ])
  })

  it('shell 命令片段不被当成路径判（否则 grep 判据会被误报成「文件不存在」）', () => {
    const caught = verdictFor([
      {
        file: 'x.md',
        row: '',
        ids: [],
        paths: ["grep -c 'local_events' apps/server/src/lib/telemetry-flush.ts"],
        names: [],
      },
    ])
    expect(caught).toEqual([])
  })

  it('真实凭据放进去必须**不被**误报（防止闸严到没有实用价值）', () => {
    const caught = verdictFor([
      {
        file: 'x.md',
        row: '',
        ids: ['UT-MIGRATION-01'],
        paths: ['packages/core/src/db/core-db.test.ts'],
        names: ['m8-ledger-schema.test.ts'],
      },
    ])
    expect(caught).toEqual([])
  })
})
