import {
  AppError,
  type FlowTemplateOut,
  type PackSelection,
  type PromptOut,
  type ResolvedPack,
  type SkillOut,
  type TermOut,
  type AdapterId,
} from '@openvibe/shared'
import type { FlowTemplatesRepo } from '../repos/flows'
import type { PromptsRepo } from '../repos/prompts'
import type { SkillsRepo } from '../repos/skills'
import type { TermsRepo } from '../repos/terms'

export interface ResolveDeps {
  prompts: PromptsRepo
  terms: TermsRepo
  skills: SkillsRepo
  flows: FlowTemplatesRepo
}

export interface PackDefinition {
  id: string
  name: string
  description: string
  targets: AdapterId[]
}

function pick<T extends { id: string }>(
  ids: readonly string[],
  get: (id: string) => T | null,
  kind: keyof StaleDetails,
  stale: StaleDetails,
): T[] {
  const found: T[] = []
  for (const id of ids) {
    const row = get(id)
    if (row) found.push(row)
    else stale[kind].push(id)
  }
  return found
}

type StaleDetails = {
  promptIds: string[]
  termIds: string[]
  skillIds: string[]
  flowTemplateId: string[]
}

/**
 * selection → 内容快照（m6a §3「导出时物化」）。
 * 引用资产已删除 ⇒ STALE_SELECTION（§6.2：快照语义只保护已导出实例，不保护未导出的定义），
 * 一次性报全部失效项，供向导标红重选。
 */
export function resolvePack(
  pack: PackDefinition,
  selection: PackSelection,
  version: string,
  deps: ResolveDeps,
): ResolvedPack {
  const stale: StaleDetails = { promptIds: [], termIds: [], skillIds: [], flowTemplateId: [] }

  const prompts = pick<PromptOut>(
    selection.promptIds,
    (id) => deps.prompts.get(id),
    'promptIds',
    stale,
  )
  const terms = pick<TermOut>(selection.termIds, (id) => deps.terms.get(id), 'termIds', stale)
  const skills = pick<SkillOut>(selection.skillIds, (id) => deps.skills.get(id), 'skillIds', stale)

  let flow: ResolvedPack['flow'] = null
  if (selection.flowTemplateId) {
    const template: FlowTemplateOut | null = deps.flows.get(selection.flowTemplateId)
    if (template)
      flow = { templateName: template.name, kind: template.kind, stages: template.stages }
    else stale.flowTemplateId.push(selection.flowTemplateId)
  }

  const staleCount = Object.values(stale).reduce((n, list) => n + list.length, 0)
  if (staleCount > 0) {
    throw new AppError(
      'STALE_SELECTION',
      `选集中 ${staleCount} 项资产已删除，请重新挑选（m6a §6.2）`,
      stale,
    )
  }

  if (prompts.length === 0 && terms.length === 0 && skills.length === 0 && !flow) {
    throw new AppError(
      'EMPTY_SELECTION',
      '空选集不可组包：至少挑一条提示词 / 术语 / skill，或选一个流程模板（m6a FR-2.4）',
    )
  }

  return {
    id: pack.id,
    name: pack.name,
    version,
    description: pack.description,
    targets: pack.targets,
    flow,
    prompts: prompts.map((p) => ({
      title: p.title,
      useAs: p.useAs,
      platformMarks: p.platformMarks,
      contentHash: p.contentHash,
      content: p.content,
    })),
    terms: terms.map((t) => ({
      zh: t.zh,
      en: t.en,
      aliases: t.aliases,
      definition: t.definition,
      example: t.example,
    })),
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      skillDir: s.skillDir ?? '',
      versionLabel: versionLabelOf(deps.skills, s),
    })),
  }
}

function versionLabelOf(repo: SkillsRepo, skill: SkillOut): string {
  if (!skill.latestVersionId) return ''
  return repo.versions(skill.id).find((v) => v.id === skill.latestVersionId)?.versionLabel ?? ''
}
