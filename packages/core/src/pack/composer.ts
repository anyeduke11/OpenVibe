import {
  ADAPTER_IDS,
  PACK_FILE_CHECKLIST,
  PACK_FILE_SKILLS,
  PACK_FILE_TERMS,
  PACK_GENERATOR,
  PACK_LEAD_QUOTE,
  PACK_MARKER_BEGIN,
  PACK_MARKER_END,
  PACK_SECTION_FLOW,
  PACK_SECTION_REFERENCE,
  PACK_SECTION_RULES,
  PACK_SECTION_TERMS,
  PACK_TITLE,
  SCHEMA_VERSION,
  compareCodeUnit,
  escapeMarkdownCell,
  extractVariables,
  packSubject,
  renderFrontmatter,
  renderTermsMdTable,
  termSortKey,
  type AdapterId,
  type ManifestPrompt,
  type ManifestSkill,
  type ManifestTerm,
  type PackManifest,
  type PlannedFile,
  type PlannedFileOut,
  type ResolvedPack,
  type Stage,
} from '@openvibe/shared'
import { fileSha256, fingerprintOf } from './fingerprint'
import { validatePackFiles } from './validate'

/**
 * adapter 能力注入（R2：core 不得 import packages/adapters，编排在 apps/server）。
 * 主规则文件「写到哪、套什么壳」由 adapter 回答，正文一律由本文件生成——
 * 因此四个根级文件除文件名外字节相同（m6a §7.4b）。
 */
export interface AdapterBundle {
  planMainFiles(pack: ResolvedPack): PlannedFile[]
  coveredPlatforms(targets: AdapterId[]): string[]
}

export interface ComposeDeps {
  adapters: AdapterBundle
  /** 只进 manifest.pack.exportedAt；不进任何正文与指纹（§7.3 零时间戳 ⇒ preview 可重复） */
  exportedAt: string
}

export interface RenderedPack {
  /** 渲染产物全集（**不含 manifest 自身**——自指哈希不存在），按路径码点序 */
  files: PlannedFileOut[]
  manifest: PackManifest
  manifestJson: string
  fingerprint: string
  warnings: string[]
  coveredPlatforms: string[]
}

// ============ 排序键（design §7.3，确定性来源） ============

function sortedPrompts(prompts: readonly ManifestPrompt[]): ManifestPrompt[] {
  return [...prompts].sort(
    (a, b) =>
      compareCodeUnit(a.title.toLowerCase(), b.title.toLowerCase()) ||
      compareCodeUnit(a.title, b.title) ||
      compareCodeUnit(a.contentHash, b.contentHash),
  )
}

function sortedTerms(terms: readonly ManifestTerm[]): ManifestTerm[] {
  return [...terms].sort(
    (a, b) =>
      compareCodeUnit(termSortKey(a), termSortKey(b)) ||
      compareCodeUnit(a.zh ?? '', b.zh ?? '') ||
      compareCodeUnit(a.definition, b.definition),
  )
}

function sortedSkills(skills: readonly ManifestSkill[]): ManifestSkill[] {
  return [...skills].sort(
    (a, b) =>
      compareCodeUnit(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compareCodeUnit(a.name, b.name),
  )
}

// ============ 主正文（§7.3 固定节序，空节整体省略） ============

function stageBlock(stage: Stage): string {
  const items = stage.checklist.map((item) => `- ${item.text}`).join('\n')
  const head = [`### ${stage.name}`, items].filter(Boolean).join('\n')
  const artifacts = stage.artifacts.length ? `**产物**: ${stage.artifacts.join('、')}` : ''
  return [head, artifacts].filter(Boolean).join('\n\n')
}

function promptBlock(prompt: ManifestPrompt): string {
  return `#### ${prompt.title}\n${prompt.content.trimEnd()}`
}

function renderBody(resolved: ResolvedPack): string {
  const ordered = sortedPrompts(resolved.prompts)
  const rules = ordered.filter((p) => p.useAs === 'rule')
  const references = ordered.filter((p) => p.useAs === 'reference')

  const lines: string[] = [
    PACK_MARKER_BEGIN(resolved.name, resolved.version),
    PACK_TITLE(resolved.name, resolved.version),
    '',
    PACK_LEAD_QUOTE,
  ]
  const section = (heading: string, blocks: string[]): void => {
    if (blocks.length === 0) return
    lines.push('', heading)
    for (const block of blocks) lines.push('', block)
  }

  section(PACK_SECTION_FLOW, resolved.flow?.stages.map(stageBlock) ?? [])
  section(PACK_SECTION_RULES, rules.map(promptBlock))
  // terms 非空 ⇒ TERMS.md 必生成（FR-2.1），故正文恒为一行引用，无需 §7.3 的内联兜底
  section(
    PACK_SECTION_TERMS,
    resolved.terms.length ? [`见 ${PACK_FILE_TERMS}（${resolved.terms.length} 条）`] : [],
  )
  section(PACK_SECTION_REFERENCE, references.map(promptBlock))

  lines.push('', PACK_MARKER_END)
  return `${lines.join('\n')}\n`
}

// ============ 辅助产物（§7.4） ============

export const SKILLS_MD_HEADER = '| Skill | 说明 | 本地路径 | 版本 |'
export const SKILLS_MD_DIVIDER = '|-------|------|----------|------|'

function renderChecklistMd(resolved: ResolvedPack): string {
  const lines: string[] = [`# 项目检查清单 · ${packSubject(resolved.name, resolved.version)}`, '']
  ;(resolved.flow?.stages ?? []).forEach((stage, index) => {
    lines.push(`## 阶段 ${index + 1} · ${stage.name}`)
    for (const item of stage.checklist) lines.push(`- [ ] ${item.text}`)
    if (stage.artifacts.length > 0) lines.push('', `**产物**: ${stage.artifacts.join('、')}`)
    lines.push('')
  })
  return lines.join('\n')
}

function renderSkillsMd(resolved: ResolvedPack): string {
  const lines: string[] = [
    `# Skill 清单 · ${packSubject(resolved.name, resolved.version)}`,
    '',
    SKILLS_MD_HEADER,
    SKILLS_MD_DIVIDER,
  ]
  for (const skill of sortedSkills(resolved.skills)) {
    lines.push(
      `| ${escapeMarkdownCell(skill.name)} | ${escapeMarkdownCell(skill.description)} | ${escapeMarkdownCell(skill.skillDir)} | ${escapeMarkdownCell(skill.versionLabel)} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

// ============ 组装 ============

export function composePack(resolved: ResolvedPack, deps: ComposeDeps): RenderedPack {
  const targets = ADAPTER_IDS.filter((id) => resolved.targets.includes(id))
  const canonical: ResolvedPack = { ...resolved, targets }
  const subject = packSubject(canonical.name, canonical.version)
  const body = renderBody(canonical)

  const generated: { path: string; content: string }[] = deps.adapters
    .planMainFiles(canonical)
    .map((file) => ({
      path: file.path,
      content: file.frontmatter ? `${renderFrontmatter(file.frontmatter)}${body}` : body,
    }))
  if (canonical.terms.length > 0) {
    generated.push({
      path: PACK_FILE_TERMS,
      content: renderTermsMdTable(subject, sortedTerms(canonical.terms)),
    })
  }
  if (canonical.flow) {
    generated.push({ path: PACK_FILE_CHECKLIST, content: renderChecklistMd(canonical) })
  }
  if (canonical.skills.length > 0) {
    generated.push({ path: PACK_FILE_SKILLS, content: renderSkillsMd(canonical) })
  }

  const files: PlannedFileOut[] = generated
    .map(({ path, content }) => ({ path, content, sha256: fileSha256(content) }))
    .sort((a, b) => compareCodeUnit(a.path, b.path))
  const fingerprint = fingerprintOf(files)

  const manifest: PackManifest = {
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: canonical.id,
      name: canonical.name,
      version: canonical.version,
      description: canonical.description,
      exportedAt: deps.exportedAt,
      generator: PACK_GENERATOR,
    },
    targets: [...targets],
    flow: canonical.flow
      ? {
          templateName: canonical.flow.templateName,
          kind: canonical.flow.kind,
          stages: canonical.flow.stages.map((stage) => ({ ...stage })),
        }
      : null,
    prompts: sortedPrompts(canonical.prompts),
    terms: sortedTerms(canonical.terms),
    skills: sortedSkills(canonical.skills),
    files: files.map((f) => ({ path: f.path, sha256: f.sha256 })),
    fingerprint,
  }

  const variableWarnings = sortedPrompts(canonical.prompts)
    .filter((p) => p.useAs === 'rule')
    .map((p) => {
      const vars = extractVariables(p.content)
      return vars.length === 0
        ? null
        : `rule 提示词「${p.title}」含 ${vars.length} 个变量（${vars.join(', ')}），注入后需人工填充`
    })
    .filter((w): w is string => w !== null)

  return {
    files,
    manifest,
    manifestJson: `${JSON.stringify(manifest, null, 2)}\n`,
    fingerprint,
    warnings: [...variableWarnings, ...validatePackFiles(files)],
    coveredPlatforms: deps.adapters.coveredPlatforms(targets),
  }
}
