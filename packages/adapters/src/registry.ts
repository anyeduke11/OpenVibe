import {
  ADAPTER_IDS,
  AppError,
  compareCodeUnit,
  type AdapterId,
  type PackAdapter,
  type PlannedFile,
  type ResolvedPack,
} from '@openvibe/shared'
import { COMPAT_MATRIX } from './compat'
import { CLAUDE_CODE_PATH, claudeCodeAdapter } from './claude-code'
import { CODEBUDDY_PATH, codebuddyAdapter } from './codebuddy'
import { CURSOR_PATH, cursorAdapter } from './cursor'
import { GENERIC_AGENTS_PATH, genericAgentsAdapter } from './generic-agents'
import { MINICODE_PATH, minicodeAdapter } from './minicode'
import { TRAE_PATH, traeAdapter } from './trae'

/** adapter 注册表（design §8：新增平台 = 新增一个模块 + 这一行 + 路径映射一行） */
export const registry: Record<AdapterId, PackAdapter> = {
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
  'generic-agents': genericAgentsAdapter,
  codebuddy: codebuddyAdapter,
  trae: traeAdapter,
  minicode: minicodeAdapter,
}

/** 各 adapter 的唯一主规则文件路径（不含 pack 内容，供 coveredPlatforms 反查矩阵） */
export const ADAPTER_MAIN_PATH: Record<AdapterId, string> = {
  'claude-code': CLAUDE_CODE_PATH,
  cursor: CURSOR_PATH,
  'generic-agents': GENERIC_AGENTS_PATH,
  codebuddy: CODEBUDDY_PATH,
  trae: TRAE_PATH,
  minicode: MINICODE_PATH,
}

/** 按 ADAPTER_IDS 声明序返回，与调用方 targets 的排列无关（确定性） */
export function adaptersFor(targets: AdapterId[]): PackAdapter[] {
  for (const id of new Set(targets)) {
    if (!registry[id]) {
      throw new AppError(
        'VALIDATION_ERROR',
        `未知 adapter：${id}（design §8 注册表外的平台需先加 adapter）`,
        {
          fieldErrors: { targets: [`未知平台 ${id}（design §8 注册表外的平台需先加 adapter）`] },
        },
      )
    }
  }
  return ADAPTER_IDS.filter((id) => targets.includes(id)).map((id) => registry[id])
}

/** 全部选中 adapter 的主文件集：按路径去重 + 码点序（§7.6 与 §7.3 同一口径） */
export function planMainFiles(pack: ResolvedPack): PlannedFile[] {
  const byPath = new Map<string, PlannedFile>()
  for (const adapter of adaptersFor(pack.targets)) {
    for (const file of adapter.plan(pack)) {
      if (!byPath.has(file.path)) byPath.set(file.path, file)
    }
  }
  return [...byPath.values()].sort((a, b) => compareCodeUnit(a.path, b.path))
}

/** 预览页「本包**额外**覆盖平台」（m6 FR-1.4）：只来自兼容矩阵，所选 adapter 自身不重复列 */
export function coveredPlatforms(targets: AdapterId[]): string[] {
  const artifactPaths = new Set<string>()
  for (const adapter of adaptersFor(targets)) artifactPaths.add(ADAPTER_MAIN_PATH[adapter.id])
  return COMPAT_MATRIX.filter((row) => artifactPaths.has(row.reads))
    .map((row) => row.platform)
    .sort(compareCodeUnit)
}
