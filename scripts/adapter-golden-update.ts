/**
 * adapter 夹具生成（adapter-fixtures.md FR-1/FR-2；队列 ㊺ 判 A，refactor-goal-plan W-1·F-3）。
 * 形制照 scripts/golden-update.ts：rm + 逐文件写盘。
 * ⚠️ `tests/golden/` 是 A 级冻结面——.zwork/commit0083a.py 会拦触它的提交，
 *    重基那笔必须 owner 显式放行，不得 --no-verify（spec §8.2① 结论）。
 * 运行：pnpm adapters:golden:update
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ADAPTER_FIXTURE_INPUT } from '../tests/golden/fixtures'
import { ADAPTER_FIXTURE_ROOT, adapterArtifacts, allAdapterIds } from '../tests/golden/artifacts'

for (const id of allAdapterIds()) {
  const artifacts = adapterArtifacts(id, ADAPTER_FIXTURE_INPUT)
  const dir = join(ADAPTER_FIXTURE_ROOT, id)
  rmSync(dir, { recursive: true, force: true })
  for (const [rel, content] of Object.entries(artifacts)) {
    const target = join(dir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  console.log(`adapter-golden:${id} → ${Object.keys(artifacts).length} 个文件`)
}
console.log('提示：本脚本动了 tests/golden/（A 级面）——提交前须 owner 显式放行 golden 闸。')
