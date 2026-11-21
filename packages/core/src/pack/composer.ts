import {
  ADAPTER_IDS,
  L1_DEFAULT,
  PACK_FILE_CHECKLIST,
  PACK_FILE_PLAYBOOKS,
  PACK_FILE_SKILLS,
  PACK_FILE_TERMS,
  PACK_GENERATOR,
  PACK_LEAD_QUOTE,
  PACK_MARKER_BEGIN,
  PACK_MARKER_END,
  PACK_SECTION_FLOW,
  PACK_SECTION_MARKER,
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
  renderPlaybooksMdTable,
  renderTermsMdTable,
  termSortKey,
  type AdapterId,
  type Hooks,
  type L1Capability,
  type ManifestPlaybook,
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
  /** N4 能力位查询（m11 FR-3.1）：供 composer 按能力位渲染 L1 引用形态（core 经注入读取，E-1） */
  l1Capability(id: AdapterId): L1Capability
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

/** 可进包的技巧（FR-6.2）：published 且选中。排序键与仓储层同律（码点序 + id 兜底） */
function publishedPlaybooks(
  playbooks: readonly ManifestPlaybook[] | undefined,
): ManifestPlaybook[] {
  return [...(playbooks ?? [])]
    .filter((p) => p.status === 'published')
    .sort(
      (a, b) => compareCodeUnit(a.scenario, b.scenario) || compareCodeUnit(a.problem, b.problem),
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

/**
 * N3 hooks（n3-hooks.md FR-2.1）：空集不写 manifest——与「写 hooks:{pre:[],post:[]}」
 * 在校验层等价（缺省 = 空集），兼容旧包与既有指纹。
 */
function hasHooks(hooks: Hooks | undefined): hooks is Hooks {
  return !!hooks && (hooks.pre.length > 0 || hooks.post.length > 0)
}

/**
 * N4 L1 引用形态（m11 FR-4.5）：terms 索引行的引用 token 按能力位分形态。
 * E-6：能力位 false 或特性位关 ⇒ 退化为今天纯文本指针，产物逐字节相同。
 */
function termsRef(count: number, capability: L1Capability, l1Enabled: boolean): string {
  if (!l1Enabled || capability === false) {
    return `见 ${PACK_FILE_TERMS}（${count} 条）`
  }
  if (capability === 'auto-import') {
    return `- \`@${PACK_FILE_TERMS}\`：${count} 条术语——${L1_TERMS_REASON}`
  }
  if (capability === 'on-demand') {
    return `- 按需读 \`${PACK_FILE_TERMS}\`：${count} 条术语——${L1_TERMS_REASON}`
  }
  // module（codebuddy）：索引指向模块文件
  return `- \`${PACK_FILE_TERMS}\`（模块）：${count} 条术语——${L1_TERMS_REASON}`
}

/** N4 L1 技巧索引行（m11 FR-4.3）：L1 生效时由纯文本指针升级为三要素索引行 */
function playbooksRef(count: number, capability: L1Capability, l1Enabled: boolean): string {
  if (!l1Enabled || capability === false) {
    return `见 ${PACK_FILE_PLAYBOOKS}（${count} 条）`
  }
  return `- \`${PACK_FILE_PLAYBOOKS}\`：${count} 条技巧——${L1_TERMS_REASON}`
}

/** L1 生效时的固定理由（确定性，不随运行变化） */
const L1_TERMS_REASON = '口径以本文件为唯一来源'

function renderBody(
  resolved: ResolvedPack,
  ctx: { capability: L1Capability; l1Enabled: boolean },
): string {
  const ordered = sortedPrompts(resolved.prompts)
  const rules = ordered.filter((p) => p.useAs === 'rule')
  const references = ordered.filter((p) => p.useAs === 'reference')
  const playbooks = publishedPlaybooks(resolved.playbooks)

  const lines: string[] = [
    PACK_MARKER_BEGIN(resolved.name, resolved.version),
    PACK_TITLE(resolved.name, resolved.version),
    '',
    PACK_LEAD_QUOTE,
  ]
  const section = (heading: string, blocks: string[]): void => {
    if (blocks.length === 0) return
    // D32（decisions ㊾）：段级受管标记置于节标题上方——空节连标记一起省略，
    // 与「空节整体省略」的确定性口径一致（§7.3）。
    lines.push('', PACK_SECTION_MARKER(heading), heading)
    for (const block of blocks) lines.push('', block)
  }

  section(PACK_SECTION_FLOW, resolved.flow?.stages.map(stageBlock) ?? [])
  // FR-7.6 交叉引用行挂在「行为规则」节内（§8.2 ① 已裁不新增第五节）：
  // 技巧是行为指引，这是四个现有节里唯一语义通用的；空选集时 blocks 为空 ⇒ 整节省略 ⇒ 字节不变。
  section(PACK_SECTION_RULES, [
    ...rules.map(promptBlock),
    ...(playbooks.length ? [playbooksRef(playbooks.length, ctx.capability, ctx.l1Enabled)] : []),
  ])
  // terms 非空 ⇒ TERMS.md 必生成（FR-2.1），故正文恒为一行引用，无需 §7.3 的内联兜底
  section(
    PACK_SECTION_TERMS,
    resolved.terms.length ? [termsRef(resolved.terms.length, ctx.capability, ctx.l1Enabled)] : [],
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

  // N4：按能力位 + 特性位渲染正文变体（能力位是入参 ⇒ 同一包在不同能力位下产出不同计划，FR-2.1）。
  // E-6：能力位 false 或特性位关 ⇒ 退化为 L0（与今天逐字节相同）。
  const ctxByAdapter = new Map<AdapterId, { capability: L1Capability; l1Enabled: boolean }>()
  const bodyByCtx = new Map<string, string>()
  for (const id of targets) {
    const capability = deps.adapters.l1Capability(id)
    const l1Enabled = canonical.l1?.[id] ?? L1_DEFAULT[id]
    ctxByAdapter.set(id, { capability, l1Enabled })
    const key = `${capability}|${l1Enabled}`
    if (!bodyByCtx.has(key)) {
      bodyByCtx.set(key, renderBody(canonical, { capability, l1Enabled }))
    }
  }

  const generated: { path: string; content: string }[] = deps.adapters
    .planMainFiles(canonical)
    .map((file) => {
      const ctx = file.adapterId ? ctxByAdapter.get(file.adapterId) : undefined
      const body = ctx
        ? (bodyByCtx.get(`${ctx.capability}|${ctx.l1Enabled}`) ?? renderBody(canonical, ctx))
        : renderBody(canonical, { capability: false, l1Enabled: false })
      return {
        path: file.path,
        content: file.frontmatter ? `${renderFrontmatter(file.frontmatter)}${body}` : body,
      }
    })
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
  // FR-6.3：空集合不产文件（空文件进指纹会把「没选」和「选了空的」混成同一字节）
  const playbooks = publishedPlaybooks(canonical.playbooks)
  if (playbooks.length > 0) {
    generated.push({
      path: PACK_FILE_PLAYBOOKS,
      content: renderPlaybooksMdTable(
        subject,
        playbooks.map((p) => ({
          scenario: p.scenario,
          problem: p.problem,
          practice: p.practice,
          antiPractice: p.antiPractice,
          verified: p.verified,
        })),
      ),
    })
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
    // N3 hooks（n3-hooks.md FR-2.1）：仅当配置了钩子才写（空集不写，兼容旧包与既有指纹）
    ...(hasHooks(canonical.hooks) ? { hooks: canonical.hooks } : {}),
    // N4 特性位（m11 FR-3.5.3）：仅声明能力位非 false 的平台，缺省按 L1_DEFAULT 补齐
    l1: Object.fromEntries(
      [...ctxByAdapter.entries()]
        .filter(([, ctx]) => ctx.capability !== false)
        .map(([id, ctx]) => [id, ctx.l1Enabled]),
    ) as Record<AdapterId, boolean>,
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
