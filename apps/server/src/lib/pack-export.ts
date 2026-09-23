import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { directoryFileName, openvibeHome, sha256Hex } from '@openvibe/core'
import { AppError } from '@openvibe/shared'

/**
 * 目录导出的唯一实现（design §7.1 / m6a §6.5）。
 * 从 routes/packs.ts 抽出（T8b，dev-plan §9-T8）：首启组装预置 default 包走的是同一条
 * 导出通道，若各写一份，「导出登记」与「用户在导出目录里手改的文件」就会出现两套判定。
 */

/** 目录导出根：`~/.openvibe/packs/<name>@<version>/` */
export function packExportDir(name: string, version: string): string {
  return join(openvibeHome(), 'packs', directoryFileName(name, version))
}

/**
 * 写目录前先比对：同名文件内容不一致说明被手改过，静默覆盖等于丢用户改动
 * → 409；全部一致则幂等重写。路径已由 composePack 内的 validatePackFiles 净化（§7.7）。
 */
export function writeDirectoryExport(root: string, artifacts: Record<string, string>): void {
  const entries = Object.entries(artifacts)
  const drifted = entries.filter(
    ([rel, content]) =>
      existsSync(join(root, rel)) &&
      sha256Hex(readFileSync(join(root, rel), 'utf8')) !== sha256Hex(content),
  )
  if (drifted.length > 0) {
    throw new AppError(
      'VERSION_IMMUTABLE',
      `${root} 下同名文件内容与本次导出不一致（本地手改？），未覆盖：${drifted.map(([rel]) => rel).join(', ')}`,
      { fieldErrors: { channel: [`请先移除或备份 ${root} 再导出`] } },
    )
  }
  for (const [rel, content] of entries) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
}
