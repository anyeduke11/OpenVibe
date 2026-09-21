import { coveredPlatforms, planMainFiles } from '@openvibe/adapters'
import {
  FlowTemplatesRepo,
  PromptsRepo,
  SkillsRepo,
  TermsRepo,
  composePack,
  fileSha256,
  resolvePack,
  type AdapterBundle,
  type RenderedPack,
  type SqliteDatabase,
} from '@openvibe/core'
import {
  PACK_FILE_MANIFEST,
  compareCodeUnit,
  type PackOut,
  type PlannedFileOut,
  type PreviewOut,
  type ResolvedPack,
} from '@openvibe/shared'

/**
 * R2 编排出出处：core 只吃注入的 AdapterBundle，adapters 只有这里能 import。
 * server 与 golden 测试是同一对接方式（tests/golden/compose.ts），
 * 因此「预览即产物」在两条路径上字节同源。
 */
export const packAdapters: AdapterBundle = { planMainFiles, coveredPlatforms }

/** preview 与 export 唯一的生成入口（m6a FR-2.3）；version 与 exportedAt 由调用方给 */
export function renderPack(
  db: SqliteDatabase,
  pack: PackOut,
  version: string,
  exportedAt: string,
): RenderedPack {
  const definition = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    targets: pack.targets,
  }
  const deps = {
    prompts: new PromptsRepo(db),
    terms: new TermsRepo(db),
    skills: new SkillsRepo(db),
    flows: new FlowTemplatesRepo(db),
  }
  const resolved: ResolvedPack = resolvePack(definition, pack.selection, version, deps)
  return composePack(resolved, { adapters: packAdapters, exportedAt })
}

/**
 * PreviewOut.files = 渲染产物 + manifest 自身，按路径码点序。
 * manifest 不进指纹（自指哈希不存在，design §7.6），仅为文件树完整展示而追加。
 */
export function toPreviewOut(rendered: RenderedPack): PreviewOut {
  const manifest: PlannedFileOut = {
    path: PACK_FILE_MANIFEST,
    sha256: fileSha256(rendered.manifestJson),
    content: rendered.manifestJson,
  }
  return {
    files: [...rendered.files, manifest].sort((a, b) => compareCodeUnit(a.path, b.path)),
    fingerprint: rendered.fingerprint,
    warnings: rendered.warnings,
    coveredPlatforms: rendered.coveredPlatforms,
  }
}
