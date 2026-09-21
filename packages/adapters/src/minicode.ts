import type { PackAdapter, PlannedFile } from '@openvibe/shared'

/** MiniCode 的 `/init` 约定产物（design §8 D9） */
export const MINICODE_PATH = 'MINI.md'

export const minicodeAdapter: PackAdapter = {
  id: 'minicode',
  plan(): PlannedFile[] {
    return [{ path: MINICODE_PATH }]
  },
}
