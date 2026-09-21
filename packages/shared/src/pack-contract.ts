// packages/shared/src/pack-contract.ts
// 标准包生成契约的类型与常量（design §7 正文模板 / §8 adapter 接口）。
// 纯类型 + 纯函数：core 依赖它做组合，adapters 依赖它实现 plan()，二者不互相 import（R2）。

import type { AdapterId } from './constants'
import type { Stage } from './schemas/flow'
import type { ManifestPrompt, ManifestSkill, ManifestTerm } from './schemas/pack'

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
}

export interface PackAdapter {
  id: AdapterId
  /** 本平台应生成的主规则文件（辅助产物由 composer 统一生成，不属 adapter，design §8） */
  plan(pack: ResolvedPack): PlannedFile[]
}

// ============ §7.3 受管块与固定节序 ============

export const PACK_MARKER_BEGIN = (name: string, version: string): string =>
  `<!-- openvibe:pack=${name}@${version} begin (regenerate: npx openvibe-cli sync) -->`

export const PACK_MARKER_END = '<!-- openvibe:end -->'

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
export const PACK_FILE_CHECKLIST = 'CHECKLIST.md'
export const PACK_FILE_SKILLS = 'SKILLS.md'
export const PACK_FILE_MANIFEST = 'openvibe.pack.json'
/** 目录导出形态下渲染产物的落盘子目录（§7.1） */
export const PACK_FILES_SUBDIR = 'files'

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
