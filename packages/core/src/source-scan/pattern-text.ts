/**
 * `packages/core/src/source-scan/pattern-text.ts` —— **可 grep 的模式串**（DL-22 的硬要求）
 *
 * ## 它解决什么
 *
 * §3.10 要求导出清单里的每一项都能被用户自己复现：
 *
 * ```bash
 * grep -n '<matched_pattern>' <项目目录>    # 必须命中导出清单里写的 file:line
 * ```
 *
 * ⚠️ **`grep` 默认是 BRE（基本正则）** ⇒ 模式串里带 `*` `[` `\` `^` `$` 会：
 * - `[` 未闭合 ⇒ **grep 直接报错**（用户看到的是「命令失败」，不是「命中了」）；
 * - `*` 跟在字面量后面 ⇒ 语义变成「前一项重复零次或多次」⇒ 命中范围乱扩。
 *
 * ⇒ 落库的 `matched_pattern` 必须是 **BRE 安全**的：截断到第一个危险字符之前，
 *   保留的仍然是**原文的一段前缀** ⇒ grep 一定能命中它声称的那一行。
 *
 * ## ⚠️ 为什么是「截断」而不是「转义」
 *
 * 转义（`a\*b`）会让存下来的值**不等于源码里的字面串** ⇒ 用户 grep 的是
 * 「带反斜杠的版本」，而源码里没有反斜杠 ⇒ 反而 grep 不到。
 * ⇒ 截断保留**原文前缀** ⇒ 命中的必然是真实存在的文本。
 */

/**
 * BRE 里会**改变语义或直接报错**的字符。
 *
 * ⚠️ `(` `)` `{` `}` `.` 在 BRE 里是**字面量**（分组要用 `\(`）⇒ 不在危险集里。
 * ⚠️ `+` `?` 在 BRE 里也是字面量（扩展正则才有）⇒ 不在危险集里。
 */
const BRE_UNSAFE = /[\\*[\]^$|&#~]/u

/** 标识符样式的 token（兜底用：整段不可用时从行里挑一个词）。 */
const IDENT_TOKEN = /[A-Za-z_][A-Za-z0-9_]{3,}/gu

/** 落库用的模式串**至少**要有的长度（太短容易误命中满屏）。 */
const MIN_LEN = 4

/**
 * 把一段源码片段变成**可 grep 的字面串**。
 *
 * 规则（按顺序）：
 * 1. 取片段的**第一个物理行**（跨行的片段对 grep 没意义 —— 用户 grep 的是行）；
 * 2. 在第一个 BRE 危险字符处**截断**；
 * 3. 去掉首尾空白；长度不足 `MIN_LEN` ⇒ 从该行里挑一个最长的标识符 token；
 * 4. 还是不行 ⇒ 返回**空串**（调用方必须回退到别处，**不许**存空串）。
 *
 * @param segment 命中的源码片段（可能跨行）
 * @param lineText 命中所在行的整行文本（兜底用）
 */
export function breSafePattern(segment: string, lineText: string): string {
  const firstLine = segment.split('\n')[0] ?? ''
  const cut = firstLine.search(BRE_UNSAFE)
  const trimmed = (cut >= 0 ? firstLine.slice(0, cut) : firstLine).trim()
  if (trimmed.length >= MIN_LEN) return trimmed

  // 兜底：整行里挑一个最长的标识符 token（它必然出现在这一行 ⇒ grep 命中得到）
  let best = ''
  for (const m of lineText.matchAll(IDENT_TOKEN)) {
    const token = m[0]
    if (token.length > best.length) best = token
  }
  if (best.length >= MIN_LEN) return best

  // 再兜底：整行去空白后取一段（仍可能被上面的规则判短 ⇒ 交给调用方回退）
  const flat = lineText.trim()
  if (flat.length >= MIN_LEN) {
    const cut2 = flat.search(BRE_UNSAFE)
    const cand = (cut2 >= 0 ? flat.slice(0, cut2) : flat).trim()
    if (cand.length >= MIN_LEN) return cand
  }
  return ''
}

/**
 * **导出时**的第二道 BRE 安全闸。
 *
 * ## 为什么扫描侧已经保证了还要再来一道
 *
 * 落库的 `matched_pattern` 按构造就是 BRE 安全的（扫描侧走 `breSafePattern`）。
 * 但导出物是**用户要粘进终端的命令** ⇒ 一旦库里出现脏值（人工改库、迁移写错、
 * 别的写入方），用户看到的是「grep: Unmatched [」这种**命令失败**，
 * 而不是「命中了」—— 那比少报一条还糟。
 *
 * ⇒ 导出时再兜一道。代价是纯函数、无 I/O、可单测。
 *
 * ## 规则（按顺序）
 *
 * 1. 已经 BRE 安全 ⇒ **原样返回**（正常路径：扫描器产出的值一字不动）；
 * 2. 截断到第一个危险字符之前 ⇒ 保留的仍是**原文前缀** ⇒ grep 必然命中那一行；
 * 3. 危险字符在开头 ⇒ 取**最长的 BRE 安全后缀**（仍是原文子串）；
 * 4. 全是危险字符 ⇒ 取**去掉危险字符**后的剩余串
 *    （⚠️ 可能不再是子串，但至少命令不报错；这种值只可能来自人工脏数据）。
 *
 * @param pattern 库里的 `matched_pattern`
 */
export function exportGrepPattern(pattern: string): string {
  if (pattern === '') return ''
  if (!BRE_UNSAFE.test(pattern)) return pattern

  const cut = pattern.search(BRE_UNSAFE)
  const prefix = pattern.slice(0, cut).trim()
  if (prefix !== '') return prefix

  // 最长的 BRE 安全后缀：最后一个危险字符之后的那一段
  let lastUnsafe = -1
  for (let i = 0; i < pattern.length; i += 1) {
    if (BRE_UNSAFE.test(pattern[i] as string)) lastUnsafe = i
  }
  const suffix = pattern.slice(lastUnsafe + 1).trim()
  if (suffix !== '') return suffix

  const stripped = pattern.replace(new RegExp(BRE_UNSAFE.source, 'gu'), '').trim()
  return stripped
}

/**
 * 模式串的**最终回退链**：片段 → 行 → 规范模式名。
 *
 * ⚠️ 规范模式名也可能不可 grep（如 'ast.Call' 的 `.` 是 BRE 的「任意字符」，
 *   仍能命中，不报错）⇒ 顺序是「片段 → 行 → 规范名」，**永不返回空串**。
 */
export function resolvePatternText(
  segment: string,
  lineText: string,
  fallbackName: string,
): string {
  const direct = breSafePattern(segment, lineText)
  if (direct !== '') return direct
  const fromLine = breSafePattern(lineText, lineText)
  if (fromLine !== '') return fromLine
  const safeName = fallbackName.replace(BRE_UNSAFE, '')
  return safeName === '' ? 'unknown' : safeName
}
