import {
  PACK_FILE_MANIFEST,
  PACK_FILES_SUBDIR,
  packSubject,
  type PackBundle,
} from '@openvibe/shared'
import type { RenderedPack } from './composer'

/** bundle 下载文件名（design §7.1，CLI `sync --file` 的默认展示名） */
export function bundleFileName(name: string, version: string): string {
  return `openvibe-pack-${name}-${version}.json`
}

/** 目录导出根目录名 `<name>@<version>`（§7.1 的 `~/.openvibe/packs/<name>@<version>/`） */
export function directoryFileName(name: string, version: string): string {
  return packSubject(name, version)
}

/** 单文件 bundle：manifest 全文 + 每个渲染产物的内容（已导出包不依赖库存活，§7.2） */
export function buildBundle(rendered: RenderedPack): PackBundle {
  return {
    bundleSchemaVersion: 1,
    manifest: rendered.manifest,
    files: rendered.files.map((f) => ({ path: f.path, content: f.content })),
  }
}

export function bundleJson(rendered: RenderedPack): string {
  return `${JSON.stringify(buildBundle(rendered), null, 2)}\n`
}

/**
 * 目录形态的「相对路径 → 内容」表：`openvibe.pack.json` + `files/<真实相对路径>`。
 * 纯函数不落盘——写盘由 apps/server（在线）与 apps/cli（离线）各自的防线负责。
 */
export function directoryFiles(rendered: RenderedPack): Record<string, string> {
  const map: Record<string, string> = { [PACK_FILE_MANIFEST]: rendered.manifestJson }
  for (const file of rendered.files) map[`${PACK_FILES_SUBDIR}/${file.path}`] = file.content
  return map
}
