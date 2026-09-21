const encoder = new TextEncoder()

/** UTF-8 字节数（浏览器/Node 通用，512KB 等 size 限制的统一口径） */
export function utf8ByteLength(s: string): number {
  return encoder.encode(s).length
}

export const SEMVER_RE = /^\d+\.\d+\.\d+$/
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/

export const PACK_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * 标准包相对路径安全规则（design §7.7）：
 * 相对路径；按 / 切分后无空段、无 .. 段、不含 \、不以 / 开头；单段 ≤128 字符；总长 ≤255。
 */
export function isValidPackRelativePath(p: string): boolean {
  if (p.length === 0 || p.length > 255) return false
  if (p.startsWith('/') || p.includes('\\')) return false
  const segments = p.split('/')
  for (const seg of segments) {
    if (seg.length === 0 || seg.length > 128) return false
    if (seg === '.' || seg === '..') return false
  }
  return true
}

/** {{变量名}} 提取正则（m1 FR-2.1，合法名 [a-zA-Z_][a-zA-Z0-9_-]*） */
export const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g

export function extractVariables(content: string): string[] {
  const names = new Set<string>()
  for (const m of content.matchAll(VARIABLE_PATTERN)) {
    if (m[1]) names.add(m[1])
  }
  return [...names]
}
