/**
 * `packages/core/src/source-scan/go-comments.ts` —— **Go 源码的「去注释与字符串」**
 *
 * ## 它为什么存在
 *
 * 启发式（正则）路径在**裸文本**上匹配 ⇒ 注释与字符串里的字面量会被误命中：
 *
 * ```go
 * // 这里 defer 一下再关闭          ← 注释：正则会命中，parser 不会
 * s := "chan int"                  ← 字符串：正则会命中，parser 不会
 * ```
 *
 * ⚠️ 这会**直接违反 DL-19**（§3.8.2 第 3 条：parser 认出的集合必须 ⊇ 正则认出的集合）——
 *   正则多认出的那些，parser 认不出 ⇒ 「⊇」被打破 ⇒ 那条判据变红。
 *
 * ⇒ 启发式路径**必须**先把注释与字符串**抹掉**再匹配。
 *
 * ## ⚠️ 抹掉时**保留长度与换行**
 *
 * - 保留长度 ⇒ 行列号与原文件**完全一致**（导出清单的 `file:line` 才指得准）；
 * - 保留换行 ⇒ 按行切分仍然对得上。
 */
const SPACE = ' '

/**
 * 把 Go 源码里的**注释与字符串字面量**替换成空格（长度与换行不变）。
 *
 * ⚠️ 覆盖：行注释、块注释、解释字符串、原始字符串（反引号）、字符字面量。
 *
 * ⚠️ **注释里不许出现「块注释的结束符」** —— 它会提前闭合本注释，
 *   后面的话变成代码 ⇒ 解析报「Unterminated string literal」。
 */
export function stripGoComments(src: string): string {
  const n = src.length
  const out: string[] = new Array<string>(n).fill(SPACE)
  let i = 0
  while (i < n) {
    const c = src[i] as string
    const c2 = i + 1 < n ? (src[i + 1] as string) : ''
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') {
        out[i] = SPACE
        i += 1
      }
      continue
    }
    if (c === '/' && c2 === '*') {
      out[i] = SPACE
      out[i + 1] = SPACE
      i += 2
      while (i < n) {
        const d = src[i] as string
        if (d === '\n') {
          out[i] = '\n'
          i += 1
          continue
        }
        if (d === '*' && i + 1 < n && src[i + 1] === '/') {
          out[i] = SPACE
          out[i + 1] = SPACE
          i += 2
          break
        }
        out[i] = SPACE
        i += 1
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out[i] = SPACE
      i += 1
      while (i < n) {
        const d = src[i] as string
        if (d === '\\' && quote !== '`' && i + 1 < n) {
          out[i] = SPACE
          out[i + 1] = SPACE
          i += 2
          continue
        }
        if (d === quote) {
          out[i] = SPACE
          i += 1
          break
        }
        if (d === '\n' && quote !== '`') {
          break // unterminated interpreted string: stop at end of line
        }
        out[i] = d === '\n' ? '\n' : SPACE
        i += 1
      }
      continue
    }
    out[i] = c
    i += 1
  }
  return out.join('')
}
