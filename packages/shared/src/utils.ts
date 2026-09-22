const encoder = new TextEncoder()

/** UTF-8 字节数（浏览器/Node 通用，512KB 等 size 限制的统一口径） */
export function utf8ByteLength(s: string): number {
  return encoder.encode(s).length
}

export const SEMVER_RE = /^\d+\.\d+\.\d+$/
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/

/**
 * 导出 semver 单调递增比较（m6a FR-4.1）：三段数字逐个比，不看 prerelease
 * （SEMVER_RE 已排除 prerelease/build 元数据）。非零返回正负号同大小关系。
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

export const PACK_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** 遥测上报体的 os 标签（design §11.5 固定三值，process.platform 归一） */
export function telemetryOs(platform: string): 'mac' | 'linux' | 'win' {
  if (platform === 'darwin') return 'mac'
  if (platform === 'win32') return 'win'
  return 'linux'
}

/** 遥测的 day 维度：UTC 日历日（去标识聚合的最小粒度，§11.5） */
export function telemetryDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

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
