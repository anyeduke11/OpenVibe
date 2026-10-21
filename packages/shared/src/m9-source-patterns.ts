// `packages/shared/src/m9-source-patterns.ts` —— M9 v1.6 **P4 的「知识点 ↔ 代码模式」登记表**
// （`m9-dev-language-roadmap.md` §3.8 / §3.10 · dev-plan §6.10 P4.1 / P4.2）
//
// ## 它是什么
//
// 一张表：**每个可被源码识别的知识点，对应哪种代码模式**。
// §3.8 举的例子是「「`defer` 语句」对应「代码里出现 `defer ` 关键字」」——
// 本文件就是那句话的**可执行形态**。
//
// ## ⚠️ 为什么是**代码里的静态表**而不是库里的列
//
// §3.1 的 `lang_topics` 只有十一列，**没有「代码模式」这一列**；
// 而 §3.1 的纪律是「规格没列的字段不主动加」（0011 迁移纪律）。
// ⇒ 模式表**不落表**、随代码走（同 §3.22 四块静态内容的处置：`m9-panels.ts`）。
//
// ⚠️ 代价（如实登记）：**模式表与 `lang_topics` 会分叉** ——
// 模式表里写了一个库里没有的 slug ⇒ 那一项永远匹配不到任何知识点。
// ⇒ 由 `m9-source-patterns.test.ts` 的**孤儿检查**钉住（模式表的每个 slug
//   都必须在 `lang_topics` 里存在）。
//
// ## ⚠️ 「节点判定」与「启发式判定」是**两列**，不是两套表
//
// - `node_spec`：**解析器**侧的判定（Python `ast` 节点 / Go `go/parser` 节点）。
//   它是**精确**的 ⇒ 命中的结果标 `confirmed`。
// - `heuristic_src`：**正则**侧的判定（只给 Go 有 —— §3.8 只给 Go 定义了回退路径）。
//   它是**粗**的 ⇒ 命中的结果标 `possible`。
//
// ### DL-19：为什么两列必须是「子集关系」而不是「各写各的」
//
// §3.8.2 第 3 条：「回退只允许**精度下降**，不允许**结果减少** ——
// parser 认出的集合必须 ⊇ 正则认出的集合」。
//
// ⇒ 本文件里**每个**带 `heuristic_src` 的模式，其正则都必须是该模式
//   **解析器判定的一个子情形**（例：`go func(` 一定是 `GoStmt`；
//   `defer` 这个词只出现在 `DeferStmt` 里）。
// ⇒ 由 `m9-source-patterns.test.ts` 的**子集自证腿**在真实样本上实测。
//
// ## ⚠️ `pattern_name` 与落库的 `matched_pattern` **不是同一个东西**
//
// - `pattern_name`：**规范的模式名**（'go func()' / 'defer ' / 'ast.Call'）——
//   给界面显示，给人看「这是哪一类」。
// - 落库 `lang_topic_findings.matched_pattern`：**命中的那段源码文本**
//   （例：`go func() { fmt.Println("a") }()`）。
//   ⚠️ 必须是**可 grep 的字面串** —— §3.10 的导出要求（DL-22）是
//   「`grep -n '<matched_pattern>' <项目目录>` 必须命中它声称的 file:line」
//   ⇒ 存规范名（如 'ast.Call'）就 grep 不到 ⇒ **存实例文本**。
//   规范名仍然保留在本表里（界面显示用）。
import type { LangCode } from './m9-roadmap'

/** 一条「知识点 ↔ 代码模式」登记。 */
export interface SourcePattern {
  /** 模式 id（稳定标识，落库与界面都用它） */
  id: string
  /** 所属语言 */
  lang: LangCode
  /** 知识点 slug（对应 `lang_topics.slug`；⚠️ 孤儿检查的对象） */
  topic_slug: string
  /** **规范**模式名（界面显示；⚠️ **不是**落库的 `matched_pattern`） */
  pattern_name: string
  /**
   * **解析器**判定式。
   *
   * 语法（两种语言各一套，helper 侧解释）：
   * - Go：`<节点类型名>`，例 `GoStmt` / `ChanType` / `FuncLit`。
   * - Python：`<节点类型名>` 或 `<节点类型名>:<条件>`，条件两档：
   *   - `module=<模块名>` —— `Import` / `ImportFrom` 的模块名等于它；
   *   - `decorator` —— `FunctionDef` / `AsyncFunctionDef` / `ClassDef` **带装饰器**。
   */
  node_spec: string
  /**
   * **启发式**（正则）判定式的源码；**缺省 = 这个模式没有正则版本**。
   *
   * ⚠️ 只给 Go 用（§3.8 只给 Go 定义了回退路径）。
   * ⚠️ 必须是 `node_spec` 的**子情形**（见文件头 DL-19 那节）。
   */
  heuristic_src?: string
}

/**
 * 模式表（**单源**）。
 *
 * ⚠️ 覆盖范围如实登记：本轮覆盖 **Python 13 条 ＋ Go 13 条**，
 *   即 78 个语言级知识点里的 26 个（其余 52 个**没有**可静态识别的代码模式 ——
 *   比如「Python3 环境搭建」「Python3 pip」这种，源码里根本没有对应痕迹）。
 *   ⇒ 「扫不到」是**诚实结果**，不是漏扫；界面上未命中的知识点不谎称命中。
 */
export const SOURCE_PATTERNS: readonly SourcePattern[] = [
  // ───────────────────────── Python（`ast`）─────────────────────────
  {
    id: 'py-import-logging',
    lang: 'python',
    topic_slug: 'python-logging',
    pattern_name: 'import logging',
    node_spec: 'Import:module=logging',
  },
  {
    id: 'py-import',
    lang: 'python',
    topic_slug: 'python3-module',
    pattern_name: 'import',
    node_spec: 'Import',
  },
  {
    id: 'py-from-import',
    lang: 'python',
    topic_slug: 'python3-module',
    pattern_name: 'from ... import',
    node_spec: 'ImportFrom',
  },
  {
    id: 'py-decorator',
    lang: 'python',
    topic_slug: 'python-decorators',
    pattern_name: '@decorator',
    node_spec: 'FunctionDef:decorator',
  },
  {
    id: 'py-class',
    lang: 'python',
    topic_slug: 'python3-class',
    pattern_name: 'class',
    node_spec: 'ClassDef',
  },
  {
    id: 'py-try',
    lang: 'python',
    topic_slug: 'python3-errors-execptions',
    pattern_name: 'try/except',
    node_spec: 'Try',
  },
  {
    id: 'py-with',
    lang: 'python',
    topic_slug: 'python3-with-keyword',
    pattern_name: 'with',
    node_spec: 'With',
  },
  {
    id: 'py-lambda',
    lang: 'python',
    topic_slug: 'python-lambda',
    pattern_name: 'lambda',
    node_spec: 'Lambda',
  },
  {
    id: 'py-comprehension',
    lang: 'python',
    topic_slug: 'python-comprehensions',
    pattern_name: 'comprehension',
    node_spec: 'Comprehension',
  },
  {
    id: 'py-global',
    lang: 'python',
    topic_slug: 'python3-namespace-scope',
    pattern_name: 'global/nonlocal',
    node_spec: 'Global',
  },
  {
    id: 'py-yield',
    lang: 'python',
    topic_slug: 'python3-iterator-generator',
    pattern_name: 'yield',
    node_spec: 'Yield',
  },
  {
    id: 'py-annotation',
    lang: 'python',
    topic_slug: 'python-type-hints',
    pattern_name: 'annotation',
    node_spec: 'AnnAssign',
  },
  {
    id: 'py-fstring',
    lang: 'python',
    topic_slug: 'python3-string',
    pattern_name: 'f-string',
    node_spec: 'JoinedStr',
  },

  // ───────────────────────── Go（`go/parser` ＋ 正则回退）─────────────────────────
  {
    id: 'go-goroutine',
    lang: 'go',
    topic_slug: 'go-concurrent',
    pattern_name: 'go func()',
    node_spec: 'GoStmt',
    // ⚠️ 正则是 `GoStmt` 的**子情形**：`go func(` 一定是 goroutine 语句
    heuristic_src: '\\bgo\\s+func\\s*\\(',
  },
  {
    id: 'go-defer',
    lang: 'go',
    topic_slug: 'go-error-handling',
    pattern_name: 'defer',
    node_spec: 'DeferStmt',
    // ⚠️ `defer` 是关键字，只出现在 `DeferStmt` 里
    heuristic_src: '\\bdefer\\b',
  },
  {
    id: 'go-chan',
    lang: 'go',
    topic_slug: 'go-concurrent',
    pattern_name: 'chan',
    node_spec: 'ChanType',
    // ⚠️ `chan` 是类型关键字，文本里每处 `chan` 都对应一个 `ChanType` 节点
    heuristic_src: '\\bchan\\b',
  },
  {
    id: 'go-select',
    lang: 'go',
    topic_slug: 'go-concurrent',
    pattern_name: 'select',
    node_spec: 'SelectStmt',
    heuristic_src: '^\\s*select\\s*\\{',
  },
  {
    id: 'go-struct',
    lang: 'go',
    topic_slug: 'go-structures',
    pattern_name: 'struct',
    node_spec: 'StructType',
    heuristic_src: '\\bstruct\\b',
  },
  {
    id: 'go-interface',
    lang: 'go',
    topic_slug: 'go-interfaces',
    pattern_name: 'interface',
    node_spec: 'InterfaceType',
    heuristic_src: '\\binterface\\b',
  },
  {
    id: 'go-map',
    lang: 'go',
    topic_slug: 'go-map',
    pattern_name: 'map',
    node_spec: 'MapType',
    heuristic_src: '\\bmap\\[',
  },
  {
    id: 'go-range',
    lang: 'go',
    topic_slug: 'go-range',
    pattern_name: 'range',
    node_spec: 'RangeStmt',
    heuristic_src: '\\brange\\b',
  },
  {
    id: 'go-funclit',
    lang: 'go',
    topic_slug: 'go-functions',
    pattern_name: 'func literal',
    node_spec: 'FuncLit',
    // ⚠️⚠️ **刻意不配正则**（本轮实测出来的，不是偷懒）：
    //   函数**字面量**与函数**类型**在文本上不可区分 ——
    //   ① `map[string]func(*Server, *tls.Conn, Handler){`（map 类型位 + 字面量花括号）
    //   ② `func f() func(req *Request, bool) {`（**返回值**位置的类型 + 外层函数体花括号）
    //   两者都长得像「`func(...)` 后面跟一个 `{`」⇒ 正则会把**类型**当成字面量
    //   ⇒ 打破 DL-19 的「parser ⊇ 正则」。
    //   ⇒ 启发式路径**不报**这一条（宁可少报，不错报）——
    //   这正是 §3.8.2 允许的「回退只降精度、不减结果」。
    //   ⚠️ 实测样本：Go 标准库 `src/net/http`（107 个 .go 文件）⇒ 修这一条前有 9 处违规。
  },
  {
    id: 'go-import',
    lang: 'go',
    topic_slug: 'go-modules',
    pattern_name: 'import',
    node_spec: 'ImportSpec',
  },
  {
    id: 'go-typeswitch',
    lang: 'go',
    topic_slug: 'go-decision-making',
    pattern_name: 'type switch',
    node_spec: 'TypeSwitchStmt',
  },
  {
    id: 'go-send',
    lang: 'go',
    topic_slug: 'go-concurrent',
    pattern_name: 'channel send',
    node_spec: 'SendStmt',
  },
  {
    id: 'go-recv',
    lang: 'go',
    topic_slug: 'go-concurrent',
    pattern_name: 'channel receive',
    node_spec: 'RecvStmt',
  },
]

/** 按语言取模式（**单源** ⇒ 调用点不自己筛）。 */
export function patternsForLang(lang: LangCode): readonly SourcePattern[] {
  return SOURCE_PATTERNS.filter((p) => p.lang === lang)
}

/** 模式表里出现过的知识点 slug（**集合**，用于孤儿检查的另一半）。 */
export function patternTopicSlugs(): readonly string[] {
  return [...new Set(SOURCE_PATTERNS.map((p) => p.topic_slug))]
}
