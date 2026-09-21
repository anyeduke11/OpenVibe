import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderGolden } from './golden/compose'
import { GOLDEN_FIXTURES } from './golden/fixtures'
import { GOLDEN_ROOT, goldenArtifacts, walkFiles } from './golden/artifacts'

/**
 * 契约快照（dev-plan §9-T6 验收：GOLDEN-G1/G2/G3 全产物字节断言）。
 * 三平台 CI 跑同一份断言，产物字节漂移 = 契约变更，必须升 schemaVersion 或在 DEV_LOG 记 A 级理由。
 */
describe('GOLDEN · 标准包契约快照', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`${fixture.id}：${fixture.covers}`, () => {
      const dir = join(GOLDEN_ROOT, fixture.id)
      const artifacts = goldenArtifacts(renderGolden(fixture.pack))
      expect(existsSync(dir), `缺少快照目录 ${fixture.id}，运行 pnpm golden:update 生成`).toBe(true)

      const onDisk = walkFiles(dir).sort()
      expect(onDisk, '快照文件集与组包产物不一致（新增/删除产物需更新快照）').toEqual(
        Object.keys(artifacts).sort(),
      )

      for (const [rel, content] of Object.entries(artifacts)) {
        expect(readFileSync(join(dir, rel), 'utf8'), `${fixture.id}/${rel} 字节漂移`).toBe(content)
      }
    })
  }
})
