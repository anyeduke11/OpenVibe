import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as core from '@openvibe/core'
import * as tooling from '@openvibe/core/tooling'
import { parseExportsOfFile } from './support/barrel-parse'

/**
 * CS1 分离闸（v0.2.3 批次 C）：**产品主出口不含工具面**。
 *
 * ⭐ 工具面清单**自动生成**（owner 增强项①）：扫 `packages/core/src/tooling/index.ts`
 * 的导出名单，新加一个工具模块，闸不加一行即自动覆盖。解析器单源在
 * `tests/support/barrel-parse.ts`（barrel-audit / 主出口快照共用）。
 *
 * 判定分层：**源级**（主 barrel 的导出名单与 tooling 名单零交集——type 也算契约，
 * 且比运行时检查强）＋ **运行时**（值符号双侧在位）。type 在运行时被擦除，
 * 拿它查运行时只会假红——所以 type 只走源级。本闸在 vitest unit project ⇒ 三平台 CI 每轮必跑。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOLING_INDEX = join(HERE, '..', 'packages', 'core', 'src', 'tooling', 'index.ts')
const MAIN_INDEX = join(HERE, '..', 'packages', 'core', 'src', 'index.ts')

const toolingParsed = parseExportsOfFile(TOOLING_INDEX)
const toolingAllNames = toolingParsed.map((e) => e.name)
const toolingValueNames = toolingParsed.filter((e) => !e.isType).map((e) => e.name)
const mainSourceNames = parseExportsOfFile(MAIN_INDEX).map((e) => e.name)

const PRODUCT_STAYS = [
  // M9 学习线的产品面（server 路由在用）——必须留在主出口
  'readStageTracks',
  'readStageChoice',
  'assignTopicProfiles',
  'seedLangTopics',
  // CS4 接入生产的三个模块（langRoadmap 路由在用）
  'listTopicTerms',
  'filterTopics',
  'exportResourcesReadme',
]

const TOOLING_PHYSICAL_ONLY = ['findGradeAssertions', 'findGradeAssertionsInText'] as const

describe('CS1：@openvibe/core 主出口与 tooling 子出口的分离（清单自动生成）', () => {
  it('工具面清单非空（闸自身的哨兵：解析器失效时这里先红）', () => {
    expect(toolingAllNames.length).toBeGreaterThanOrEqual(30)
    expect(toolingAllNames).toContain('computeFreshness')
    expect(toolingAllNames).toContain('parseSpecPhaseRows')
  })

  it('源级：主 barrel 的导出名单与工具面名单零交集（type 也在内）', () => {
    const overlap = mainSourceNames.filter((n) => toolingAllNames.includes(n))
    expect(overlap, `工具面符号漏进主出口源码：${overlap.join(', ')}`).toEqual([])
  })

  it('运行时：主出口不含任何工具面值符号', () => {
    const face = core as unknown as Record<string, unknown>
    for (const name of toolingValueNames) {
      expect(face[name], `${name} 不应出现在主出口`).toBeUndefined()
    }
  })

  it('运行时：tooling 子出口提供全部工具面值符号（一个不少）', () => {
    const face = tooling as unknown as Record<string, unknown>
    for (const name of toolingValueNames) {
      expect(face[name], `${name} 应由 tooling 提供`).toBeDefined()
    }
  })

  it('CS4 后仅存的物理 tooling 模块（grade-guard）双侧 barrel 均不露出', () => {
    const coreFace = core as unknown as Record<string, unknown>
    const toolingFace = tooling as unknown as Record<string, unknown>
    for (const name of TOOLING_PHYSICAL_ONLY) {
      expect(coreFace[name], `${name} 不应在主出口`).toBeUndefined()
      expect(toolingFace[name], `${name} 不应在 tooling 出口（物理在位即可）`).toBeUndefined()
    }
  })

  it('产品面符号留在主出口（M9 学习线 + CS4 接入生产的路由在用）', () => {
    const face = core as unknown as Record<string, unknown>
    for (const name of PRODUCT_STAYS) {
      expect(face[name], `${name} 应留在主出口`).toBeDefined()
    }
  })
})
