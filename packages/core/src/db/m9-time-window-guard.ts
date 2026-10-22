// `packages/core/src/db/m9-time-window-guard.ts` —— **「日历漂移型红」的守卫**（实现层）
//
// ## 它挡的是什么
//
// 本仓踩过一次（2026-10-22）：`LocalEventsRepo.summary(N)` 的下界是 SQLite 的
// `date('now', '-N days')` ⇒ **按跑测那天**算；而测试把日期**写死**为 `'2026-10-14'` ⇒
// 写死那天落在 7 天窗口内 ⇒ 绿；过了 2026-10-21，窗口下界推到 `10-15`
// ⇒ 那一行被过滤掉 ⇒ `s.find(...)` 变 `undefined` ⇒ **这条会「到期变红」** ——
// 而那次全量回归距上一次全量绿隔了**好几周**，极易被误判成「我刚改的东西把别的弄坏了」
// ⇒ 去改**没坏的**代码。
//
// ⇒ **通法**：凡测试要落在「相对 now 的窗口」里 ⇒ 写入日期必须**跟随当天**；
//   **窗口边界另由绝对窗口判据负责**（不漂移）。
//
// ## ⚠️ 守卫的判定式（三条，缺一不可）
//
// 1. **生产代码里有相对窗口** —— SQL 里出现 `date('now'` / `datetime('now'` /
//    `julianday('now'`（**表名**从同一段 SQL 里取）；
// 2. **该相对窗口在某个方法里** —— 方法名从源码上下文取（`summary` 之类）；
// 3. **某个测试用例同时具备**：① 调用那个方法 ② **写死**了一个日历日期。
//
// ⇒ 三条**同时**成立才算风险 ⇒ **不会**把「测试里随便写了个日期」与
//   「生产代码里有个相对窗口」当成一回事（那是两种不同的事）。
//
// ## ⚠️ 为什么是**纯函数**（吃文本、不做 I/O）
//
// 扫描器要能**被单测直接喂样本** ⇒ 判定逻辑必须与「怎么找文件」分开。
// ⇒ 文件遍历在**测试**里做，本模块只做判定。
//
// ⚠️ **本守卫是实现层**，**不计入 §7 的五十条判据**（判据数不变，DL-44 守着）。

/** 一份源码（路径相对仓根 ＋ 文本）。 */
export interface SourceFile {
  file: string
  text: string
}

/** 生产代码里的一处「相对窗口」用法。 */
export interface RelativeWindowUse {
  file: string
  /** 行号（1 起） */
  line: number
  /** 涉及的表 */
  table: string
  /** 所在方法名（**空串** = 不在方法里 —— 例如模块顶层常量） */
  method: string
}

/** 测试里一处「写死的日历日期」。 */
export interface HardCodedDateUse {
  file: string
  /** 行号（1 起） */
  line: number
  /** 那个日期（`YYYY-MM-DD`） */
  date: string
}

/** 一处「日历漂移型红」的风险。 */
export interface TimeDriftRisk {
  /** 涉及的表 */
  table: string
  /** 相对窗口所在的方法 */
  method: string
  /** 生产侧那一处 */
  production: RelativeWindowUse
  /** 测试侧那一处（文件 ＋ 行号 ＋ 日期） */
  test: HardCodedDateUse
}

/** 相对窗口的三种 SQLite 写法。 */
const RELATIVE_NOW_PATTERNS: readonly RegExp[] = [
  /\bdate\s*\(\s*'now'/i,
  /\bdatetime\s*\(\s*'now'/i,
  /\bjulianday\s*\(\s*'now'/i,
]

/** 表名（`FROM x` / `JOIN x`）。 */
const TABLE_PATTERN = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi

/** 方法声明（**两格缩进**的成员函数 —— 本仓的成员方法都是这个形状）。 */
const METHOD_DECL_PATTERN = /^\s{2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*[(<]/u

/** 写死的日历日期（带引号的 `YYYY-MM-DD`，后面可跟时间部分）。 */
const HARDCODED_DATE_PATTERN = /'(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?Z?)?'/gu

/**
 * **「写死日期」的落点判定** —— 只认**写入位置**，不认断言位置。
 *
 * ⚠️ **为什么**：`expect(row.day).toBe('2026-10-14')` 里的日期是**断言**，
 *   它不写库 ⇒ 不会造成漂移；把断言也算进去 ⇒ 满仓误报 ⇒ 守卫会被无视。
 *
 * ⚠️ 认的写入位置有三类：
 *   ① `new Date('2026-10-14…')`（**最常见**：直接造一个时间戳）；
 *   ② 原始 SQL 里的 `INSERT INTO …` / `UPDATE …`（**字面量在 SQL 串里**）；
 *   ③ 方法名像写入的那些调用（`record` / `ingest` / `write` / `insert` / `save` / `create` / `add`）。
 */
const WRITE_METHOD_PATTERN = /\b(record|ingest|write|insert|save|create|add|upsert|set)\b/u

/**
 * 一行里有没有「写入位置」。
 *
 * @param line 整行
 * @param date 那一行的日期字面量
 */
function isWritePosition(line: string, date: string): boolean {
  const at = line.indexOf(date)
  if (at < 0) return false
  const before = line.slice(0, at)
  // ① `new Date('…')` —— ⚠️ 引号也在 `before` 里（日期字面量**含**引号）
  if (/\bnew\s+Date\s*\(\s*['"`]?$/u.test(before)) return true
  // ② 原始 SQL（`INSERT INTO` / `UPDATE`）—— 整行里有就是在写
  if (/\b(?:INSERT\s+INTO|UPDATE)\b/iu.test(line)) return true
  // ③ 写入类方法调用
  if (WRITE_METHOD_PATTERN.test(before)) return true
  return false
}

/**
 * 找生产代码里的「相对窗口」用法。
 *
 * @param files 生产源码
 */
export function findRelativeWindowUses(files: readonly SourceFile[]): RelativeWindowUse[] {
  const out: RelativeWindowUse[] = []
  for (const f of files) {
    const lines = f.text.split('\n')
    // ⚠️ **当前所在方法**（往上找最近的方法声明）
    let method = ''
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      const decl = METHOD_DECL_PATTERN.exec(line)
      if (decl?.[1] !== undefined) method = decl[1]
      if (!RELATIVE_NOW_PATTERNS.some((p) => p.test(line))) continue
      const tables = new Set<string>()
      TABLE_PATTERN.lastIndex = 0
      let m = TABLE_PATTERN.exec(line)
      while (m !== null) {
        const name = m[1]
        if (name !== undefined) tables.add(name.toLowerCase())
        m = TABLE_PATTERN.exec(line)
      }
      // ⚠️ **表名取不到就不报** —— 报一个不知道表的相对窗口，用户不知道该看哪儿
      for (const table of tables) {
        out.push({ file: f.file, line: i + 1, table, method })
      }
    }
  }
  return out
}

/** 一个测试用例（`it(...)` / `test(...)` 块）。 */
export interface TestBlock {
  /** 起始行号（1 起） */
  startLine: number
  /** 块内文本 */
  text: string
}

/**
 * 把一个测试文件切成「一个个用例」。
 *
 * ⚠️ **按 `it(` / `test(` 的出现切** —— 不求嵌套精确（`describe` 里套 `it` 是常态），
 *   只要保证「一个用例的正文落在同一块里」即可。
 */
export function splitTestBlocks(file: SourceFile): TestBlock[] {
  const lines = file.text.split('\n')
  const starts: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(?:it|test)\s*\(/u.test(lines[i]!)) starts.push(i)
  }
  const out: TestBlock[] = []
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i]!
    const to = i + 1 < starts.length ? starts[i + 1]! : lines.length
    out.push({ startLine: from + 1, text: lines.slice(from, to).join('\n') })
  }
  return out
}

/**
 * 找测试里「写死的日历日期」（**只认写入位置**）。
 *
 * @param files 测试源码
 */
export function findHardCodedDateUses(files: readonly SourceFile[]): HardCodedDateUse[] {
  const out: HardCodedDateUse[] = []
  for (const f of files) {
    const lines = f.text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      HARDCODED_DATE_PATTERN.lastIndex = 0
      let m = HARDCODED_DATE_PATTERN.exec(line)
      while (m !== null) {
        const date = m[1]
        if (date !== undefined && isWritePosition(line, date)) {
          out.push({ file: f.file, line: i + 1, date })
        }
        m = HARDCODED_DATE_PATTERN.exec(line)
      }
    }
  }
  return out
}

/**
 * **找出「日历漂移型红」的风险**（守卫的判定式）。
 *
 * ⚠️ **三条同时成立**才算风险：
 *   ① 生产代码里那个表有相对窗口（`findRelativeWindowUses`）；
 *   ② 测试用例**调用了**那个方法（`.<method>(`）；
 *   ③ 同一个测试用例里**写死了**一个日历日期。
 *
 * ⚠️ **②③ 必须同一个用例** —— 不同用例里的日期与调用互不相干（那不是风险）。
 *
 * @param production 生产源码
 * @param tests 测试源码
 */
export function findTimeDriftRisks(
  production: readonly SourceFile[],
  tests: readonly SourceFile[],
): TimeDriftRisk[] {
  const uses = findRelativeWindowUses(production)
  if (uses.length === 0) return []
  const out: TimeDriftRisk[] = []

  for (const file of tests) {
    for (const block of splitTestBlocks(file)) {
      const blockLines = block.text.split('\n')
      for (const use of uses) {
        if (use.method === '') continue
        // ② 这个用例**调用了**相对窗口那个方法吗？
        const callPattern = new RegExp(`\\.\\s*${use.method}\\s*\\(`, 'u')
        let called = false
        let calledLine = block.startLine
        for (let i = 0; i < blockLines.length; i += 1) {
          if (callPattern.test(blockLines[i]!)) {
            called = true
            calledLine = block.startLine + i
            break
          }
        }
        if (!called) continue
        // ③ 同一个用例里**写死了**日期吗？
        for (let i = 0; i < blockLines.length; i += 1) {
          const line = blockLines[i]!
          HARDCODED_DATE_PATTERN.lastIndex = 0
          let m = HARDCODED_DATE_PATTERN.exec(line)
          while (m !== null) {
            const date = m[1]
            if (date !== undefined && isWritePosition(line, date)) {
              out.push({
                table: use.table,
                method: use.method,
                production: use,
                test: { file: file.file, line: block.startLine + i, date },
              })
            }
            m = HARDCODED_DATE_PATTERN.exec(line)
          }
        }
        void calledLine
      }
    }
  }
  return out
}
