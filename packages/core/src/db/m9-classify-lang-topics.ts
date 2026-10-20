// `packages/core/src/db/m9-classify-lang-topics.ts` —— M9 v1.6 P1.4（`m9-dev-plan-2026-10.md` §6.2）
//
// 按 `docs/specs/m9-dev-language-roadmap.md` §1.4 的可复算分类规则给 runoob
// inventory 标题打 kind。⚠️ **kind 是 §3.1 schema 的字段**（`language` | `library`
// 二值）；本模块的「严格库级」是**统计口径**（30 条 = 84 × 35.7%），与 kind 字段不
// 是一回事 —— 详见函数 `strictLibraryClassifier` 的 doc。
//
// 分类规则（§1.4 第 95、100 行）：
//   "标题含「模块/库/驱动」或落在第三方名清单 ⇒ 库级"
//   其他归 language；§1.4 把 84 条分三档（语言知识点 44 / 库级 31 / 环境与杂项 9），
//   "环境与杂项"按 §1.4 第 113 行「library 进按需查阅区」也归 library。
//
// 设计要点：
//   - **单源**：`THIRD_PARTY_NAMES` 是第三方名清单的唯一出处，加新名只改这里。
//   - **可复算**：同一份 inventory 跑出来结果逐字一致。
//   - **可测**：导出 `strictLibraryClassifier` 与 `classifyKind` 两个纯函数，
//     让 DL-13 单测对它们各发断言。
//
// 关于"环境与杂项"归 library 的登记：本轮**没改 §3.1 schema**，故 §1.4 第 99–101
// 行第三档 9 条统一归 `kind='library'`。`strictLibraryClassifier` 不识别"环境与杂项"
// —— 它只识别 §1.4 严格定义的"库级"30 条 —— 故 DL-13 复算跑的是严格口径。
//
// 如需 §1.4 完整三档，可在 §3.1 schema 加 `tooling` 第三值后再开新分类器；
// 本轮不动 schema 是因 §3.1 已被 DL-13 v1.0 收口、二值改三值属 B 级规格改动。

/**
 * §1.4 第三方名清单（小写匹配，**单源**，加新名只改这里）。
 *
 * 入选原则：
 *   1. 是 Python / Go 标准库以外、但 runoob 把它当独立条目收录的"库"。
 *   2. 是 Python / Go 标准库本身（如 logging、re、asyncio）—— 这些**算库级**，
 *      因 spec §1.4 把它们列在「库级 31」举例里（"logging、pickle、subprocess、
 *      queue、re、csv、threading、asyncio…"）。
 *   3. **不**入选：教程首页、IDE 设置、测验 —— 这些属"环境与杂项"，由
 *      关键词命中识别，不在第三方清单里。
 *
 * ⚠️ **不**收录"通用英文单词"（`file`、`os`、`math`、`random`、`operator`）——
 * 它们作为 Python 模块名存在，但 §1.4 第 100 行的 30 条没把它们列入"库级"。
 * 这些条目靠"模块"关键词命中（标题里都含"X 模块"）。
 *
 * ⚠️ **不**收录 `cgi` —— "Python3 CGI编程"标题语义模糊（教程内容 vs cgi 库），
 * §1.4 第 100 行没把它列入库级。剔除以避免边界争议。
 */
const THIRD_PARTY_NAMES = [
  // §1.4 第 100 行 Python stdlib 举例（8 个）
  'logging', 'pickle', 'subprocess', 'queue', 're', 'csv', 'threading', 'asyncio',
  // 同源扩展：runoob 单列的 Python stdlib（§1.4 第 100 行未举例但同档）
  'urllib', 'sys', 'stringio', 'datetime', 'json', 'xml', 'smtplib',
  // §1.4 第 100 行 Python 第三方举例（5 个）
  'mysql', 'mongodb', 'scrapy', 'selenium', 'pyqt',
  // 同源扩展：连接器与同族第三方库
  'mysql-connector', 'pymysql', 'requests', 'openai', 'statistics', 'hashlib',
  'pyecharts', 'beautifulsoup', 'markdown',
] as const

/**
 * 关键词命中即识别为「库级」的标题子串（不含第三方名清单）。
 *
 * 入选原则：标题里出现「模块 / 库 / 驱动」三个字样之一（spec §1.4 显式给的规则）。
 *
 * ⚠️ **「库」字在「标准库」语境下不命中** —— "Python3 标准库概览"是 §1.4 第 101
 * 行"环境与杂项"档，按 §1.4 第 113 行归 library（不进学习路线），但**不是**严格
 * 库级 —— 故严格口径要排除。
 */
const KEYWORD_LIBRARY_HITS = ['模块', '驱动'] as const

/**
 * 关键词命中即识别为「环境与杂项」（§1.4 第 101 行：教程/简介/环境搭建/
 * Pycharm/VScode/测验/资源）。
 *
 * **本轮处置**：按 §1.4 第 113 行「library 进按需查阅区」归 `kind='library'`，
 * 不进学习路线主体。
 */
const KEYWORD_ENV_HITS = [
  // §1.4 第 101 行明列（Python 7 词组）
  '教程', '简介', '环境搭建', 'PYCHARM', 'VSCODE', '测验',
  // 同源扩展：runoob Go 34 条里的"Go 语言环境安装"标题含此
  '环境安装',
  // 同源扩展：runoob Python 84 条里的"Python3 标准库概览"标题含此
  '概览',
  // 推广项
  '有用的资源',
  // §1.4 没明列但语义同档（虚拟环境是教程性索引）
  '虚拟环境', '开发工具',
  // ⚠️ **刻意不含「实例」「类型注解」**（P1.7 开工时发现，P1.4 规则缺陷）：
  //   这两个词过泛 ——「Python3 实例」（面向对象的实例）与「Python 类型注解」
  //   都是**语言知识点**（§3.7 第 534 行明确把「类型注解」列为 Python 语言专有条目），
  //   却被「环境与杂项」关键词误伤成 library ⇒ 同样进不了 DAG。
  //   ⇒ **关键词命中 ≠ 语义命中**；过泛的词宁可不收。
] as const

/** 把标题规整为可匹配的形态：去前后空白；不做大小写归一（关键词是中文）。 */
function normTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

/** 标题是否含第三方名（大小写不敏感）。 */
function hasThirdParty(title: string): boolean {
  const t = title.toLowerCase()
  return THIRD_PARTY_NAMES.some((name) => t.includes(name))
}

/**
 * 「<语言> 模块」形态 —— 讲的是**模块这个概念本身**，不是某个库。
 *
 * ⚠️ **这条例外是 P1.7 开工时才发现的**（P1.4 的规则缺陷，跨期传导）：
 *   「Python3 模块」标题含「模块」⇒ 被原规则判成库级 ⇒ 它进不了 DAG。
 *   但它恰恰是 spec §1.4 第 109–111 行点名的**「源顺序 ≠ 依赖」反例主角**
 *   （「侧栏位次：Python3 模块 = #28 …… Python logging 模块 = #76」），
 *   也是 §3.6 站 2「函数与模块」的核心节点。
 *   ⇒ 关键词命中 ≠ 语义命中：**「<语言名> 模块」是语言知识点，「logging 模块」才是库级。**
 *
 * 判定：标题去掉语言前缀后恰好等于「模块」（允许中间有空格/版本号）。
 */
const LANGUAGE_MODULE_EXCEPTIONS = [
  /^Python\s*3?\s*模块$/,
  /^Go\s*模块$/,
  /^Go\s*Modules$/,
]

/**
 * 标题是否含「库级」关键词。
 *
 * 规则：
 *   - 含「模块」或「驱动」→ 命中，**但**「<语言> 模块」形态除外（见上）
 *   - 含「库」但**不在「标准库」语境** → 命中
 *   - 含「标准库」→ 不命中（归环境与杂项 / language，由 §1.4 第 113 行决定）
 */
function hasLibraryKeyword(title: string): boolean {
  if (LANGUAGE_MODULE_EXCEPTIONS.some((re) => re.test(title))) return false
  if (KEYWORD_LIBRARY_HITS.some((kw) => title.includes(kw))) return true
  if (title.includes('库') && !title.includes('标准库')) return true
  return false
}

/** 标题是否属「环境与杂项」档（§1.4 第 101 行）。 */
function hasEnvKeyword(title: string): boolean {
  const upper = title.toUpperCase()
  return KEYWORD_ENV_HITS.some((kw) => upper.includes(kw.toUpperCase()))
}

/**
 * §1.4 严格库级分类器 —— DL-13 复算口径。
 *
 * 严格识别"§1.4 第 100 行库级 30 条"那一档（不被"环境与杂项"污染）。
 *
 * 规则：`标题含「模块/驱动」` OR `标题含「库」但非「标准库」` OR
 * `标题含第三方名` ⇒ 库级。
 *
 * **不**识别"环境与杂项"档（教程/简介/环境搭建…）—— 这些按 §1.4 第 113 行
 * 归 `kind='library'` 但不算 §1.4 严格定义的"库级"，故严格口径不收。
 *
 * 实测：84 行 ⇒ 30 库级 = 35.7%（与 §1.4 第 100 行一致 —— 2026-10-20 已订正正文）。
 *
 * @returns true ⇒ 库级（§1.4 严格）；false ⇒ 非库级（语言知识点 或 环境与杂项）。
 */
export function strictLibraryClassifier(title: string): boolean {
  const t = normTitle(title)
  return hasLibraryKeyword(t) || hasThirdParty(t)
}

/**
 * §1.4 完整三档 → §3.1 schema kind 二值映射。
 *
 * §1.4 三档：语言知识点 / 库级 / 环境与杂项
 * §3.1 schema：`language` | `library` 二值
 *
 * 映射：
 *   - 语言知识点 → 'language'（学习路线主体）
 *   - 库级       → 'library' （按需查阅）
 *   - 环境与杂项 → 'library' （按 §1.4 第 113 行，不进学习路线）
 *
 * @returns 'language' | 'library'
 */
export function classifyKind(title: string): 'language' | 'library' {
  const t = normTitle(title)
  // 优先级：库级 > 环境与杂项 > 语言知识点
  if (hasLibraryKeyword(t) || hasThirdParty(t)) return 'library'
  if (hasEnvKeyword(t)) return 'library'
  return 'language'
}

/** 仅供测试 / 文档展示的内部数据：单源清单引用。 */
export const _internals = {
  THIRD_PARTY_NAMES,
  KEYWORD_LIBRARY_HITS,
  KEYWORD_ENV_HITS,
} as const