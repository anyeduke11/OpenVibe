import { planMainFiles, coveredPlatforms } from '@openvibe/adapters'
import { composePack, type RenderedPack } from '@openvibe/core'
import type { ResolvedPack } from '@openvibe/shared'
import { GOLDEN_EXPORTED_AT } from './fixtures'

/**
 * golden 的接线点：core 的生成器 + adapters 的注册表。
 * 这层注入同时是 R2 的可执行证明——packages/core 里没有一行 import '@openvibe/adapters'。
 */
export function renderGolden(pack: ResolvedPack): RenderedPack {
  return composePack(pack, {
    adapters: { planMainFiles, coveredPlatforms },
    exportedAt: GOLDEN_EXPORTED_AT,
  })
}
