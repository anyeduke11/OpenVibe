import {
  AppError,
  TERM_RECOMMEND_LIMIT,
  TERM_RECOMMEND_THRESHOLD,
  type ProjectOut,
  type TermRecommendationReason,
  type TermRecommendationsResponse,
} from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { ProjectsRepo } from '../repos/projects'
import { PacksRepo } from '../repos/packs'
import { TermsRepo } from '../repos/terms'

/**
 * M3-T · FR-6.2 确定性基线层（Pi 不在也必须能跑）。
 *
 * ⚠️ **这一层是纯本地计算**：只读 SQLite，不起子进程、不发网络请求。
 * 那是 FR-7.1 的硬要求，也是 §2.4 硬约束 1「Pi 是可插拔后端」的兑现 ——
 * 没装 Pi、没配 API Key、Pi 起不来，三种情况下推荐照常工作。
 *
 * **本文件不含任何 AI 分支**：FR-6.3 的增强层是 P4，届时另起文件，
 * 不在这里加 `if (aiEnabled)` —— 那会让「基线永远可用」这条变成一条需要测试去证明的分支。
 */

export interface TermRecommendDeps {
  db: SqliteDatabase
}

/** FR-6.2 各因子的权重（改这里等于改打分口径，须同步 spec） */
const W_CHECKLIST = 2.0
const W_DOMAIN = 1.5
const W_SKILL = 1.0
const W_STARTER = 0.5
/** FR-6.2 最后一项：starter=0 且弱相关时压下去 */
const W_COLD_PENALTY = 2.0

/** 打分用的词面：中文名、英文名、别名。任一命中即算「这个词面出现了」 */
function surfacesOf(t: { zh?: string; en?: string | null; aliases: string[] }): string[] {
  return [t.zh ?? '', t.en ?? '', ...t.aliases].map((s) => s.trim()).filter((s) => s !== '')
}

/**
 * FR-6.2 括注「项目领域（由阶段名+技能推导）」的落地口径（P3 实测后定的，见下）。
 *
 * ⚠️ **不是「从阶段名里找领域词」**：实测本仓内置 9 个流程模板的全部阶段名，
 * `TERM_DOMAINS` 的八个词面出现次数为 **0** —— 那条推导在真实数据上恒为空集。
 * 阶段名的真实作用是**它自己常常就是一个术语**（「PRD」「复盘」「推送」「验收标准」），
 * 所以领域要靠「阶段名命中了哪个词条」反推。
 *
 * skill 侧同理：项目绑定的标准包 `selection.skillIds` 指向的 skill，
 * 用它的 name/description 做同样的反推。当前唯一真实项目 `standard_pack_id` 为空，
 * 故该源为空集 —— **这不是实现缺失，是「项目没绑标准包」的事实**，读侧不猜。
 */
function deriveProjectDomains(
  terms: ReturnType<TermsRepo['list']>,
  stageNames: string[],
  boundSkills: { name: string; description: string }[],
): Set<string> {
  const domains = new Set<string>()
  const sources = [stageNames.join('\n'), ...boundSkills.flatMap((s) => [s.name, s.description])]
  for (const term of terms) {
    if (term.domain === null) continue
    for (const surface of surfacesOf(term)) {
      if (sources.some((src) => src.includes(surface))) {
        domains.add(term.domain)
        break
      }
    }
  }
  return domains
}

/** 阶段名里命中的词条：这些词的领域构成项目领域，同时给 1.5 因子攒 stage 理由 */
function stageHits(
  terms: ReturnType<TermsRepo['list']>,
  stageNames: string[],
): Map<string, string[]> {
  const hit = new Map<string, string[]>()
  const blob = stageNames.join('\n')
  for (const term of terms) {
    for (const surface of surfacesOf(term)) {
      if (blob.includes(surface)) {
        hit.set(term.id, [surface])
        break
      }
    }
  }
  return hit
}

/**
 * 项目绑定的 skill：包未绑定时这里是空表，1.0 因子恒为 0 —— **如实为 0，不回退到「全部已装 skill」**。
 * 回退会让 438 条已装 skill 全变成候选，「项目绑定的 skill」这条约束就名存实亡了。
 */
function boundSkillsOf(
  db: SqliteDatabase,
  project: ProjectOut,
): { name: string; description: string }[] {
  if (project.standardPackId === null) return []
  const pack = new PacksRepo(db).get(project.standardPackId)
  if (pack === null) return []
  const rows = db.prepare('SELECT name, description FROM skills WHERE id = ?')
  const out: { name: string; description: string }[] = []
  for (const skillId of pack.selection.skillIds) {
    const row = rows.get(skillId) as { name: string; description: string } | undefined
    if (row) out.push(row)
  }
  return out
}

export function createTermRecommendService(deps: TermRecommendDeps) {
  const projects = new ProjectsRepo(deps.db)
  const terms = new TermsRepo(deps.db)

  return {
    recommend(projectId: string): TermRecommendationsResponse {
      const project = projects.get(projectId)
      if (project === null) {
        throw new AppError('NOT_FOUND', `项目不存在: ${projectId}`)
      }

      const all = terms.list()
      const stageNames = project.stagesSnapshot.map((s) => s.name)
      const checklistTexts = project.stagesSnapshot.flatMap((s) => s.checklist.map((c) => c.text))
      const skills = boundSkillsOf(deps.db, project)
      const stageHit = stageHits(all, stageNames)
      const projectDomains = deriveProjectDomains(all, stageNames, skills)

      const scored = all.map((term) => {
        const reasons: TermRecommendationReason[] = []
        let score = 0

        // 2.0 × 词面直接命中 checklist
        for (const surface of surfacesOf(term)) {
          const hitText = checklistTexts.find((t) => t.includes(surface))
          if (hitText !== undefined) {
            score += W_CHECKLIST
            reasons.push({ kind: 'checklist', text: hitText })
            break
          }
        }

        // 1.5 × 术语所属领域与项目领域重合
        if (term.domain !== null && projectDomains.has(term.domain)) {
          score += W_DOMAIN
          // 该词条自己命中阶段名时引原文（stage）；否则只能引领域名（domain）——
          // 绝不能拿领域重合去冒充阶段命中。
          const hitStage = stageHit.get(term.id)
          reasons.push(
            hitStage !== undefined
              ? { kind: 'stage', text: hitStage[0] as string }
              : { kind: 'domain', text: term.domain },
          )
        }

        // 1.0 × 词面与项目绑定 skill 的名称/描述重合
        for (const skill of skills) {
          const blob = `${skill.name}\n${skill.description}`
          if (surfacesOf(term).some((s) => blob.includes(s))) {
            score += W_SKILL
            reasons.push({ kind: 'skill', text: skill.name })
            break
          }
        }

        // 0.5 × starter=1
        if (term.starter) score += W_STARTER

        // -2.0 × starter=0 且弱相关
        if (!term.starter && score < TERM_RECOMMEND_THRESHOLD) score -= W_COLD_PENALTY

        return { term, score, reasons }
      })

      const items = scored
        .filter((s) => s.score >= TERM_RECOMMEND_THRESHOLD && s.reasons.length > 0)
        // 同分时先入门必看、再难度低 —— 与卡片视图（FR-4.1）的递进一致
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score
          if (a.term.starter !== b.term.starter) return a.term.starter ? -1 : 1
          const rank = { L1: 0, L2: 1, L3: 2 } as const
          return rank[a.term.level] - rank[b.term.level]
        })
        .slice(0, TERM_RECOMMEND_LIMIT)
        .map(({ term, score, reasons }) => ({
          termId: term.id,
          zh: term.zh ?? '',
          en: term.en ?? null,
          level: term.level,
          starter: term.starter,
          domain: term.domain,
          score,
          reasons,
        }))

      return {
        projectId,
        source: 'baseline',
        threshold: TERM_RECOMMEND_THRESHOLD,
        limit: TERM_RECOMMEND_LIMIT,
        projectDomains: [...projectDomains].sort(),
        items,
      }
    },
  }
}
