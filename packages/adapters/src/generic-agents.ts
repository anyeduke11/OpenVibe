import type { PackAdapter, PlannedFile } from '@openvibe/shared'

/** 通用代理约定（design §8：Codex / zcode / Kimi Code 等经兼容矩阵读此文件） */
export const GENERIC_AGENTS_PATH = 'AGENTS.md'

export const genericAgentsAdapter: PackAdapter = {
  id: 'generic-agents',
  plan(): PlannedFile[] {
    return [{ path: GENERIC_AGENTS_PATH }]
  },
}
