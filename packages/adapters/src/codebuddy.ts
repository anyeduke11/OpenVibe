import type { PackAdapter, PlannedFile } from '@openvibe/shared'

/** CodeBuddy 项目根规则文件（无此文件时回退读 AGENTS.md，design §8） */
export const CODEBUDDY_PATH = 'CODEBUDDY.md'

export const codebuddyAdapter: PackAdapter = {
  id: 'codebuddy',
  plan(): PlannedFile[] {
    return [{ path: CODEBUDDY_PATH }]
  },
}
