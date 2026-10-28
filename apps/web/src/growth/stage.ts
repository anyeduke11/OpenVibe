/**
 * 成长阶段模型（F0–F3）。
 *
 * 文字口径单源 = `docs/analysis-2026-10-02-first-principles.md` §5.1（四阶段定义与
 * 毕业信号）与 §5.3（渐进披露五红线硬约束）。本文件只把那张表搬成可执行的数据，
 * 不新增阶段、不改毕业信号、不改措辞。
 *
 * **当前实现只落「阶段向量 + 一键越级」**，阶段**自动判定**（C1）还没接：
 * §5.2 的判定信号来自 D29 本机事件台账，而台账读端点属 RF1-5（dev-plan §16 排期
 * 面，尚未开工）。在它落地前，阶段由用户手选并记在本机——宁可让人自己认领，
 * 也不拿假信号算出一个假的「你已毕业」。
 */

export type Stage = 0 | 1 | 2 | 3

/** 阶段是三维的：按模块维护向量，不是全局单级（§5.1 关键决定 1） */
export const STAGE_MODULES = ['prompts', 'terms', 'skills', 'flows', 'packs'] as const
export type StageModule = (typeof STAGE_MODULES)[number]

export interface StageDef {
  code: Stage
  name: string
  en: string
  /** 用户的心智（§5.1「用户的心智」列原文） */
  mind: string
  /** 系统该替他行使的权威 */
  authority: string
  /** 明确的毕业信号（可机器判定）——信号源未接前展示为「待采集」 */
  graduate: string
}

export const STAGES: readonly StageDef[] = [
  {
    code: 0,
    name: '跟随者',
    en: 'Follower',
    mind: '别让我选，告诉我做什么',
    authority: '替他决定：一套默认标准包、一条命令、一个流程模板',
    graduate: '完成 1 次端到端注入 + 勾完 1 个阶段的清单',
  },
  {
    code: 1,
    name: '实践者',
    en: 'Practitioner',
    mind: '我想知道为什么，我想挑',
    authority: '给他选项与解释：条款级开关、术语路线、模板对比',
    graduate: '改过 ≥1 次资产内容 + 用过 ≥2 个流程模板',
  },
  {
    code: 2,
    name: '作者',
    en: 'Author',
    mind: '我要写自己的标准',
    authority: '给他创作工具：复制模板、批量编辑、自定义清单、组自己的包',
    graduate: '自建过 ≥1 个资产（且非种子）且导出过 ≥1 个非预置包',
  },
  {
    code: 3,
    name: '定标者',
    en: 'Standard-setter',
    mind: '我要定义别人怎么判断',
    authority: '给他元规则：检查项的设计权、评审流、使用统计',
    graduate: '团队共享（M7）或 ≥3 个项目共用同一包',
  },
]

/** 渐进披露五红线（§5.3 逐条原文，硬约束不是建议） */
export const REDLINES: readonly string[] = [
  '永不隐藏数据：只有排序、预填、折叠默认值的差别，「查看全部」永远一键可达',
  '永不隐藏错误：任何阶段都必须看到失败、漂移、冲突，不为了「简单」而吞错',
  '阶段可见可解释：界面上永远有一句「为什么你现在看到这个」，且可点开',
  '一键越级：任意页面可切到「专家视图」，且记忆该选择（按模块）',
  '升级不打断：升级提示是一次性卡片而非模态框，拒绝后不再打扰',
]

/** 阶段可见可解释（红线 3）——每阶段一句话，展开即得 */
export const STAGE_WHY: Readonly<Record<Stage, string>> = {
  0: '现在是跟随者视图：默认值已经替你选好，每处都能一键展开到全部。',
  1: '现在是实践者视图：选项与解释都露出来了，你可以挑，也可以改默认值。',
  2: '现在是作者视图：创作工具全开——批量编辑、自定义清单、组自己的包。',
  3: '现在是定标者视图：元规则可见——检查项的设计权、评审流与使用统计。',
}

/**
 * 毕业信号一律标「待采集」。
 *
 * 红线是硬约束：阶段**可见可解释**，而「解释」里最容易被造假的一格就是毕业信号。
 * §5.1 的判定信号来自 D29 台账读端点（RF1-5，未开工），在它落地前
 * `graduate` 只是**人写的目标**，不是机器判过的事实——所以这一层对外只暴露
 * 「待采集」这个事实，不给「已毕业」的结论。
 */
export const GRADUATE_PENDING = '待采集'

export interface StageDetail {
  name: string
  en: string
  /** 用户此刻的心智（§5.1「用户的心智」列原文） */
  mind: string
  /** 系统该替他行使的权威 */
  authority: string
  /** 目标毕业信号（未判定，恒为 GRADUATE_PENDING） */
  graduate: string
  /** 该阶段的一句话解释（红线 3：永远有一句「为什么你现在看到这个」） */
  why: string
  /** 恒为 true：信号尚未采集，界面不得据此声称已毕业 */
  graduatePending: true
}

export function stageDetail(stage: Stage): StageDetail {
  const def = STAGES[stage]
  if (def === undefined) throw new RangeError(`非法阶段：${String(stage)}`)
  return {
    name: def.name,
    en: def.en,
    mind: def.mind,
    authority: def.authority,
    graduate: def.graduate,
    why: STAGE_WHY[stage],
    graduatePending: true,
  }
}

const STORAGE_KEY = 'openvibe.growth.v1'

export interface GrowthState {
  /** 按模块的阶段向量 */
  stages: Record<StageModule, Stage>
  /** 规则 4：按模块记忆的专家视图开关 */
  expert: Record<StageModule, boolean>
}

export function defaultGrowthState(): GrowthState {
  return {
    stages: { prompts: 0, terms: 0, skills: 0, flows: 0, packs: 0 },
    // 默认不开启专家视图：渐进披露的前提是「默认收起、按阶段展开」
    expert: { prompts: false, terms: false, skills: false, flows: false, packs: false },
  }
}

export function readGrowthState(): GrowthState {
  const base = defaultGrowthState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<GrowthState>
    return {
      stages: { ...base.stages, ...(parsed.stages ?? {}) },
      expert: { ...base.expert, ...(parsed.expert ?? {}) },
    }
  } catch {
    // localStorage 不可用（无痕模式等）：仅本次会话生效，不阻断页面
    return base
  }
}

export function writeGrowthState(next: GrowthState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 同上：写不进去不是错误，界面仍可操作
  }
}

/** 是否处于「专家视图」：手选阶段 ≥2 或显式打开，两者任一 */
export function isExpert(state: GrowthState, m: StageModule): boolean {
  return state.expert[m] || state.stages[m] >= 2
}
