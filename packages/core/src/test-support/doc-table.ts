// `packages/core/src/test-support/doc-table.ts` —— Markdown 表格的**单元格级**定位与替换（2026-10-26）。
//
// ## 它住在哪、为什么
//
// 放在 `@openvibe/core/test-support`（与 `new-db` 同处）而不是仓根 `tests/`：
// 消费方跨了包边界（`packages/core/src/db/*.test.ts` 与仓根 `tests/*.test.ts` 都要用），
// 而包内源码 import 仓根的 `tests/` 是坏味道 ⇒ 走既有的 test-support 子路径导出。
//
// ## 它解决什么
//
// 规格文档的表格断言此前用**整行字面量**当锚点：
//
//   replaceOnce(SPEC_TEXT, '| **语言知识点** | 45   |', '| **语言知识点** | 44   |')
//
// 而 prettier 会给 Markdown 表格**对齐列宽**（加空格）⇒ 锚点里的空格数一改，断言就失配。
// 2026-10-26 的全仓格式化实测：9 个测试因锚点失配而红，每改一次表格排版就要重数一遍空格。
//
// ⇒ 本模块把锚点从「整行文本」降为「**单元格序列**」：
//   行的判定只看**各单元格的文字**（去空白、去 Markdown 强调标记），
//   **不看**它们之间有多少空格 ⇒ 排版重排不影响锚点。
//
// ## 为什么不是「正则宽松匹配」
//
// 宽松正则（如 `/\|\s*语言知识点\s*\|\s*45\s*\|/`）仍然要求「45」紧跟在那一格 ⇒
// 表格换列序或加列时就失配。单元格级比对是按**列序号**定位的，加列不失效。
//
// ## 匹配强度
//
// ⚠️ **只按单元格内容匹配会误伤**：文档里可能有两行都叫「语言知识点」（不同表）。
//   ⇒ 本模块要求调用方给出**足够区分的行**（通常给首格 + 目标格 + 尾格），
//   匹配不到就抛错（**不静默放过**）—— 变异腿打空了必须立刻知道。
//
// ## 本模块不做什么
//
// - 不解析 Markdown 表格语法（转义管道 `\|`、代码块里的 `|` 等一律按普通字符处理）。
//   本仓的规格表格**不含**转义管道，真实需要时再单独处理。
// - 不做「找不到就新建一行」—— 那是文档编辑器的活，本模块只做定位与替换。

/** 一个表格行的单元格序列（已规范化：去空白、去 Markdown 强调标记） */
export type DocRow = string[]

/**
 * 规范化一个单元格：去首尾空白 → 剥掉 Markdown 强调/代码标记 → 再次去空白。
 *
 * ⚠️ **标记是「格内局部」的，不只是整格包裹**：规格表常见混合形态 ——
 *   ``**精通** `master```（整格两个标记）、`` `official` 官方文档``（反引号只包住前半）。
 *   只处理「整格包裹」会留下残渣（`` `master```、`` `official` 官方文档``）⇒ 锚点写不出来。
 *   ⇒ 这里**把标记字符整体剥掉**，只留文字。
 *
 * ⚠️ 剥的是**标记符号本身**（`*` `_` `` ` ``），不是文字 ⇒ 「C++ 指针」这类含符号的正文不受影响
 *   （`*` 与 `` ` `` 才会被剥，`+` 与文字不动）。
 */
export function normalizeCell(cell: string): string {
  return cell
    .trim()
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/(?<![\w*])\*(?![\w*])/g, '')
    .trim()
}

/**
 * 把一行 Markdown 表格拆成单元格序列。
 *
 * ⚠️ **分隔符行**（`|---|---|`）拆出来的每格都是 `-` ⇒ 调用方要自己跳过
 *   （本模块提供 `isSeparatorRow` 供判断）。
 */
export function splitRow(line: string): DocRow {
  const t = line.trim()
  if (!t.startsWith('|')) return []
  // 去掉首尾的 `|`，再按 `|` 拆
  const inner = t.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map(normalizeCell)
}

/** 是否是表格的分隔行（`|---|---|`）—— 规范化后每格都只剩 `-` */
export function isSeparatorRow(row: DocRow): boolean {
  return row.length > 0 && row.every((c) => /^:?-{2,}:?$/.test(c))
}

/**
 * 在文档里找**第一行**匹配给定单元格模式的表格行。
 *
 * @param text 文档全文
 * @param pattern 要匹配的单元格序列（按列序号逐格比对，规范化后比较）
 * @param opts.where 可选的定位范围：只在这个小节内找（按标题文字截取）
 * @returns 命中行的**原文**（含行尾换行）；找不到抛错
 * @throws 锚点不存在时抛错 —— 变异腿打空了必须立刻知道，不能静默放过
 */
export function findRow(text: string, pattern: DocRow, opts: { where?: string } = {}): string {
  const scope = opts.where ? sectionOf(text, opts.where) : text
  for (const line of scope.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = splitRow(line)
    if (isSeparatorRow(cells)) continue
    if (cellsMatch(cells, pattern)) return line
  }
  throw new Error(
    `表格里找不到匹配行：${JSON.stringify(pattern)}${opts.where ? `（范围：${opts.where}）` : ''}`,
  )
}

/**
 * 在文档里找**第一行**满足条件的表格行，返回它的**单元格序列**。
 *
 * ## 为什么需要它（与 `findRow` 的分工）
 *
 * `findRow` 要求给出**整行**的单元格序列 ⇒ 行里有一格内容很长且会变时（例如
 * 「入 · 回流」那行的字段清单）⇒ 锚点本身就会漂。
 * 本函数只给**条件**（首格是什么、哪一列含什么）⇒ 锚点短且稳。
 *
 * @param text 文档全文
 * @param predicate 判定条件（拿到规范化后的单元格序列）
 * @param opts.where 可选的定位范围
 * @returns 命中行的单元格序列（规范化后）；找不到抛错
 */
export function findRowWhere(
  text: string,
  predicate: (cells: DocRow, raw: string) => boolean,
  opts: { where?: string } = {},
): DocRow {
  const scope = opts.where ? sectionOf(text, opts.where) : text
  for (const line of scope.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = splitRow(line)
    if (isSeparatorRow(cells)) continue
    if (predicate(cells, line)) return cells
  }
  throw new Error('表格里找不到满足条件的行')
}

/**
 * 把文档里**第一行**匹配给定模式的表格行的**某个单元格**替换掉。
 *
 * ⚠️ **只改单元格内容，不动排版** ⇒ 改完之后那一行的列宽可能不再对齐，
 *   这正是 prettier 的活（下次 `pnpm format` 会重新对齐）⇒ 本模块不重排整表。
 *
 * @param text 文档全文
 * @param pattern 行匹配模式（按列序号逐格比对）
 * @param columnIndex 要替换的列序号（0 起）
 * @param newValue 新的单元格内容（**按原样写入**，不加 Markdown 标记）
 * @param opts.where 可选的定位范围
 * @returns 替换后的文档全文
 */
export function replaceCell(
  text: string,
  pattern: DocRow,
  columnIndex: number,
  newValue: string,
  opts: { where?: string } = {},
): string {
  const scope = opts.where ? sectionOf(text, opts.where) : text
  const lines = scope.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (!line.trim().startsWith('|')) continue
    const cells = splitRow(line)
    if (isSeparatorRow(cells)) continue
    if (!cellsMatch(cells, pattern)) continue
    // 重建这一行：只替换目标格，其余原样（保留各自的对齐空格）
    const raw = splitRaw(line)
    if (columnIndex >= raw.length) {
      throw new Error(
        `要替换的列序号 ${columnIndex} 超出该行单元格数 ${raw.length}：${line.trim()}`,
      )
    }
    raw[columnIndex] = newValue
    lines[i] = `| ${raw.join(' | ')} |`
    return lines.join('\n')
  }
  throw new Error(`表格里找不到匹配行：${JSON.stringify(pattern)}`)
}

/**
 * 逐格比对：**pattern 比给定的格子数少时，只比前面那些**（其余列不参与）。
 *
 * ## 为什么允许前缀匹配
 *
 * 规格表常有「含义」这类长文本列（如 §1.4 三档表的第 4 列）⇒
 * 把整列写进锚点既冗长又会随正文改写而漂 ⇒ 锚点只给**稳定的头几列**。
 *
 * ⚠️ **但列数必须一致**：pattern 比给的格子数多 ⇒ 不匹配（那是「行变了」）；
 *   行实际列数比 pattern 少 ⇒ 不匹配（pattern 引用了不存在的列）。
 */
export function cellsMatch(cells: DocRow, pattern: DocRow): boolean {
  if (pattern.length > cells.length) return false
  return pattern.every((p, i) => cells[i] === p)
}

/** 拆出**未规范化**的原始单元格（保留各自的对齐空格，用于重建行） */
function splitRaw(line: string): string[] {
  const t = line.trim()
  const inner = t.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((c) => c.trim())
}

/**
 * 取某个小节的正文（从标题行到下一个同级或更高级标题行为止）。
 *
 * @param text 文档全文
 * @param heading 标题文字（**不含** `#` 号；如 `'### 1.4'`）
 */
export function sectionOf(text: string, heading: string): string {
  const lines = text.split('\n')
  const from = lines.findIndex((l) => l.trim().startsWith(heading))
  if (from < 0) throw new Error(`找不到小节：${heading}`)
  const level = (lines[from]!.trim().match(/^#+/) ?? ['#'])[0]!.length
  let to = lines.length
  for (let i = from + 1; i < lines.length; i += 1) {
    const m = (lines[i] ?? '').trim().match(/^(#{2,6})\s/)
    if (m && m[1]!.length <= level) {
      to = i
      break
    }
  }
  return lines.slice(from, to).join('\n')
}
