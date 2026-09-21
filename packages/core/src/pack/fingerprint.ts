import { sha256Hex } from '../repos/util'
import { compareCodeUnit } from '@openvibe/shared'

/** 单文件哈希（§7.6）：UTF-8 字节 sha256，hex 小写 */
export function fileSha256(content: string): string {
  return sha256Hex(content)
}

/**
 * 包指纹（design §7.6）：对 `path\t文件sha256\n` 按路径码点序拼接后再取 sha256。
 * 码点序而非 localeCompare——后者随 ICU 漂移，会让同一包在三平台 CI 上算出不同指纹。
 */
export function fingerprintOf(files: readonly { path: string; sha256: string }[]): string {
  const concat = [...files]
    .sort((a, b) => compareCodeUnit(a.path, b.path))
    .map((f) => `${f.path}\t${f.sha256}\n`)
    .join('')
  return sha256Hex(concat)
}
