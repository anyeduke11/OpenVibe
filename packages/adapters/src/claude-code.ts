import type { PackAdapter, PlannedFile } from '@openvibe/shared'

/** Claude Code 项目根记忆文件（design §8：主正文原样，无壳） */
export const CLAUDE_CODE_PATH = 'CLAUDE.md'

export const claudeCodeAdapter: PackAdapter = {
  id: 'claude-code',
  plan(): PlannedFile[] {
    return [{ path: CLAUDE_CODE_PATH }]
  },
}
