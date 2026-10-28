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
// 1. **生产代码里有相对窗口** —— **两种形态**：
//    ① **SQL 形态** —— SQL 里出现 `date('now'` / `datetime('now'` / `julianday('now'`
//       （**表名从同一段 SQL 里取** —— ⚠️ **必须按「语句」取，不能逐行取**：
//       `FROM local_events` 与 `WHERE day >= date('now', ?)` 常常**不在同一行**
//       ⇒ 逐行取表名 ⇒ 表名取不到 ⇒ **整个 use 不报** ⇒ **守卫没在守事故现场那一处**
//       （2026-10-22 实测：`packages/core/src/repos/localEvents.ts` 正是这个形状））；
//    ② **JS 形态** —— 「当下时刻减去一个时长」（`Date.now() - 7 * 86_400_000`、
//       `new Date().getTime() - days * 24 * 60 * 60 * 1000`）——
//       ⚠️ JS 侧**本来就没有表** ⇒ `table` 留**空串**；表名**只作附加信息**报出，
//       **不参与**判定（否则 JS 形态会被漏报）。
// 2. **该相对窗口在某个方法里** —— 方法名从源码上下文取（`summary` 之类）；
// 3. **某个测试用例同时具备**：① 调用那个方法 ② **写死**了一个日历日期。
//
// ⇒ 三条**同时**成立才算风险 ⇒ **不会**把「测试里随便写了个日期」与
//   「生产代码里有个相对窗口」当成一回事（那是两种不同的事）。
//
// ## ⚠️ 两种形态的取法不一样（各有限制，别互相迁就）
//
// - **SQL 形态**：**表名取不到就不报**（报一个不知道表的相对窗口，用户不知道该看哪儿）。
//   ⚠️ **表名按「整段 SQL 语句」取**（语句可能跨多行）—— 逐行取会把上头那条漏掉。
// - **JS 形态**：⚠️ **只认「减法 ＋ 时长」** —— `Date.now()` **单独出现不算**
//   （本仓 `source-scan/scan.ts` 的 scan id 就是 `Date.now()`，那是**标识**不是**窗口**）。
//   ⚠️ 减数**必须带时间单位换算**（`7 * 86_400_000` / `TTL_MS`）——
//   `Date.now() - 7`（减个常数）**不是**窗口。
//   ⚠️ **驼峰标识符不算单位** —— `now - startedMs` 是「算已过时长」不是窗口，
//   认了会误报 ⇒ 只有**数字换算因子**或**全大写常量的单位词**才让减数成为「时长」。
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
  /**
   * 涉及的表。
   *
   * ⚠️ **空串 = JS 形态的相对窗口**（JS 侧本来就没有表）⇒ 表名**只作附加信息**报出，
   *   **不参与**判定（若按表匹配，JS 形态会被漏报）。
   */
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
  /**
   * 涉及的表。
   *
   * ⚠️ **空串 = 风险来自 JS 形态的相对窗口**（JS 侧没有表）⇒ 那是**附加信息**，
   *   不影响「三条同时成立」的判定。
   */
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

/**
 * JS 侧的「当下时刻」表达式。
 *
 * ⚠️ **只认这几种**：`Date.now()` / `new Date().getTime()` / `new Date().valueOf()` /
 *   `new Date()`（**空参**）。
 * ⚠️ **顺序要紧**：长写法必须在前 —— 否则 `new Date()` 会把 `new Date().getTime()` 截短。
 * ⚠️ `new Date('2026-10-14')`（**带参**）**不是**「当下」⇒ 不认（正则要求空参）。
 */
const JS_NOW_PATTERN =
  /\b(?:Date\s*\.\s*now\s*\(\s*\)|new\s+Date\s*\(\s*\)\s*\.\s*getTime\s*\(\s*\)|new\s+Date\s*\(\s*\)\s*\.\s*valueOf\s*\(\s*\)|new\s+Date\s*\(\s*\))/g

/**
 * 时长的**数值单位因子**（去下划线后比较）：时／分／秒／毫秒的换算。
 *
 * ⚠️ **为什么要有这张表**：减数必须**带单位**才算「时长」——
 *   `Date.now() - 7 * 86_400_000`（7 天）是窗口，`Date.now() - 7`（7 毫秒）不是。
 */
const DURATION_UNIT_NUMBERS = new Set([
  '24', // 小时／天
  '60', // 秒／分
  '1000', // 毫秒／秒
  '3600', // 秒／时
  '86400', // 秒／天
  '60000', // 毫秒／分
  '3600000', // 毫秒／时
  '86400000', // 毫秒／天
  '604800', // 秒／周
  '604800000', // 毫秒／周
])

/**
 * 时长的**单位词**（**只用于全大写常量**，如 `TTL_MS` / `SEVEN_DAYS`）。
 *
 * ⚠️ **为什么不用驼峰**：`startedMs` 这类名字既可能是「时长」也可能是「另一个时间戳」
 *   （`now - startedMs` 是**算已过时长**，不是窗口）⇒ 认了会误报 ⇒ 驼峰一律不算单位。
 */
const DURATION_UNIT_WORDS = new Set([
  'MS',
  'MILLISECOND',
  'MILLISECONDS',
  'SEC',
  'SECS',
  'SECOND',
  'SECONDS',
  'MIN',
  'MINS',
  'MINUTE',
  'MINUTES',
  'HOUR',
  'HOURS',
  'DAY',
  'DAYS',
  'WEEK',
  'WEEKS',
])

/**
 * 词法切分：**先切字符串**（含模板串），**再切注释**。
 *
 * ⚠️ **为什么**：注释里常写示例代码（`// 截止 = Date.now() - 7 * 86_400_000`）——
 *   那不是代码 ⇒ 认成「相对窗口」就是误报。
 * ⚠️ **先切字符串** ⇒ 字符串里的 `//`（URL）与 `/*` 不算注释。
 */
const LEX_TOKEN_PATTERN =
  /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

/** 表名（`FROM x` / `JOIN x`）。 */
const TABLE_PATTERN = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi

/**
 * **字符串字面量**（含模板串，**可跨行**）。
 *
 * ⚠️ **为什么按「字符串」切而不是按「行」扫**：
 *   SQL 的 `FROM x` 与 `date('now')` 常常**不在同一行**
 *   （`SELECT … FROM local_events WHERE day >= date('now', ?)` 写成多行是本仓的常态）
 *   ⇒ 逐行取表名会**整片漏报**。
 *   ⇒ **以「一段 SQL 字符串」为取名单位** ⇒ 表名与相对窗口必然同段。
 *
 * ⚠️ **正则字面量不算字符串** —— 守卫自己的 `/\bdate\s*\(\s*'now'/i` 不会被误认成 SQL。
 */
const STRING_LITERAL_PATTERN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g

/** 方法声明（**两格缩进**的成员函数 —— 本仓的成员方法都是这个形状）。 */
const METHOD_DECL_PATTERN = /^\s{2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*[(<]/u

/** 写死的日历日期（带引号的 `YYYY-MM-DD`，后面可跟时间部分）。 */
const HARDCODED_DATE_PATTERN =
  /'(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?Z?)?'/gu

/** 「时长」表达式里的一个因子。 */
interface DurationFactor {
  /** 数字因子还是标识符因子 */
  kind: 'num' | 'ident'
  /** 因子原文（数字保留下划线，判定时再去） */
  value: string
}

/** 数字因子（**粘性**匹配 ⇒ 必须从当前位置起）。 */
const NUMBER_FACTOR_PATTERN = /\d[\d_]*/y

/** 标识符因子。 */
const IDENT_FACTOR_PATTERN = /[A-Za-z_$][\w$]*/y

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
 * 把**注释**抹白（长度与换行位置不变 ⇒ 行号仍对得上）。
 *
 * @param text 原文
 */
function stripComments(text: string): string {
  return text.replace(LEX_TOKEN_PATTERN, (token) =>
    token.startsWith('//') || token.startsWith('/*') ? token.replace(/[^\n]/gu, ' ') : token,
  )
}

/**
 * 逐行记下「当前所在方法」（往上找最近的方法声明）。
 *
 * ⚠️ **与 SQL 形态共用同一份方法表** ⇒ 两种形态取到的方法名口径一致。
 *
 * @param lines 源码行
 */
function collectMethodsByLine(lines: readonly string[]): string[] {
  const out: string[] = []
  let method = ''
  for (const line of lines) {
    const decl = METHOD_DECL_PATTERN.exec(line)
    if (decl?.[1] !== undefined) method = decl[1]
    out.push(method)
  }
  return out
}

/**
 * 读「减数」—— 一个**乘积**形态的表达式（`7 * 86_400_000` / `days * 24 * 60 * 60 * 1000`）。
 *
 * ⚠️ **只读乘积**：加法（`now - (a + b)`）不是时长 ⇒ 读不出来就是「不是时长」。
 *
 * @param text 全文
 * @param from 起点（紧跟减号之后）
 */
function readDurationFactors(text: string, from: number): DurationFactor[] | null {
  let i = from
  const skipSpace = (): void => {
    while (i < text.length && /\s/u.test(text[i] ?? '')) i += 1
  }
  skipSpace()
  let parenthesized = false
  if (text[i] === '(') {
    parenthesized = true
    i += 1
    skipSpace()
  }
  const factors: DurationFactor[] = []
  for (;;) {
    NUMBER_FACTOR_PATTERN.lastIndex = i
    const num = NUMBER_FACTOR_PATTERN.exec(text)
    if (num) {
      factors.push({ kind: 'num', value: num[0] })
      i = NUMBER_FACTOR_PATTERN.lastIndex
    } else {
      IDENT_FACTOR_PATTERN.lastIndex = i
      const ident = IDENT_FACTOR_PATTERN.exec(text)
      if (!ident) break
      factors.push({ kind: 'ident', value: ident[0] })
      i = IDENT_FACTOR_PATTERN.lastIndex
    }
    skipSpace()
    if (text[i] === '*') {
      i += 1
      skipSpace()
      continue
    }
    break
  }
  if (factors.length === 0) return null
  if (parenthesized) {
    skipSpace()
    // ⚠️ 括号没闭合 ⇒ 读的不是一个完整的减数 ⇒ 不认
    if (text[i] !== ')') return null
  }
  return factors
}

/**
 * 这个因子**带不带时间单位**。
 *
 * @param factor 因子
 */
function carriesDurationUnit(factor: DurationFactor): boolean {
  if (factor.kind === 'num') {
    // ⚠️ 同一个毫秒数的写法五花八门（`86_400_000` / `86400000`）⇒ 去下划线后再比
    return DURATION_UNIT_NUMBERS.has(factor.value.replace(/_/gu, ''))
  }
  // ⚠️ **只认全大写常量**（`TTL_MS` / `SEVEN_DAYS`）—— 驼峰分不清「时长」与「另一个时间戳」
  if (!/^[A-Z][A-Z0-9_]*$/u.test(factor.value)) return false
  return factor.value.split('_').some((part) => DURATION_UNIT_WORDS.has(part))
}

/**
 * 某个下标在第几行（1 起）。
 *
 * @param code 源码
 * @param offset 下标
 */
function countLineBefore(code: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i += 1) {
    if (code.charCodeAt(i) === 10) line += 1
  }
  return line
}

/** SQL 形态的一处「相对窗口」命中。 */
interface SqlRelativeNowHit {
  /** `date('now')` 所在行（1 起） */
  line: number
  /** **同一段 SQL 里**涉及的表（**可能为空** ⇒ 那就不报） */
  tables: string[]
}

/**
 * 找 **SQL 形态**的相对窗口 —— **以「一段 SQL 字符串」为单位**。
 *
 * ⚠️ **为什么不是逐行扫**：表名（`FROM local_events`）与相对窗口（`date('now', ?)`）
 *   常常**不在同一行** ⇒ 逐行扫取不到表名 ⇒ 表名为空 ⇒ 整个 use 被丢掉
 *   ⇒ **守卫根本没在守那次事故的现场那一处**（2026-10-22 实测）。
 *
 * @param code 已抹掉注释的源码
 */
function findSqlRelativeNows(code: string): SqlRelativeNowHit[] {
  const out: SqlRelativeNowHit[] = []
  STRING_LITERAL_PATTERN.lastIndex = 0
  let m = STRING_LITERAL_PATTERN.exec(code)
  while (m !== null) {
    const text = m[0]
    // 段内**第一个**相对窗口写法的位置（用来定位行号）
    let relIdx = -1
    for (const p of RELATIVE_NOW_PATTERNS) {
      const idx = text.search(p)
      if (idx >= 0 && (relIdx < 0 || idx < relIdx)) relIdx = idx
    }
    if (relIdx >= 0) {
      const tables = new Set<string>()
      TABLE_PATTERN.lastIndex = 0
      let t = TABLE_PATTERN.exec(text)
      while (t !== null) {
        const name = t[1]
        if (name !== undefined) tables.add(name.toLowerCase())
        t = TABLE_PATTERN.exec(text)
      }
      out.push({ line: countLineBefore(code, m.index + relIdx), tables: [...tables] })
    }
    m = STRING_LITERAL_PATTERN.exec(code)
  }
  return out
}

/** JS 侧的一处相对窗口命中。 */
interface JsRelativeWindowHit {
  /** 行号（1 起） */
  line: number
}

/**
 * 找 JS 形态的相对窗口 —— **「当下时刻减去一个时长」**。
 *
 * ⚠️ **只认减法 ＋ 时长**：`Date.now()` 单独出现（当 scan id 用）**不算**相对窗口。
 *
 * @param code 已抹掉注释的源码
 */
function findJsRelativeWindows(code: string): JsRelativeWindowHit[] {
  const out: JsRelativeWindowHit[] = []
  JS_NOW_PATTERN.lastIndex = 0
  let m = JS_NOW_PATTERN.exec(code)
  while (m !== null) {
    let i = m.index + m[0].length
    while (i < code.length && /\s/u.test(code[i] ?? '')) i += 1
    // ⚠️ **必须有减号** —— `Date.now()` 单独出现不是窗口
    if (code[i] === '-') {
      const factors = readDurationFactors(code, i + 1)
      // ⚠️ 减数必须**带时间单位** ⇒ 减个常数（`now - 7`）不算窗口
      if (factors !== null && factors.some(carriesDurationUnit)) {
        out.push({ line: countLineBefore(code, m.index) })
      }
    }
    m = JS_NOW_PATTERN.exec(code)
  }
  return out
}

/**
 * 找生产代码里的「相对窗口」用法（**SQL 形态 ＋ JS 形态**）。
 *
 * @param files 生产源码
 */
export function findRelativeWindowUses(files: readonly SourceFile[]): RelativeWindowUse[] {
  const out: RelativeWindowUse[] = []
  for (const f of files) {
    // ⚠️ **先抹掉注释** —— 注释里的示例代码不是代码（否则 JS 形态会误报）
    const code = stripComments(f.text)
    const lines = code.split('\n')
    const methods = collectMethodsByLine(lines)

    // ① **SQL 形态** —— ⚠️ **按「整段 SQL」取表名**（表名与 `date('now')` 常常不同行）
    for (const hit of findSqlRelativeNows(code)) {
      // ⚠️ **表名取不到就不报** —— 报一个不知道表的相对窗口，用户不知道该看哪儿
      for (const table of hit.tables) {
        out.push({ file: f.file, line: hit.line, table, method: methods[hit.line - 1] ?? '' })
      }
    }

    // ② **JS 形态** —— 「当下时刻减去一个时长」（⚠️ **没有表** ⇒ `table` 留空串）
    for (const hit of findJsRelativeWindows(code)) {
      out.push({ file: f.file, line: hit.line, table: '', method: methods[hit.line - 1] ?? '' })
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
    // ⚠️ **测试侧也要抹注释** —— 被注释掉的造数语句**不会执行** ⇒ 不会漂
    const lines = stripComments(f.text).split('\n')
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
 *   ① 生产代码里那个方法有相对窗口（`findRelativeWindowUses` —— SQL 形态或 JS 形态都算）；
 *   ② 测试用例**调用了**那个方法（`.<method>(`）；
 *   ③ 同一个测试用例里**写死了**一个日历日期。
 *
 * ⚠️ **②③ 必须同一个用例** —— 不同用例里的日期与调用互不相干（那不是风险）。
 *
 * ⚠️ **不按表匹配** —— JS 形态的相对窗口**没有表**（`table` 为空串）⇒
 *   若按表匹配，JS 形态会被整片漏报 ⇒ 表名只作**附加信息**报出。
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
    // ⚠️ **测试侧也要抹注释** —— 被注释掉的造数语句**不会执行** ⇒ 不会漂
    //   （否则「注释里留个写死日期」会把守卫打成满仓红 ⇒ 守卫被无视）
    const stripped: SourceFile = { file: file.file, text: stripComments(file.text) }
    for (const block of splitTestBlocks(stripped)) {
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
