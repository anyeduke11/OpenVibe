import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { directoryFiles, type RenderedPack } from '@openvibe/core'

/** 本模块即位于快照根，不做二次跳转（曾错拼出 tests/tests/golden） */
export const GOLDEN_ROOT = dirname(fileURLToPath(import.meta.url))

/** 快照 = 目录导出形态（design §7.1 原样）+ 三份可读侧车 */
export function goldenArtifacts(rendered: RenderedPack): Record<string, string> {
  return {
    ...directoryFiles(rendered),
    'fingerprint.txt': `${rendered.fingerprint}\n`,
    'covered.txt': `${rendered.coveredPlatforms.join('\n')}\n`,
    'warnings.txt': rendered.warnings.length
      ? `${rendered.warnings.join('\n')}\n`
      : '',
  }
}

export function walkFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkFiles(join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}
