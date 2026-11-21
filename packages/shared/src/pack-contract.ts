// packages/shared/src/pack-contract.ts
// 标准包生成契约的类型与常量（design §7 正文模板 / §8 adapter 接口）。
// 纯类型 + 纯函数：core 依赖它做组合，adapters 依赖它实现 plan()，二者不互相 import（R2）。

import type { AdapterId, L1Capability } from './constants'
import type { Stage } from './schemas/flow'
import type {
  Hooks,
  ManifestPlaybook,
  ManifestPrompt,
  ManifestSkill,
  ManifestTerm,
} from './schemas/pack'

/** 选集解析后的包（repos 已按 selection 取内容快照，§7.2 的 manifest 内嵌资产即源于此） */
export interface ResolvedPack {
  id: string
  name: string
  version: string
  description: string
  targets: AdapterId[]
  flow: { templateName: string; kind: string; stages: Stage[] } | null
  prompts: ManifestPrompt[]
  terms: ManifestTerm[]
  skills: ManifestSkill[]
  /**
   * 技巧快照（m4 FR-7.1）。**选填**：golden 夹具是 A 级冻结契约输入（tests/golden/fixtures.ts
   * 不得改），把它变成必填等于借 M4 之手改契约快照面；渲染侧一律按缺省 = 未选技巧处理，
   * 与「playbookIds 缺省」在字节上等价（FR-8.4）。
   */
  playbooks?: ManifestPlaybook[]
  /** N3 hooks（n3-hooks.md FR-2.2）：组包时配置，composePack 写入 manifest.hooks */
  hooks?: Hooks
  /** N4 特性位（m11 FR-3.5）：平台级 L1 开关，composePack 写入 manifest.l1 */
  l1?: Partial<Record<AdapterId, boolean>>
}

/**
 * frontmatter 值原样落盘（不做引号推断）：
 * Cursor 走 YAML 需要 `"…"`，Trae 的解析器按首个 `:` 切分后把余下文本当裸值，加引号反而进正文。
 * 两家的差异由各自 adapter 决定字面量，渲染层不加戏。
 */
export type Frontmatter = Record<string, string | boolean>

export interface PlannedFile {
  path: string
  frontmatter?: Frontmatter
  /**
   * N4 归属 adapter（m11 FR-2.1：能力位是入参 ⇒ 同一包在不同能力位下产出不同计划）。
   * 由 registry.planMainFiles 按来源 adapter 盖章；composePack 据此选择 L1 引用形态。
   * **可选**——adapter 的 plan() 不强制声明，缺失时 composePack 退化为 L0（与今天逐字节相同）。
   */
  adapterId?: AdapterId
}

export interface PackAdapter {
  id: AdapterId
  /** N4 能力位（m11 FR-3.1）：本平台对 L1 引用的加载能力（auto-import/on-demand/module/false） */
  l1Capability: L1Capability
  /** 本平台应生成的主规则文件（辅助产物由 composer 统一生成，不属 adapter，design §8） */
  plan(pack: ResolvedPack): PlannedFile[]
}

// ============ §7.3 受管块与固定节序 ============

/** 受管块起始标记的前缀：仅需「认出这是标记」的解析方引用它，拼整句用 `PACK_MARKER_BEGIN` */
export const PACK_MARKER_PREFIX = '<!-- openvibe:pack='

export const PACK_MARKER_BEGIN = (name: string, version: string): string =>
  `${PACK_MARKER_PREFIX}${name}@${version} begin (regenerate: npx openvibe-cli sync) -->`

export const PACK_MARKER_END = '<!-- openvibe:end -->'

/**
 * 段级受管标记（D32 · 4-c，decisions ㊾；design §7.3）。置于**节标题行上方**，
 * 节序恒定（PACK_SECTION_ORDER）⇒ 段名即节标题文本、可由结构推导（㊷ ② 的段界口径在
 * 4-c 下的自然细化）。壳内标记之前的「壳头」（标题＋引用块）仍是契约字节；
 * 壳外（begin 之前 / end 之后）依旧是用户的自由区——diff 报文如实分层（section-diff.ts）。
 * 段级**写入**（4-b 段级选择）按 ㊷③ 不在本版，planner 的整文件 sha 判定不动。
 */
export const PACK_SECTION_MARKER = (heading: string): string =>
  `<!-- openvibe:section=${heading.replace(/^#+\s*/, '')} -->`

/** 段级标记的识别前缀（section-diff 的切段依据；整句用 PACK_SECTION_MARKER 拼装） */
export const PACK_SECTION_MARKER_PREFIX = '<!-- openvibe:section='

export const PACK_TITLE = (name: string, version: string): string =>
  `# OpenVibe 标准包：${name}@${version}`

/** 标题下的两行引用块（§7.3，逐字冻结） */
export const PACK_LEAD_QUOTE = [
  '> 本文件由 OpenVibe 生成。要修改标准，请回资产库改后重新注入；',
  '> 本地手改会被 `openvibe diff` 漂移检测发现。',
].join('\n')

export const PACK_SECTION_FLOW = '## 工作流程'
export const PACK_SECTION_RULES = '## 行为规则'
export const PACK_SECTION_TERMS = '## 术语表'
export const PACK_SECTION_REFERENCE = '## 任务提示词参考'

/** 节序恒定：流程 → 规则 → 术语 → 参考（空节整体省略，确定性来源） */
export const PACK_SECTION_ORDER = [
  PACK_SECTION_FLOW,
  PACK_SECTION_RULES,
  PACK_SECTION_TERMS,
  PACK_SECTION_REFERENCE,
] as const

// ============ §7.1 / §7.4 产物文件名 ============

export const PACK_FILE_TERMS = 'TERMS.md'
/** m4 FR-6.1：独立产物，不进主正文新节（§8.2 ① 裁 A，否则所有既有包指纹变化） */
export const PACK_FILE_PLAYBOOKS = 'PLAYBOOKS.md'
export const PACK_FILE_CHECKLIST = 'CHECKLIST.md'
export const PACK_FILE_SKILLS = 'SKILLS.md'
export const PACK_FILE_MANIFEST = 'openvibe.pack.json'
/** 目录导出形态下渲染产物的落盘子目录（§7.1） */
export const PACK_FILES_SUBDIR = 'files'

/**
 * 「某平台真正读进上下文」的辅助产物清单（主文件之外，存在才算）。
 * 唯一出处：体量估算与注入作用域都从这里取，任一消费方不得另写一份。
 */
export const PACK_CONTEXT_AUX_FILES = [
  PACK_FILE_TERMS,
  PACK_FILE_CHECKLIST,
  PACK_FILE_SKILLS,
  PACK_FILE_PLAYBOOKS,
] as const

/** frontmatter / 章节标题里的包标识（§7.4 各产物共用一个口径） */
export const packSubject = (name: string, version: string): string => `${name}@${version}`

// ============ 确定性工具 ============

/**
 * 码点序比较（design §7.3/§7.6）。禁止 localeCompare——其结果随 ICU 环境漂移，
 * 会让同一包在 macOS/Linux/Windows CI 上生成不同字节、指纹不一致。
 */
export function compareCodeUnit(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function renderFrontmatter(fm: Frontmatter): string {
  const lines = Object.entries(fm).map(
    ([key, value]) => `${key}: ${typeof value === 'string' ? value : String(value)}`,
  )
  return `---\n${lines.join('\n')}\n---\n`
}
