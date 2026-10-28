import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as core from '@openvibe/core'
import { parseExportsOfFile } from './support/barrel-parse'

/**
 * 主出口面快照（v0.2.3 批次 C，owner 增强项②）：
 * `@openvibe/core` 的导出面逐符号比对 `tests/core-main-exports.txt` 快照。
 * 快照记**源级契约面**（type + value 都算契约——type 在运行时被擦除，但它是
 * tarball 消费者拿到的那份 .d.ts 的一部分）。任何增删都会让本测试变红——
 * 处置只有一条合法路径：审阅 diff 后 `pnpm barrel:snapshot` 重新生成并同笔提交。
 * 本测试在 vitest unit project ⇒ 三平台 CI 矩阵每轮必跑。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX = join(HERE, '..', 'packages', 'core', 'src', 'index.ts')
const SNAPSHOT = join(HERE, 'core-main-exports.txt')
const TOOLING_INDEX = join(HERE, '..', 'packages', 'core', 'src', 'tooling', 'index.ts')

const live = parseExportsOfFile(INDEX)
const liveNames = live.map((e) => e.name).sort()
const liveValueSet = new Set(Object.keys(core))
const snapshotted = readFileSync(SNAPSHOT, 'utf8')
  .split('\n')
  .filter((l) => l !== '')

describe('主出口面快照（core-main-exports.txt）', () => {
  it('快照与源级导出面逐符号一致（type 也算契约；差一个都是契约变更）', () => {
    const missing = snapshotted.filter((n) => !liveNames.includes(n))
    const added = liveNames.filter((n) => !snapshotted.includes(n))
    if (missing.length > 0 || added.length > 0) {
      throw new Error(
        `主出口面与快照不一致：快照多出 [${missing.join(', ')}]，现值新增 [${added.join(', ')}]。\n` +
          '处置：审阅这次面变更（对外契约！），确认后运行 pnpm barrel:snapshot 重新生成并同笔提交。',
      )
    }
    expect(missing).toEqual([])
    expect(added).toEqual([])
  })

  it('快照的每个值符号在运行时可导入（type 被擦除，不在此比对面）', () => {
    const valueNames = live.filter((e) => !e.isType).map((e) => e.name)
    const missingAtRuntime = valueNames.filter((n) => !liveValueSet.has(n))
    expect(missingAtRuntime, `值符号运行时缺失：${missingAtRuntime.join(', ')}`).toEqual([])
    // 哨兵：快照非空（解析器失效时这里先红，而不是空快照假绿）
    expect(snapshotted.length).toBeGreaterThan(300)
  })

  it('快照内不含工具面符号（与 tooling-face 闸互为冗余，防两把闸同时失明）', () => {
    const tooling = parseExportsOfFile(TOOLING_INDEX).map((e) => e.name)
    const leaked = snapshotted.filter((n) => tooling.includes(n))
    expect(leaked, `工具面符号漏进主出口快照：${leaked.join(', ')}`).toEqual([])
  })
})
