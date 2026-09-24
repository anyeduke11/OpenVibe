import { ADAPTER_MAIN_PATH, coveredPlatforms, planMainFiles } from '@openvibe/adapters'
import {
  FlowTemplatesRepo,
  PromptsRepo,
  SIZE_WARN_THRESHOLD,
  SkillsRepo,
  TermsRepo,
  composePack,
  estimateBundle,
  estimateTokens,
  fileSha256,
  resolvePack,
  type AdapterBundle,
  type RenderedPack,
  type SqliteDatabase,
} from '@openvibe/core'
import {
  PACK_FILE_CHECKLIST,
  PACK_FILE_MANIFEST,
  PACK_FILE_SKILLS,
  PACK_FILE_TERMS,
  compareCodeUnit,
  utf8ByteLength,
  type AdapterId,
  type PackOut,
  type PlannedFileOut,
  type PreviewOut,
  type ResolvedPack,
  type SizeEstimate,
  type SizeEstimateFile,
  type SizeEstimatePerTarget,
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
    sizeEstimate: buildSizeEstimate(
      rendered.files,
      rendered.manifestJson,
      rendered.manifest.targets,
    ),
  }
}

/** 某平台真正读进上下文的那批文件：自己的主文件 + 三个辅助产物（存在才算） */
const CONTEXT_AUX = [PACK_FILE_TERMS, PACK_FILE_CHECKLIST, PACK_FILE_SKILLS] as const

export function buildSizeEstimate(
  files: { path: string; content: string }[],
  manifestJson: string,
  targets: readonly AdapterId[],
): SizeEstimate {
  const byPath = new Map(files.map((f) => [f.path, f.content]))
  const perTarget: SizeEstimatePerTarget[] = [...targets].sort(compareCodeUnit).map((adapter) => {
    const paths = [ADAPTER_MAIN_PATH[adapter], ...CONTEXT_AUX].filter((p) => byPath.has(p))
    const rows: SizeEstimateFile[] = paths.map((path) => ({
      path,
      approxTokens: estimateTokens(byPath.get(path) ?? '').approxTokens,
    }))
    const approxTokens = estimateBundle(paths.map((p) => byPath.get(p) ?? ''))
    return { adapter, files: rows, approxTokens, warn: approxTokens > SIZE_WARN_THRESHOLD }
  })

  const all = [...files, { path: PACK_FILE_MANIFEST, content: manifestJson }]
  const footprint: SizeEstimate['footprint'] = {
    files: all
      .map((f) => ({ path: f.path, approxTokens: estimateTokens(f.content).approxTokens }))
      .sort((a, b) => compareCodeUnit(a.path, b.path)),
    approxTokens: estimateBundle(all.map((f) => f.content)),
    bytes: all.reduce((sum, f) => sum + utf8ByteLength(f.content), 0),
  }
  return { perTarget, footprint }
}
