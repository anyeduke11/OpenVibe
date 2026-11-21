/**
 * scripts/migrate-temp-dir.ts —— 把测试夹具的 `mkdtempSync` 改走统一出口（2026-11-02）。
 *
 * ## 它解决什么
 *
 * `packages/core/src/test-support/temp-dir.ts` 的退出兜底能清理**登记过的**目录，
 * 但存量 61 个测试文件**直写 `mkdtempSync`** ⇒ 它们的目录**不在登记集里**
 * ⇒ 进程被中断时**永远不会被清**（实测：一次全量跑残留 300+ 个 `ov-*` 目录）。
 *
 * ⇒ 本脚本把「建目录」这件事收敛到**一个出口**。
 *
 * ## 为什么是「脚本批量改」而不是「手改 61 个文件」
 *
 * 61 个文件的改动**形态完全一致**（`mkdtempSync(join(tmpdir(), 'xxx'))` ⇒ `tempDir('xxx')`）
 * ⇒ 手改 61 次容易漏、也难复核 ⇒ 用脚本做**同一形态的机械替换**，
 *   改完再用「残留调用数 = 0」这条判据复核 ⇒ **可复算**。
 *
 * ## 改造的边界（只改「创建」，不改「清理」）
 *
 * ⚠️ **只替换创建调用**，各文件原有的 `rmSync` / `afterEach` 清理逻辑**原样保留**
 *   ⇒ 语义不变（目录照样被显式清掉），只是**多了一层退出兜底**。
 *   ⇒ 这也是「外科式改动」的要求：不顺手重构相邻代码。
 *
 * ⚠️ 但有一个**必须改**的地方：各文件原本用 `mkdtempSync(join(tmpdir(), prefix))`，
 *   改后要用 `tempDir(prefix)` ⇒ `join` 与 `tmpdir` 这两个 import 可能变成未使用
 *   ⇒ **未使用的 import 会被 eslint 判红** ⇒ 本脚本负责清理它们（只删确实没别的用处的）。
 *
 * ## 幂等
 *
 * 改过的文件再跑一次 ⇒ **不改任何东西**（判据是「还有 `mkdtempSync(` 调用」）。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** 仓根 */
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')

/** 要扫的目录（测试与脚本；不含 docs 下的历史存档） */
const TARGET_DIRS = ['apps', 'packages', 'tests', 'scripts']

/** 不改的文件（判据自身、对外 API 面、生成件） */
const SKIP = new Set([
  'packages/core/src/test-support/temp-dir.ts', // 实现本身
  'tests/temp-dir.test.ts', // 判据：它就是要检查「还有没有残留调用」
  'tests/machine-preflight.test.ts',
  'tests/check-orphan-workers.test.ts',
])

/** 走相对路径 import 的目录前缀（仓内包内部） */
const RELATIVE_IMPORT_PREFIXES = ['packages/core/src/']

/** 遍历目录下的所有 .ts/.tsx/.mts/.mjs 文件 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.git') continue
      walk(p, out)
    } else if (/\.(ts|tsx|mts)$/.test(name)) {
      // ⚠️ **只改 `.ts`/`.tsx`/`.mts`，不改 `.mjs`** —— `.mjs` 是纯 JS，由 `node` 直接跑
      //   （不经 tsx）⇒ import 不了 TS 模块（实测 `node scripts/dev-iso.mjs` 报
      //   ERR_MODULE_NOT_FOUND）⇒ 改造会直接破坏脚本。
      out.push(p)
    }
  }
  return out
}

/**
 * 一个文件该用哪种 import 路径。
 *
 * - 仓内包（`packages/core/src/**`）⇒ 相对路径（`@openvibe/core` 在包内指自己，
 *   经 workspace 解析绕一圈，且 `packages/core` 不是本包的名字 ⇒ 用相对路径最稳）；
 * - 其余（`apps/**`、`tests/**`、`scripts/**`）⇒ `@openvibe/core/test-support`。
 */
function importPathFor(relPath: string): string {
  for (const prefix of RELATIVE_IMPORT_PREFIXES) {
    if (relPath.startsWith(prefix)) {
      const depth = relPath.slice(prefix.length).split('/').length - 1
      return `${'../'.repeat(depth)}test-support/temp-dir`
    }
  }
  return '@openvibe/core/test-support'
}

/** 改一个文件；返回是否改了 */
function migrateOne(absPath: string): { changed: boolean; replacements: number } {
  const relPath = relative(ROOT, absPath)
  const original = readFileSync(absPath, 'utf8')
  if (!original.includes('mkdtempSync(')) return { changed: false, replacements: 0 }

  const impPath = importPathFor(relPath)
  const escaped = impPath.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
  let next = original

  // ① **先处理同名局部函数**（若有）
  //
  // ⚠️ **顺序至关重要**：必须**先改名、再替换调用**。
  //   反过来（先替换再改名）会把 wrapper 内部那一次新调用也改名掉 ⇒ wrapper 调自己 ⇒ 无限递归。
  //
  //   正解的最终形态：
  //     import { tempDir } from '@openvibe/core/test-support'
  //     function makeTempDir(): string {
  //       const d = tempDir('ov-dl-')   // ← 统一出口（import 来的）
  //       temps.push(d)
  //       return d
  //     }
  //   ⇒ wrapper 的**对外契约不变**（调用点只是改名，行为一样）。
  const hasLocalTempDir = /function\s+tempDir\s*\(/.test(next) || /const\s+tempDir\s*=/.test(next)
  if (hasLocalTempDir) next = renameLocalTempDir(next)

  // ② 替换调用形态：`mkdtempSync(join(tmpdir(), 'xxx'))` ⇒ `tempDir('xxx')`
  //    ⚠️ 只认「join 的第二参数是字符串字面量或单个标识符」的形态 ——
  //    更复杂的表达式（拼接、模板串）不在本轮机械替换范围内，交给人工。
  let replacements = 0
  next = next.replace(
    /mkdtempSync\(\s*join\(\s*tmpdir\(\)\s*,\s*(('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)|([A-Za-z_$][\w$]*))\s*\)\s*\)/g,
    (_m, _q, strLit, tplLit, ident) => {
      replacements += 1
      if (strLit !== undefined) return `tempDir(${strLit})`
      if (tplLit !== undefined) return `tempDir(${tplLit})`
      return `tempDir(${ident as string})`
    },
  )

  if (replacements === 0) return { changed: false, replacements: 0 }

  // ③ 加 import（若**该路径的 import 语句里**还没有 `tempDir`）
  //
  // ⚠️ **不能只判「这个路径出现过」**：文件可能已经从该路径导入了别的符号
  //   （如 `import { newDb } from '@openvibe/core/test-support'`）⇒
  //   那样会跳过添加 ⇒ `tempDir` 未定义（TS2304，本轮实测踩到）。
  //   ⇒ 判定口径：**这条 import 语句的具名列表里有没有 `tempDir`**。
  if (!importsTempDir(next, impPath)) {
    // ⚠️ 若该路径**已有** import 语句 ⇒ 并入它（不新增第二条，避免重复导入）
    if (new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*['"]${escaped}['"]`).test(next)) {
      next = mergeTempDirIntoExisting(next, impPath)
    } else {
      next = addImport(next, `import { tempDir } from '${impPath}'`)
    }
  }

  // ④ 清理因替换而未使用的 import（`mkdtempSync` / `tmpdir` / `join`）
  next = pruneUnusedImports(next, ['mkdtempSync', 'tmpdir', 'join'])

  writeFileSync(absPath, next, 'utf8')
  return { changed: true, replacements }
}

/**
 * 这个文件是否**已经从指定路径导入了 `tempDir`**。
 *
 * ⚠️ 判定口径是「那条 import 语句的具名列表里有没有 `tempDir`」，
 *   不是「这个路径有没有出现过」（后者会把「只导入了别的符号」误判成已引入）。
 */
function importsTempDir(src: string, impPath: string): boolean {
  const escaped = impPath.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
  // 抓所有 `import { ... } from '<impPath>'`（含多行块）
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`, 'g')
  for (const m of src.matchAll(re)) {
    if (/(^|[,\s])tempDir\s*($|[,\s])/.test(m[1] ?? '')) return true
  }
  return false
}

/**
 * 把 `tempDir` **并入**已有的那条 import 语句（不新增一条）。
 *
 * ⚠️ 为什么要并入：同一个路径 import 两次 ⇒ TS 虽不报错但**重复导入**，
 *   且 eslint 的 `import-x/no-duplicates` 会判红 ⇒ 必须并入。
 */
function mergeTempDirIntoExisting(src: string, impPath: string): string {
  const escaped = impPath.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
  const re = new RegExp(`(import\\s*\\{)([^}]*)(\\})(\\s*from\\s*['"]${escaped}['"])`, 'g')
  return src.replace(re, (_m, head: string, body: string, tail: string, from: string) => {
    const trimmed = body.replace(/\s+$/, '')
    // ⚠️ **必须补逗号**：原列表可能是 `newDb, type TestDbHandle`（末项无逗号）
    //   ⇒ 直接拼 `tempDir` 会变成 `type TestDbHandle tempDir`（TS1005 语法错）。
    if (trimmed.length === 0) return `${head}tempDir${tail}${from}`
    return `${head}${trimmed}, tempDir${tail}${from}`
  })
}

/**
 * 把文件里的**局部** `tempDir` 改名，让位给统一出口。
 *
 * ⚠️ **为什么必须改名**：局部函数与 import 同名 ⇒ TS2440（声明冲突）；
 *   且局部函数体里若被换成 `tempDir('xxx')` ⇒ **无限递归**（自己调自己）。
 *   ⇒ 把局部的 `tempDir` 改名为 `makeTempDir`，调用点同步改。
 */
function renameLocalTempDir(src: string): string {
  // 声明处：`function tempDir(` / `const tempDir =`
  let out = src.replace(/\bfunction\s+tempDir\s*\(/g, 'function makeTempDir(')
  out = out.replace(/\bconst\s+tempDir\s*=/g, 'const makeTempDir =')
  // 调用点：`tempDir(` （排除刚改好的声明行）
  out = out.replace(/(?<!function\s)(?<!const\s)\btempDir\s*\(/g, 'makeTempDir(')
  return out
}

/**
 * 在文件里插入一条 import。
 *
 * ⚠️ **必须插在「import 块的结尾」**：import 可能是多行块
 *   （`import {\n  A,\n  B,\n} from 'x'`）⇒ 逐行找「最后一行以 import 开头」会插到块中间。
 *   ⇒ 正确做法：找出**所有以 `from '...'` 结尾的 import 语句的结束行**，插在它之后。
 */
function addImport(src: string, importLine: string): string {
  const lines = src.split('\n')
  let insertAt = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string
    // 单行 import：`import x from 'y'`
    if (/^import\s.+from\s+'[^']*'\s*$/.test(line)) insertAt = i
    // 多行 import 的结束行：`} from 'y'`
    else if (/^}\s*from\s+'[^']*'\s*$/.test(line)) insertAt = i
  }
  if (insertAt < 0) return `${importLine}\n${src}`
  lines.splice(insertAt + 1, 0, importLine)
  return lines.join('\n')
}

/**
 * 从 import 语句里删掉「本文件已不再使用」的具名导入。
 *
 * ⚠️ **保守判定**：只有当该标识符在 import 语句**之外**再无出现时才删
 *   （否则会误删同名局部变量）。
 */
function pruneUnusedImports(src: string, names: string[]): string {
  let out = src
  for (const name of names) {
    // ⚠️ **「是否还在用」必须按「剥离 import 块」后判**，且剥离要认**多行块**：
    //   import 可能是 `import {\n  A,\n} from 'x'` ⇒ 只按行剥离会漏掉块中间的内容
    //   ⇒ 漏判 ⇒ 误以为「还在用」⇒ 不删（保守，可接受）；
    //   但反过来若把 import 块**当正文**参与判断 ⇒ 会永远认为「还在用」⇒ 删不掉。
    const withoutImports = stripImportBlocks(out)
    const used = new RegExp(`\\b${name}\\b`).test(withoutImports)
    if (used) continue
    // 从具名导入列表里删掉它
    out = out.replace(new RegExp(`(\\{[^}]*?)\\b${name}\\b,\\s*`, 'g'), '$1')
    out = out.replace(new RegExp(`(\\{[^}]*?),\\s*\\b${name}\\b(\\s*\\})`, 'g'), '$1$2')
    // ⚠️ **末项无逗号**的形态：`{ tmpdir }` ⇒ `{ tmpdir }` 删成 `{ }`
    //   （上面的两条都要求「后面有逗号」⇒ 漏掉这一形态，本轮实测踩到）
    out = out.replace(new RegExp(`(\\{[^}]*?)\\b${name}\\b(\\s*\\})`, 'g'), '$1$2')
    // 整条 import 只剩它一个 ⇒ 整条删掉
    out = out.replace(
      new RegExp(`^import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'[^']*'\\n`, 'gm'),
      '',
    )
    // ⚠️ 删完变成空列表 `{ }` ⇒ 整条也删掉（否则留下 `import { } from 'node:os'`）
    out = out.replace(new RegExp(`^import\\s*\\{\\s*\\}\\s*from\\s*'[^']*'\\n`, 'gm'), '')
    // default import 形态：`import tmpdir from 'node:os'`
    out = out.replace(new RegExp(`^import\\s+${name}\\s+from\\s*'[^']*'\\n`, 'gm'), '')
  }
  return out
}

/**
 * 把源码里的 **import 语句块**整段剥掉（返回剩下的正文）。
 *
 * ⚠️ 认两种形态：
 *   ① `import ... from '...'`（单行，含 `import type`）；
 *   ② `import {\n  A,\n  B,\n} from '...'`（多行块）。
 *   ⇒ 实现：从 `import` 开头扫到**第一个** `from '...'` 结束为止（跨行）。
 */
function stripImportBlocks(src: string): string {
  const lines = src.split('\n')
  const kept: string[] = []
  let inImport = false
  for (const line of lines) {
    if (!inImport && /^import\b/.test(line)) {
      inImport = true
      // 单行 import（这条就结束了）
      if (/from\s+'[^']*'\s*$/.test(line)) inImport = false
      continue
    }
    if (inImport) {
      if (/from\s+'[^']*'\s*$/.test(line)) inImport = false
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

// 直接跑（被 import 时不跑）
if (process.argv[1] !== undefined && process.argv[1].endsWith('migrate-temp-dir.ts')) {
  const dryRun = process.argv.includes('--dry-run')
  const files: string[] = []
  for (const d of TARGET_DIRS) {
    const abs = join(ROOT, d)
    try {
      statSync(abs)
      walk(abs, files)
    } catch {
      // 目录不存在 ⇒ 跳过
    }
  }
  let changedCount = 0
  let replacementCount = 0
  for (const f of files.sort()) {
    const rel = relative(ROOT, f)
    if (SKIP.has(rel)) continue
    if (rel === 'scripts/migrate-temp-dir.ts') continue
    const res = migrateOne(f)
    if (res.changed) {
      changedCount += 1
      replacementCount += res.replacements
      console.log(`[migrate] ${rel} ⇒ 替换 ${String(res.replacements)} 处`)
    }
  }
  console.log(
    `[migrate] ${dryRun ? '（dry-run）' : ''}共改 ${String(changedCount)} 个文件、${String(replacementCount)} 处调用`,
  )
}
