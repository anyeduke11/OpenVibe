// packages/core/src/pack/size.ts —— 近似上下文量估算（m6a FR-6.2）。
// 系数 1.2 / 4 是**粗估常数**，不是任何 tokenizer 的实测曲线：展示层必须带 ≈ 且措辞为
// 「近似上下文量（非计费口径）」。§14-1 原提议的 chars/4 对 CJK 语料低估 4.0 倍（FR-6.1 实量），
// 所以这里锁死分字区双系数口径；改系数属 B 级变更（会移动 warn 判定线）。
export interface TokenEstimate {
  codePoints: number
  cjk: number
  other: number
  approxTokens: number
}

/** perTarget.approxTokens 超过它 ⇒ warn=true（只提示，永不阻断导出/sync，FR-6.4） */
export const SIZE_WARN_THRESHOLD = 12_000

const CJK_PER_TOKEN = 1.2
const OTHER_PER_TOKEN = 4

/** 假名/汉字/兼容表意/全角标点四个区（FR-6.2 原文区间，不扩也不缩） */
function isCjk(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef)
  )
}

export function estimateTokens(content: string): TokenEstimate {
  let cjk = 0
  let other = 0
  // Array.from 按码点迭代；用 String.length 会把代理对算两位，emoji 虚增
  for (const ch of Array.from(content)) {
    if (isCjk(ch.codePointAt(0) ?? 0)) cjk += 1
    else other += 1
  }
  return {
    codePoints: cjk + other,
    cjk,
    other,
    approxTokens: Math.ceil(other / OTHER_PER_TOKEN + cjk * CJK_PER_TOKEN),
  }
}

/** 拼接后整体估算（单次 ceil）：perTarget 用它，逐文件相加会随文件数系统性高估 */
export function estimateBundle(parts: readonly string[]): number {
  return estimateTokens(parts.join('')).approxTokens
}
